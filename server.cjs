const express = require('express');
const { google } = require('googleapis');
const twilio = require('twilio');
const admin = require('firebase-admin');
const bodyParser = require('body-parser');
const schedule = require('node-schedule');

const app = express();
const PORT = 5000;

// Middleware
app.use(bodyParser.json());

// Google Sheets Integration
const SHEET_ID = process.env.SHEET_ID || 'your_google_sheet_id';
const CLIENT_EMAIL = process.env.CLIENT_EMAIL || 'your_service_account_email';
const PRIVATE_KEY = process.env.PRIVATE_KEY || 'your_private_key';

let auth, sheets;
if (CLIENT_EMAIL !== 'your_service_account_email') {
  auth = new google.auth.JWT(
    CLIENT_EMAIL,
    null,
    PRIVATE_KEY.replace(/\\n/g, '\n'),
    ['https://www.googleapis.com/auth/spreadsheets']
  );
  sheets = google.sheets({ version: 'v4', auth });
}

// Twilio Integration
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || 'your_account_sid';
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || 'your_auth_token';
let twilioClient;
if (TWILIO_ACCOUNT_SID !== 'your_account_sid') {
  twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
}

// Firebase Admin Initialization
// const serviceAccount = require('./firebase-service-account.json');
// admin.initializeApp({
//   credential: admin.credential.cert(serviceAccount),
// });

// Routes
app.post('/book', async (req, res) => {
  const { name, contact, address, date, time, type, processedBy } = req.body;

  try {
    // Append data to Google Sheet
    if (sheets) {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: 'Sheet1!A:G',
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [[name, contact, address, date, time, type, processedBy]],
        },
      });
    }

    // Schedule WhatsApp reminder
    const reminderDate = new Date(`${date}T${time}`);
    if (twilioClient) {
      schedule.scheduleJob(reminderDate, async () => {
        try {
          await twilioClient.messages.create({
            from: 'whatsapp:+14155238886', // Twilio sandbox number
            to: `whatsapp:+918050045500`, // Destination number
            body: `Reminder: Counselling session for ${name} at ${time}.`,
          });
          console.log('Reminder sent via WhatsApp');
        } catch (error) {
          console.error('Error sending reminder:', error);
        }
      });

      // Send initial confirmation WhatsApp
      await twilioClient.messages.create({
        from: 'whatsapp:+14155238886',
        to: `whatsapp:+91${contact}`,
        body: `Hi ${name}, your counselling session is booked for ${date} at ${time}.`,
      });
    }

    res.status(200).send('Booking successful and reminder scheduled!');
  } catch (error) {
    console.error(error);
    res.status(500).send('Error booking counselling session.');
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});