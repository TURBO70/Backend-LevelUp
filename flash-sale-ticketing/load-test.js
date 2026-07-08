import http from 'k6/http'
import { check } from 'k6'

export const options = {
  scenarios: {
    flash_sale: {
      executor: 'shared-iterations',
      vus: 50,           
      iterations: 200,   
      maxDuration: '10s',
    },
  },
}

export default function () {
  const payload = JSON.stringify({
    ticket_id: 2,        
    user_id: Math.floor(Math.random() * 100000),
  })

  const params = {
    headers: { 'Content-Type': 'application/json' },
  }

  const res = http.post('http://localhost:3000/api/tickets/bookings', payload, params)

  check(res, {
    'status is 201 or 409': (r) => r.status === 201 || r.status === 409,
  })
}