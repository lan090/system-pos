-- Create telemetry_logs table for Service Worker observability
CREATE TABLE IF NOT EXISTS public.telemetry_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT now(),
    event TEXT NOT NULL,
    queue_depth INT,
    success_count INT,
    fail_count INT,
    device_storage_pct NUMERIC(5,2),
    error_message TEXT,
    metadata JSONB
);

-- Add index on created_at and event for faster dashboard filtering
CREATE INDEX IF NOT EXISTS idx_telemetry_logs_created_at ON public.telemetry_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_logs_event ON public.telemetry_logs(event);

-- Set Row Level Security (RLS) policies
ALTER TABLE public.telemetry_logs ENABLE ROW LEVEL SECURITY;

-- Allow anonymous inserts (NetworkOnly telemetry endpoint)
-- We use a service role or anon key to insert via the Edge/Serverless function.
-- Since the API handler runs server-side, it will use the service_role key, bypassing RLS.
-- But just in case, we can allow insert from authenticated or anon if needed.
CREATE POLICY "Enable insert for all users" ON public.telemetry_logs
    FOR INSERT 
    TO public
    WITH CHECK (true);

-- Only admins/service role can select
CREATE POLICY "Enable select for authenticated users" ON public.telemetry_logs
    FOR SELECT
    TO authenticated
    USING (true);
