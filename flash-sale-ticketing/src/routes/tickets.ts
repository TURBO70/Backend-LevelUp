import { Router, Request, Response } from 'express'
import { query } from '../db/pool'
import { Ticket, Booking, BookingRequest } from '../types'

const router = Router()

// ─── GET /api/tickets/:eventId ───────────────────────────────────────────────
// Returns all available tickets for a given event
router.get('/tickets/:eventId', async (req: Request, res: Response) => {
  // TypeScript note — req.params is typed as Record<string, string>
  // so we parse it to number manually
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

// ─── POST /api/bookings ───────────────────────────────────────────────────────
// THE BROKEN VERSION — no transaction, no locking
// Two requests hitting this at the same time WILL oversell
router.post('/bookings', async (req: Request, res: Response) => {
  // TypeScript note — "as BookingRequest" tells TypeScript
  // to trust that req.body matches our interface
  const { ticket_id, user_id } = req.body as BookingRequest

  if (!ticket_id || !user_id) {
    res.status(400).json({ error: 'ticket_id and user_id are required' })
    return
  }

  try {
    // ⚠️  STEP 1: Check if ticket is available
    // Problem: another request can pass this check at the same time
    const checkResult = await query<Ticket>(
      `SELECT id, status FROM tickets WHERE id = $1`,
      [ticket_id]
    )

    if (checkResult.rowCount === 0) {
      res.status(404).json({ error: 'Ticket not found' })
      return
    }

    const ticket = checkResult.rows[0]

    if (ticket.status !== 'available') {
      res.status(409).json({ error: 'Ticket is no longer available' })
      return
    }

    // ⚠️  STEP 2: Mark ticket as booked
    // Problem: the gap between STEP 1 and STEP 2 is where overselling happens
    await query(
      `UPDATE tickets
       SET status = 'booked', held_by = $1
       WHERE id = $2`,
      [user_id, ticket_id]
    )

    // ⚠️  STEP 3: Create the booking record
    const bookingResult = await query<Booking>(
      `INSERT INTO bookings (ticket_id, user_id, status)
       VALUES ($1, $2, 'confirmed')
       RETURNING *`,
      [ticket_id, user_id]
    )

    res.status(201).json({
      message: 'Booking confirmed',
      booking: bookingResult.rows[0],
    })
  } catch (err) {
    console.error('POST /bookings error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router