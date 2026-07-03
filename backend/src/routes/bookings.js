const express = require('express');
const router = express.Router();
const prisma = require('../db');
const { authenticate } = require('../middleware/auth');
const { sendTicketEmail, sendWaitlistOfferEmail } = require('../mailer');

// Helper to generate random alphanumeric booking reference (8 chars)
function generateBookingRef() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// 1. Hold Seats (10 minutes TTL)
router.post('/hold', authenticate, async (req, res) => {
  try {
    const { eventId, seatIds } = req.body;
    const userId = req.user.id;

    if (!eventId || !seatIds || !Array.isArray(seatIds) || seatIds.length === 0) {
      return res.status(400).json({ error: 'Event ID and list of seat IDs are required.' });
    }

    const now = new Date();
    const holdDuration = 10 * 60 * 1000; // 10 minutes
    const holdExpiresAt = new Date(Date.now() + holdDuration);

    // Run hold assignment inside transaction to prevent race conditions
    const result = await prisma.$transaction(async (tx) => {
      // Fetch seats status
      const showSeats = await tx.showSeat.findMany({
        where: {
          eventId,
          seatId: { in: seatIds }
        },
        include: { seat: true }
      });

      if (showSeats.length !== seatIds.length) {
        throw new Error('One or more selected seats were not found for this event.');
      }

      // Check availability of each seat
      for (const showSeat of showSeats) {
        const isExpired = showSeat.holdExpiresAt && showSeat.holdExpiresAt < now;
        const isAvailable = showSeat.status === 'AVAILABLE' || isExpired;
        
        // Waitlisted users have a special hold on their offered seat
        const isMyWaitlistHold = showSeat.status === 'WAITLIST_HELD' && 
                                 showSeat.heldByUserId === userId && 
                                 !isExpired;

        if (!isAvailable && !isMyWaitlistHold) {
          throw new Error(`Seat at Row ${showSeat.seat.row}, Column ${showSeat.seat.col} is already held or booked by another customer.`);
        }
      }

      // Update seats to HELD
      const updatedSeats = [];
      for (const showSeat of showSeats) {
        const updated = await tx.showSeat.update({
          where: { id: showSeat.id },
          data: {
            status: 'HELD',
            heldByUserId: userId,
            holdExpiresAt: holdExpiresAt
          },
          include: { seat: true }
        });
        updatedSeats.push(updated);
      }

      return { updatedSeats, holdExpiresAt };
    });

    return res.json({
      message: 'Seats held successfully.',
      holdExpiresAt: result.holdExpiresAt,
      seats: result.updatedSeats.map(s => ({
        id: s.id,
        seatId: s.seatId,
        row: s.seat.row,
        col: s.seat.col,
        category: s.seat.category
      }))
    });
  } catch (error) {
    console.error('Error holding seats:', error.message);
    return res.status(409).json({ error: error.message || 'Seat hold failed.' });
  }
});

// 2. Release Held Seats manually (Optional / Checkout abandonment)
router.post('/release', authenticate, async (req, res) => {
  try {
    const { eventId, seatIds } = req.body;
    const userId = req.user.id;

    if (!eventId || !seatIds || !Array.isArray(seatIds) || seatIds.length === 0) {
      return res.status(400).json({ error: 'Event ID and seat IDs are required.' });
    }

    await prisma.showSeat.updateMany({
      where: {
        eventId,
        seatId: { in: seatIds },
        heldByUserId: userId,
        status: { in: ['HELD', 'WAITLIST_HELD'] }
      },
      data: {
        status: 'AVAILABLE',
        heldByUserId: null,
        holdExpiresAt: null
      }
    });

    return res.json({ message: 'Seats released successfully.' });
  } catch (error) {
    console.error('Error releasing seats:', error);
    return res.status(500).json({ error: 'Server error releasing seats.' });
  }
});

// 3. Confirm Booking (Purchasing held seats)
router.post('/confirm', authenticate, async (req, res) => {
  try {
    const { eventId, seatIds } = req.body;
    const userId = req.user.id;

    if (!eventId || !seatIds || !Array.isArray(seatIds) || seatIds.length === 0) {
      return res.status(400).json({ error: 'Event ID and seat IDs are required.' });
    }

    const now = new Date();

    const booking = await prisma.$transaction(async (tx) => {
      // 1. Verify that all requested seats are currently held by this user and not expired
      const heldSeats = await tx.showSeat.findMany({
        where: {
          eventId,
          seatId: { in: seatIds },
          heldByUserId: userId,
          status: { in: ['HELD', 'WAITLIST_HELD'] },
          holdExpiresAt: { gt: now }
        },
        include: {
          seat: true
        }
      });

      if (heldSeats.length !== seatIds.length) {
        throw new Error('Some seats holds have expired or were not locked by you. Please select them again.');
      }

      // 2. Fetch prices
      const priceRecords = await tx.eventPrice.findMany({
        where: { eventId }
      });
      const priceMap = {};
      priceRecords.forEach(pr => {
        priceMap[pr.category] = pr.price;
      });

      // Calculate total price
      let totalPrice = 0;
      heldSeats.forEach(hs => {
        const cat = hs.seat.category;
        const price = priceMap[cat] || 0;
        totalPrice += price;
      });

      // Generate reference and booking record
      const bookingReference = generateBookingRef();
      const newBooking = await tx.booking.create({
        data: {
          eventId,
          userId,
          totalPrice,
          status: 'CONFIRMED',
          bookingReference
        }
      });

      // Update seats status to BOOKED and link to booking
      for (const hs of heldSeats) {
        await tx.showSeat.update({
          where: { id: hs.id },
          data: {
            status: 'BOOKED',
            bookingId: newBooking.id,
            holdExpiresAt: null // clear hold expiry
          }
        });
      }

      // Mark any waitlist entries for this event and category for this user as COMPLETED
      // Collect unique categories booked
      const bookedCategories = [...new Set(heldSeats.map(hs => hs.seat.category))];
      await tx.waitlist.updateMany({
        where: {
          eventId,
          userId,
          category: { in: bookedCategories },
          status: { in: ['WAITING', 'OFFERED'] }
        },
        data: { status: 'COMPLETED' }
      });

      return {
        booking: newBooking,
        seats: heldSeats.map(hs => `${hs.seat.category} (Row ${hs.seat.row}, Col ${hs.seat.col})`)
      };
    });

    // Send ticket booking confirmation email async
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { venue: true }
    });

    sendTicketEmail(
      req.user.email,
      req.user.name,
      event.title,
      event.date,
      event.time,
      event.venue.name,
      booking.seats,
      booking.booking.bookingReference
    ).catch(e => console.error("Email send failed: ", e));

    return res.status(201).json({
      message: 'Booking confirmed successfully!',
      booking: booking.booking,
      seats: booking.seats
    });
  } catch (error) {
    console.error('Booking confirmation error:', error.message);
    return res.status(400).json({ error: error.message || 'Booking confirmation failed.' });
  }
});

// 4. Cancel Booking (Initiates waitlist auto-assignment)
router.post('/cancel/:id', authenticate, async (req, res) => {
  try {
    const bookingId = req.params.id;
    const userId = req.user.id;

    const result = await prisma.$transaction(async (tx) => {
      // Find the booking
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        include: {
          event: {
            include: { venue: true }
          },
          showSeats: {
            include: { seat: true }
          }
        }
      });

      if (!booking) {
        throw new Error('Booking not found.');
      }

      // Enforce auth (only booking owner, organiser, or admin can cancel)
      if (booking.userId !== userId && req.user.role === 'CUSTOMER') {
        throw new Error('Unauthorized to cancel this booking.');
      }

      if (booking.status === 'CANCELLED') {
        throw new Error('Booking is already cancelled.');
      }

      // Update booking to CANCELLED
      await tx.booking.update({
        where: { id: bookingId },
        data: { status: 'CANCELLED' }
      });

      const reallocationReports = [];

      // Process each seat in the booking for waitlist reallocation
      for (const showSeat of booking.showSeats) {
        const category = showSeat.seat.category;
        
        // Find the oldest WAITING customer in the waitlist for this category
        const nextInWaitlist = await tx.waitlist.findFirst({
          where: {
            eventId: booking.eventId,
            category: category,
            status: 'WAITING'
          },
          orderBy: { createdAt: 'asc' },
          include: { user: true }
        });

        if (nextInWaitlist) {
          // Found a waitlisted user! Assign this seat to them with a 5-minute offer TTL
          const offerDuration = 5 * 60 * 1000; // 5 minutes
          const offerExpiresAt = new Date(Date.now() + offerDuration);

          // Update ShowSeat: status to WAITLIST_HELD, assign to waitlisted user
          await tx.showSeat.update({
            where: { id: showSeat.id },
            data: {
              status: 'WAITLIST_HELD',
              heldByUserId: nextInWaitlist.userId,
              holdExpiresAt: offerExpiresAt,
              bookingId: null // unlink from original booking
            }
          });

          // Update Waitlist entry: status to OFFERED, capture offered seat & time limit
          await tx.waitlist.update({
            where: { id: nextInWaitlist.id },
            data: {
              status: 'OFFERED',
              offeredSeatId: showSeat.seat.id,
              offerExpiresAt: offerExpiresAt
            }
          });

          reallocationReports.push({
            seatId: showSeat.seat.id,
            category: category,
            waitlistedUserId: nextInWaitlist.userId,
            waitlistedUserEmail: nextInWaitlist.user.email,
            waitlistedUserName: nextInWaitlist.user.name,
            offerExpiresAt
          });
        } else {
          // No one on the waitlist for this category, release seat to AVAILABLE
          await tx.showSeat.update({
            where: { id: showSeat.id },
            data: {
              status: 'AVAILABLE',
              heldByUserId: null,
              holdExpiresAt: null,
              bookingId: null
            }
          });
        }
      }

      return { booking, reallocationReports };
    });

    // Send notification emails outside transaction to keep db connections brief
    for (const report of result.reallocationReports) {
      const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
      const checkoutUrl = `${clientUrl}/event/${result.booking.eventId}?claimSeatId=${report.seatId}`;
      
      sendWaitlistOfferEmail(
        report.waitlistedUserEmail,
        report.waitlistedUserName,
        result.booking.event.title,
        report.category,
        report.offerExpiresAt,
        checkoutUrl
      ).catch(e => console.error("Waitlist offer email send failed:", e));
    }

    return res.json({
      message: 'Booking cancelled successfully.',
      reallocatedSeatsCount: result.reallocationReports.length
    });
  } catch (error) {
    console.error('Cancellation error:', error.message);
    return res.status(400).json({ error: error.message || 'Booking cancellation failed.' });
  }
});

// 5. Join Waitlist
router.post('/waitlist', authenticate, async (req, res) => {
  try {
    const { eventId, category } = req.body;
    const userId = req.user.id;

    if (!eventId || !category) {
      return res.status(400).json({ error: 'Event ID and seat category are required.' });
    }

    // Verify category is valid and sold out
    const showSeats = await prisma.showSeat.findMany({
      where: {
        eventId,
        seat: { category }
      },
      include: { seat: true }
    });

    if (showSeats.length === 0) {
      return res.status(404).json({ error: 'Category not found in venue for this event.' });
    }

    const now = new Date();
    // Count active seats (not booked, and either not held or held but hold expired)
    const availableSeats = showSeats.filter(s => {
      const isBooked = s.status === 'BOOKED';
      const isHeld = (s.status === 'HELD' || s.status === 'WAITLIST_HELD') && s.holdExpiresAt > now;
      return !isBooked && !isHeld;
    });

    if (availableSeats.length > 0) {
      return res.status(400).json({ error: `Cannot join waitlist. There are still ${availableSeats.length} available seats in this category.` });
    }

    // Check if user is already on the waitlist for this category
    const existingWaitlist = await prisma.waitlist.findFirst({
      where: {
        eventId,
        userId,
        category,
        status: { in: ['WAITING', 'OFFERED'] }
      }
    });

    if (existingWaitlist) {
      return res.status(400).json({ error: 'You are already on the active waitlist for this seat category.' });
    }

    const waitlistEntry = await prisma.waitlist.create({
      data: {
        eventId,
        userId,
        category,
        status: 'WAITING'
      }
    });

    return res.status(201).json({
      message: 'Successfully joined the waitlist.',
      waitlist: waitlistEntry
    });
  } catch (error) {
    console.error('Waitlist join error:', error);
    return res.status(500).json({ error: 'Server error joining waitlist.' });
  }
});

// 6. User Booking History
router.get('/history', authenticate, async (req, res) => {
  try {
    const bookings = await prisma.booking.findMany({
      where: { userId: req.user.id },
      include: {
        event: {
          include: { venue: { select: { name: true } } }
        },
        showSeats: {
          include: { seat: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Fetch active waitlist entries for this user
    const waitlists = await prisma.waitlist.findMany({
      where: { userId: req.user.id },
      include: {
        event: {
          include: { venue: { select: { name: true } } }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return res.json({ bookings, waitlists });
  } catch (error) {
    console.error('Error fetching booking history:', error);
    return res.status(500).json({ error: 'Server error loading history.' });
  }
});

module.exports = router;
