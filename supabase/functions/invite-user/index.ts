import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function respond(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return respond({ success: false, error: "Missing authorization" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Verify the calling user's identity
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return respond({ success: false, error: "Unauthorized" }, 401);

  // Verify caller is admin/slt for the correct school
  const { data: callerProfile } = await admin
    .from("profiles")
    .select("role, school_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!callerProfile || !["admin", "slt"].includes(callerProfile.role)) {
    return respond({ success: false, error: "Only admins or SLT can invite users" }, 403);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return respond({ success: false, error: "Invalid JSON body" }, 400);
  }

  const { email, fullName, role, schoolId, department, yearGroups } = body as {
    email: string; fullName: string; role: string; schoolId: string;
    department?: string; yearGroups?: string[];
  };

  if (!email || !fullName || !role || !schoolId) {
    return respond({ success: false, error: "Missing required fields: email, fullName, role, schoolId" }, 400);
  }

  if (callerProfile.school_id !== schoolId) {
    return respond({ success: false, error: "Cannot invite users to a different school" }, 403);
  }

  // Send the Supabase invite email. Do NOT pass redirectTo — use the project's
  // configured Site URL so it's always in the allow-list.
  const { data: inviteData, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(
    email.trim().toLowerCase(),
    { data: { full_name: fullName } }
  );

  if (inviteErr) {
    console.error("inviteUserByEmail error:", inviteErr);
    return respond({ success: false, error: inviteErr.message || "Failed to send invite email" });
  }

  const invitedUserId = inviteData.user.id;

  // Pre-create the profile with the correct role
  const { error: profileErr } = await admin.from("profiles").upsert({
    id: invitedUserId,
    school_id: schoolId,
    role,
    full_name: fullName,
  }, { onConflict: "id" });

  if (profileErr) {
    console.error("Profile upsert error:", profileErr.message);
  }

  // Record the invite for audit
  await admin.from("invites").upsert({
    school_id: schoolId,
    email: email.trim().toLowerCase(),
    role,
    department: department || null,
    year_groups: yearGroups ?? [],
    invited_by: user.id,
  }, { onConflict: "school_id,email" });

  return respond({ success: true, userId: invitedUserId });
});

