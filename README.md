# Rol's Counselling App

A web application for booking counselling sessions with reminders via WhatsApp and mobile notifications.

## Features

- Book counselling slots with date, time, and type selection.
- Store data in Google Sheets.
- Send WhatsApp reminders to the officer.
- Browser notifications for confirmations.

## Setup

1. **Google Apps Script Setup**:
   - Go to [Google Apps Script](https://script.google.com).
   - Create a new script and paste the code from `apps-script.js`.
   - Replace `'your_google_sheet_id'` with your Google Sheet ID.
   - Deploy as a web app: Publish > Deploy as web app > Execute as 'Me', Access 'Anyone'.
   - Copy the web app URL and replace in `src/App.jsx`.

2. **Frontend**:
   - Install dependencies: `npm install`
   - Run: `npm run dev`
   - Open http://localhost:5173

## Usage

- Fill in the booking form.
- Submit to book the session.
- Reminders will be sent at the scheduled time via WhatsApp (configure in Apps Script).
