import express from 'express';
import dotenv from 'dotenv';
import ticketRoutes from './routes/tickets';
import { startExpiryListener } from './redis/expiryListener';

import { connectRabbitMQ } from './rabbitmq/client'
import { startWorkers } from './workers/bookingWorkers'

// startExpiryListener();
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Routes
app.use('/api/tickets', ticketRoutes);

const start = async () => {
 
  await connectRabbitMQ()
  startWorkers()
  startExpiryListener()

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
  })
}

start().catch(console.error)


export default app;
