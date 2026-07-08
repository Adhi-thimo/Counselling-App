const express = require('express');
const { google } = require('googleapis');
const admin = require('firebase-admin');
const bodyParser = require('body-parser');
const schedule = require('node-schedule');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});

const app = express();
const REMINDERS_FILE = path.join(__dirname, '.reminders.json');
const BOOKING_COUNTER_FILE = path.join(__dirname, '.booking-counter.json');
const scheduledReminderIds = new Set();
const PORT = process.env.NODE_ENV === 'production'
  ? (process.env.PORT || 5001)
  : 5001;

// Local/default configuration. For production, you can still override any value using process.env.
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL || 'https://script.google.com/macros/s/AKfycbzdO98nydmTJiEA9PuoEdMeOpU9JI8t9P_JjCPvw0p2RlUJGv6J7N6VfMAhwFRlvCdI/exec';
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS || 'http://localhost:5173';
const GREEN_API_ID_INSTANCE = process.env.GREEN_API_ID_INSTANCE || '7107629494';
const GREEN_API_TOKEN_INSTANCE = process.env.GREEN_API_TOKEN_INSTANCE || 'c92fd11ef0c2406f9d9d210a115bafdd75eaf2eb47fb40928f';
const GREEN_API_BASE_URL = (process.env.GREEN_API_BASE_URL || 'https://api.green-api.com').replace(/\/$/, '');
const COUNSELOR_CONTACT = process.env.COUNSELOR_CONTACT || '8050045500';
const COUNSELOR_NAME = process.env.COUNSELOR_NAME || 'Benson K Sunny';

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

const readBookingCounter = () => {
  try {
    if (fs.existsSync(BOOKING_COUNTER_FILE)) {
      const data = fs.readFileSync(BOOKING_COUNTER_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.warn('Failed to read booking counter:', error.message);
  }
  return { date: '', counter: 0 };
};

const writeBookingCounter = (counter) => {
  try {
    fs.writeFileSync(BOOKING_COUNTER_FILE, JSON.stringify(counter, null, 2));
  } catch (error) {
    console.error('Failed to save booking counter:', error.message);
  }
};

const createBookingId = () => {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const dateStr = `${yy}${mm}${dd}`;

  const counter = readBookingCounter();
  const seq = counter.date === dateStr ? counter.counter + 1 : 1;
  writeBookingCounter({ date: dateStr, counter: seq });

  return `${dateStr}${String(seq).padStart(3, '0')}`;
};

const createReminderId = (clientName, reminderDate, appointmentTime, counsellingType, counselorContact) => {
  const normalizedDate = reminderDate instanceof Date ? reminderDate.toISOString() : String(reminderDate || '').trim();

  return [
    String(clientName || '').trim().toLowerCase(),
    normalizedDate,
    String(appointmentTime || '').trim().toLowerCase(),
    String(counsellingType || '').trim().toLowerCase(),
    cleanPhoneNumber(counselorContact),
  ].join('|');
};

const toReminderKey = (reminder) => {
  if (!reminder || typeof reminder !== 'object') {
    return '';
  }

  if (reminder.id) {
    return String(reminder.id).trim();
  }

  return [
    reminder.clientName || '',
    reminder.reminderTime || '',
    reminder.counsellingType || '',
    reminder.appointmentTime || '',
    reminder.counselorContact || '',
  ].join('|').trim();
};

const dedupeReminders = (reminders) => {
  if (!Array.isArray(reminders)) {
    return [];
  }

  const seen = new Set();
  const deduped = [];

  for (const reminder of reminders) {
    const key = toReminderKey(reminder);
    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(reminder);
  }

  return deduped;
};

// Load pending reminders from file
const loadReminders = () => {
  try {
    if (fs.existsSync(REMINDERS_FILE)) {
      const data = fs.readFileSync(REMINDERS_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      const deduped = dedupeReminders(parsed);

      if (Array.isArray(parsed) && deduped.length !== parsed.length) {
        saveReminders(deduped);
      }

      return deduped;
    }
  } catch (error) {
    console.warn('Failed to load reminders:', error.message);
  }
  return [];
};

// Save reminders to file
const saveReminders = (reminders) => {
  try {
    const deduped = dedupeReminders(reminders);
    fs.writeFileSync(REMINDERS_FILE, JSON.stringify(deduped, null, 2));
  } catch (error) {
    console.error('Failed to save reminders:', error.message);
  }
};

const normalizeComparableText = (value) => String(value ?? '').trim().toLowerCase();

const normalizeComparableContact = (value) => String(value ?? '').replace(/[^0-9]/g, '');

const areSameBooking = (left, right) => {
  if (!left || !right) {
    return false;
  }

  if (left.bookingId && right.bookingId) {
    return String(left.bookingId).trim() === String(right.bookingId).trim();
  }

  const leftContact = normalizeComparableContact(left.contact);
  const rightContact = normalizeComparableContact(right.contact);

  const contactMatches = leftContact && rightContact
    ? leftContact === rightContact
    : normalizeComparableText(left.contact) === normalizeComparableText(right.contact);

  return (
    normalizeComparableText(left.name) === normalizeComparableText(right.name)
    && contactMatches
    && normalizeComparableText(left.address) === normalizeComparableText(right.address)
    && normalizeComparableText(normalizeDateValue(left.date)) === normalizeComparableText(normalizeDateValue(right.date))
    && normalizeComparableText(normalizeTimeValue(left.time)) === normalizeComparableText(normalizeTimeValue(right.time))
    && normalizeComparableText(left.type) === normalizeComparableText(right.type)
    && normalizeComparableText(left.processedBy) === normalizeComparableText(right.processedBy)
  );
};

const resolveRowIndexFromSheetRows = (rows, originalBooking) => {
  const matchIndex = rows.findIndex((row) => areSameBooking(mapSheetRowToBooking(row), originalBooking));
  return matchIndex >= 0 ? matchIndex + 2 : null;
};

const resolveRowIndexFromAppsScript = async (url, originalBooking) => {
  const bookings = await fetchBookingsFromAppsScript(url);
  const matchIndex = bookings.findIndex((booking) => areSameBooking(booking, originalBooking));

  if (matchIndex < 0) {
    return null;
  }

  // Apps Script list endpoint returns newest first, while sheet row indexes grow with time.
  return bookings.length + 1 - matchIndex;
};

const resolveMissingRowIndex = async (originalBooking) => {
  if (!originalBooking) {
    return null;
  }

  if (sheets) {
    try {
      const result = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID,
        range: 'Sheet1!A2:H',
      });

      const rows = result.data.values || [];
      const rowIndex = resolveRowIndexFromSheetRows(rows, originalBooking);
      if (rowIndex) {
        return rowIndex;
      }
    } catch (error) {
      console.warn(`Could not resolve row index via Sheets API: ${error.message}`);
    }
  }

  if (APPS_SCRIPT_URL) {
    try {
      return await resolveRowIndexFromAppsScript(APPS_SCRIPT_URL, originalBooking);
    } catch (error) {
      console.warn(`Could not resolve row index via Apps Script list: ${error.message}`);
    }
  }

  return null;
};

// Schedule a reminder with persistence
const REMINDER_LOG = path.join(__dirname, 'reminder.log');
const logReminder = (msg) => {
  const line = `[${new Date().toISOString()}] REMINDER: ${msg}`;
  console.log(line);
  try { fs.appendFileSync(REMINDER_LOG, line + '\n'); } catch (e) { console.error('Log write failed:', e.message); }
};

const scheduleReminder = (
  appointmentId,
  reminderDate,
  clientName,
  clientContact,
  counselorContact,
  appointmentTime,
  counsellingType,
  bookingId,
  options = {}
) => {
  const { persist = true } = options;

  logReminder(`scheduleReminder called for ${clientName} at ${appointmentTime}, reminderDate=${reminderDate.toISOString()}`);

  if (reminderDate <= new Date()) {
    logReminder(`Reminder time ${reminderDate} is in the past. Skipping.`);
    return;
  }

  if (scheduledReminderIds.has(appointmentId)) {
    logReminder(`Skipping duplicate in-memory schedule for reminder ${appointmentId}`);
    return;
  }

  if (persist) {
    const reminders = loadReminders();
    if (reminders.some((reminder) => reminder.id === appointmentId)) {
      logReminder(`Reminder ${appointmentId} already exists on disk. Skipping duplicate schedule.`);
      return;
    }
  }

  scheduledReminderIds.add(appointmentId);

  logReminder(`Creating scheduleJob for ${clientName} at ${reminderDate.toISOString()}`);

  schedule.scheduleJob(reminderDate, async () => {
    logReminder(`JOB FIRED for ${clientName} at ${appointmentTime}`);
    
    try {
      logReminder(`About to call sendWhatsApp to counselor (${counselorContact})...`);
      const safeType = String(counsellingType || 'General').trim();
      await sendWhatsApp(
        counselorContact,
        `Hi ${COUNSELOR_NAME} Your councelling with ${clientName} regarding ${safeType} councelling is schedule by ${appointmentTime}`
      );
      logReminder(`sendWhatsApp completed successfully`);
    } catch (err) {
      logReminder(`sendWhatsApp FAILED: ${err.message}`);
    }

    // Mark reminder as sent
    const reminders = loadReminders();
    const updatedReminders = reminders.filter(r => r.id !== appointmentId);
    saveReminders(updatedReminders);
    scheduledReminderIds.delete(appointmentId);
    logReminder(`Reminder ${appointmentId} cleaned up.`);
  });

  if (persist) {
    // Store in file for persistence only when this reminder is newly created.
    const reminders = loadReminders();
    reminders.push({
      id: appointmentId,
      reminderTime: reminderDate.toISOString(),
      clientName,
      clientContact: cleanPhoneNumber(clientContact),
      counselorContact: cleanPhoneNumber(counselorContact),
      appointmentTime,
      counsellingType,
      bookingId: bookingId || appointmentId,
      status: 'pending',
    });
    saveReminders(reminders);
  }

  console.log(`✓ Reminder scheduled for ${clientName} at ${reminderDate.toISOString()}`);
};

// Reschedule all pending reminders on server start
const rescheduleAllReminders = async () => {
  const reminders = loadReminders();
  const now = new Date();
  const activeReminders = [];

  for (const reminder of reminders) {
    const reminderTime = new Date(reminder.reminderTime);
    
    // Only reschedule if in the future
    if (reminderTime > now) {
      activeReminders.push(reminder);
      console.log(`Rescheduling reminder for ${reminder.clientName} at ${reminderTime.toISOString()}`);
      scheduleReminder(
        reminder.id,
        reminderTime,
        reminder.clientName,
        reminder.clientContact,
        reminder.counselorContact,
        reminder.appointmentTime,
        reminder.counsellingType,
        reminder.bookingId,
        { persist: false }
      );
    } else {
      console.log(`Skipping expired reminder for ${reminder.clientName}`);
    }
  }

  // Cleanup expired reminders from disk and keep one unique copy of each pending reminder.
  saveReminders(activeReminders);

  if (activeReminders.length > 0) {
    console.log(`\n📋 Rescheduled ${activeReminders.length} pending reminder(s)`);
  }
};

const GREEN_API_LOG = path.join(__dirname, 'green-api.log');
const logGreenApi = (msg) => {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(GREEN_API_LOG, line + '\n'); } catch {}
};

const sendWhatsApp = async (to, body) => {
  if (!GREEN_API_ID_INSTANCE || !GREEN_API_TOKEN_INSTANCE) {
    logGreenApi(`WARN: Green API not configured. Skipping message to ${to}`);
    return;
  }

  const cleaned = cleanPhoneNumber(to);
  const chatId = `${cleaned}@c.us`;
  const endpoint = `${GREEN_API_BASE_URL}/waInstance${GREEN_API_ID_INSTANCE}/sendMessage/${GREEN_API_TOKEN_INSTANCE}`;

  logGreenApi(`Sending to chatId: ${chatId}`);
  logGreenApi(`Endpoint: ${endpoint}`);

  try {
    const greenApiResponse = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId, message: body }),
    });

    const responseText = await greenApiResponse.text();
    logGreenApi(`HTTP ${greenApiResponse.status} — Response: ${responseText.slice(0, 500)}`);

    let parsedResponse = null;
    try { parsedResponse = responseText ? JSON.parse(responseText) : null; } catch { parsedResponse = null; }

    if (!greenApiResponse.ok) {
      throw new Error(`Green API send failed (${greenApiResponse.status}): ${responseText.slice(0, 200)}`);
    }

    if (parsedResponse?.error) {
      throw new Error(`Green API error: ${parsedResponse.error}`);
    }

    logGreenApi(`Message sent successfully. idMessage: ${parsedResponse?.idMessage || 'N/A'}`);
  } catch (err) {
    logGreenApi(`ERROR: ${err.message}`);
    throw err;
  }
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
  date: normalizeDateValue(row ? row[3] : ''),
  time: normalizeTimeValue(row ? row[4] : ''),
  type: row ? (row[5] || '') : '',
  processedBy: row ? (row[6] || '') : '',
  bookingId: row ? (row[7] || '') : '',
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
  if (typeof value === 'number' && Number.isFinite(value)) {
    const totalMinutes = Math.round(value * 24 * 60);
    const minutesInDay = ((totalMinutes % (24 * 60)) + (24 * 60)) % (24 * 60);
    const hours = String(Math.floor(minutesInDay / 60)).padStart(2, '0');
    const minutes = String(minutesInDay % 60).padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Intl.DateTimeFormat('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Asia/Kolkata',
    }).format(value);
  }

  if (typeof value !== 'string') {
    return value || '';
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  // Convert 12-hour values like 5:45 PM into 24-hour format.
  const meridiemMatch = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (meridiemMatch) {
    let hours = Number.parseInt(meridiemMatch[1], 10);
    const minutes = Number.parseInt(meridiemMatch[2], 10);
    const meridiem = meridiemMatch[3].toUpperCase();

    if (meridiem === 'AM' && hours === 12) {
      hours = 0;
    }

    if (meridiem === 'PM' && hours !== 12) {
      hours += 12;
    }

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  if (/^\d{1,2}:\d{2}$/.test(trimmed)) {
    const [hoursPart, minutesPart] = trimmed.split(':');
    const hours = Number.parseInt(hoursPart, 10);
    const minutes = Number.parseInt(minutesPart, 10);

    if (Number.isInteger(hours) && Number.isInteger(minutes) && hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }
  }

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(trimmed)) {
    const parsedDate = new Date(trimmed);
    if (!Number.isNaN(parsedDate.getTime())) {
      return new Intl.DateTimeFormat('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'Asia/Kolkata',
      }).format(parsedDate);
    }

    return trimmed.slice(11, 16);
  }

  return trimmed;
};

const normalizeBooking = (booking) => ({
  name: booking?.name || '',
  contact: booking?.contact ? String(booking.contact) : '',
  address: booking?.address || '',
  date: normalizeDateValue(booking?.date),
  time: normalizeTimeValue(booking?.time),
  type: booking?.type || '',
  processedBy: booking?.processedBy || '',
  bookingId: booking?.bookingId || '',
  rowIndex: booking?.rowIndex || null,
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

  const bookings = parsedAppsScriptResponse.bookings || [];

  return bookings.map((booking, index) => {
    const normalizedBooking = normalizeBooking(booking);

    if (!normalizedBooking.rowIndex) {
      // Apps Script returns newest first; convert list position back to sheet row index.
      normalizedBooking.rowIndex = bookings.length - index + 1;
    }

    if (!normalizedBooking.bookingId) {
      normalizedBooking.bookingId = `sheet-row-${normalizedBooking.rowIndex}`;
    }

    return normalizedBooking;
  });
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

    const booking = { name, contact, address, date, time, type, processedBy, bookingId: createBookingId() };
    let storageBackend = '';

    // Append data to Google Sheet
    let synced = false;
    if (sheets) {
      try {
        await sheets.spreadsheets.values.append({
          spreadsheetId: SHEET_ID,
          range: 'Sheet1!A:H',
          valueInputOption: 'USER_ENTERED',
          requestBody: {
            values: [[name, contact, address, date, time, type, processedBy, booking.bookingId]],
          },
        });
        storageBackend = 'google-sheets-service-account';
        synced = true;
      } catch (sheetError) {
        console.warn(`Direct Google Sheets append failed: ${sheetError.message}. Falling back to Apps Script...`);
      }
    }

    if (!synced && APPS_SCRIPT_URL) {
      try {
        const appsScriptResponse = await fetch(APPS_SCRIPT_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(booking),
        });

        const responseBody = await appsScriptResponse.text();

        if (!appsScriptResponse.ok) {
          throw new Error(`Apps Script storage failed with status ${appsScriptResponse.status}: ${responseBody.slice(0, 200)}`);
        }

        let parsedAppsScriptResponse;
        try {
          parsedAppsScriptResponse = JSON.parse(responseBody);
        } catch {
          throw new Error(`Apps Script returned a non-JSON response. Response snippet: ${responseBody.slice(0, 200)}`);
        }

        if (!parsedAppsScriptResponse?.success) {
          throw new Error(parsedAppsScriptResponse?.message || 'Apps Script did not confirm storage success.');
        }

        storageBackend = 'google-apps-script';
        synced = true;
      } catch (appsScriptError) {
        console.warn(`Apps Script booking write failed: ${appsScriptError.message}. Falling back to local storage.`);
      }
    }

    if (!synced) {
      throw new Error('Not able to access Google Sheet.');
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
    const appointmentId = createReminderId(name, reminderDate, time, type, COUNSELOR_CONTACT);
    
    scheduleReminder(
      appointmentId,
      reminderDate,
      name,
      contact,
      COUNSELOR_CONTACT,
      time,
      type,
      booking.bookingId
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

const handleEdit = async (req, res) => {
  const { rowIndex, source, savedAt, originalBooking, bookingId, name, contact, address, date, time, type, processedBy } = req.body;

  try {
    if (!name || !contact || !address || !date || !time || !type || !processedBy) {
      return res.status(400).json({
        error: 'All booking fields are required.',
      });
    }

    const resolvedBookingId = bookingId || originalBooking?.bookingId || (rowIndex ? `sheet-row-${rowIndex}` : '');
    const booking = { name, contact, address, date, time, type, processedBy, bookingId: resolvedBookingId };
    const editTarget = originalBooking || { source, savedAt, ...booking };
    let storageBackend = '';
    let synced = false;
    let resolvedRowIndex = rowIndex ? Number(rowIndex) : null;

    if (!resolvedRowIndex) {
      resolvedRowIndex = await resolveMissingRowIndex(editTarget);
    }

    // 1. Direct Sheets API
    if (!synced && resolvedRowIndex && sheets) {
      try {
        await sheets.spreadsheets.values.update({
          spreadsheetId: SHEET_ID,
          range: `Sheet1!A${resolvedRowIndex}:H${resolvedRowIndex}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: {
            values: [[name, contact, address, date, time, type, processedBy, resolvedBookingId || `sheet-row-${resolvedRowIndex}`]],
          },
        });
        storageBackend = 'google-sheets-service-account';
        synced = true;
      } catch (sheetError) {
        console.warn(`Direct Google Sheets edit failed: ${sheetError.message}. Falling back to Apps Script...`);
      }
    }

    // 2. Apps Script fallback
    if (!synced && resolvedRowIndex && APPS_SCRIPT_URL) {
      try {
        const appsScriptResponse = await fetch(APPS_SCRIPT_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'update',
            rowIndex: Number(resolvedRowIndex),
            ...booking
          }),
        });

        const responseBody = await appsScriptResponse.text();

        if (!appsScriptResponse.ok) {
          throw new Error(`Apps Script update failed with status ${appsScriptResponse.status}: ${responseBody.slice(0, 200)}`);
        }

        let parsedAppsScriptResponse;
        try {
          parsedAppsScriptResponse = JSON.parse(responseBody);
        } catch {
          throw new Error(`Apps Script returned a non-JSON response on update. Response snippet: ${responseBody.slice(0, 200)}`);
        }

        if (!parsedAppsScriptResponse?.success) {
          throw new Error(parsedAppsScriptResponse?.message || 'Apps Script did not confirm update success.');
        }

        storageBackend = 'google-apps-script';
        synced = true;
      } catch (appsScriptError) {
        console.warn(`Apps Script edit failed: ${appsScriptError.message}. Falling back to local storage.`);
      }
    }

    if (!synced) {
      throw new Error('Not able to access Google Sheet.');
    }

    // Reschedule WhatsApp reminder
    try {
      const reminders = loadReminders();
      const previousReminderId = originalBooking
        ? createReminderId(originalBooking.name, new Date(`${originalBooking.date}T${normalizeTimeValue(originalBooking.time)}:00+05:30`), normalizeTimeValue(originalBooking.time), originalBooking.type, COUNSELOR_CONTACT)
        : '';
      const updatedReminders = reminders.filter(r => {
        if (r.id === previousReminderId || r.bookingId === resolvedBookingId || (r.clientName === name && r.status === 'pending')) {
          return false;
        }
        return true;
      });
      saveReminders(updatedReminders);

      const sessionDate = new Date(`${date}T${time}:00+05:30`);
      const reminderDate = new Date(sessionDate.getTime() - 30 * 60 * 1000); // 30 mins before
      
      const appointmentId = createReminderId(name, reminderDate, time, type, COUNSELOR_CONTACT);
      scheduleReminder(
        appointmentId,
        reminderDate,
        name,
        contact,
        COUNSELOR_CONTACT,
        time,
        type,
        resolvedBookingId
      );
    } catch (reminderErr) {
      console.error('Failed to reschedule reminder on edit:', reminderErr.message);
    }

    res.status(200).json({
      success: true,
      message: 'Booking updated successfully.',
      backend: storageBackend,
      synced: true,
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: error.message || 'Error updating counselling session.',
    });
  }
};

app.post('/book', handleBooking);
app.post('/api/book', handleBooking);
app.post('/edit', handleEdit);
app.post('/api/edit', handleEdit);
app.post('/api/update', handleEdit);
app.get('/api/whatsapp/status', (req, res) => {
  res.status(200).json({
    provider: 'green-api',
    configured: Boolean(GREEN_API_ID_INSTANCE && GREEN_API_TOKEN_INSTANCE),
  });
});
app.get('/api/bookings', async (req, res) => {
  try {
    if (sheets) {
      try {
        const result = await sheets.spreadsheets.values.get({
          spreadsheetId: SHEET_ID,
          range: 'Sheet1!A2:H',
        });

        const rows = result.data.values || [];
        const bookings = rows
          .map((row, idx) => {
            const b = mapSheetRowToBooking(row);
            b.rowIndex = idx + 2; // Header is row 1
            if (!b.bookingId) {
              b.bookingId = `sheet-row-${b.rowIndex}`;
            }
            return b;
          })
          .filter((b) => b.name || b.contact)
          .reverse();

        return res.status(200).json({
          success: true,
          bookings,
        });
      } catch (sheetError) {
        console.warn(`Direct Google Sheets API failed: ${sheetError.message}. Falling back to Apps Script...`);
      }
    }

    if (APPS_SCRIPT_URL) {
      const candidateUrls = uniqueUrls([APPS_SCRIPT_URL]);
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

    throw new Error('Not able to access Google Sheet.');
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: 'Not able to access Google Sheet.',
    });
  }
});

// Test endpoint to directly send WhatsApp
app.post('/api/test-whatsapp', async (req, res) => {
  try {
    const { to, message } = req.body;
    await sendWhatsApp(to || COUNSELOR_CONTACT, message || 'Test message from server');
    res.status(200).json({ success: true, message: 'WhatsApp sent' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/test-reminder', async (req, res) => {
  try {
    const { name = 'Test User', contact = '9876543210', date = '2026-07-01', time = '23:59', type = 'Test' } = req.body || {};
    const reminderDate = new Date();
    reminderDate.setMinutes(reminderDate.getMinutes() + 1);

    scheduleReminder(
      `test-reminder-${Date.now()}`,
      reminderDate,
      name,
      contact,
      COUNSELOR_CONTACT,
      time,
      type,
      `test-${Date.now()}`
    );

    res.status(200).json({ success: true, message: 'Reminder scheduled for 1 minute from now.' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Export the app for serverless deployments (like Vercel)
module.exports = app;

// Start Server locally or on persistent environments (only if not running on Vercel)
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);

    setTimeout(() => {
      console.log('\n📋 Checking for pending reminders from previous sessions...');
      rescheduleAllReminders();
    }, 2000);
  });
}