-- INE Price Tracker — Supabase Schema
-- Run this in the Supabase SQL Editor to set up all tables.

-- Product catalog (cache of products from the store listing page)
CREATE TABLE IF NOT EXISTS product_catalog (
  id SERIAL PRIMARY KEY,
  store_product_id INTEGER UNIQUE NOT NULL,
  name TEXT NOT NULL,
  brand TEXT,
  category TEXT,
  last_refreshed TIMESTAMPTZ DEFAULT NOW()
);

-- Tracked products (products the user has chosen to track)
CREATE TABLE IF NOT EXISTS tracked_products (
  id SERIAL PRIMARY KEY,
  store_product_id INTEGER UNIQUE NOT NULL,
  name TEXT NOT NULL,
  brand TEXT,
  category TEXT,
  sku TEXT,
  description TEXT,
  image_url TEXT,
  scrape_frequency_hours INTEGER DEFAULT 2,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Price & stock history (one row per scrape per product)
CREATE TABLE IF NOT EXISTS price_history (
  id SERIAL PRIMARY KEY,
  tracked_product_id INTEGER REFERENCES tracked_products(id) ON DELETE CASCADE,
  price DECIMAL(10,2),
  mrp DECIMAL(10,2),
  discount_pct DECIMAL(5,2),
  stock INTEGER,
  stock_status TEXT,
  currency TEXT DEFAULT 'INR',
  scraped_at TIMESTAMPTZ DEFAULT NOW()
);

-- Scrape log (one row per scrape attempt per product — honest logging)
CREATE TABLE IF NOT EXISTS scrape_logs (
  id SERIAL PRIMARY KEY,
  tracked_product_id INTEGER REFERENCES tracked_products(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('success', 'retried', 'failed')),
  attempts INTEGER DEFAULT 1,
  error_message TEXT,
  duration_ms INTEGER,
  scraped_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_price_history_product_time 
  ON price_history(tracked_product_id, scraped_at DESC);

CREATE INDEX IF NOT EXISTS idx_scrape_logs_product_time 
  ON scrape_logs(tracked_product_id, scraped_at DESC);

CREATE INDEX IF NOT EXISTS idx_product_catalog_name 
  ON product_catalog(name);

CREATE INDEX IF NOT EXISTS idx_tracked_products_active 
  ON tracked_products(is_active);

-- Enable Row Level Security (optional, for Supabase best practices)
-- ALTER TABLE product_catalog ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE tracked_products ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE price_history ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE scrape_logs ENABLE ROW LEVEL SECURITY;

-- Since we're using the service role key from the backend, 
-- we don't need RLS policies for this use case.
