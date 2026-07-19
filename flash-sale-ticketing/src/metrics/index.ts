import { Registry, Counter, Histogram, collectDefaultMetrics } from 'prom-client'


export const register = new Registry()
collectDefaultMetrics({ register })


export const bookingCounter = new Counter({
    name: 'booking_requests_total',
    help: 'Total number of booking confirmation attempts',
    labelNames: ['status'] as const,
    registers: [register],
})

export const reservationCounter = new Counter({
    name :'reservation_requests_total',
    help: 'Total number of reservation attempts',
    labelNames: ['status'] as const,
    registers: [register],
})

export const ticketReleasedCounter = new Counter({
    name: 'ticket_released_total',
    help: 'Total number of tickets released after TTL expiry',
    registers: [register],
})


// it helps to know the duration of each request, so we can monitor performance and identify bottlenecks
export const httpDuration = new Histogram({
  name: 'http_request_duration_ms',
  help: 'HTTP request duration in milliseconds',
  labelNames: ['method', 'route', 'status_code'] as const,
  buckets: [5, 10, 25, 50, 100, 250, 500, 1000],
  registers: [register],
})