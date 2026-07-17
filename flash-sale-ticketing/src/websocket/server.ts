import { WebSocketServer, WebSocket } from 'ws'
import { Server } from 'http'
import { query } from '../db/pool'
import { Ticket } from '../types'

// we export this so routes can call broadcastUpdate()
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

  // Build a counts object from the rows
  // TypeScript note — "Record<string, number>" means an object
  // where keys are strings and values are numbers
  const counts: Record<string, number> = {
    available: 0,
    reserved: 0,
    booked: 0,
  }

  result.rows.forEach(row => {
    counts[row.status] = parseInt(row.count)
  })

  const update: DashboardUpdate = {
    type: 'TICKET_UPDATE',
    available: counts.available,
    reserved: counts.reserved,
    booked: counts.booked,
    timestamp: new Date().toISOString(),
  }

  const message = JSON.stringify(update)

  // Broadcast to every connected client
  // readyState === WebSocket.OPEN means the client is still connected
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message)
    }
  })

  console.log(`[WS] Broadcast: ${counts.available} available, ${counts.reserved} reserved, ${counts.booked} booked`)
}

export const initWebSocketServer = (server: Server): void => {
  wss = new WebSocketServer({ server })

  wss.on('connection', async (ws) => {
    console.log('[WS] Client connected')

    // Send current state immediately when a client connects
    // so they don't see a blank dashboard until the next event fires
    await broadcastUpdate()

    ws.on('close', () => {
      console.log('[WS] Client disconnected')
    })
  })

  console.log('WebSocket server initialized')
}