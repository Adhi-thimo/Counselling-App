// Google Apps Script for Rol's Counselling App

function doPost(e) {
  const data = JSON.parse(e.postData.contents);
  const { name, contact, address, date, time, type, processedBy } = data;

  // Open the Google Sheet
  const sheetId = '10debAspmaD3ZfKAxeWpgbMC1nNfVhwC-mywsTuCOyOg'; // Your Google Sheet ID
  const sheet = SpreadsheetApp.openById(sheetId).getSheetByName('Sheet1');

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
        To: 'whatsapp:+918050045500', // Destination number
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