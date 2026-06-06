// Google Apps Script for Rol's Counselling App

function getSheet_() {
  const sheetId = '10debAspmaD3ZfKAxeWpgbMC1nNfVhwC-mywsTuCOyOg';
  const sheet = SpreadsheetApp.openById(sheetId).getSheetByName('Sheet1');

  if (!sheet) {
    throw new Error('Sheet "Sheet1" was not found.');
  }

  return sheet;
}

function normalizeDateInput_(value) {
  if (!value) {
    return '';
  }

  const asString = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(asString)) {
    return asString;
  }

  const parsed = new Date(asString);
  if (!isNaN(parsed.getTime())) {
    return Utilities.formatDate(parsed, 'Asia/Kolkata', 'yyyy-MM-dd');
  }

  return asString;
}

function normalizeTimeInput_(value) {
  if (!value) {
    return '';
  }

  const asString = String(value).trim();

  const hhmm = asString.match(/^(\d{1,2}):(\d{2})$/);
  if (hhmm) {
    const hours = Number(hhmm[1]);
    const minutes = Number(hhmm[2]);
    if (hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
      return ('0' + hours).slice(-2) + ':' + ('0' + minutes).slice(-2);
    }
  }

  const ampm = asString.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (ampm) {
    let hours = Number(ampm[1]);
    const minutes = Number(ampm[2]);
    const meridiem = ampm[3].toUpperCase();

    if (meridiem === 'AM' && hours === 12) {
      hours = 0;
    }

    if (meridiem === 'PM' && hours !== 12) {
      hours += 12;
    }

    return ('0' + hours).slice(-2) + ':' + ('0' + minutes).slice(-2);
  }

  return asString;
}

function createBookingId_() {
  return Utilities.getUuid();
}

function doGet(e) {
  try {
    const action = e && e.parameter ? e.parameter.action : '';

    if (action !== 'list') {
      return ContentService
        .createTextOutput(JSON.stringify({
          success: true,
          message: 'Apps Script is reachable. Use ?action=list to fetch bookings.',
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const sheet = getSheet_();
    const timezone = sheet.getParent().getSpreadsheetTimeZone();
    const values = sheet.getDataRange().getValues();

    const requiredHeader = ['Name', 'Contact', 'Address', 'Date', 'Time', 'Type', 'Processed By'];
    const hasHeader = values.length > 0 && requiredHeader.every((value, index) => String(values[0][index] || '').trim() === value);

    const bookings = values
      .map((row, index) => {
        const dateVal = row[3] instanceof Date 
          ? Utilities.formatDate(row[3], timezone, "yyyy-MM-dd") 
          : String(row[3] || '');
        const timeVal = row[4] instanceof Date 
          ? Utilities.formatDate(row[4], timezone, "HH:mm") 
          : String(row[4] || '');

        return {
          name: row[0] || '',
          contact: row[1] || '',
          address: row[2] || '',
          date: dateVal,
          time: timeVal,
          type: row[5] || '',
          processedBy: row[6] || '',
          bookingId: row[7] || '',
          rowIndex: index + 1,
        };
      })
      .slice(hasHeader ? 1 : 0)
      .filter((row) => row.name || row.contact)
      .reverse();

    return ContentService
      .createTextOutput(JSON.stringify({ success: true, bookings: bookings }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        message: error && error.message ? error.message : 'Unknown Apps Script error.',
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error('Missing request body.');
    }

    const data = JSON.parse(e.postData.contents);
    const { action, rowIndex, bookingId, name, contact, address, date, time, type, processedBy } = data;
    const normalizedDate = normalizeDateInput_(date);
    const normalizedTime = normalizeTimeInput_(time);
    const normalizedBookingId = bookingId || createBookingId_();

    if (!name || !contact || !address || !normalizedDate || !normalizedTime || !type || !processedBy) {
      throw new Error('All fields are required.');
    }

    // Open the Google Sheet
    const sheet = getSheet_();

    if (action === 'update') {
      if (!rowIndex) {
        throw new Error('Row index is required for update.');
      }
      // Update row (rowIndex in Google Sheet is 1-indexed, columns A to H are 1 to 8)
      sheet.getRange(Number(rowIndex), 1, 1, 8).setValues([[name, contact, address, normalizedDate, normalizedTime, type, processedBy, normalizedBookingId]]);

      return ContentService
        .createTextOutput(JSON.stringify({ success: true, message: 'Update successful!' }))
        .setMimeType(ContentService.MimeType.JSON);
    } else {
      // Append data (normal booking)
      sheet.appendRow([name, contact, address, normalizedDate, normalizedTime, type, processedBy, normalizedBookingId]);

      return ContentService
        .createTextOutput(JSON.stringify({ success: true, message: 'Booking successful!' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        message: error && error.message ? error.message : 'Unknown Apps Script error.',
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function sendReminder() {
  // This function will be called at the reminder time
  const properties = PropertiesService.getScriptProperties();
  const keys = properties.getKeys();

  keys.forEach(key => {
    if (key.startsWith('reminder_')) {
      const data = JSON.parse(properties.getProperty(key));
      // Send WhatsApp reminder using Twilio
      const twilioSid = 'your_account_sid'; // Replace with your Twilio SID
      const twilioToken = 'your_auth_token'; // Replace with your Twilio token
      const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`;

      const payload = {
        From: 'whatsapp:+14155238886', // Twilio WhatsApp number
        To: 'whatsapp:+918867030490', // Destination number
        Body: `Reminder: Counselling session for ${data.name} at ${data.time}.`
      };

      const options = {
        method: 'post',
        headers: {
          'Authorization': 'Basic ' + Utilities.base64Encode(twilioSid + ':' + twilioToken),
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        payload: payload
      };

      try {
        UrlFetchApp.fetch(twilioUrl, options);
        Logger.log('Reminder sent via WhatsApp');
      } catch (error) {
        Logger.log('Error sending reminder: ' + error);
      }

      // Remove the property
      properties.deleteProperty(key);
    }
  });
}

// For testing, you can call this function
function testBooking() {
  const testData = {
    name: 'John Doe',
    contact: '1234567890',
    address: '123 Main St',
    date: '2023-10-01',
    time: '10:00',
    type: 'mental-health',
    processedBy: 'Officer A'
  };

  const e = { postData: { contents: JSON.stringify(testData) } };
  const result = doPost(e);
  Logger.log(result.getContent());
}