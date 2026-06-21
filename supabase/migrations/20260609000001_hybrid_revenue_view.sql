-- =============================================================================
-- FSRMS v2.0 — Migration: Hybrid Revenue Aggregation View
-- Generated: 2026-06-09
-- Author: Senior DB Architect
-- =============================================================================

BEGIN;

CREATE OR REPLACE VIEW v_daily_revenue AS
SELECT 
  (created_at AT TIME ZONE 'Asia/Jakarta')::date::text AS date,
  SUM(total_amount)::numeric AS total
FROM transactions
WHERE status = 'Done'
GROUP BY (created_at AT TIME ZONE 'Asia/Jakarta')::date;

-- Grant permissions for read access
GRANT SELECT ON v_daily_revenue TO anon, authenticated, service_role;

COMMIT;
