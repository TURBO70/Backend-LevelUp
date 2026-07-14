import { redisSubscriber } from './client'
import { pool } from '../db/pool'

export const startExpiryListener = () => {
  // Redis publishes expired-key events on this special channel
  redisSubscriber.subscribe('__keyevent@0__:expired')

  redisSubscriber.on('message', async (_channel, expiredKey) => {
    // expiredKey looks like: "reservation:42"
    if (!expiredKey.startsWith('reservation:')) return

    const ticketId = parseInt(expiredKey.split(':')[1])
    console.log(`Reservation expired for ticket ${ticketId}, releasing...`)

    try {
      // No FOR UPDATE needed here — this is a background process,
      // not a concurrent user request racing against others
      await pool.query(
        `UPDATE tickets
         SET status = 'available', held_by = NULL, held_until = NULL
         WHERE id = $1 AND status = 'reserved'`,
        [ticketId]
      )
    } catch (err) {
      console.error(`Failed to release expired ticket ${ticketId}:`, err)
    }
  })

  console.log('Redis expiry listener started')
}