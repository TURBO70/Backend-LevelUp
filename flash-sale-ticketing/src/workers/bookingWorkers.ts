import { getChannel, QUEUES } from '../rabbitmq/client'
import { BookingConfirmedEvent } from '../types'

export const startWorkers = (): void => {
  const channel = getChannel()


  channel.prefetch(1)

  channel.consume(QUEUES.BOOKING_CONFIRMED, async (msg) => {
    if (!msg) return

    const event: BookingConfirmedEvent = JSON.parse(msg.content.toString())
    console.log(`[Email worker] Sending confirmation to user ${event.user_id}`)

    try {
    
      await new Promise(r => setTimeout(r, 500))
      console.log(`[Email worker] Email sent for booking ${event.booking_id}, seat ${event.seat_code}`)

      
      channel.ack(msg)
    } catch (err) {
      console.error('[Email worker] Failed:', err)

   
      channel.nack(msg, false, true)
    }
  })

  channel.consume(QUEUES.BOOKING_CONFIRMED, async (msg) => {
    if (!msg) return

    const event: BookingConfirmedEvent = JSON.parse(msg.content.toString())
    console.log(`[Analytics worker] Recording sale for event "${event.event_name}"`)

    try {
      
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