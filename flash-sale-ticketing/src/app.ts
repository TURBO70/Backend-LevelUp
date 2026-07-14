import express from 'express';
import dotenv from 'dotenv';
import ticketRoutes from './routes/tickets';
import { startExpiryListener } from './redis/expiryListener';

// Start the Redis expiry listener
startExpiryListener();
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Routes
app.use('/api/tickets', ticketRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

export default app;
