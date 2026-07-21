import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Missing authorization header" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Create a client with the caller's token to verify they are a platform admin
  const callerClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  // Verify caller is a platform admin
  const { data: adminRow, error: adminErr } = await callerClient
    .from("platform_admins")
    .select("user_id")
    .maybeSingle();

  if (adminErr || !adminRow) {
    return new Response(JSON.stringify({ error: "Forbidden — platform admin access required" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const body = await req.json();
  const schoolId: string | undefined = body?.school_id;
  if (!schoolId) {
    return new Response(JSON.stringify({ error: "Missing school_id" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Use service role to bypass RLS for deletion
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const TABLES = [
    "intelligence_insights",
    "quick_notes",
    "communications",
    "success_recognitions",
    "recommendation_dismissals",
    "notifications",
    "staff_insights",
    "interventions",
    "behaviour_records",
    "analysis_results",
    "uploads",
    "career_profiles",
    "students",
  ];

  const deleted: Record<string, number> = {};

  for (const table of TABLES) {
    const { error, count } = await admin
      .from(table)
      .delete({ count: "exact" })
      .eq("school_id", schoolId);

    if (error) {
      // Skip tables that don't exist yet
      if (error.message.includes("does not exist") || error.code === "42P01") {
        continue;
      }
      return new Response(JSON.stringify({ error: `Failed on ${table}: ${error.message}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    deleted[table] = count ?? 0;
  }

  return new Response(
    JSON.stringify({ success: true, deleted }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});

