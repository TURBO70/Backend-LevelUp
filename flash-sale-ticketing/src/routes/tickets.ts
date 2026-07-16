import { Router, Request, Response } from 'express'
import { query,withTransaction } from '../db/pool'
import { Ticket, Booking, BookingRequest } from '../types'
import {redis} from '../redis/client'
import { publishMessage, QUEUES } from '../rabbitmq/client'
import { BookingConfirmedEvent } from '../types'
const router = Router()


router.get('/tickets/:eventId', async (req: Request, res: Response) => {
 
  const eventId = parseInt(req.params.eventId)

  if (isNaN(eventId)) {
    res.status(400).json({ error: 'Invalid event ID' })
    return
  }

  try {
    const result = await query<Ticket>(
      `SELECT id, seat_code, status
       FROM tickets
       WHERE event_id = $1 AND status = 'available'
       ORDER BY seat_code`,
      [eventId]
    )

    res.json({
      event_id: eventId,
      available_count: result.rowCount,
      tickets: result.rows,
    })
  } catch (err) {
    console.error('GET /tickets error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})




router.post('/reservations', async (req: Request, res: Response) => {
  const { ticket_id, user_id } = req.body as BookingRequest

  if (!ticket_id || !user_id) {
    res.status(400).json({ error: 'ticket_id and user_id are required' })
    return
  }

  try {
    const result = await withTransaction(async (client) => {
      // Same lock as before — still need this, Redis doesn't replace it.
      // Redis handles the EXPIRY, Postgres still guards the WRITE.
      const checkResult = await client.query<Ticket>(
        `SELECT id, status FROM tickets WHERE id = $1 FOR UPDATE`,
        [ticket_id]
      )

      if (checkResult.rowCount === 0) {
        throw { statusCode: 404, message: 'Ticket not found' }
      }

      if (checkResult.rows[0].status !== 'available') {
        throw { statusCode: 409, message: 'Ticket is no longer available' }
      }

      await client.query(
        `UPDATE tickets
         SET status = 'reserved', held_by = $1, held_until = NOW() + INTERVAL '10 minutes'
         WHERE id = $2`,
        [user_id, ticket_id]
      )

      return { ticket_id, user_id }
    })

    // TypeScript note — 'EX', 600 means "expire in 600 seconds"
    // This is what makes the hold actually time out
    await redis.set(`reservation:${ticket_id}`, user_id, 'EX', 600)

    res.status(201).json({
      message: 'Ticket reserved for 10 minutes',
      ...result,
    })
  } catch (err: any) {
    if (err.statusCode) {
      res.status(err.statusCode).json({ error: err.message })
      return
    }
    console.error('POST /reservations error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})




router.post('/bookings/confirm', async (req: Request, res: Response) => {
  const { ticket_id, user_id } = req.body as BookingRequest

  try {
    const result = await withTransaction(async (client) => {
      const checkResult = await client.query<Ticket>(
        `SELECT t.id, t.status, t.held_by, t.seat_code, e.name as event_name
         FROM tickets t
         JOIN events e ON e.id = t.event_id
         WHERE t.id = $1 FOR UPDATE`,
        [ticket_id]
      )

      if (checkResult.rowCount === 0) {
        throw { statusCode: 404, message: 'Ticket not found' }
      }

      const ticket = checkResult.rows[0]

      if (ticket.status !== 'reserved' || ticket.held_by !== user_id) {
        throw { statusCode: 409, message: 'No active reservation for this user' }
      }

      await client.query(
        `UPDATE tickets SET status = 'booked' WHERE id = $1`,
        [ticket_id]
      )

      const bookingResult = await client.query<Booking>(
        `INSERT INTO bookings (ticket_id, user_id, status)
         VALUES ($1, $2, 'confirmed') RETURNING *`,
        [ticket_id, user_id]
      )

      return {
        booking: bookingResult.rows[0],
        seat_code: ticket.seat_code,
        event_name: ticket.event_name,
      }
    })

    await redis.del(`reservation:${ticket_id}`)

    // TypeScript note — "satisfies BookingConfirmedEvent" checks the shape
    // is correct at compile time without changing the runtime value
    const event: BookingConfirmedEvent = {
      booking_id: result.booking.id,
      ticket_id,
      user_id,
      seat_code: result.seat_code,
      event_name: result.event_name,
      booked_at: result.booking.booked_at.toISOString(),
    }

    // This is instant — just drops a message on the queue and returns
    // The workers below handle the rest asynchronously
    publishMessage(QUEUES.BOOKING_CONFIRMED, event)

    res.status(201).json({ message: 'Booking confirmed', booking: result.booking })
  } catch (err: any) {
    if (err.statusCode) {
      res.status(err.statusCode).json({ error: err.message })
      return
    }
    console.error('POST /bookings/confirm error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/bookings', async (req: Request, res: Response) => {
  const { ticket_id, user_id } = req.body as BookingRequest

  if (!ticket_id || !user_id) {
    res.status(400).json({ error: 'ticket_id and user_id are required' })
    return
  }

  try {
    const result = await withTransaction(async (client) => {
      // This is the fix. FOR UPDATE locks this row until COMMIT/ROLLBACK.
      // Any other transaction trying to SELECT FOR UPDATE the same row
      // will block here until this one finishes.
      const checkResult = await client.query<Ticket>(
        `SELECT id, status FROM tickets WHERE id = $1 FOR UPDATE`,
        [ticket_id]
      )

      if (checkResult.rowCount === 0) {
        // TypeScript note — throwing a custom error object lets us
        // carry an HTTP status code out of the transaction callback
        throw { statusCode: 404, message: 'Ticket not found' }
      }

      const ticket = checkResult.rows[0]

      if (ticket.status !== 'available') {
        throw { statusCode: 409, message: 'Ticket is no longer available' }
      }

      // Still inside the SAME transaction, on the SAME locked row
      await client.query(
        `UPDATE tickets SET status = 'booked', held_by = $1 WHERE id = $2`,
        [user_id, ticket_id]
      )

      const bookingResult = await client.query<Booking>(
        `INSERT INTO bookings (ticket_id, user_id, status)
         VALUES ($1, $2, 'confirmed')
         RETURNING *`,
        [ticket_id, user_id]
      )

      return bookingResult.rows[0]
    })

    res.status(201).json({
      message: 'Booking confirmed',
      booking: result,
    })
  } catch (err: any) {
    if (err.statusCode) {
      res.status(err.statusCode).json({ error: err.message })
      return
    }
    console.error('POST /bookings error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router