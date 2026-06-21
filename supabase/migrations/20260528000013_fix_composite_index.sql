-- Migration: Fix Composite Index Ordering (Issue 3.10)
-- Replaces the inefficient composite index with a targeted B-Tree for exact phone matching
-- and a highly optimized GIN index for partial/full-text name matching.

-- 1. Drop the incorrect composite index
DROP INDEX IF EXISTS idx_customers_search;

-- 2. Create optimized B-Tree index for phone numbers
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers (nomor_telepon);

-- 3. Create high-performance GIN index for text search
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers USING GIN (to_tsvector('indonesian', nama_lengkap));
