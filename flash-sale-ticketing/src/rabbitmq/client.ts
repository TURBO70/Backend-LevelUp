import amqplib, { Channel, Connection } from 'amqplib'


let connection: Connection | null = null
let channel: Channel | null = null

export const QUEUES = {
  BOOKING_CONFIRMED: 'booking.confirmed',
  BOOKING_FAILED:    'booking.failed',
} as const

export const connectRabbitMQ = async (): Promise<void> => {
 
  let retries = 5
  while (retries > 0) {
    try {
      connection = await amqplib.connect(
        process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672'
      )
      channel = await connection.createChannel()

      await channel.assertQueue(QUEUES.BOOKING_CONFIRMED, { durable: true })
      await channel.assertQueue(QUEUES.BOOKING_FAILED, { durable: true })

      console.log('RabbitMQ connected')
      return
    } catch (err) {
      retries--
      console.log(`RabbitMQ not ready, retrying... (${retries} left)`)
      await new Promise(r => setTimeout(r, 3000))
    }
  }
  throw new Error('Could not connect to RabbitMQ after retries')
}

export const publishMessage = (queue: string, payload: object): void => {
  if (!channel) throw new Error('RabbitMQ channel not initialized')

  // Messages must be Buffer — JSON.stringify converts our object,
  // Buffer.from converts that string to bytes RabbitMQ can send
  channel.sendToQueue(
    queue,
    Buffer.from(JSON.stringify(payload)),
    { persistent: true } // message survives RabbitMQ restart
  )
}

export const getChannel = (): Channel => {
  if (!channel) throw new Error('RabbitMQ channel not initialized')
  return channel
}