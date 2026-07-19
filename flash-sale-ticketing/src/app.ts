import express from 'express';
import dotenv from 'dotenv';
import http from 'http'
import { httpDuration } from './metrics'
import ticketRoutes from './routes/tickets';
import { startExpiryListener } from './redis/expiryListener';

import { connectRabbitMQ } from './rabbitmq/client'
import { startWorkers } from './workers/bookingWorkers'
import { initWebSocketServer } from './websocket/server'
import path from 'path'



// startExpiryListener();
dotenv.config();

const app = express();
const server = http.createServer(app)

const PORT = process.env.PORT || 3000;

app.use(express.json());
import { register } from './metrics'

app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', register.contentType)
  res.end(await register.metrics())
})
app.use(express.static(path.join(__dirname, "../public")));// Routes
app.use((req, res, next) => {

  const end = httpDuration.startTimer({
    method: req.method,
    route: req.path,
  })

  res.on('finish', () => {
    end({ status_code: res.statusCode })
  })

  next()
})
app.use('/api/tickets', ticketRoutes);

const start = async () => {
 
  await connectRabbitMQ()
  startWorkers()
  startExpiryListener()
  initWebSocketServer(server)


  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
  })
}

start().catch(console.error)


export default app;
