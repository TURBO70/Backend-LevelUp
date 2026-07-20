import http from 'k6/http'
import { check, sleep } from 'k6'

export const options = {
  scenarios: {
    full_booking_flow: {
      executor: 'constant-arrival-rate',
      rate: 50,           // 50 full flows per second
      timeUnit: '1s',
      duration: '30s',
      preAllocatedVUs: 100,
    },
  },
}

export default function () {
  const ticketId = Math.floor(Math.random() * 100) + 1
  const userId   = Math.floor(Math.random() * 99999) + 1
  const headers  = { 'Content-Type': 'application/json' }

  // ── Step 1: Reserve ────────────────────────────────────────────────
  const reserve = http.post(
    'http://localhost:3000/api/tickets/reservations',
    JSON.stringify({ ticket_id: ticketId, user_id: userId }),
    { headers }
  )

  check(reserve, {
    'reservation: 201 or 409': (r) => r.status === 201 || r.status === 409,
  })

  // If the ticket was already taken, no point trying to confirm
  if (reserve.status !== 201) return

  // Simulate the user filling in payment details — tiny pause
  sleep(0.1)

  // ── Step 2: Confirm booking ────────────────────────────────────────
  const confirm = http.post(
    'http://localhost:3000/api/tickets/bookings/confirm',
    JSON.stringify({ ticket_id: ticketId, user_id: userId }),
    { headers }
  )

  check(confirm, {
    'confirm: 201': (r) => r.status === 201,
  })
}