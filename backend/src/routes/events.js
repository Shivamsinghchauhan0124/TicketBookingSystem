const express = require('express');
const router = express.Router();
const prisma = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

// Create Event (Organiser only)
router.post('/', authenticate, requireRole(['ORGANISER']), async (req, res) => {
  try {
    const { title, description, date, time, venueId, prices } = req.body;

    if (!title || !date || !time || !venueId || !prices) {
      return res.status(400).json({ error: 'Title, date, time, venue, and pricing prices are required.' });
    }

    // Verify venue exists
    const venue = await prisma.venue.findUnique({
      where: { id: venueId },
      include: { seats: true }
    });

    if (!venue) {
      return res.status(404).json({ error: 'Venue not found.' });
    }

    if (venue.seats.length === 0) {
      return res.status(400).json({ error: 'Venue has no seats configured.' });
    }

    // Pricing must cover all seat categories present in the venue (PREMIUM, STANDARD)
    const seatCategories = [...new Set(venue.seats.map(s => s.category))];
    for (const cat of seatCategories) {
      if (prices[cat] === undefined || prices[cat] === null) {
        return res.status(400).json({ error: `Pricing for seat category '${cat}' must be specified.` });
      }
    }

    // Create Event, Prices and ShowSeats in a transaction
    const event = await prisma.$transaction(async (tx) => {
      const createdEvent = await tx.event.create({
        data: {
          title,
          description: description || '',
          date,
          time,
          venueId,
          organiserId: req.user.id
        }
      });

      // Create event prices
      const priceRecords = Object.entries(prices).map(([cat, val]) => ({
        eventId: createdEvent.id,
        category: cat,
        price: parseFloat(val)
      }));
      
      await tx.eventPrice.createMany({
        data: priceRecords
      });

      // Create ShowSeats by copying venue seats
      const showSeats = venue.seats.map(seat => ({
        eventId: createdEvent.id,
        seatId: seat.id,
        status: 'AVAILABLE'
      }));

      await tx.showSeat.createMany({
        data: showSeats
      });

      return createdEvent;
    });

    const completeEvent = await prisma.event.findUnique({
      where: { id: event.id },
      include: {
        prices: true,
        venue: true
      }
    });

    return res.status(201).json(completeEvent);
  } catch (error) {
    console.error('Error creating event:', error);
    return res.status(500).json({ error: 'Server error during event creation.' });
  }
});

// List all events with filters (Search, date, venue)
router.get('/', async (req, res) => {
  try {
    const { search, date } = req.query;

    const where = {};
    if (search) {
      where.OR = [
        { title: { contains: search } },
        { description: { contains: search } }
      ];
    }
    if (date) {
      where.date = date;
    }

    const events = await prisma.event.findMany({
      where,
      include: {
        venue: { select: { name: true } },
        prices: true
      },
      orderBy: { date: 'asc' }
    });

    return res.json(events);
  } catch (error) {
    console.error('Error listing events:', error);
    return res.status(500).json({ error: 'Server error listing events.' });
  }
});

// Organiser Dashboard summary & statistics
router.get('/organiser/dashboard', authenticate, requireRole(['ORGANISER']), async (req, res) => {
  try {
    const events = await prisma.event.findMany({
      where: { organiserId: req.user.id },
      include: {
        venue: { select: { name: true } },
        prices: true,
        bookings: {
          where: { status: 'CONFIRMED' },
          select: { totalPrice: true }
        },
        showSeats: {
          select: { status: true }
        }
      }
    });

    const dashboardData = events.map(event => {
      const confirmedBookings = event.bookings;
      const totalRevenue = confirmedBookings.reduce((sum, b) => sum + b.totalPrice, 0);
      
      const totalSeats = event.showSeats.length;
      const bookedSeats = event.showSeats.filter(s => s.status === 'BOOKED').length;
      const heldSeats = event.showSeats.filter(s => s.status === 'HELD' || s.status === 'WAITLIST_HELD').length;
      const availableSeats = totalSeats - bookedSeats;

      return {
        id: event.id,
        title: event.title,
        date: event.date,
        time: event.time,
        venueName: event.venue.name,
        totalSeats,
        bookedSeats,
        heldSeats,
        availableSeats,
        totalRevenue,
        isSoldOut: availableSeats === 0
      };
    });

    return res.json(dashboardData);
  } catch (error) {
    console.error('Error fetching organiser dashboard:', error);
    return res.status(500).json({ error: 'Server error fetching dashboard data.' });
  }
});

// Get detailed Event seat map and status
router.get('/:id', authenticate, async (req, res) => {
  try {
    const eventId = req.params.id;
    const userId = req.user.id;

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        venue: true,
        prices: true
      }
    });

    if (!event) {
      return res.status(404).json({ error: 'Event not found.' });
    }

    // Run hold expiry check in-line to ensure real-time accuracy of seat map
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      // Find expired holds
      const expiredShowSeats = await tx.showSeat.findMany({
        where: {
          eventId,
          status: { in: ['HELD', 'WAITLIST_HELD'] },
          holdExpiresAt: { lt: now }
        },
        include: { seat: true }
      });

      if (expiredShowSeats.length > 0) {
        for (const showSeat of expiredShowSeats) {
          // If it was a waitlist hold, update the waitlist status to EXPIRED
          if (showSeat.status === 'WAITLIST_HELD') {
            await tx.waitlist.updateMany({
              where: {
                eventId,
                userId: showSeat.heldByUserId,
                offeredSeatId: showSeat.seatId,
                status: 'OFFERED'
              },
              data: { status: 'EXPIRED' }
            });
          }

          // Release the seat back to available
          await tx.showSeat.update({
            where: { id: showSeat.id },
            data: {
              status: 'AVAILABLE',
              heldByUserId: null,
              holdExpiresAt: null
            }
          });
        }
      }
    });

    // Fetch up-to-date seats
    const showSeats = await prisma.showSeat.findMany({
      where: { eventId },
      include: {
        seat: true
      }
    });

    // Format seats map for frontend
    const seatsData = showSeats.map(s => {
      const isMyHold = s.heldByUserId === userId && (s.status === 'HELD' || s.status === 'WAITLIST_HELD');
      
      return {
        id: s.id,
        seatId: s.seatId,
        row: s.seat.row,
        col: s.seat.col,
        category: s.seat.category,
        // Enforce hold TTL client-side checks
        status: (s.status === 'HELD' || s.status === 'WAITLIST_HELD') && s.holdExpiresAt < now ? 'AVAILABLE' : s.status,
        isMyHold,
        holdExpiresAt: s.holdExpiresAt
      };
    });

    // Calculate details on sold-out state by category
    const categoriesStatus = {};
    const categories = [...new Set(event.venue.seats.map(s => s.category))];
    
    for (const cat of categories) {
      const catSeats = seatsData.filter(s => s.category === cat);
      const bookedCount = catSeats.filter(s => s.status === 'BOOKED').length;
      const heldCount = catSeats.filter(s => s.status === 'HELD' || s.status === 'WAITLIST_HELD').length;
      const totalCatSeats = catSeats.length;

      // Seat is available if it is not booked and does not have an active hold
      const availableCount = totalCatSeats - bookedCount - heldCount;

      categoriesStatus[cat] = {
        total: totalCatSeats,
        booked: bookedCount,
        held: heldCount,
        available: availableCount,
        isSoldOut: availableCount === 0
      };
    }

    return res.json({
      event,
      seats: seatsData,
      categoriesStatus
    });
  } catch (error) {
    console.error('Error fetching seat map:', error);
    return res.status(500).json({ error: 'Server error loading seat map.' });
  }
});

module.exports = router;
