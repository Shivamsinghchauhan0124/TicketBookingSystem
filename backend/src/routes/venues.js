const express = require('express');
const router = express.Router();
const prisma = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

// Create Venue (Admin only)
router.post('/', authenticate, requireRole(['ADMIN']), async (req, res) => {
  try {
    const { name, rows, cols, premiumRows = [] } = req.body;
    
    if (!name || !rows || !cols) {
      return res.status(400).json({ error: 'Venue name, rows, and columns are required.' });
    }

    if (rows <= 0 || cols <= 0) {
      return res.status(400).json({ error: 'Rows and columns must be positive numbers.' });
    }

    // Create Venue and its seats in a single transaction
    const venue = await prisma.$transaction(async (tx) => {
      const createdVenue = await tx.venue.create({
        data: { name, rows: parseInt(rows), cols: parseInt(cols) }
      });

      const seatsToCreate = [];
      for (let r = 1; r <= rows; r++) {
        for (let c = 1; c <= cols; c++) {
          const isPremium = premiumRows.includes(r);
          seatsToCreate.push({
            venueId: createdVenue.id,
            row: r,
            col: c,
            category: isPremium ? 'PREMIUM' : 'STANDARD'
          });
        }
      }

      await tx.seat.createMany({
        data: seatsToCreate
      });

      return createdVenue;
    });

    // Fetch the complete venue with seats to return
    const completeVenue = await prisma.venue.findUnique({
      where: { id: venue.id },
      include: { seats: true }
    });

    return res.status(201).json(completeVenue);
  } catch (error) {
    console.error('Error creating venue:', error);
    return res.status(500).json({ error: 'Server error during venue creation.' });
  }
});

// List all venues (Available to Admin and Organiser)
router.get('/', authenticate, requireRole(['ADMIN', 'ORGANISER']), async (req, res) => {
  try {
    const venues = await prisma.venue.findMany({
      include: {
        _count: {
          select: { seats: true }
        }
      }
    });
    return res.json(venues);
  } catch (error) {
    console.error('Error listing venues:', error);
    return res.status(500).json({ error: 'Server error listing venues.' });
  }
});

// Get venue details and seat layout
router.get('/:id', authenticate, async (req, res) => {
  try {
    const venue = await prisma.venue.findUnique({
      where: { id: req.params.id },
      include: { seats: true }
    });

    if (!venue) {
      return res.status(404).json({ error: 'Venue not found.' });
    }

    return res.json(venue);
  } catch (error) {
    console.error('Error getting venue:', error);
    return res.status(500).json({ error: 'Server error getting venue.' });
  }
});

module.exports = router;
