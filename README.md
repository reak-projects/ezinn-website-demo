# EZinn — Interactive Hotel Check-In Platform

EZinn is a premium self-service hotel check-in platform designed to simplify the guest arrival experience through interactive kiosks, automated workflows, AI-powered support, and hotel management tools.

The project combines an immersive 3D website experience with a scalable backend and AI infrastructure.

---

## 🚀 Project Vision

The core goal of EZinn is simple:

> **Let guests check in without waiting at the front desk.**

The guest journey:

```text
Guest Arrives
      ↓
Find Booking
      ↓
Verify Identity
      ↓
Complete Payment
      ↓
Receive Room Key
      ↓
Access Room
```

## Request a Demo Email

The demo form sends requests to the Node API at `/api/demo-request`. The API validates the submitted fields and sends the message through the configured SMTP service; SMTP credentials are read only by the server.

### Configure SMTP

Use Node.js 22.12 or later. Copy `.env.example` to `.env` and replace the example values:

| Variable | Purpose |
| --- | --- |
| `DEMO_RECIPIENT_EMAIL` | EZinn business inbox that should receive demo requests |
| `SMTP_HOST` | SMTP server hostname from your email provider |
| `SMTP_PORT` | SMTP port, commonly `587` or `465` |
| `SMTP_SECURE` | Set to `true` for implicit TLS (commonly port `465`); otherwise set to `false` (commonly port `587` with STARTTLS) |
| `SMTP_USER` | SMTP account username |
| `SMTP_PASSWORD` | SMTP account password or provider-issued SMTP credential |
| `SMTP_FROM` | Sender identity authorized by your provider |
| `PORT` | Optional API port; defaults to `3001` |

Keep `.env` private and do not prefix these server variables with `VITE_`. The checked-in `.env.example` contains placeholders, not working credentials.

### Run locally

Start the API and frontend in separate terminals:

```sh
npm run server
npm run dev
```

Vite forwards `/api` requests to the local API. In Vercel, `api/demo-request.js` provides the `/api/demo-request` serverless function; the Vercel project serves it alongside the Vite frontend. Configure the SMTP environment variables in Vercel Project Settings for each target environment rather than putting secrets in the frontend. `PORT` is only used by the local server.

### Verify delivery

Run the mock-backed server checks with `npm run test:server`; they verify validation, the message fields and timestamp, SMTP failure/retry behavior, and the Vercel function's parsed request body without contacting a real mail service. Run `npm run lint` and `npm run build` for frontend and server checks.

To test the actual mail path, configure valid SMTP credentials and the real `DEMO_RECIPIENT_EMAIL`, start both local processes, submit a valid request through the website, and check that inbox (including spam/junk) for all form fields and the UTC submission time. An API success means the SMTP server accepted the message; it does not guarantee final inbox delivery. Check your email provider's delivery logs if it does not appear.
