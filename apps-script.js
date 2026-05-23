// Google Apps Script for Rol's Counselling App

function getSheet_() {
  const sheetId = '10debAspmaD3ZfKAxeWpgbMC1nNfVhwC-mywsTuCOyOg';
  const sheet = SpreadsheetApp.openById(sheetId).getSheetByName('Sheet1');

  if (!sheet) {
    throw new Error('Sheet "Sheet1" was not found.');
  }

  return sheet;
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
    const values = sheet.getDataRange().getValues();

    const header = ['Name', 'Contact', 'Address', 'Date', 'Time', 'Type', 'Processed By'];
    const hasHeader = values.length > 0 && header.every((value, index) => String(values[0][index] || '').trim() === value);
    const dataRows = hasHeader ? values.slice(1) : values;

    const bookings = dataRows
      .filter((row) => row.some((cell) => String(cell || '').trim() !== ''))
      .map((row) => ({
        name: row[0] || '',
        contact: row[1] || '',
        address: row[2] || '',
        date: row[3] || '',
        time: row[4] || '',
        type: row[5] || '',
        processedBy: row[6] || '',
      }))
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
    const { name, contact, address, date, time, type, processedBy } = data;

    if (!name || !contact || !address || !date || !time || !type || !processedBy) {
      throw new Error('All fields are required.');
    }

    // Open the Google Sheet
    const sheet = getSheet_();

    // Append data
    sheet.appendRow([name, contact, address, date, time, type, processedBy]);

    // Schedule reminder (using time-based trigger)
    const reminderTime = new Date(`${date}T${time}`);
    ScriptApp.newTrigger('sendReminder')
      .timeBased()
      .at(reminderTime)
      .create();

    // Store data for reminder
    PropertiesService.getScriptProperties().setProperty('reminder_' + Date.now(), JSON.stringify({ name, time }));

    return ContentService
      .createTextOutput(JSON.stringify({ success: true, message: 'Booking successful!' }))
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