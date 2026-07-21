import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  parseUkDate, canonicalBehaviourClass, canonicalCaseStatus,
  canonicalProgressStatus, canonicalAttendanceConcern, ImportValueError,
} from "../_shared/canonical.ts";

/** Strict date for API payloads: invalid values become a reported error, never a stored corruption. */
function apiDate(raw: unknown, field: string, fallbackToday = true): string {
  const parsed = parseUkDate(raw == null ? "" : String(raw), field);
  if (parsed) return parsed;
  if (fallbackToday) return new Date().toISOString().slice(0, 10);
  throw new ImportValueError(field, String(raw ?? ""), "date required");
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function ok(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function err(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  if (req.method === "GET") {
    return ok({ status: "Student Signal data-sync endpoint is live", version: "1.1" });
  }

  if (req.method !== "POST") return err("Method not allowed", 405);

  // ── Auth ──────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization") || "";
  const apiKey = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!apiKey) return err("Missing Authorization header. Use: Authorization: Bearer <api_key>", 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Look up integration by api_key
  const { data: integration, error: integrationErr } = await supabase
    .from("integrations")
    .select("id, school_id, system_name, enabled")
    .eq("api_key", apiKey)
    .maybeSingle();

  if (integrationErr || !integration) return err("Invalid API key", 401);
  if (!integration.enabled) return err("This integration has been disabled", 403);

  const schoolId: string = integration.school_id;
  const integrationId: string = integration.id;
  const source: string = integration.system_name;

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: { payload_type?: string; records?: unknown[] };
  try {
    body = await req.json();
  } catch {
    return err("Invalid JSON body");
  }

  const payloadType = (body.payload_type || "students").toLowerCase();
  const records = Array.isArray(body.records) ? body.records : [];

  if (records.length === 0) return err("No records provided in payload");
  if (records.length > 2000) return err("Payload too large — maximum 2000 records per request");

  let upserted = 0;
  const errors: string[] = [];

  // ── Fetch existing students for this school (for ID resolution) ───────────
  const { data: existingStudents } = await supabase
    .from("students")
    .select("id, name, year_group")
    .eq("school_id", schoolId);

  const studentIndex = new Map<string, string>(); // "name|year_group" → id
  for (const s of (existingStudents || [])) {
    studentIndex.set(`${(s.name as string).toLowerCase()}|${s.year_group}`, s.id as string);
  }

  function resolveStudentId(name: string, yearGroup: string): string | null {
    return studentIndex.get(`${name.toLowerCase()}|${yearGroup}`) ?? null;
  }

  // ── Process records by type ───────────────────────────────────────────────
  if (payloadType === "students") {
    for (const raw of records) {
      const r = raw as Record<string, unknown>;
      const name = String(r.student_name || r.name || "").trim();
      const yearGroup = String(r.year_group || "").trim();
      if (!name || !yearGroup) { errors.push(`Skipped record: missing student_name or year_group`); continue; }
      const { error: e } = await supabase.from("students").upsert(
        {
          school_id: schoolId,
          name,
          year_group: yearGroup,
          form: r.form ?? null,
          send_status: r.send_status ?? null,
          pupil_premium: r.pupil_premium ?? false,
          attendance_pct: r.attendance_pct != null ? Number(r.attendance_pct) : null,
          behaviour_score: r.behaviour_score != null ? Number(r.behaviour_score) : null,
        },
        { onConflict: "school_id,name", ignoreDuplicates: false },
      );
      if (e) errors.push(`Student ${name}: ${e.message}`);
      else upserted++;
    }
  } else if (payloadType === "behaviour") {
    for (const raw of records) {
      const r = raw as Record<string, unknown>;
      const name = String(r.student_name || "").trim();
      const yearGroup = String(r.year_group || "").trim();
      const studentId = resolveStudentId(name, yearGroup);
      if (!studentId) { errors.push(`Unknown student: ${name} (${yearGroup}) — push students payload first`); continue; }
      const rawPoints = r.points != null ? Number(r.points) : (r.behaviour_points != null ? Number(r.behaviour_points) : 1);
      const behaviourClass = canonicalBehaviourClass(
        r.type != null ? String(r.type) : (r.behaviour_class != null ? String(r.behaviour_class) : null),
        rawPoints,
      );
      const { error: e } = await supabase.from("behaviour_records").upsert(
        {
          school_id: schoolId,
          student_id: studentId,
          date: apiDate(r.date, "date"),
          incident_type: String(r.incident_type ?? r.behaviour_type ?? r.event_type ?? "Incident"),
          behaviour_class: behaviourClass,
          behaviour_points: behaviourClass === "negative" ? Math.abs(rawPoints) : 0,
          positive_points:  behaviourClass === "positive" ? Math.abs(rawPoints) : 0,
          category: r.category != null ? String(r.category) : null,
          lesson_period: r.lesson_period ?? r.period ?? null,
          subject: r.subject ?? null,
          staff_member: r.staff_member ?? r.reported_by ?? r.staff ?? r.logged_by ?? null,
          comment: r.comment ?? r.notes ?? r.description ?? null,
          // Contextual retention — kept wherever the source supplies them:
          location: r.location != null ? String(r.location) : null,
          time_of_day: r.time_of_day != null ? String(r.time_of_day) : (r.time != null ? String(r.time) : null),
          department: r.department != null ? String(r.department) : null,
          event_type: r.event_type != null ? String(r.event_type) : null,
          // Provenance:
          source_system: "api",
          external_record_id: r.external_record_id != null ? String(r.external_record_id) : (r.record_id != null ? String(r.record_id) : null),
          metadata: { original: { source, points: rawPoints, type: r.type ?? null } },
          source,
        },
        { onConflict: "school_id,student_id,date,incident_type", ignoreDuplicates: false },
      );
      if (e) errors.push(`Behaviour for ${name}: ${e.message}`);
      else upserted++;
    }
  } else if (payloadType === "attendance") {
    for (const raw of records) {
      const r = raw as Record<string, unknown>;
      const name = String(r.student_name || "").trim();
      const yearGroup = String(r.year_group || "").trim();
      const studentId = resolveStudentId(name, yearGroup);
      if (!studentId) { errors.push(`Unknown student: ${name} (${yearGroup})`); continue; }
      let pct: number | null = null;
      if (r.attendance_pct != null) {
        pct = Number(r.attendance_pct);
      } else if (r.sessions_possible != null && r.sessions_attended != null && Number(r.sessions_possible) > 0) {
        pct = Math.round((Number(r.sessions_attended) / Number(r.sessions_possible)) * 1000) / 10;
      }
      if (pct == null) { errors.push(`Attendance for ${name}: provide attendance_pct or sessions_attended + sessions_possible`); continue; }
      const { error: e } = await supabase
        .from("students")
        .update({ attendance_pct: Math.round(pct * 10) / 10 })
        .eq("id", studentId)
        .eq("school_id", schoolId);
      if (e) { errors.push(`Attendance for ${name}: ${e.message}`); continue; }
      // Canonical attendance record with structured fields + provenance:
      const { error: e2 } = await supabase.from("attendance_records").upsert(
        {
          school_id: schoolId,
          student_id: studentId,
          record_date: apiDate(r.date || r.record_date, "record_date"),
          attendance_percentage: Math.round(pct * 10) / 10,
          sessions_attended: r.sessions_attended != null ? Number(r.sessions_attended) : null,
          sessions_possible: r.sessions_possible != null ? Number(r.sessions_possible) : null,
          late_marks: r.late_marks != null ? Number(r.late_marks) : null,
          attendance_concern: canonicalAttendanceConcern(r.attendance_concern != null ? String(r.attendance_concern) : null),
          source_system: "api",
          external_record_id: r.external_record_id != null ? String(r.external_record_id) : null,
          metadata: { original: { source } },
        },
        { onConflict: "school_id,student_id,record_date", ignoreDuplicates: false },
      );
      if (e2) errors.push(`Attendance record for ${name}: ${e2.message}`);
      else upserted++;
    }
  } else if (payloadType === "safeguarding") {
    // Safeguarding records from CPOMS or any MIS must go to the protected
    // safeguarding_notes table — NOT quick_notes — so they are:
    //   1. Subject to deny-by-default RLS (no SELECT policy for regular users)
    //   2. Only readable via the audited get_safeguarding_notes() RPC
    //   3. Immutable (no UPDATE/DELETE policy for any user)
    for (const raw of records) {
      const r = raw as Record<string, unknown>;
      const name = String(r.student_name || "").trim();
      const yearGroup = String(r.year_group || "").trim();
      const studentId = resolveStudentId(name, yearGroup);
      if (!studentId) { errors.push(`Unknown student: ${name} (${yearGroup})`); continue; }
      const { error: e } = await supabase.from("safeguarding_notes").upsert(
        {
          school_id: schoolId,
          student_id: studentId,
          note: String(r.note || r.description || r.summary || "Safeguarding note imported from " + source),
          source: source.toLowerCase().replace(/\s+/g, "_"),
          created_at: r.date ? apiDate(r.date, "date") + "T00:00:00Z" : new Date().toISOString(),
          // created_by is null for MIS imports — the source system is the author
        },
        { onConflict: "school_id,student_id,note,source", ignoreDuplicates: true },
      );
      if (e) errors.push(`Safeguarding for ${name}: ${e.message}`);
      else upserted++;
    }
  } else if (payloadType === "pastoral_notes") {
    // Accepts pastoral concern logs from CPOMS, Arbor, SIMS, Bromcom, etc.
    // Each record becomes a pastoral_note row — the signal engine picks these
    // up as a corroboration source for wellbeing and behaviour signals.
    for (const raw of records) {
      const r = raw as Record<string, unknown>;
      const name = String(r.student_name || "").trim();
      const yearGroup = String(r.year_group || "").trim();
      const studentId = resolveStudentId(name, yearGroup);
      if (!studentId) { errors.push(`Unknown student: ${name} (${yearGroup})`); continue; }
      const priority = String(r.priority || r.concern_level || "medium");
      const { error: e } = await supabase.from("pastoral_notes").upsert(
        {
          school_id: schoolId,
          student_id: studentId,
          note_date: String(r.date || r.note_date || new Date().toISOString().slice(0, 10)),
          note: String(r.note || r.description || r.case_note || r.body || ""),
          priority: ["urgent", "high", "medium", "low"].includes(priority) ? priority : "medium",
          entered_by: String(r.staff_member || r.recorded_by || r.key_worker || source),
          status: r.status != null ? canonicalCaseStatus(String(r.status)) : null,
          source_system: "api",
          external_record_id: r.external_record_id != null ? String(r.external_record_id) : null,
          metadata: { original: { source } },
        },
        { onConflict: "school_id,student_id,note_date,note", ignoreDuplicates: true },
      );
      if (e) errors.push(`Pastoral note for ${name}: ${e.message}`);
      else upserted++;
    }
  } else if (payloadType === "communications") {
    // Parent/carer contacts from any MIS or logged by reception.
    // Each record becomes a communications row — the engine uses these to
    // corroborate attendance and wellbeing signals.
    for (const raw of records) {
      const r = raw as Record<string, unknown>;
      const name = String(r.student_name || "").trim();
      const yearGroup = String(r.year_group || "").trim();
      const studentId = resolveStudentId(name, yearGroup);
      if (!studentId) { errors.push(`Unknown student: ${name} (${yearGroup})`); continue; }
      const validSources = ["email", "phone", "meeting", "letter", "external_agency", "pastoral_conversation"];
      const commSource = validSources.includes(String(r.source)) ? String(r.source) : "phone";
      const priority = String(r.priority || "medium");
      const { error: e } = await supabase.from("communications").upsert(
        {
          school_id: schoolId,
          student_id: studentId,
          date: String(r.date || new Date().toISOString().slice(0, 10)),
          source: commSource,
          summary: String(r.summary || r.note || r.description || r.body || ""),
          priority: ["urgent", "high", "medium", "low"].includes(priority) ? priority : "medium",
          staff_member: String(r.staff_member || r.logged_by || r.key_worker || source),
          follow_up_required: Boolean(r.follow_up_required ?? r.follow_up ?? false),
          follow_up_date: r.follow_up_date ? String(r.follow_up_date) : null,
          notes: r.notes ? String(r.notes) : null,
          routing_status: "pending_review",
        },
        { onConflict: "school_id,student_id,date,summary", ignoreDuplicates: true },
      );
      if (e) errors.push(`Communication for ${name}: ${e.message}`);
      else upserted++;
    }
  } else if (payloadType === "assessment") {
    // Subject-level assessment data from any MIS.
    // Feeds into subject-specific distress detection and academic risk scoring.
    for (const raw of records) {
      const r = raw as Record<string, unknown>;
      const name = String(r.student_name || "").trim();
      const yearGroup = String(r.year_group || "").trim();
      const studentId = resolveStudentId(name, yearGroup);
      if (!studentId) { errors.push(`Unknown student: ${name} (${yearGroup})`); continue; }
      const cycle = r.assessment_cycle != null ? String(r.assessment_cycle) : (r.cycle != null ? String(r.cycle) : null);
      const { error: e } = await supabase.from("assessment_records").upsert(
        {
          school_id: schoolId,
          student_id: studentId,
          assessment_date: apiDate(r.assessment_date || r.date, "assessment_date"),
          assessment_cycle: cycle,
          subject: r.subject ? String(r.subject) : null,
          current_grade: r.current_grade ? String(r.current_grade) : null,
          target_grade: r.target_grade ? String(r.target_grade) : null,
          progress_gap: r.progress_gap ? String(r.progress_gap) : null,
          progress_status: canonicalProgressStatus(r.progress_status != null ? String(r.progress_status) : null),
          staff_member: r.staff_member ? String(r.staff_member) : null,
          source_file: source,
          source_system: "api",
          external_record_id: r.external_record_id != null ? String(r.external_record_id) : null,
          metadata: { original: { source } },
        },
        // Identity matches assessment_identity_uidx. (The 17 Jul patch targeted
        // assessment_date+subject, an identity with no backing index.)
        { onConflict: "school_id,student_id,assessment_cycle,subject", ignoreDuplicates: false },
      );
      if (e) errors.push(`Assessment for ${name}: ${e.message}`);
      else upserted++;
    }
  } else if (payloadType === "messages") {
    // Teacher-parent / staff-student messages from ClassCharts, Arbor, or any MIS.
    // Each message thread entry becomes a communications row so the intelligence
    // engine can correlate parent contact patterns with attendance and behaviour.
    // Expected fields: student_name, year_group, date, sender, recipient, body, subject?
    for (const raw of records) {
      const r = raw as Record<string, unknown>;
      const name = String(r.student_name || "").trim();
      const yearGroup = String(r.year_group || "").trim();
      const studentId = resolveStudentId(name, yearGroup);
      if (!studentId) { errors.push(`Unknown student: ${name} (${yearGroup})`); continue; }

      const sender   = String(r.sender || r.from || "");
      const body     = String(r.body || r.message || r.content || r.text || "");
      const subject  = r.subject ? String(r.subject) : null;
      const msgDate  = String(r.date || r.sent_at || new Date().toISOString().slice(0, 10));

      // Determine direction: parent→school or school→parent
      const isParentContact = /parent|carer|guardian|mum|dad|mother|father/i.test(sender);
      const commSource = isParentContact ? "email" : "phone"; // default to email for message threads

      // Build a human-readable summary preserving original wording
      const summary = [
        subject ? `Re: ${subject}` : null,
        `From: ${sender}`,
        body.slice(0, 300),
      ].filter(Boolean).join(" — ");

      // Infer priority from content
      const bodyLower = body.toLowerCase();
      const isUrgent = /urgent|emergency|safeguard|crisis|harm|abuse|immediate/i.test(bodyLower);
      const isHigh   = /worried|concerned|struggling|anxiety|refusing|not coming/i.test(bodyLower);
      const priority = isUrgent ? "urgent" : isHigh ? "high" : "medium";

      const { error: e } = await supabase.from("communications").upsert(
        {
          school_id: schoolId,
          student_id: studentId,
          date: msgDate,
          source: commSource,
          summary,
          priority,
          staff_member: sender,
          follow_up_required: isUrgent || isHigh,
          notes: body.slice(0, 500),
          routing_status: "pending_review",
        },
        { onConflict: "school_id,student_id,date,summary", ignoreDuplicates: true },
      );
      if (e) errors.push(`Message for ${name}: ${e.message}`);
      else upserted++;
    }
  } else if (payloadType === "intelligence_events") {
    // ClassCharts "intelligence events" (Uniform & equipment issue, Excessive make-up, etc.)
    // These are pastoral observation flags — they go to quick_notes as staff observations
    // so the hypothesis engine can detect presentation/home-circumstance patterns.
    for (const raw of records) {
      const r = raw as Record<string, unknown>;
      const name = String(r.student_name || "").trim();
      const yearGroup = String(r.year_group || "").trim();
      const studentId = resolveStudentId(name, yearGroup);
      if (!studentId) { errors.push(`Unknown student: ${name} (${yearGroup})`); continue; }

      const eventType = String(r.event_type || r.type || r.category || "");
      const noteText  = eventType + (r.note ? ` — ${r.note}` : "");

      // Map ClassCharts event types to concern levels
      const concernLevel =
        /uniform|equipment|appearance|makeup|make.up|hygiene/i.test(eventType) ? 2 :
        /late.*lesson|punctuality/i.test(eventType) ? 2 :
        /fight|aggression|threatening/i.test(eventType) ? 4 :
        /welfare|concern|distress/i.test(eventType) ? 3 : 2;

      const { error: e } = await supabase.from("quick_notes").upsert(
        {
          school_id: schoolId,
          student_id: studentId,
          category: "Pastoral concern",
          concern_level: concernLevel,
          visibility: "general",
          note: noteText,
          staff_member: String(r.staff_member || r.recorded_by || source),
          source: source.toLowerCase().replace(/\s+/g, "_"),
          date: String(r.date || new Date().toISOString().slice(0, 10)),
        },
        { onConflict: "school_id,student_id,date,note", ignoreDuplicates: true },
      );
      if (e) errors.push(`Intelligence event for ${name}: ${e.message}`);
      else upserted++;
    }
  } else {
    return err(`Unknown payload_type: "${payloadType}". Use: students, behaviour, attendance, safeguarding, pastoral_notes, communications, assessment, messages, intelligence_events`);
  }
  }

  // ── Update integration stats & write sync log ─────────────────────────────
  await supabase.from("integrations").update({
    last_sync_at: new Date().toISOString(),
    status: errors.length === records.length ? "error" : "active",
    error_message: errors.length > 0 ? errors.slice(0, 3).join("; ") : null,
  }).eq("id", integrationId);

  await supabase.rpc("increment_integration_counts", {
    p_integration_id: integrationId,
    p_synced: upserted,
  }).maybeSingle().catch(() => null);

  await supabase.from("sync_logs").insert({
    integration_id: integrationId,
    school_id: schoolId,
    source,
    payload_type: payloadType,
    records_received: records.length,
    records_upserted: upserted,
    status: errors.length === 0 ? "success" : upserted > 0 ? "partial" : "error",
    error_details: errors.length > 0 ? errors.slice(0, 10).join("\n") : null,
  });

  return ok({
    success: true,
    source,
    payload_type: payloadType,
    records_received: records.length,
    records_upserted: upserted,
    errors: errors.slice(0, 10),
  });
});

