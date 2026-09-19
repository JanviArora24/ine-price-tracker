-- ==============================================================================
-- INE Mock Store Price Tracker - Safe Migration Script
-- ==============================================================================
-- This migration safely aligns the existing Supabase tables (tracked_products,
-- price_history, scrape_logs) with the application schema WITHOUT dropping
-- any tables or losing existing data.
-- ==============================================================================

-- 1. TRACKED_PRODUCTS TABLE
-- Add missing columns required by the application
ALTER TABLE public.tracked_products 
    ADD COLUMN IF NOT EXISTS external_product_id INTEGER UNIQUE,
    ADD COLUMN IF NOT EXISTS name TEXT,
    ADD COLUMN IF NOT EXISTS slug TEXT,
    ADD COLUMN IF NOT EXISTS brand TEXT,
    ADD COLUMN IF NOT EXISTS category TEXT,
    ADD COLUMN IF NOT EXISTS url TEXT,
    ADD COLUMN IF NOT EXISTS image_url TEXT,
    ADD COLUMN IF NOT EXISTS current_price NUMERIC(12, 2),
    ADD COLUMN IF NOT EXISTS current_stock INTEGER,
    ADD COLUMN IF NOT EXISTS stock_status TEXT,
    ADD COLUMN IF NOT EXISTS last_scraped_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_scrape_status TEXT DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Synchronize legacy column names if present
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'tracked_products' AND column_name = 'product_name'
    ) THEN
        UPDATE public.tracked_products SET name = product_name WHERE name IS NULL AND product_name IS NOT NULL;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'tracked_products' AND column_name = 'product_url'
    ) THEN
        UPDATE public.tracked_products SET url = product_url WHERE url IS NULL AND product_url IS NOT NULL;
    END IF;
END $$;

-- 2. PRICE_HISTORY TABLE
-- Add missing stock_status column
ALTER TABLE public.price_history 
    ADD COLUMN IF NOT EXISTS stock_status TEXT;

-- 3. SCRAPE_LOGS TABLE
-- Add missing observability columns
ALTER TABLE public.scrape_logs 
    ADD COLUMN IF NOT EXISTS attempts INTEGER DEFAULT 1,
    ADD COLUMN IF NOT EXISTS duration_ms INTEGER,
    ADD COLUMN IF NOT EXISTS http_status INTEGER,
    ADD COLUMN IF NOT EXISTS details JSONB DEFAULT '{}'::jsonb;

-- Synchronize legacy column names if present
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'scrape_logs' AND column_name = 'attempt_number'
    ) THEN
        UPDATE public.scrape_logs SET attempts = attempt_number WHERE attempts IS NULL AND attempt_number IS NOT NULL;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'scrape_logs' AND column_name = 'response_time_ms'
    ) THEN
        UPDATE public.scrape_logs SET duration_ms = response_time_ms WHERE duration_ms IS NULL AND response_time_ms IS NOT NULL;
    END IF;
END $$;

-- 4. PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_tracked_products_ext_id ON public.tracked_products(external_product_id);
CREATE INDEX IF NOT EXISTS idx_price_history_product_time ON public.price_history(tracked_product_id, scraped_at DESC);
CREATE INDEX IF NOT EXISTS idx_scrape_logs_product_time ON public.scrape_logs(tracked_product_id, attempted_at DESC);

-- 5. RELOAD POSTGREST SCHEMA CACHE
NOTIFY pgrst, 'reload schema';
