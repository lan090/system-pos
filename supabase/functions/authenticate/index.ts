// @ts-nocheck
// =============================================================================
// FSRMS Security Hardening — Task 7
// Supabase Edge Function: authenticate
//
// Purpose: Perform database-driven credential verification and terminal account
// Supabase Auth login SERVER-SIDE, so the terminal password (MED-3) is NEVER
// sent to or stored in the client-side JavaScript bundle.
//
// Flow:
// 1. Client computes PBKDF2 hash locally using salt from get_user_salt() RPC
// 2. Client POST to this function with { identifier, computedHash }
// 3. Edge Function verifies hash match against database using service role key
// 4. On success: performs terminal Supabase Auth login using TERMINAL_PASSWORD env var
// 5. Returns { user, access_token, expires_at } — terminal password never reaches browser
//
// Environment variables required (set via: npx supabase secrets set TERMINAL_PASSWORD=...):
//   SUPABASE_URL — auto-provided by Supabase Edge runtime
//   SUPABASE_SERVICE_ROLE_KEY — auto-provided by Supabase Edge runtime
//   TERMINAL_PASSWORD — the shared terminal account password (set as secret)
// =============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TERMINAL_CASHIER_EMAIL = "cashier-terminal@fenina.com";
const TERMINAL_OWNER_EMAIL = "owner-terminal@fenina.com";
// TERMINAL_PASSWORD is set as a Supabase secret — never in source code
const TERMINAL_PASSWORD = Deno.env.get("TERMINAL_PASSWORD");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  }

  if (!TERMINAL_PASSWORD) {
    console.error("[authenticate] TERMINAL_PASSWORD env var is not set");
    return new Response(
      JSON.stringify({ error: "Server misconfiguration" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  let identifier: string;
  let computedHash: string;

  try {
    const body = await req.json();
    identifier = body.identifier;
    computedHash = body.computedHash;
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid request body" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (!identifier || !computedHash) {
    return new Response(
      JSON.stringify({ error: "Missing identifier or computedHash" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Use service role to bypass RLS for credential verification
  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Verify credentials server-side — hash comparison done here, never on client
  const { data: users, error: verifyError } = await serviceClient
    .from("users")
    .select("id, email, username, nama_lengkap, role, is_active, created_at")
    .or(`username.eq.${identifier},email.eq.${identifier}`)
    .eq("password_hash", computedHash)
    .eq("is_active", true)
    .limit(1);

  if (verifyError || !users?.length) {
    console.error("[authenticate] Credential verification failed:", verifyError?.message);
    return new Response(
      JSON.stringify({ error: "Invalid credentials" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const user = users[0];

  // Perform terminal Supabase Auth login server-side
  // TERMINAL_PASSWORD never leaves the Edge Function environment
  const terminalEmail = user.role === "Owner/Manager"
    ? TERMINAL_OWNER_EMAIL
    : TERMINAL_CASHIER_EMAIL;

  const { data: authData, error: authError } = await serviceClient.auth.signInWithPassword({
    email: terminalEmail,
    password: TERMINAL_PASSWORD,
  });

  if (authError || !authData?.session) {
    console.error("[authenticate] Terminal login failed:", authError?.message);
    return new Response(
      JSON.stringify({ error: "Terminal authentication failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({
      user,
      access_token: authData.session.access_token,
      expires_at: authData.session.expires_at,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
