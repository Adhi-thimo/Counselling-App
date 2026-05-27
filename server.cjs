const express = require('express');
const { google } = require('googleapis');
const admin = require('firebase-admin');
const bodyParser = require('body-parser');
const schedule = require('node-schedule');
const fs = require('fs');
const path = require('path');

const app = express();
const REMINDERS_FILE = path.join(__dirname, '.reminders.json');
const PORT = process.env.NODE_ENV === 'production'
  ? (process.env.PORT || 5001)
  : 5001;
const DEFAULT_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwt5XoWM1ZMzjmH7ICp2QiMZe1mT1gt6c90S7rXWQc3tQZVQRLTsq7iP4qz60iLYVbc/exec';
const APPS_SCRIPT_URL = Object.prototype.hasOwnProperty.call(process.env, 'APPS_SCRIPT_URL')
  ? process.env.APPS_SCRIPT_URL
  : DEFAULT_APPS_SCRIPT_URL;
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS || '';
const GREEN_API_ID_INSTANCE = process.env.GREEN_API_ID_INSTANCE || '7107629494';
const GREEN_API_TOKEN_INSTANCE = process.env.GREEN_API_TOKEN_INSTANCE || 'c92fd11ef0c2406f9d9d210a115bafdd75eaf2eb47fb40928f';
const GREEN_API_BASE_URL = (process.env.GREEN_API_BASE_URL || 'https://api.green-api.com').replace(/\/$/, '');
const COUNSELOR_CONTACT = process.env.COUNSELOR_CONTACT || '8050045500';

// Middleware
app.use(bodyParser.json());

app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowedOrigins = ALLOWED_ORIGINS.split(',').map((value) => value.trim()).filter(Boolean);
  const allowAnyOrigin = !ALLOWED_ORIGINS || ALLOWED_ORIGINS === '*';

  if (origin && (allowAnyOrigin || allowedOrigins.includes(origin))) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Vary', 'Origin');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  }

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  return next();
});

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

if (!GREEN_API_ID_INSTANCE || !GREEN_API_TOKEN_INSTANCE) {
  console.warn('Green API credentials are missing. Set GREEN_API_ID_INSTANCE and GREEN_API_TOKEN_INSTANCE to enable WhatsApp sending.');
}

const cleanPhoneNumber = (phone) => {
  // Remove all non-digit characters
  const digits = String(phone).replace(/[^0-9]/g, '');
  // Take last 10 digits (strips country codes if present)
  const last10 = digits.slice(-10);
  // Return in format: 91XXXXXXXXXX
  return '91' + last10;
};

// Load pending reminders from file
const loadReminders = () => {
  try {
    if (fs.existsSync(REMINDERS_FILE)) {
      const data = fs.readFileSync(REMINDERS_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.warn('Failed to load reminders:', error.message);
  }
  return [];
};

// Save reminders to file
const saveReminders = (reminders) => {
  try {
    fs.writeFileSync(REMINDERS_FILE, JSON.stringify(reminders, null, 2));
  } catch (error) {
    console.error('Failed to save reminders:', error.message);
  }
};

// Schedule a reminder with persistence
const scheduleReminder = (appointmentId, reminderDate, clientName, clientContact, counselorContact, appointmentTime) => {
  if (reminderDate <= new Date()) {
    console.warn(`Reminder time ${reminderDate} is in the past. Skipping.`);
    return;
  }

  const job = schedule.scheduleJob(reminderDate, async () => {
    console.log(`\n⏰ REMINDER TRIGGERED for ${clientName} at ${appointmentTime}`);
    
    try {
      // Send to counselor
      console.log(`Sending reminder to counselor (${counselorContact})...`);
      await sendWhatsApp(counselorContact, `Reminder: Counselling session with ${clientName} is in 30 minutes (at ${appointmentTime}).`);
      console.log('✓ Counselor reminder sent');
    } catch (err) {
      console.error('✗ Counselor reminder failed:', err.message);
    }

    try {
      // Send to client
      console.log(`Sending reminder to client (${clientContact})...`);
      await sendWhatsApp(clientContact, `Hi ${clientName}, your counselling session is in 30 minutes (at ${appointmentTime}).`);
      console.log('✓ Client reminder sent');
    } catch (err) {
      console.error('✗ Client reminder failed:', err.message);
    }

    // Mark reminder as sent
    const reminders = loadReminders();
    const updatedReminders = reminders.filter(r => r.id !== appointmentId);
    saveReminders(updatedReminders);
    console.log(`Reminder ${appointmentId} marked as sent and removed from queue.`);
  });

  // Store in file for persistence
  const reminders = loadReminders();
  reminders.push({
    id: appointmentId,
    reminderTime: reminderDate.toISOString(),
    clientName,
    clientContact: cleanPhoneNumber(clientContact),
    counselorContact: cleanPhoneNumber(counselorContact),
    appointmentTime,
    status: 'pending',
  });
  saveReminders(reminders);
  console.log(`✓ Reminder scheduled for ${clientName} at ${reminderDate.toISOString()}`);
};

// Reschedule all pending reminders on server start
const rescheduleAllReminders = async () => {
  const reminders = loadReminders();
  const now = new Date();

  for (const reminder of reminders) {
    const reminderTime = new Date(reminder.reminderTime);
    
    // Only reschedule if in the future
    if (reminderTime > now) {
      console.log(`Rescheduling reminder for ${reminder.clientName} at ${reminderTime.toISOString()}`);
      scheduleReminder(
        reminder.id,
        reminderTime,
        reminder.clientName,
        reminder.clientContact,
        reminder.counselorContact,
        reminder.appointmentTime
      );
    } else {
      console.log(`Skipping expired reminder for ${reminder.clientName}`);
    }
  }

  if (reminders.length > 0) {
    console.log(`\n📋 Rescheduled ${reminders.filter(r => new Date(r.reminderTime) > now).length} pending reminder(s)`);
  }
};

const sendWhatsApp = async (to, body) => {
  if (!GREEN_API_ID_INSTANCE || !GREEN_API_TOKEN_INSTANCE) {
    console.warn('Green API is not configured. Skipping message to', to);
    return;
  }

  const cleaned = cleanPhoneNumber(to);
  const chatId = `${cleaned}@c.us`;
  const endpoint = `${GREEN_API_BASE_URL}/waInstance${GREEN_API_ID_INSTANCE}/sendMessage/${GREEN_API_TOKEN_INSTANCE}`;

  console.log(`[Green API] Sending to chatId: ${chatId}`);
  console.log(`[Green API] Endpoint: ${endpoint}`);

  const greenApiResponse = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chatId,
      message: body,
    }),
  });

  const responseText = await greenApiResponse.text();
  console.log(`[Green API] HTTP ${greenApiResponse.status} — Response: ${responseText.slice(0, 300)}`);

  let parsedResponse = null;

  try {
    parsedResponse = responseText ? JSON.parse(responseText) : null;
  } catch {
    parsedResponse = null;
  }

  if (!greenApiResponse.ok) {
    throw new Error(`Green API send failed (${greenApiResponse.status}): ${responseText.slice(0, 200)}`);
  }

  if (parsedResponse?.error) {
    throw new Error(`Green API error: ${parsedResponse.error}`);
  }

  console.log(`[Green API] Message sent successfully. idMessage: ${parsedResponse?.idMessage || 'N/A'}`);
};

// Firebase Admin Initialization
// const serviceAccount = require('./firebase-service-account.json');
// admin.initializeApp({
//   credential: admin.credential.cert(serviceAccount),
// });

const mapSheetRowToBooking = (row) => ({
  name: row ? (row[0] || '') : '',
  contact: row ? (row[1] || '') : '',
  address: row ? (row[2] || '') : '',
  date: row ? (row[3] || '') : '',
  time: row ? (row[4] || '') : '',
  type: row ? (row[5] || '') : '',
  processedBy: row ? (row[6] || '') : '',
});

const normalizeDateValue = (value) => {
  if (typeof value !== 'string') {
    return value || '';
  }

  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return value.slice(0, 10);
  }

  return value;
};

const normalizeTimeValue = (value) => {
  if (typeof value !== 'string') {
    return value || '';
  }

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) {
    return value.slice(11, 16);
  }

  return value;
};

const normalizeBooking = (booking) => ({
  name: booking?.name || '',
  contact: booking?.contact ? String(booking.contact) : '',
  address: booking?.address || '',
  date: normalizeDateValue(booking?.date),
  time: normalizeTimeValue(booking?.time),
  type: booking?.type || '',
  processedBy: booking?.processedBy || '',
});

const uniqueUrls = (values) => {
  const seen = new Set();
  return values.filter((value) => {
    if (!value || seen.has(value)) {
      return false;
    }
    seen.add(value);
    return true;
  });
};

const fetchBookingsFromAppsScript = async (url) => {
  const appsScriptResponse = await fetch(`${url}?action=list`);
  const responseBody = await appsScriptResponse.text();

  if (!appsScriptResponse.ok) {
    throw new Error(`Apps Script fetch failed with status ${appsScriptResponse.status}: ${responseBody.slice(0, 200)}`);
  }

  let parsedAppsScriptResponse;
  try {
    parsedAppsScriptResponse = JSON.parse(responseBody);
  } catch {
    throw new Error(`Apps Script returned a non-JSON response while reading bookings. Response snippet: ${responseBody.slice(0, 200)}`);
  }

  if (!parsedAppsScriptResponse?.success) {
    throw new Error(parsedAppsScriptResponse?.message || 'Apps Script did not return bookings successfully.');
  }

  return (parsedAppsScriptResponse.bookings || []).map(normalizeBooking);
};

// Routes

const handleBooking = async (req, res) => {
  const { name, contact, address, date, time, type, processedBy } = req.body;

  try {
    if (!name || !contact || !address || !date || !time || !type || !processedBy) {
      return res.status(400).json({
        error: 'All booking fields are required.',
      });
    }

    const booking = { name, contact, address, date, time, type, processedBy };
    let storageBackend = '';

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
      storageBackend = 'google-sheets-service-account';
    } else if (APPS_SCRIPT_URL) {
      const appsScriptResponse = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(booking),
      });

      const responseBody = await appsScriptResponse.text();

      if (!appsScriptResponse.ok) {
        if (appsScriptResponse.status === 403) {
          throw new Error('Apps Script access is denied. Deploy the script as a Web App with access set to Anyone, or configure Google Sheets service account credentials on the server.');
        }

        throw new Error(`Apps Script storage failed with status ${appsScriptResponse.status}: ${responseBody.slice(0, 200)}`);
      }

      let parsedAppsScriptResponse;
      try {
        parsedAppsScriptResponse = JSON.parse(responseBody);
      } catch {
        throw new Error(`Apps Script returned a non-JSON response. Make sure the Web App is deployed correctly. Response snippet: ${responseBody.slice(0, 200)}`);
      }

      if (!parsedAppsScriptResponse?.success) {
        throw new Error(parsedAppsScriptResponse?.message || 'Apps Script did not confirm storage success.');
      }
      storageBackend = 'google-apps-script';
    } else {
      throw new Error('No Google Sheet backend is configured.');
    }

    // Disabled on request: do not send immediate WhatsApp confirmation on booking.
    // Keep only the 30-minute reminder message flow.
    // sendWhatsApp(`91${contact}`, `Hi ${name}, your counselling session is booked for ${date} at ${time}.`)
    //   .catch((err) => console.error('WhatsApp confirmation error:', err.message));

    // Schedule WhatsApp reminder 30 mins before appointment
    // Force Indian Standard Time (UTC+05:30) timezone parsing since cloud servers run in UTC.
    const sessionDate = new Date(`${date}T${time}:00+05:30`);
    const reminderDate = new Date(sessionDate.getTime() - 30 * 60 * 1000); // 30 mins before
    
    // Create a unique ID for this reminder
    const appointmentId = `${name}_${date}_${time}_${Date.now()}`;
    
    scheduleReminder(
      appointmentId,
      reminderDate,
      name,
      contact,
      COUNSELOR_CONTACT,
      time
    );

    res.status(200).json({
      success: true,
      message: 'Booking saved to Google Sheet successfully.',
      backend: storageBackend,
      synced: true,
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: error.message || 'Error booking counselling session.',
    });
  }
};

app.post('/book', handleBooking);
app.post('/api/book', handleBooking);
app.get('/api/whatsapp/status', (req, res) => {
  res.status(200).json({
    provider: 'green-api',
    configured: Boolean(GREEN_API_ID_INSTANCE && GREEN_API_TOKEN_INSTANCE),
  });
});
app.get('/api/bookings', async (req, res) => {
  try {
    if (sheets) {
      const result = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: 'Sheet1!A2:G',
      });

      const rows = result.data.values || [];
      const bookings = rows
        .map(mapSheetRowToBooking)
        .filter((b) => b.name || b.contact)
        .reverse();

      return res.status(200).json({
        success: true,
        bookings,
      });
    }

    if (APPS_SCRIPT_URL) {
      const candidateUrls = uniqueUrls([APPS_SCRIPT_URL, DEFAULT_APPS_SCRIPT_URL]);
      let lastError;

      for (const url of candidateUrls) {
        try {
          const bookings = (await fetchBookingsFromAppsScript(url)).filter((b) => b.name || b.contact);
          return res.status(200).json({
            success: true,
            bookings,
            source: url,
          });
        } catch (error) {
          lastError = error;
          console.warn(`Apps Script read failed for ${url}: ${error.message}`);
        }
      }

      throw lastError || new Error('Apps Script bookings read failed.');
    }

    throw new Error('No Google Sheet backend is configured.');
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: error.message || 'Failed to load bookings.',
    });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);

  setTimeout(() => {
    console.log('\n📋 Checking for pending reminders from previous sessions...');
    rescheduleAllReminders();

    // Trial message to counselor on server start
    console.log('\n📤 Sending trial WhatsApp message to counselor...');
    sendWhatsApp(COUNSELOR_CONTACT, 'Trial message: Counselling App server is up and WhatsApp sending is working.')
      .then(() => console.log('✓ Trial message sent to counselor.'))
      .catch((err) => console.error('✗ Trial message failed:', err.message));
  }, 2000);
});