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

