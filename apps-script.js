// Google Apps Script for Rol's Counselling App

function getSheet_() {
  const sheetId = '10debAspmaD3ZfKAxeWpgbMC1nNfVhwC-mywsTuCOyOg';
  const sheet = SpreadsheetApp.openById(sheetId).getSheetByName('Sheet1');
  if (!sheet) {
    throw new Error('Sheet "Sheet1" was not found.');
  }
  return sheet;
}

function cleanPhone_(phone) {
  const digits = String(phone).replace(/[^0-9]/g, '');
  return '91' + digits.slice(-10);
}

function getCounselorContact_() {
  const properties = PropertiesService.getScriptProperties();
  const configuredContact = properties.getProperty('counselorContact');
  return configuredContact || '8050045500';
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

    const bookings = values
      .map((row, index) => ({
        name: row[0] || '',
        contact: row[1] || '',
        address: row[2] || '',
        date: row[3] || '',
        time: row[4] || '',
        type: row[5] || '',
        processedBy: row[6] || '',
        bookingId: row[7] || '',
        rowIndex: index + 1,
      }))
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
    const { action, rowIndex, name, contact, address, date, time, type, processedBy, bookingId } = data;

    if (!name || !contact || !address || !date || !time || !type || !processedBy) {
      throw new Error('All fields are required.');
    }

    const sheet = getSheet_();

    if (action === 'update') {
      if (!rowIndex) {
        throw new Error('Row index is required for update.');
      }
      sheet.getRange(Number(rowIndex), 1, 1, 8).setValues([[name, contact, address, date, time, type, processedBy, bookingId || '']]);
      
      // Update persistent trigger (wrap in try/catch so it doesn't fail the booking if triggers fail)
      try {
        cleanOldTriggersByName_(name);
        scheduleReminderTrigger_(name, contact, date, time);
      } catch (triggerError) {
        Logger.log('Trigger update failed: ' + triggerError.message);
      }

      return ContentService
        .createTextOutput(JSON.stringify({ success: true, message: 'Update successful!' }))
        .setMimeType(ContentService.MimeType.JSON);
    } else {
      sheet.appendRow([name, contact, address, date, time, type, processedBy, bookingId || '']);
      
      // Schedule reminder (wrap in try/catch so it doesn't fail the booking if triggers fail)
      try {
        scheduleReminderTrigger_(name, contact, date, time);
      } catch (triggerError) {
        Logger.log('Trigger scheduling failed: ' + triggerError.message);
      }

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

function scheduleReminderTrigger_(name, contact, date, time) {
  const sessionDate = new Date(date + 'T' + time + ':00+05:30');
  const reminderTime = new Date(sessionDate.getTime() - 30 * 60 * 1000); // 30 mins before
  
  if (reminderTime > new Date()) {
    const triggerId = ScriptApp.newTrigger('sendReminder')
      .timeBased()
      .at(reminderTime)
      .create()
      .getUniqueId();

    PropertiesService.getScriptProperties().setProperty('trigger_' + triggerId, JSON.stringify({
      name: name,
      contact: contact,
      time: time
    }));
  }
}

function cleanOldTriggersByName_(name) {
  const properties = PropertiesService.getScriptProperties();
  const keys = properties.getKeys();
  const triggers = ScriptApp.getProjectTriggers();

  keys.forEach(key => {
    if (key.startsWith('trigger_')) {
      const data = JSON.parse(properties.getProperty(key));
      if (data.name === name) {
        const triggerId = key.replace('trigger_', '');
        // Delete trigger
        for (let i = 0; i < triggers.length; i++) {
          if (triggers[i].getUniqueId() === triggerId) {
            ScriptApp.deleteTrigger(triggers[i]);
          }
        }
        properties.deleteProperty(key);
      }
    }
  });
}

function sendReminder(e) {
  if (!e) return;
  const triggerId = e.triggerUid;
  const properties = PropertiesService.getScriptProperties();
  const propValue = properties.getProperty('trigger_' + triggerId);
  
  if (!propValue) return;
  const data = JSON.parse(propValue);

  // --- Green API Settings ---
  const greenApiId = '7107629494';
  const greenApiToken = 'c92fd11ef0c2406f9d9d210a115bafdd75eaf2eb47fb40928f';
  const counselorContact = getCounselorContact_();
  
  const clientChatId = cleanPhone_(data.contact) + '@c.us';
  const counselorChatId = cleanPhone_(counselorContact) + '@c.us';
  const endpoint = 'https://api.green-api.com/waInstance' + greenApiId + '/sendMessage/' + greenApiToken;

  // Send to counselor
  try {
    UrlFetchApp.fetch(endpoint, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({
        chatId: counselorChatId,
        message: 'Reminder: Counselling session with ' + data.name + ' is in 30 minutes (at ' + data.time + ').'
      })
    });
  } catch (err) {
    Logger.log('Failed to send WhatsApp to counselor: ' + err);
  }

  // Send to client
  try {
    UrlFetchApp.fetch(endpoint, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({
        chatId: clientChatId,
        message: 'Hi ' + data.name + ', your counselling session is in 30 minutes (at ' + data.time + ').'
      })
    });
  } catch (err) {
    Logger.log('Failed to send WhatsApp to client: ' + err);
  }

  // Clean property after trigger executes
  properties.deleteProperty('trigger_' + triggerId);
}