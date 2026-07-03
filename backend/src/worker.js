const prisma = require('./db');
const { sendWaitlistOfferEmail } = require('./mailer');

async function processExpirations() {
  const now = new Date();
  
  try {
    // 1. Process standard HELD seat expirations (Release back to AVAILABLE)
    const expiredStandardHolds = await prisma.showSeat.findMany({
      where: {
        status: 'HELD',
        holdExpiresAt: { lt: now }
      }
    });

    if (expiredStandardHolds.length > 0) {
      console.log(`[Worker] Found ${expiredStandardHolds.length} expired standard seat holds. Releasing...`);
      await prisma.showSeat.updateMany({
        where: {
          id: { in: expiredStandardHolds.map(h => h.id) }
        },
        data: {
          status: 'AVAILABLE',
          heldByUserId: null,
          holdExpiresAt: null
        }
      });
      console.log(`[Worker] Released expired standard holds.`);
    }

    // 2. Process expired WAITLIST_HELD offers
    const expiredWaitlistOffers = await prisma.showSeat.findMany({
      where: {
        status: 'WAITLIST_HELD',
        holdExpiresAt: { lt: now }
      },
      include: {
        seat: true,
        event: true
      }
    });

    if (expiredWaitlistOffers.length > 0) {
      console.log(`[Worker] Found ${expiredWaitlistOffers.length} expired waitlist offers. Reallocating...`);
      
      for (const showSeat of expiredWaitlistOffers) {
        const eventId = showSeat.eventId;
        const category = showSeat.seat.category;
        const previousUserId = showSeat.heldByUserId;

        const emailReport = await prisma.$transaction(async (tx) => {
          // A. Set the previous user's offered waitlist entry to EXPIRED
          await tx.waitlist.updateMany({
            where: {
              eventId,
              userId: previousUserId,
              offeredSeatId: showSeat.seatId,
              status: 'OFFERED'
            },
            data: { status: 'EXPIRED' }
          });

          // B. Look for the next user in the waitlist queue for this event and category
          const nextInWaitlist = await tx.waitlist.findFirst({
            where: {
              eventId,
              category,
              status: 'WAITING'
            },
            orderBy: { createdAt: 'asc' },
            include: { user: true }
          });

          if (nextInWaitlist) {
            // C. Assign this seat to the next waitlisted user
            const offerDuration = 5 * 60 * 1000; // 5 minutes
            const newExpiresAt = new Date(Date.now() + offerDuration);

            await tx.showSeat.update({
              where: { id: showSeat.id },
              data: {
                status: 'WAITLIST_HELD',
                heldByUserId: nextInWaitlist.userId,
                holdExpiresAt: newExpiresAt
              }
            });

            await tx.waitlist.update({
              where: { id: nextInWaitlist.id },
              data: {
                status: 'OFFERED',
                offeredSeatId: showSeat.seatId,
                offerExpiresAt: newExpiresAt
              }
            });

            return {
              email: nextInWaitlist.user.email,
              name: nextInWaitlist.user.name,
              title: showSeat.event.title,
              category,
              expiresAt: newExpiresAt,
              seatId: showSeat.seatId
            };
          } else {
            // D. No other user in queue, release seat back to AVAILABLE
            await tx.showSeat.update({
              where: { id: showSeat.id },
              data: {
                status: 'AVAILABLE',
                heldByUserId: null,
                holdExpiresAt: null
              }
            });
            return null;
          }
        });

        // Send email to next waitlisted user if assigned
        if (emailReport) {
          const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
          const checkoutUrl = `${clientUrl}/event/${eventId}?claimSeatId=${emailReport.seatId}`;
          
          sendWaitlistOfferEmail(
            emailReport.email,
            emailReport.name,
            emailReport.title,
            emailReport.category,
            emailReport.expiresAt,
            checkoutUrl
          ).catch(e => console.error("[Worker] Waitlist email notification failed:", e));
          
          console.log(`[Worker] Reallocated seat to next waitlisted customer: ${emailReport.email}`);
        } else {
          console.log(`[Worker] Reallocated seat back to AVAILABLE since waitlist was empty.`);
        }
      }
    }
  } catch (error) {
    console.error('[Worker] Error processing expirations:', error);
  }
}

function startExpiryWorker(intervalMs = 30000) {
  console.log(`[Worker] Starting background hold-expiration worker (interval: ${intervalMs / 1000}s)...`);
  // Run once immediately on start
  processExpirations();
  
  // Schedule periodic runs
  const intervalId = setInterval(processExpirations, intervalMs);
  return intervalId;
}

module.exports = {
  startExpiryWorker,
  processExpirations
};
