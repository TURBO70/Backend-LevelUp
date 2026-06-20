CREATE TABLE events (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(255) NOT NULL,
  description TEXT,
  event_date  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE tickets (
  id         SERIAL PRIMARY KEY,
  event_id   INTEGER NOT NULL REFERENCES events(id),
  seat_code  VARCHAR(50) NOT NULL,
  status     VARCHAR(20) NOT NULL
             DEFAULT 'available'
             CHECK (status IN ('available', 'reserved', 'booked')),
  held_by    INTEGER,
  held_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (event_id, seat_code)
);

CREATE TABLE bookings (
  id         SERIAL PRIMARY KEY,
  ticket_id  INTEGER NOT NULL REFERENCES tickets(id),
  user_id    INTEGER NOT NULL,
  status     VARCHAR(20) NOT NULL
             DEFAULT 'pending'
             CHECK (status IN ('pending', 'confirmed', 'cancelled')),
  booked_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tickets_status ON tickets(status);
CREATE INDEX idx_tickets_event  ON tickets(event_id, status);
CREATE INDEX idx_bookings_user  ON bookings(user_id);

INSERT INTO events (name, description, event_date)
VALUES ('Flash Sale Concert', 'The big one', NOW() + INTERVAL '30 days');

INSERT INTO tickets (event_id, seat_code)
SELECT 1, 'SEAT-' || LPAD(generate_series::TEXT, 3, '0')
FROM generate_series(1, 100);