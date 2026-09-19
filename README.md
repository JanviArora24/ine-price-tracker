# INE Store Product Price Tracker

A robust, full-stack automated price and inventory tracking application built for INE's hosted mock storefront ([https://demo.inelabteamdev.com/](https://demo.inelabteamdev.com/)).

The tracker overcomes real-world anti-scraping mechanisms, decoy elements, cryptographic challenges, click-dropping jitter, and delayed modal overlays to ensure reliable, unattended price and stock monitoring.

---

## Architecture Overview

```
                          ┌───────────────────────────┐
                          │   cron-job.org (2-Hours)  │
                          └─────────────┬─────────────┘
                                        │ POST /api/cron/scrape
                                        │ (X-Cron-Secret Header)
                                        ▼
┌──────────────────┐           ┌─────────────────────────────┐
│  React Frontend  │ ────────> │   Express Backend (Node.js)  │
│     (Vercel)     │           │          (Render)           │
└──────────────────┘           └──────────────┬──────────────┘
                                              │
                      ┌───────────────────────┴───────────────────────┐
                      │                                               │
                      ▼                                               ▼
         ┌────────────────────────┐                      ┌────────────────────────┐
         │  Supabase PostgreSQL   │                      │     INE Mock Store     │
         │ (or Local Offline DAL) │                      │ (demo.inelabteamdev)   │
         └────────────────────────┘                      └────────────────────────┘
```

---

## Tech Stack

- **Frontend**: React 19, Vite, Vanilla CSS (Glassmorphic dark design system, responsive, zero UI framework overhead)
- **Backend**: Node.js, Express
- **Database**: Supabase PostgreSQL (with automatic local persistent storage fallback)
- **Scraping Engine**: Playwright Chromium (with network interception, payload decryption, mouse simulation, and decoy suppression)
- **Scheduling**: External cron triggering via `cron-job.org`

---

## Core Features

1. **Product Search & Tracking**:
   - Live search across 1,000+ mock store products by name, brand, category, or SKU.
   - One-click tracking with duplicate prevention (`409 Conflict`).
2. **Resilient Scraper Engine**:
   - Satisfies the mock store's behavioral requirements (cursor coordinates + dwell time).
   - Handles delayed cookie overlays (1.5s–5.0s popup) and click-dropping jitter (`Xn`).
   - Ignores decoy/honeypot elements (`.price-value`, `[data-price="true"]`).
   - Intercepts and decrypts live XOR server payloads.
   - Exponential backoff with random jitter on transient failures.
3. **Data Integrity & Observability**:
   - Never overwrites valid current data with empty or corrupt values.
   - Price history only contains verified, successful scrapes.
   - Every attempt records duration, HTTP status, and error logs in `scrape_logs`.
4. **Visual Headed Demonstration**:
   - Dedicated CLI command to watch the browser in action: `npm run scrape:headed`.
5. **Scheduled Scraping (Render Free-Tier Friendly)**:
   - Protected endpoint `POST /api/cron/scrape` called by cron-job.org every 2 hours, waking sleeping instances automatically.

---

## Database Setup & SQL Schema

If using Supabase, navigate to the **SQL Editor** in your Supabase Dashboard and run:

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Tracked Products Table
CREATE TABLE IF NOT EXISTS tracked_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_product_id INTEGER NOT NULL UNIQUE,
    name TEXT NOT NULL,
    slug TEXT,
    brand TEXT,
    category TEXT,
    sku TEXT,
    url TEXT NOT NULL,
    image_url TEXT,
    current_price NUMERIC(12, 2),
    current_stock INTEGER,
    stock_status TEXT,
    last_scraped_at TIMESTAMPTZ,
    last_scrape_status TEXT DEFAULT 'pending' CHECK (last_scrape_status IN ('pending', 'success', 'retried', 'failed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Price History Table
CREATE TABLE IF NOT EXISTS price_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tracked_product_id UUID NOT NULL REFERENCES tracked_products(id) ON DELETE CASCADE,
    price NUMERIC(12, 2) NOT NULL,
    stock INTEGER NOT NULL,
    stock_status TEXT,
    scraped_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Scrape Logs Table
CREATE TABLE IF NOT EXISTS scrape_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tracked_product_id UUID REFERENCES tracked_products(id) ON DELETE CASCADE,
    attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status TEXT NOT NULL CHECK (status IN ('success', 'retried', 'failed')),
    attempts INTEGER NOT NULL DEFAULT 1,
    duration_ms INTEGER,
    http_status INTEGER,
    error_message TEXT,
    details JSONB DEFAULT '{}'::jsonb
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tracked_products_ext_id ON tracked_products(external_product_id);
CREATE INDEX IF NOT EXISTS idx_price_history_product_time ON price_history(tracked_product_id, scraped_at DESC);
CREATE INDEX IF NOT EXISTS idx_scrape_logs_product_time ON scrape_logs(tracked_product_id, attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_scrape_logs_status ON scrape_logs(status);
```

> **Note**: If `SUPABASE_URL` is omitted, the backend automatically operates in **Local Storage Mode** (`backend/data/local_db.json`), enabling immediate offline evaluation with full persistence.

---

## Environment Variables

### Backend (`backend/.env`)

```env
PORT=5000
MOCK_STORE_BASE_URL=https://demo.inelabteamdev.com
CRON_SECRET=super_secret_cron_token_12345
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
SCRAPE_HEADLESS=true
SCRAPE_TIMEOUT_MS=35000
```

### Frontend (`frontend/.env`)

```env
VITE_API_BASE_URL=http://localhost:5000
```

---

## Local Setup & Running

### Prerequisites
- Node.js >= 18
- npm

### 1. Install Dependencies

```bash
# Backend
cd backend
npm install
npx playwright install chromium

# Frontend
cd ../frontend
npm install
```

### 2. Run Tests

```bash
cd backend
npm test
node test/e2e.test.js
```

### 3. Start Backend Server

```bash
cd backend
npm start
# Server runs on http://localhost:5000
```

### 4. Start Frontend Dashboard

```bash
cd frontend
npm run dev
# Dashboard opens on http://localhost:3000
```

---

## Headed Scraper Visual Demonstration

To watch the browser navigate, dismiss cookies, move the mouse, click reveal, and decrypt live data in real time:

```bash
cd backend
npm run scrape:headed -- 1
```

*(You can replace `1` with any product ID, e.g. `npm run scrape:headed -- 495`)*

---

## Setting Up Scheduled 2-Hour Scraping with cron-job.org

Because Render free tier sleeps after 15 minutes of inactivity:

1. Register an account at [cron-job.org](https://cron-job.org/).
2. Create a new cron job:
   - **URL**: `https://<your-render-app>.onrender.com/api/cron/scrape`
   - **Schedule**: Every 2 hours (`0 */2 * * *`)
   - **Request Method**: `POST`
   - **Headers**:
     ```
     X-Cron-Secret: super_secret_cron_token_12345
     ```
3. The cron job will wake the Render instance, run the batch scrape, update Supabase, and receive a complete execution summary:

```json
{
  "success": true,
  "message": "Scheduled batch scrape completed.",
  "summary": {
    "totalTracked": 5,
    "processed": 5,
    "succeeded": 5,
    "retried": 0,
    "failed": 0,
    "durationMs": 14230
  }
}
```

---

## Deployment Instructions

### Deploy Backend to Render

1. Create a **New Web Service** connected to your repository.
2. Settings:
   - **Root Directory**: `backend`
   - **Environment**: `Node`
   - **Build Command**: `npm install && npx playwright install chromium`
   - **Start Command**: `npm start`
3. Environment Variables:
   - `MOCK_STORE_BASE_URL`: `https://demo.inelabteamdev.com`
   - `CRON_SECRET`: `<your_chosen_secret>`
   - `SUPABASE_URL`: `<your_supabase_url>`
   - `SUPABASE_SERVICE_ROLE_KEY`: `<your_supabase_key>`
   - `SCRAPE_HEADLESS`: `true`

### Deploy Frontend to Vercel

1. Import your repository into Vercel.
2. Settings:
   - **Root Directory**: `frontend`
   - **Framework Preset**: `Vite`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
3. Environment Variables:
   - `VITE_API_BASE_URL`: `https://<your-render-backend>.onrender.com`

---

## Reliability & Error Handling Strategy

1. **Request Timeout**: Configured at 35 seconds per scrape attempt.
2. **Exponential Backoff**: Up to 3 automatic retries with randomized jitter on transient failures.
3. **Decoy Suppression**: Filters out fake prices generated by mock store honey-pot elements.
4. **Continuation on Error**: During batch cron scrapes, if a single product encounters issues, the remaining products continue processing uninterrupted.
5. **No False Positives**: Failed attempts are recorded in `scrape_logs`, never in `price_history`.
