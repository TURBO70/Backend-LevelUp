import { WebSocketServer, WebSocket } from 'ws'
import { Server } from 'http'
import { query } from '../db/pool'
import { Ticket } from '../types'

// TypeScript note — we export this so routes can call broadcastUpdate()
// from anywhere in the app
let wss: WebSocketServer

// The shape of every message we push to clients
interface DashboardUpdate {
  type: 'TICKET_UPDATE'
  available: number
  reserved: number
  booked: number
  timestamp: string
}

// Fetch current counts directly from Postgres and broadcast to all clients
export const broadcastUpdate = async (): Promise<void> => {
  if (!wss) return

  const result = await query<{ status: string; count: string }>(
    `SELECT status, COUNT(*) as count
     FROM tickets
     GROUP BY status`
  )
}