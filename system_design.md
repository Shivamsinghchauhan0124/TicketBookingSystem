# System Design Write-up: Ticket Booking Platform

This document describes the design patterns, mechanisms, and database structures engineered to handle high-concurrency ticket reservations, lock expiration, and automated queue allocations.

---

## 1. Seat Hold and TTL Mechanism

To prevent seat hoarding, reserving a seat initiates a temporary hold (Time-To-Live: 10 minutes) rather than an immediate purchase. This state is represented in the `ShowSeat` entity:

* **State Model**: `status` is set to `HELD`, `heldByUserId` maps to the customer, and `holdExpiresAt` is timestamped to `now + 10 minutes`.
* **Enforcement Strategy**: Enforced via a **hybrid trigger model** for maximum reliability:
  1. **Inline Cleanup (Hot Paths)**: When any user retrieves an event details page or attempts a hold booking, the system executes an inline transaction clearing expired holds on that event. This guarantees that users always view the most up-to-date seat map status in real-time.
  2. **Background Cron Worker**: A background worker runs every 30 seconds to clean up expired holds system-wide, releasing the seats back to `AVAILABLE`.

---

## 2. Concurrency Protection

In high-demand scenarios, multiple users will simultaneously attempt to select the same seat. To ensure **exactly-once hold allocation** without double-booking, the platform uses database transactions and optimistic validation:

* **Transactional Atomicity**: Seat bookings and locks are wrapped inside an atomic ACID database transaction (`prisma.$transaction`).
* **Check-and-Update (State Guard)**:
  Within the transaction, the engine queries the current state of the requested seat IDs:
  ```sql
  SELECT status, holdExpiresAt FROM ShowSeat WHERE eventId = :eventId AND seatId IN (:seatIds)
  ```
  The transaction validates that every requested seat has:
  * `status = 'AVAILABLE'` OR
  * `(status IN ('HELD', 'WAITLIST_HELD') AND holdExpiresAt < NOW())`
  If any seat is active-held or booked by another client, the transaction **throws an error and rolls back** completely.
* **SQLite Serialization**: Since SQLite serializes write transactions (using a database-level lock during transactions), parallel threads executing this read-then-write check are executed sequentially. This prevents race conditions where two users might read the seat as available simultaneously and both write a hold.
* **PostgreSQL Scaling**: For distributed systems, this scales seamlessly to PostgreSQL by applying a row-level write lock (`SELECT ... FOR UPDATE`) during the status check, blocking concurrent threads until the active transaction completes.

---

## 3. Waitlist Auto-Assignment Flow

When an event category sells out, customers can join a First-In, First-Out (FIFO) waitlist queue.
```
[User Cancels Booking] 
       │
       ▼
[Find Oldest WAITING Customer in Waitlist] ──(None)──► [Set Seat to AVAILABLE]
       │
       ▼ (User Found)
[Set Seat to WAITLIST_HELD for 5 mins]
       │
       ▼
[Update Waitlist to OFFERED]
       │
       ▼
[Email Claim Link to Waitlisted Customer]
```

1. **Waitlist Collection**: The `Waitlist` table tracks entries with columns `eventId`, `userId`, `category`, and `status` (`WAITING`, `OFFERED`, `COMPLETED`, `EXPIRED`).
2. **Cancellation Hook**: When a booking is cancelled:
   * The transaction marks the original booking as `CANCELLED`.
   * For each cancelled seat, the system checks for active waitlist entries:
     ```sql
     SELECT * FROM Waitlist 
     WHERE eventId = :eventId AND category = :category AND status = 'WAITING' 
     ORDER BY createdAt ASC LIMIT 1
     ```
   * If a waitlisted user is found, the system holds the seat for them (`WAITLIST_HELD`) and updates their waitlist record status to `OFFERED`.
   * An email containing a secure checkout token link (`/event/:eventId?claimSeatId=:seatId`) is generated and sent.

---

## 4. Time-Limited Offer Handling

Waitlist seat offers are time-limited (Offer TTL: 5 minutes) to ensure seats are not blocked by inactive users.

* **Offer Expiration**: If the waitlisted customer fails to complete the booking within 5 minutes, their offer expires.
* **Worker Reallocation Hook**: The background worker scans for expired offers:
  ```sql
  SELECT * FROM ShowSeat WHERE status = 'WAITLIST_HELD' AND holdExpiresAt < NOW()
  ```
  For each expired seat, the worker starts a transaction:
  * Sets the old waitlist entry status to `EXPIRED`.
  * Checks if another user is waiting in the queue.
  * If yes: places a new `WAITLIST_HELD` hold for the next waitlisted user and fires a new notification email.
  * If no: releases the seat back to `AVAILABLE`.
This cyclical flow continues until the waitlist queue is exhausted or all seats remain booked.
