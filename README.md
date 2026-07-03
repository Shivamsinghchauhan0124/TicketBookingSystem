# EpicTickets - Ticket Booking Platform

EpicTickets is a high-concurrency ticket booking platform for concerts and movies. It features interactive visual seat maps, database transaction-enforced seat locking, automated FIFO waitlist queues, time-limited seat offers, and automated ticket confirmation emails with generated QR codes.

---

## 1. Project Structure

```
ticket-booking-platform/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma   # Relational Database Schema (SQLite)
│   │   └── seed.js         # Seed script for initial setup
│   ├── src/
│   │   ├── index.js        # Main Express Entrypoint
│   │   ├── db.js           # Prisma Client Instance
│   │   ├── mailer.js       # SMTP/Ethereal & QR Code Service
│   │   ├── worker.js       # Background Expiration & Reallocation Engine
│   │   ├── middleware/     # JWT Auth & RBAC Middleware
│   │   └── routes/         # Express routes (auth, venues, events, bookings)
│   ├── .env.example
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── app/            # Next.js App Router (Layouts & Pages)
│   │   ├── components/     # Visual Seating Grid Map & Layout Components
│   │   └── utils/          # API Connection helpers
│   ├── next.config.js
│   ├── .env.example
│   └── package.json
├── system_design.md        # Technical Write-up (Locks, TTL, Concurrency)
└── README.md
```

---

## 2. Technical Mechanisms Explained

### A. Seat Hold & TTL
* When a customer taps an available seat, the backend places a hold on it by setting `status = 'HELD'`, mapping the seat to the user (`heldByUserId`), and assigning an expiration time (`holdExpiresAt = now + 10 minutes`).
* During the hold period, other customers see this seat as unavailable.
* **Auto-Release**: A background cron-worker evaluates expired locks every 30 seconds. Additionally, when a user queries the seat map of an event, an inline cleanup transaction fires, guaranteeing real-time seat map precision.

### B. Concurrency Control
* To prevent two users from locking the same seat, seat reservations are processed inside a database transaction (`prisma.$transaction`).
* The system checks if the seat status is `AVAILABLE` (or has an expired hold). If it is currently locked by someone else, the transaction immediately fails and rolls back, ensuring that dual bookings can never succeed.
* For local development, SQLite's writer serialization natively shields against race conditions. For production distributed PostgreSQL systems, row-level write-locks (`SELECT ... FOR UPDATE`) are applied.

### C. Waitlist Reallocation
* If a seat category (e.g. Premium) is sold out, users can click to join the waitlist.
* When a booking is cancelled:
  1. The booking status updates to `CANCELLED`.
  2. The system fetches the first customer in the queue for that category (FIFO order).
  3. The seat status changes to `WAITLIST_HELD` and is assigned to the waitlisted user.
  4. The waitlist record is marked as `OFFERED` with an `offerExpiresAt` timestamp of `now + 5 minutes`.
  5. The waitlisted user receives an email notification with a 5-minute claim checkout link.
  6. If the user doesn't complete booking, the background worker expires the offer and reallocates the seat to the next person in line.

---

## 3. Database Schema

The SQLite schema consists of:
* **User**: Customer, Organiser, and Admin records.
* **Venue**: Grids of rows/cols.
* **Seat**: Physical seat configurations mapped to standard/premium categories.
* **Event**: Listings created by organisers.
* **EventPrice**: Per-category pricing rules.
* **ShowSeat**: Seat booking status for a specific event show (`AVAILABLE`, `HELD`, `BOOKED`, `WAITLIST_HELD`).
* **Booking**: Header record containing confirmation status and alphanumeric booking reference.
* **Waitlist**: FIFO queue entries tracking customer requests for sold-out seat categories.

---

## 4. Local Setup Guide

### Prerequisites
* **Node.js** (v18 or higher)
* **npm** (v9 or higher)

### Step 1: Clone and Configure Backend
1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy the environment variables template and configure it:
   ```bash
   cp .env.example .env
   ```
4. Push the schema to the SQLite database and seed initial test accounts:
   ```bash
   npm run db:push
   npm run db:seed
   ```
5. Start the backend developer server:
   ```bash
   npm run dev
   ```
   *Note: If no custom SMTP credentials are provided in `.env`, emails are automatically logged to the terminal console (including ASCII QR codes) and an Ethereal SMTP account is created (with preview links printed).*

### Step 2: Configure and Start Frontend
1. In a separate terminal session, navigate to the frontend directory:
   ```bash
   cd ../frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy the environment variables template:
   ```bash
   cp .env.example .env
   ```
4. Start the Next.js development server:
   ```bash
   npm run dev
   ```
5. Open your browser and navigate to `http://localhost:3000`.

---

## 5. Seed Credentials

We've preloaded test accounts for all roles (Default password: `password123`):
* **Admin**: `admin@ticketbooking.com` (Creates venues)
* **Organiser**: `organiser@ticketbooking.com` (Lists event shows)
* **Customer 1**: `customer1@ticketbooking.com` (Books tickets)
* **Customer 2**: `customer2@ticketbooking.com` (Tests waitlist queue)

---

## 6. API Documentation

All routes expect `Content-Type: application/json`. Authenticated routes require a headers option: `Authorization: Bearer <JWT_Token>`.

### Authentication
* **POST** `/api/auth/register` - Create account. Body: `{ email, password, name, role }`.
* **POST** `/api/auth/login` - Authenticate account. Body: `{ email, password }`.
* **GET** `/api/auth/me` - Profile checks.

### Venues (Admin)
* **POST** `/api/venues` - Create venue with auto seat generation. Body: `{ name, rows, cols, premiumRows: [1, 2] }`.
* **GET** `/api/venues` - List all venues.

### Events (Organiser & Customer)
* **POST** `/api/events` - Create event show. Body: `{ title, description, date, time, venueId, prices: { PREMIUM, STANDARD } }`.
* **GET** `/api/events` - List and filter events. Queries: `?search=...&date=...`.
* **GET** `/api/events/:id` - Detailed seat map including inline lock-release processes.
* **GET** `/api/events/organiser/dashboard` - Returns event ticket sales and revenues summaries.

### Bookings (Customer)
* **POST** `/api/bookings/hold` - Reserve seat seats (10m TTL). Body: `{ eventId, seatIds: [...] }`.
* **POST** `/api/bookings/release` - Release seat locks. Body: `{ eventId, seatIds: [...] }`.
* **POST** `/api/bookings/confirm` - Purchase held seats (Generates email & QR). Body: `{ eventId, seatIds: [...] }`.
* **POST** `/api/bookings/cancel/:id` - Cancel ticket booking (Triggers waitlist reallocation).
* **POST** `/api/bookings/waitlist` - Join FIFO sold-out queue. Body: `{ eventId, category }`.
* **GET** `/api/bookings/history` - User's personal booking orders and waitlist items history.
