const nodemailer = require('nodemailer');
const QRCode = require('qrcode');

// Helper to get or create mail transporter
async function getTransporter() {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (host && port && user && pass) {
    return nodemailer.createTransport({
      host,
      port: parseInt(port),
      secure: parseInt(port) === 465,
      auth: { user, pass }
    });
  }

  // Fallback to Ethereal fake email for development
  try {
    let testAccount = await nodemailer.createTestAccount();
    return nodemailer.createTransport({
      host: "smtp.ethereal.email",
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass
      }
    });
  } catch (error) {
    console.warn("Could not create Ethereal SMTP test account. Emails will only log to console.", error.message);
    return null;
  }
}

async function sendTicketEmail(toEmail, toName, eventTitle, date, time, venueName, seats, bookingReference) {
  try {
    // Generate QR Code as DataURL
    const qrDataUrl = await QRCode.toDataURL(bookingReference);
    
    // Create console ASCII representation of QR for developer visibility
    const asciiQR = await QRCode.toString(bookingReference, { type: 'terminal', small: true });
    console.log(`\n📧 SIMULATED TICKET EMAIL FOR: ${toEmail}\n`);
    console.log(`Dear ${toName},\nYour booking is CONFIRMED for ${eventTitle}!`);
    console.log(`Details: ${date} at ${time} | Venue: ${venueName}`);
    console.log(`Seats: ${seats.join(', ')}`);
    console.log(`Booking Reference: ${bookingReference}`);
    console.log(`QR Code (booking reference encoded):`);
    console.log(asciiQR);
    console.log(`-----------------------------------------\n`);

    const transporter = await getTransporter();
    const fromAddress = process.env.SMTP_FROM || '"Ticket Booking" <noreply@ticketbooking.com>';
    
    const mailOptions = {
      from: fromAddress,
      to: toEmail,
      subject: `Your Ticket Booking Confirmation - Ref: ${bookingReference}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px; background-color: #f9f9f9;">
          <h2 style="color: #4f46e5; text-align: center;">Ticket Confirmed!</h2>
          <p>Dear <strong>${toName}</strong>,</p>
          <p>Thank you for your purchase. Your booking is confirmed. Here are the details:</p>
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Event:</td>
              <td style="padding: 8px; border-bottom: 1px solid #eee;">${eventTitle}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Date & Time:</td>
              <td style="padding: 8px; border-bottom: 1px solid #eee;">${date} at ${time}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Venue:</td>
              <td style="padding: 8px; border-bottom: 1px solid #eee;">${venueName}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Seats:</td>
              <td style="padding: 8px; border-bottom: 1px solid #eee;">${seats.join(', ')}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Reference Code:</td>
              <td style="padding: 8px; border-bottom: 1px solid #eee;"><code>${bookingReference}</code></td>
            </tr>
          </table>
          <div style="text-align: center; margin-top: 30px;">
            <p>Scan this QR code at the entrance:</p>
            <img src="cid:qrcode" alt="QR Code Ticket" style="width: 200px; height: 200px; border: 1px solid #ccc; padding: 5px; background: white;" />
          </div>
          <p style="font-size: 12px; color: #777; text-align: center; margin-top: 30px;">This is an automated confirmation email. Please do not reply.</p>
        </div>
      `,
      attachments: [
        {
          filename: 'qrcode.png',
          path: qrDataUrl,
          cid: 'qrcode' // same cid value as in the html img src
        }
      ]
    };

    if (transporter) {
      const info = await transporter.sendMail(mailOptions);
      if (transporter.options.host === "smtp.ethereal.email") {
        console.log(`📧 Test Email Sent: Preview URL at ${nodemailer.getTestMessageUrl(info)}`);
      } else {
        console.log(`📧 Live Email Sent to ${toEmail} (Message ID: ${info.messageId})`);
      }
    }
  } catch (error) {
    console.error("Error generating/sending QR ticket email:", error);
  }
}

async function sendWaitlistOfferEmail(toEmail, toName, eventTitle, seatCategory, offerExpiresAt, checkoutUrl) {
  try {
    const timeLimitStr = new Date(offerExpiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    console.log(`\n📧 SIMULATED WAITLIST OFFER EMAIL FOR: ${toEmail}\n`);
    console.log(`Dear ${toName},\nA seat has become available for ${eventTitle} in the ${seatCategory} category!`);
    console.log(`You have a limited time to complete your booking.`);
    console.log(`This offer expires at: ${timeLimitStr}`);
    console.log(`Complete checkout here: ${checkoutUrl}`);
    console.log(`-----------------------------------------\n`);

    const transporter = await getTransporter();
    const fromAddress = process.env.SMTP_FROM || '"Ticket Booking" <noreply@ticketbooking.com>';
    
    const mailOptions = {
      from: fromAddress,
      to: toEmail,
      subject: `Action Required: Seat Available for ${eventTitle}!`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px; background-color: #fffbeb;">
          <h2 style="color: #d97706; text-align: center;">Waitlist Seat Available!</h2>
          <p>Dear <strong>${toName}</strong>,</p>
          <p>Good news! A seat has opened up for <strong>${eventTitle}</strong> under the <strong>${seatCategory}</strong> category.</p>
          <p>Since you are next on the waitlist, we have placed a temporary hold on a seat for you. You have a limited time to claim it:</p>
          <div style="background-color: #fef3c7; border: 1px solid #f59e0b; padding: 15px; border-radius: 6px; text-align: center; margin: 20px 0;">
            <p style="margin: 0; font-weight: bold; color: #b45309; font-size: 16px;">
              Offer Expires At: ${timeLimitStr}
            </p>
          </div>
          <p>Click the button below to complete your booking before the offer expires. If you miss this window, the seat will automatically be offered to the next person in line.</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${checkoutUrl}" style="background-color: #d97706; color: white; padding: 12px 24px; text-decoration: none; font-weight: bold; border-radius: 6px; display: inline-block;">
              Book Your Seat Now
            </a>
          </div>
          <p style="font-size: 12px; color: #777; text-align: center;">If you do not want to book this ticket, you can ignore this email.</p>
        </div>
      `
    };

    if (transporter) {
      const info = await transporter.sendMail(mailOptions);
      if (transporter.options.host === "smtp.ethereal.email") {
        console.log(`📧 Test Offer Email Sent: Preview URL at ${nodemailer.getTestMessageUrl(info)}`);
      } else {
        console.log(`📧 Live Offer Email Sent to ${toEmail} (Message ID: ${info.messageId})`);
      }
    }
  } catch (error) {
    console.error("Error sending waitlist offer email:", error);
  }
}

module.exports = {
  sendTicketEmail,
  sendWaitlistOfferEmail
};
