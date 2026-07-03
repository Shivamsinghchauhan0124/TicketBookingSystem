const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // 1. Clear existing database
  await prisma.showSeat.deleteMany();
  await prisma.waitlist.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.eventPrice.deleteMany();
  await prisma.event.deleteMany();
  await prisma.seat.deleteMany();
  await prisma.venue.deleteMany();
  await prisma.user.deleteMany();

  // 2. Create Users
  const passwordHash = await bcrypt.hash('password123', 10);
  
  const admin = await prisma.user.create({
    data: {
      email: 'admin@ticketbooking.com',
      name: 'System Admin',
      passwordHash,
      role: 'ADMIN'
    }
  });

  const organiser = await prisma.user.create({
    data: {
      email: 'organiser@ticketbooking.com',
      name: 'Event Organiser',
      passwordHash,
      role: 'ORGANISER'
    }
  });

  const customer1 = await prisma.user.create({
    data: {
      email: 'customer1@ticketbooking.com',
      name: 'Alice Customer',
      passwordHash,
      role: 'CUSTOMER'
    }
  });

  const customer2 = await prisma.user.create({
    data: {
      email: 'customer2@ticketbooking.com',
      name: 'Bob Customer',
      passwordHash,
      role: 'CUSTOMER'
    }
  });

  console.log('Users created:');
  console.log(`- Admin: admin@ticketbooking.com (password123)`);
  console.log(`- Organiser: organiser@ticketbooking.com (password123)`);
  console.log(`- Customer 1: customer1@ticketbooking.com (password123)`);
  console.log(`- Customer 2: customer2@ticketbooking.com (password123)`);

  // 3. Create Venue (5 rows x 6 columns)
  const venue = await prisma.venue.create({
    data: {
      name: 'Grand Concert Hall',
      rows: 5,
      cols: 6
    }
  });

  // Premium seats will be in row 1 and 2
  const premiumRows = [1, 2];
  const seatsData = [];
  for (let r = 1; r <= venue.rows; r++) {
    for (let c = 1; c <= venue.cols; c++) {
      seatsData.push({
        venueId: venue.id,
        row: r,
        col: c,
        category: premiumRows.includes(r) ? 'PREMIUM' : 'STANDARD'
      });
    }
  }

  await prisma.seat.createMany({ data: seatsData });
  console.log(`Venue 'Grand Concert Hall' created with ${seatsData.length} seats (Rows 1-2 Premium, Rows 3-5 Standard).`);

  // Fetch created seats to relate to shows
  const seats = await prisma.seat.findMany({ where: { venueId: venue.id } });

  // 4. Create Events
  const event1 = await prisma.event.create({
    data: {
      title: 'Summer Rock Festival 2026',
      description: 'A spectacular evening with the world\'s best rock music artists.',
      date: '2026-08-15',
      time: '19:30',
      venueId: venue.id,
      organiserId: organiser.id
    }
  });

  const event2 = await prisma.event.create({
    data: {
      title: 'Interstellar Movie Night',
      description: 'Experience Nolan\'s masterpiece Interstellar on the giant screen with live orchestra.',
      date: '2026-08-20',
      time: '21:00',
      venueId: venue.id,
      organiserId: organiser.id
    }
  });

  // 5. Pricing
  await prisma.eventPrice.createMany({
    data: [
      { eventId: event1.id, category: 'PREMIUM', price: 150.0 },
      { eventId: event1.id, category: 'STANDARD', price: 80.0 },
      { eventId: event2.id, category: 'PREMIUM', price: 50.0 },
      { eventId: event2.id, category: 'STANDARD', price: 30.0 }
    ]
  });

  // 6. ShowSeats
  const showSeats1 = seats.map(s => ({
    eventId: event1.id,
    seatId: s.id,
    status: 'AVAILABLE'
  }));

  const showSeats2 = seats.map(s => ({
    eventId: event2.id,
    seatId: s.id,
    status: 'AVAILABLE'
  }));

  await prisma.showSeat.createMany({ data: [...showSeats1, ...showSeats2] });
  console.log(`Seeded 2 events with prices and seat allocations.`);

  console.log('Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
