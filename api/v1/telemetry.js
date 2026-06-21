import { createClient } from '@supabase/supabase-js';
import { waitUntil } from '@vercel/functions';

// Vercel Serverless Function configuration
export const config = {
  runtime: 'edge', // Use Edge runtime for fast, non-blocking telemetry responses
};

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export default async function handler(req) {
  // CORS and Method check
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      status: 200,
      headers: corsHeaders,
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json();
    
    // Parse safe fields
    const event = body.event || 'unknown';
    const queue_depth = body.queue_depth ? parseInt(body.queue_depth, 10) : null;
    const success_count = body.success_count ? parseInt(body.success_count, 10) : null;
    const fail_count = body.fail_count ? parseInt(body.fail_count, 10) : null;
    const device_storage_pct = body.device_storage_pct ? parseFloat(body.device_storage_pct) : null;
    const error_message = body.error_message || null;
    const metadata = body.metadata || {};

    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    // Use service role for backend insertion to bypass RLS, or fallback to anon key if configured
    const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error('Telemetry Handler: Missing Supabase credentials');
      return new Response(JSON.stringify({ error: 'Server misconfiguration' }), { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Asynchronous Fire-and-Forget / Non-Blocking Strategy
    // Utilize waitUntil to tell the Vercel Edge Runtime to wait for this promise
    // to settle in the background without holding up the HTTP response
    waitUntil(
      supabase.from('telemetry_logs').insert([{
        event,
        queue_depth,
        success_count,
        fail_count,
        device_storage_pct,
        error_message,
        metadata
      }]).then(({ error }) => {
        if (error) console.error('Telemetry DB Insert Error:', error);
      })
    );

    return new Response(JSON.stringify({ status: 'Accepted' }), {
      status: 202,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      },
    });

  } catch (err) {
    console.error('Telemetry Endpoint Error:', err);
    // Even on error, we return 202 to avoid client-side error loops
    return new Response(JSON.stringify({ status: 'Accepted, with errors' }), {
      status: 202,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  }
}
