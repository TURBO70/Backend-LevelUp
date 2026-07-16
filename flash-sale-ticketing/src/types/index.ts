export interface Ticket {
    id: number
    event_id: number
    seat_code: string
    status: 'available' | 'reserved' | 'booked'
    held_by: number | null
    held_until: Date | null
    created_at: Date
  }
  
  export interface Booking {
    id: number
    ticket_id: number
    user_id: number
    status: 'pending' | 'confirmed' | 'cancelled'
    booked_at: Date
  }
  
  export interface BookingRequest {
    ticket_id: number
    user_id: number
  }



export interface BookingConfirmedEvent {
  booking_id: number
  ticket_id: number
  user_id: number
  seat_code: string
  event_name: string
  booked_at: string
}