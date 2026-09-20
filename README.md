# iNE Assignment

This is a full-stack application that includes a frontend, backend, and a scraper designed to monitor product prices and availability.

## Setup Instructions

### 1. Prerequisites
- Node.js installed
- Supabase account (for database setup)

### 2. Backend Setup
```bash
cd backend
npm install
# Create a .env file based on the environment variables section below
node server.js
```

### 3. Frontend Setup
```bash
cd frontend
# Create a .env file with your backend URL (default: http://localhost:3001)
npm install
npm run dev
```

### 4. Run the headed scraper (for screen recording)
```bash
cd backend
HEADED_MODE=true node headed-demo.js
# Or: npm run scrape:headed
```

## Environment Variables Required

### Backend (`backend/.env`)

| Variable | Description | Example |
|----------|-------------|---------|
| `SUPABASE_URL` | Supabase project URL | `https://xxx.supabase.co` |
| `SUPABASE_KEY` | Supabase service role key | `eyJhbG...` |
| `CRON_SECRET` | Secret key to protect the cron endpoint | `your-random-cron-secret` |
| `PORT` | Backend server port | `3001` |
| `STORE_BASE_URL` | Base URL of the store to scrape | `https://demo.inelabteamdev.com` |
| `FRONTEND_URL` | Allowed frontend URL for CORS | `http://localhost:5173` |

### Frontend (`frontend/.env`)
Create a `.env` in the `frontend` directory containing any necessary variables like the backend API URL (e.g., `VITE_API_URL=http://localhost:3001`).

## Scraping Schedule

The scraper is designed to be triggered externally via a cron endpoint. 

- **Endpoint**: `POST /api/scrape/trigger`
- **Authentication**: Requires the `X-Cron-Secret` header or `secret` query parameter to match the `CRON_SECRET` in your `.env`.
- **How it works**: When triggered, the orchestrator fetches all active tracked products from the database and scrapes their details sequentially (with retry logic and backoff) to avoid overwhelming the target store. You can use external cron services like [cron-job.org](https://cron-job.org) to hit this endpoint at your desired schedule (e.g., every 5 minutes or every hour).
