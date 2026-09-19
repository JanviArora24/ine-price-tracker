-- ==============================================================================
-- INE Mock Store Price Tracker - Supabase PostgreSQL Schema
-- ==============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. TRACKED PRODUCTS
-- Stores metadata and the latest verified price/stock for each tracked product.
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

-- 2. PRICE HISTORY
-- Stores verified, non-empty historical price and stock records.
-- IMPORTANT: Only populated on verified, valid scrapes. Never on failed attempts.
CREATE TABLE IF NOT EXISTS price_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tracked_product_id UUID NOT NULL REFERENCES tracked_products(id) ON DELETE CASCADE,
    price NUMERIC(12, 2) NOT NULL,
    stock INTEGER NOT NULL,
    stock_status TEXT,
    scraped_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. SCRAPE LOGS
-- Observability table capturing every scrape attempt, duration, retries, and errors.
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

-- INDEXES FOR PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_tracked_products_ext_id ON tracked_products(external_product_id);
CREATE INDEX IF NOT EXISTS idx_price_history_product_time ON price_history(tracked_product_id, scraped_at DESC);
CREATE INDEX IF NOT EXISTS idx_scrape_logs_product_time ON scrape_logs(tracked_product_id, attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_scrape_logs_status ON scrape_logs(status);

-- AUTO-UPDATE updated_at TIMESTAMP
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_tracked_products_updated_at ON tracked_products;
CREATE TRIGGER set_tracked_products_updated_at
BEFORE UPDATE ON tracked_products
FOR EACH ROW
EXECUTE FUNCTION update_modified_column();
