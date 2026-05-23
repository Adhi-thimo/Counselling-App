# Rol's Counselling App

A web application for booking counselling sessions with reminders via WhatsApp and mobile notifications.

## Features

- Book counselling slots with date, time, and type selection.
- Store data in Google Sheets.
- Send WhatsApp confirmations and reminders through Green API.
- Browser notifications for confirmations.

## Setup

1. Install dependencies
   - `npm install`

2. Configure backend storage (choose one)
   - Google Sheets service account (recommended): set `SHEET_ID`, `CLIENT_EMAIL`, `PRIVATE_KEY`.
   - Apps Script fallback: set `APPS_SCRIPT_URL` to your deployed Web App URL.
     Your script deployment must allow public access, otherwise booking will fail with access denied.

3. Configure WhatsApp sending with Green API
   - Create an instance in Green API dashboard and scan QR with your WhatsApp number.
   - Set these backend environment variables:
     - `GREEN_API_ID_INSTANCE` (example: `1101xxxxxx`)
     - `GREEN_API_TOKEN_INSTANCE` (from instance settings)
   - Optional backend variables:
     - `GREEN_API_BASE_URL` (default: `https://api.green-api.com`)
     - `COUNSELOR_CONTACT` (default: `8867030490`)

4. Local development
   - Run: `npm run dev`
   - This starts both backend (`:5001`) and frontend (Vite, usually `:5173` or next free port).

5. Deployment
   - Deploy backend and frontend.
   - Set frontend env var `VITE_API_BASE_URL` to your backend base URL (for example, `https://api.example.com`).
   - Set backend env var `ALLOWED_ORIGINS` to your frontend origin(s), comma-separated (or `*` for open access).
   - Ensure Green API vars are set on backend host.

## Usage

- Fill in the booking form.
- Submit to book the session.
- Backend stores booking and sends WhatsApp confirmation immediately.
- Reminder messages are sent 30 minutes before session time.

## API Check

- `GET /api/whatsapp/status` returns whether Green API credentials are configured.
