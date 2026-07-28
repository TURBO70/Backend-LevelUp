# Flash Sale Ticketing Engine

A high-concurrency ticketing system built to demonstrate distributed systems concepts — race condition prevention, async event processing, real-time updates, and production-grade observability. Built in phases to deliberately show the problem first, then solve it correctly.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [API Reference](#api-reference)
- [How It Works](#how-it-works)
  - [Race Condition Prevention](#race-condition-prevention)
  - [Reservation TTL System](#reservation-ttl-system)
  - [Async Event Processing](#async-event-processing)
  - [Live Dashboard](#live-dashboard)
  - [Observability](#observability)
- [Load Testing](#load-testing)
- [Phase Breakdown](#phase-breakdown)
- [Environment Variables](#environment-variables)

---

## Overview

Imagine 10,000 users trying to buy 100 tickets at the exact same second. A naive implementation will oversell — two users book the same seat. This project is built to make that impossible.

The system handles:

- **High-concurrency booking** with zero overselling under any load
- **Two-phase reservations** — tickets are held for 10 minutes, then automatically released if unpaid
- **Async background processing** — emails, analytics, and AI feedback categorization run after the response is sent
- **Real-time inventory** — connected browsers see ticket counts update instantly via WebSocket
- **Full observability** — Prometheus metrics and Grafana dashboards for p95 latency and success/failure rates

---

## Architecture

```
Client Request
     │
     ▼
REST API (Express)  ──────────────────────────────► WebSocket Server
     │                                               (Live Dashboard)
     ├──► PostgreSQL
     │    Row-level Locking · Atomic Transactions
     │
     ├──► Redis
     │    TTL Holds · Expiry → Auto Release
     │
     └──► RabbitMQ
          Event Queue · Ack/Nack Retry
               │
               ├──► Email Worker
               ├──► Analytics Worker
               └──► LLM Feedback Categorizer

API also exposes /metrics
     └──► Prometheus (scrape) ──► Grafana (visualize)

All services run inside docker-compose
```

---

## Tech Stack

| Layer | Technology | Role |
|---|---|---|
| Runtime | Node.js + TypeScript | API server and workers |
| Framework | Express | HTTP routing |
| Database | PostgreSQL | Source of truth, row-level locking |
| Cache / TTL | Redis | Reservation holds, keyspace expiry events |
| Message Broker | RabbitMQ | Async event queue with retry |
| Real-time | WebSocket (ws) | Live inventory dashboard |
| Metrics | Prometheus | Scrapes `/metrics` every 5s |
| Dashboards | Grafana | p95 latency, success/failure rates |
| Infrastructure | Docker + Docker Compose | Full containerized environment |
| Load Testing | k6 | Concurrency stress testing |

---

## Project Structure

```
flash-sale-ticketing/
├── src/
│   ├── routes/
│   │   ├── tickets.ts          # Reservation and booking endpoints
│   │   └── feedback.ts         # Customer feedback endpoint
│   ├── db/
│   │   └── pool.ts             # PostgreSQL connection pool + transaction helper
│   ├── redis/
│   │   ├── client.ts           # Redis connection (commands + subscriber)
│   │   └── expiryListener.ts   # Listens for TTL expiry, releases tickets
│   ├── rabbitmq/
│   │   └── client.ts           # RabbitMQ connection, queue assertions, publish helper
│   ├── workers/
│   │   ├── bookingWorkers.ts   # Email and analytics consumers
│   │   └── feedbackWorker.ts   # LLM feedback categorization consumer
│   ├── websocket/
│   │   └── server.ts           # WebSocket server, broadcast logic
│   ├── metrics/
│   │   └── index.ts            # Prometheus counters, histograms, default metrics
│   ├── public/
│   │   └── dashboard.html      # Live inventory dashboard (vanilla JS + WebSocket)
│   ├── types/
│   │   └── index.ts            # Shared TypeScript interfaces
│   └── app.ts                  # Entry point — wires all services together
├── init.sql                    # Schema + seed data (runs on first Postgres startup)
├── docker-compose.yml          # All services: API, Postgres, Redis, RabbitMQ, Prometheus, Grafana
├── Dockerfile                  # Multi-stage build — compile stage + lean production stage
├── prometheus.yml              # Prometheus scrape config
├── load-test.js                # k6 script — reservation load test
├── load-test-booking.js        # k6 script — full reserve → confirm flow
├── nodemon.json                # Dev server config
├── tsconfig.json               # TypeScript compiler config
└── .env                        # Local environment variables
```

---

## Getting Started

### Prerequisites

- [Docker](https://www.docker.com/) installed and running
- [Node.js 20+](https://nodejs.org/) (for local dev only)
- [k6](https://k6.io/) (for load testing, optional)

### Run with Docker (recommended)

```bash
# Clone the repo
git clone https://github.com/your-username/flash-sale-ticketing.git
cd flash-sale-ticketing

# Copy environment file
cp .env.example .env
# Add your ANTHROPIC_API_KEY to .env

# Start everything
docker compose up --build
```

Services will be available at:

| Service | URL |
|---|---|
| REST API | http://localhost:3000 |
| Live Dashboard | http://localhost:3000/dashboard.html |
| RabbitMQ UI | http://localhost:15672 (guest / guest) |
| Prometheus | http://localhost:9090 |
| Grafana | http://localhost:3001 (admin / admin) |

### Run locally (dev mode)

```bash
npm install
npm run dev
```

> Make sure Postgres and Redis are running locally and `.env` is configured.

### Reset the database

```bash
# Wipes all data and reruns init.sql (re-seeds 100 tickets)
docker compose down -v
docker compose up --build
```

---

## API Reference

### Tickets

#### `GET /api/tickets/:eventId`
Returns all available tickets for an event.

```bash
curl http://localhost:3000/api/tickets/1
```

```json
{
  "event_id": 1,
  "available_count": 100,
  "tickets": [
    { "id": 1, "seat_code": "SEAT-001", "status": "available" }
  ]
}
```

---

### Reservations

#### `POST /api/reservations`
Reserves a ticket for 10 minutes. Uses `SELECT FOR UPDATE` to prevent two users from reserving the same seat simultaneously.

```bash
curl -X POST http://localhost:3000/api/reservations \
  -H "Content-Type: application/json" \
  -d '{"ticket_id": 1, "user_id": 42}'
```

```json
{
  "message": "Ticket reserved for 10 minutes",
  "ticket_id": 1,
  "user_id": 42
}
```

| Status | Meaning |
|---|---|
| `201` | Reservation successful |
| `409` | Ticket already reserved or booked |
| `404` | Ticket not found |

---

### Bookings

#### `POST /api/bookings/confirm`
Confirms a reservation after payment. Publishes a `booking.confirmed` event to RabbitMQ.

```bash
curl -X POST http://localhost:3000/api/bookings/confirm \
  -H "Content-Type: application/json" \
  -d '{"ticket_id": 1, "user_id": 42}'
```

```json
{
  "message": "Booking confirmed",
  "booking": {
    "id": 1,
    "ticket_id": 1,
    "user_id": 42,
    "status": "confirmed",
    "booked_at": "2025-01-01T12:00:00.000Z"
  }
}
```

---

### Feedback

#### `POST /api/feedback`
Submits customer feedback. Returns immediately — LLM categorization runs asynchronously in the background.

```bash
curl -X POST http://localhost:3000/api/feedback \
  -H "Content-Type: application/json" \
  -d '{"user_id": 42, "booking_id": 1, "message": "Payment failed but I was charged twice"}'
```

```json
{
  "message": "Feedback received — analysis in progress",
  "feedback_id": 1
}
```

#### `GET /api/feedback/:id`
Poll to check if the LLM has processed the feedback.

```bash
curl http://localhost:3000/api/feedback/1
```

```json
{
  "id": 1,
  "message": "Payment failed but I was charged twice",
  "category": "payment_issue",
  "sentiment": "negative",
  "processed": true
}
```

**Categories:** `payment_issue` · `seat_complaint` · `positive_experience` · `refund_request` · `technical_problem` · `general_enquiry`

**Sentiments:** `positive` · `neutral` · `negative`

---

## How It Works

### Race Condition Prevention

The core problem: two users sending `POST /reservations` at the same millisecond both read `status = 'available'`, both pass the check, and both book the same ticket.

The fix is `SELECT ... FOR UPDATE` inside a PostgreSQL transaction:

```sql
BEGIN;
SELECT id, status FROM tickets WHERE id = $1 FOR UPDATE;
-- Row is now locked. Any other transaction trying to lock
-- the same row will BLOCK here until this transaction commits.
UPDATE tickets SET status = 'reserved' WHERE id = $1;
COMMIT;
-- Lock released. Second request now proceeds, sees 'reserved', returns 409.
```

The lock is held from the moment of the SELECT until COMMIT — there is no gap where a second request can slip through.

This was proven by running k6 with 50 concurrent users targeting the same ticket:
- **Before the fix:** 3–5 bookings created for the same ticket
- **After the fix:** exactly 1 booking, every time

---

### Reservation TTL System

Tickets move through a state machine:

```
available  →  reserved  →  booked
                ↓
           (10 min TTL expires)
                ↓
           available  ←── back to pool
```

When a reservation is created:
1. Postgres sets `status = 'reserved'` and `held_until = NOW() + 10 minutes`
2. Redis sets `reservation:{ticket_id}` with `EX 600` (600 second TTL)

When the Redis key expires automatically:
1. Redis emits a keyspace notification on `__keyevent@0__:expired`
2. The expiry listener catches the event
3. Postgres is updated: `status = 'available'`, `held_by = NULL`
4. WebSocket broadcasts the updated counts to all connected clients

No polling. No cron job. The release happens within milliseconds of the TTL expiring.

---

### Async Event Processing

When a booking is confirmed, the response is sent to the user immediately. Slow work happens after:

```
POST /bookings/confirm
  └── Postgres write           ~5ms   ← inline
  └── Redis DEL                ~1ms   ← inline
  └── Publish to RabbitMQ      ~2ms   ← inline
  └── Return 201 to user       ~8ms total

Meanwhile (async, user already got their response):
  Email Worker      ~500ms   consumes booking.confirmed
  Analytics Worker  ~200ms   consumes booking.confirmed
  LLM Worker        ~2-8s    consumes feedback.received
```

Workers use `ack/nack` for reliability:
- `ack` — message processed successfully, remove from queue
- `nack` with `requeue: true` — processing failed, put it back for retry
- `nack` with `requeue: false` — max retries exceeded, send to dead-letter queue

---

### Live Dashboard

Open `http://localhost:3000/dashboard.html` to see live ticket counts.

The dashboard connects to the server via WebSocket. Every time a ticket changes state — reserved, confirmed, or released — the server broadcasts updated counts to all connected clients instantly. No polling, no page refresh.

---

### Observability

#### Prometheus
The API exposes `GET /metrics` in Prometheus format. Metrics collected:

| Metric | Type | Description |
|---|---|---|
| `reservation_requests_total` | Counter | Reservation attempts by status |
| `booking_requests_total` | Counter | Booking confirmations by status |
| `tickets_released_total` | Counter | Tickets auto-released after TTL expiry |
| `http_request_duration_ms` | Histogram | Response time by route and status code |
| Node.js defaults | Various | Memory, event loop lag, GC, CPU |

#### Grafana
After starting the stack, set up Grafana at `http://localhost:3001`:

1. Add data source: Prometheus → URL: `http://prometheus:9090`
2. Create panels with these queries:

```
# Bookings per second
rate(booking_requests_total{status="success"}[1m])

# Failed bookings per second
rate(booking_requests_total{status="failed"}[1m])

# p95 response time for booking confirmation
histogram_quantile(0.95, rate(http_request_duration_ms_bucket{route="/bookings/confirm"}[1m]))
```

---

## Load Testing

Two k6 scripts are included:

### Reservation load test
```bash
k6 run load-test.js
```
Fires 50 reservation requests/sec for 30 seconds across random tickets.

### Full booking flow
```bash
k6 run load-test-booking.js
```
Each virtual user does the full flow: reserve a ticket, pause 100ms (simulating payment), then confirm. Proves the end-to-end system holds up under concurrent load.

**Reset between runs:**
```bash
docker compose exec postgres psql -U postgres -d ticketing \
  -c "UPDATE tickets SET status='available', held_by=NULL, held_until=NULL; DELETE FROM bookings;"
```

---

## Phase Breakdown

This project was built in three deliberate phases:

### Phase A — Junior build (intentionally broken)
Basic REST API with no locking. Running k6 against it proves the race condition is real — multiple bookings are created for the same ticket.

**What you learn:** What a race condition actually looks like in a database, not just in theory.

### Phase B — Mid-level fix
- `SELECT FOR UPDATE` closes the race condition
- Redis TTL handles automatic reservation expiry
- RabbitMQ decouples slow work from the booking response
- WebSocket pushes live updates without polling
- Prometheus + Grafana make system behavior visible under load

**What you learn:** How to use the right tool for each problem instead of solving everything with the database.

### Phase C — AI integration
LLM-powered feedback categorization runs behind the event queue. The API returns in milliseconds; the Claude API call happens asynchronously in a background worker.

**What you learn:** How to integrate AI services without letting their latency affect your core system.

---

## Environment Variables

| Variable | Description | Example |
|---|---|---|
| `PORT` | API server port | `3000` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:password@postgres:5432/ticketing` |
| `REDIS_URL` | Redis connection string | `redis://redis:6379` |
| `RABBITMQ_URL` | RabbitMQ connection string | `amqp://guest:guest@rabbitmq:5672` |
| `ANTHROPIC_API_KEY` | Claude API key for feedback categorization | `sk-ant-...` |
