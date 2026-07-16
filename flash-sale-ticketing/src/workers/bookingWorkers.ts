import { getChannel, QUEUES } from '../rabbitmq/client'
import { BookingConfirmedEvent } from '../types'

export const startWorkers = (): void => {
  const channel = getChannel()

  // prefetch(1) means: give this worker one message at a time.
  // Don't send the next one until this one is acknowledged.
  // Without this, RabbitMQ floods the worker with all queued messages at once.
  channel.prefetch(1)

  // ─── Email worker ────────────────────────────────────────────────────────
  channel.consume(QUEUES.BOOKING_CONFIRMED, async (msg) => {
    if (!msg) return

    const event: BookingConfirmedEvent = JSON.parse(msg.content.toString())
    console.log(`[Email worker] Sending confirmation to user ${event.user_id}`)

    try {
      // Simulated slow email send — in production this calls
      // SendGrid, SES, Resend, etc.
      await new Promise(r => setTimeout(r, 500))
      console.log(`[Email worker] Email sent for booking ${event.booking_id}, seat ${event.seat_code}`)

      // ack = "acknowledged" — tells RabbitMQ this message was processed
      // successfully and can be removed from the queue
      channel.ack(msg)
    } catch (err) {
      console.error('[Email worker] Failed:', err)

      // nack = "negative acknowledgement" — requeue: true puts it
      // back on the queue so another worker can retry
      channel.nack(msg, false, true)
    }
  })

  // ─── Analytics worker ────────────────────────────────────────────────────
  channel.consume(QUEUES.BOOKING_CONFIRMED, async (msg) => {
    if (!msg) return

    const event: BookingConfirmedEvent = JSON.parse(msg.content.toString())
    console.log(`[Analytics worker] Recording sale for event "${event.event_name}"`)

    try {
      // In production: write to a data warehouse, update a counter,
      // send to Segment, etc.
      await new Promise(r => setTimeout(r, 200))
      console.log(`[Analytics worker] Sale recorded for booking ${event.booking_id}`)
      channel.ack(msg)
    } catch (err) {
      console.error('[Analytics worker] Failed:', err)
      channel.nack(msg, false, true)
    }
  })

  console.log('Workers started: email, analytics')
}