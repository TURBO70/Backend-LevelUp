import amqplib, { Connection, Channel } from 'amqplib';

let connection: Connection;
let channel: Channel;


export const QUEUES = {
  BOOKING_QUEUE: 'booking_queue',
  BOOKING_FAILED: 'booking.failed'
} as const;