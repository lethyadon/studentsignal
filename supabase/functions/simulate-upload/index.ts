import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// CSV data embedded — exactly what's in the demo files
const SIMS_CSV = `Admission No,UPN,Legal Surname,Legal Forename,Preferred Name,Date of Birth,Gender,Year Group,Reg Group,Enrolment Status,SEN Status,Pupil Premium,EAL,Looked After,School,Site
A001,X1000010001,Carter,Emma,Emma Carter,2014-03-12,F,7,7A,Active,N - No SEN,No,No,No,Northampton Academy Trust,Main School
A002,X1000020002,Jones,Liam,Liam Jones,2014-07-01,M,7,7B,Active,N - No SEN,No,No,No,Northampton Academy Trust,Main School
A003,X1000030003,Smith,Olivia,Olivia Smith,2013-02-18,F,8,8A,Active,K - SEN Support,No,Yes,No,Northampton Academy Trust,Main School
A004,X1000040004,Brown,Noah,Noah Brown,2013-11-25,M,8,8B,Active,N - No SEN,No,No,No,Northampton Academy Trust,Main School
A005,X1000050005,Wilson,Ava,Ava Wilson,2012-05-09,F,9,9A,Active,K - SEN Support,Yes,No,No,Northampton Academy Trust,Main School
A006,X1000060006,Taylor,George,George Taylor,2012-09-13,M,9,9B,Active,N - No SEN,No,No,No,Northampton Academy Trust,Main School
A007,X1000070007,Evans,Sophia,Sophia Evans,2011-01-22,F,10,10A,Active,N - No SEN,No,No,No,Northampton Academy Trust,Main School
A008,X1000080008,Thomas,Jack,Jack Thomas,2011-06-30,M,10,10B,Active,N - No SEN,No,No,No,Northampton Academy Trust,Main School
A009,X1000090009,Harris,Amelia,Amelia Harris,2010-04-17,F,11,11A,Active,N - No SEN,Yes,No,No,Northampton Academy Trust,Main School
A010,X1000100010,Walker,Harry,Harry Walker,2010-12-05,M,11,11B,Active,N - No SEN,No,No,No,Northampton Academy Trust,Main School
A011,X1000110011,Hall,Grace,Grace Hall,2014-10-10,F,7,7A,Active,N - No SEN,No,No,No,Northampton Academy Trust,Main School
A012,X1000120012,Allen,Charlie,Charlie Allen,2013-08-16,M,8,8A,Active,E - EHCP,Yes,No,No,Northampton Academy Trust,Main School
A013,X1000130013,Young,Isla,Isla Young,2012-03-03,F,9,9A,Active,N - No SEN,No,No,No,Northampton Academy Trust,Main School
A014,X1000140014,King,Freddie,Freddie King,2011-05-21,M,10,10A,Active,N - No SEN,No,Yes,No,Northampton Academy Trust,Main School
A015,X1000150015,Wright,Mia,Mia Wright,2010-09-28,F,11,11A,Active,K - SEN Support,No,No,No,Northampton Academy Trust,Main School
A016,X1000160016,Scott,Leo,Leo Scott,2014-01-14,M,7,7B,Active,N - No SEN,No,No,No,Northampton Academy Trust,Main School
A017,X1000170017,Green,Ella,Ella Green,2013-07-19,F,8,8B,Active,N - No SEN,No,No,No,Northampton Academy Trust,Main School
A018,X1000180018,Baker,Oscar,Oscar Baker,2012-02-26,M,9,9B,Active,K - SEN Support,Yes,No,No,Northampton Academy Trust,Main School
A019,X1000190019,Adams,Ruby,Ruby Adams,2011-10-04,F,10,10B,Active,N - No SEN,No,No,No,Northampton Academy Trust,Main School
A020,X1000200020,Nelson,Archie,Archie Nelson,2010-06-11,M,11,11B,Active,N - No SEN,Yes,No,No,Northampton Academy Trust,Main School`;

const BEHAVIOUR_CSV = `Date,Admission No,Pupil Name,Year,Form,Type,Reason,Lesson,Points,Awarded By,Category
01/07/2026,A001,Emma Carter,7,7A,Positive,Excellent classwork,English,2,Miss Lane,Achievement
03/07/2026,A001,Emma Carter,7,7A,Positive,Helped another pupil,Science,2,Mr Patel,Achievement
02/07/2026,A002,Liam Jones,7,7B,Negative,Homework not completed,Mathematics,-1,Mrs Cole,Behaviour
28/06/2026,A003,Olivia Smith,8,8A,Negative,Withdrawn / not engaging,English,-1,Miss Lane,Behaviour
04/07/2026,A003,Olivia Smith,8,8A,Negative,Peer conflict at lunch,Tutor,-2,Mr Grey,Behaviour
05/07/2026,A004,Noah Brown,8,8B,Positive,Improved focus,History,1,Mrs Webb,Achievement
24/06/2026,A005,Ava Wilson,9,9A,Negative,Defiance,Mathematics,-2,Mrs Cole,Behaviour
27/06/2026,A005,Ava Wilson,9,9A,Negative,Walked out of lesson,Science,-3,Mr Patel,Behaviour
01/07/2026,A005,Ava Wilson,9,9A,Negative,Refused reasonable instruction,English,-2,Miss Lane,Behaviour
05/07/2026,A005,Ava Wilson,9,9A,Negative,Argument with peer,PE,-2,Mr Stone,Behaviour
03/07/2026,A006,George Taylor,9,9B,Positive,Good homework,Geography,1,Mrs Bell,Achievement
01/07/2026,A007,Sophia Evans,10,10A,Positive,Leadership,Drama,2,Ms Fox,Achievement
30/06/2026,A008,Jack Thomas,10,10B,Negative,Late to lesson,Mathematics,-1,Mrs Cole,Behaviour
06/07/2026,A008,Jack Thomas,10,10B,Negative,Mobile phone seen,Science,-1,Mr Patel,Behaviour
25/06/2026,A009,Amelia Harris,11,11A,Negative,Refused work / low mood,English,-1,Miss Lane,Behaviour
02/07/2026,A009,Amelia Harris,11,11A,Negative,Crying after break,Tutor,-1,Mr Grey,Behaviour
05/07/2026,A009,Amelia Harris,11,11A,Negative,Left lesson upset,Mathematics,-2,Mrs Cole,Behaviour
02/07/2026,A010,Harry Walker,11,11B,Positive,Strong assessment result,Mathematics,2,Mrs Cole,Achievement
01/07/2026,A011,Grace Hall,7,7A,Positive,Kindness shown to peer,Tutor,2,Mr Grey,Achievement
24/06/2026,A012,Charlie Allen,8,8A,Negative,Overwhelmed in corridor,SEN,-1,Mrs Wells,Behaviour
03/07/2026,A012,Charlie Allen,8,8A,Negative,Missed intervention,SEN,-1,Mrs Wells,Behaviour
04/07/2026,A013,Isla Young,9,9A,Positive,Consistent effort,Art,1,Ms Fox,Achievement
01/07/2026,A014,Freddie King,10,10A,Negative,Missed detention,History,-2,Mrs Webb,Behaviour
27/06/2026,A015,Mia Wright,11,11A,Negative,Anxious before assessment,Science,-1,Mr Patel,Behaviour
04/07/2026,A015,Mia Wright,11,11A,Negative,Avoided lesson,Mathematics,-1,Mrs Cole,Behaviour
06/07/2026,A016,Leo Scott,7,7B,Negative,Late to school,Tutor,-1,Mr Grey,Behaviour
02/07/2026,A017,Ella Green,8,8B,Positive,Excellent presentation,English,2,Miss Lane,Achievement
21/06/2026,A018,Oscar Baker,9,9B,Negative,Truancy,Attendance,-3,Mrs Hill,Behaviour
26/06/2026,A018,Oscar Baker,9,9B,Negative,Truancy,Attendance,-3,Mrs Hill,Behaviour
03/07/2026,A018,Oscar Baker,9,9B,Negative,Aggressive language,PE,-2,Mr Stone,Behaviour
06/07/2026,A018,Oscar Baker,9,9B,Negative,Failed to attend detention,Pastoral,-2,Mrs Wells,Behaviour
01/07/2026,A019,Ruby Adams,10,10B,Positive,Mentored Year 7 pupil,Tutor,2,Mr Grey,Achievement
29/06/2026,A020,Archie Nelson,11,11B,Negative,Missing equipment,Science,-1,Mr Patel,Behaviour
04/07/2026,A020,Archie Nelson,11,11B,Negative,Homework not completed,Mathematics,-1,Mrs Cole,Behaviour`;

const ATTENDANCE_CSV = `Student ID,UPN,Student Name,Year,Registration Form,Possible Sessions,Present Sessions,Authorised Absence,Unauthorised Absence,Attendance %,Late Marks,Attendance Concern,Start Date,End Date
A001,X1000010001,Emma Carter,7,7A,320,316,2,2,98.7,0,No Concern,01/09/2025,07/07/2026
A002,X1000020002,Liam Jones,7,7B,320,301,9,10,94.2,0,No Concern,01/09/2025,07/07/2026
A003,X1000030003,Olivia Smith,8,8A,320,284,18,18,88.6,7,Persistent Absence,01/09/2025,07/07/2026
A004,X1000040004,Noah Brown,8,8B,320,307,6,7,96.0,1,No Concern,01/09/2025,07/07/2026
A005,X1000050005,Ava Wilson,9,9A,320,264,28,28,82.4,14,Persistent Absence,01/09/2025,07/07/2026
A006,X1000060006,George Taylor,9,9B,320,292,14,14,91.1,1,Monitor,01/09/2025,07/07/2026
A007,X1000070007,Sophia Evans,10,10A,320,312,4,4,97.5,0,No Concern,01/09/2025,07/07/2026
A008,X1000080008,Jack Thomas,10,10B,320,285,17,18,89.2,4,Persistent Absence,01/09/2025,07/07/2026
A009,X1000090009,Amelia Harris,11,11A,320,271,24,25,84.8,9,Persistent Absence,01/09/2025,07/07/2026
A010,X1000100010,Harry Walker,11,11B,320,299,10,11,93.5,4,No Concern,01/09/2025,07/07/2026
A011,X1000110011,Grace Hall,7,7A,320,317,1,2,99.0,3,No Concern,01/09/2025,07/07/2026
A012,X1000120012,Charlie Allen,8,8A,320,278,21,21,86.9,11,Persistent Absence,01/09/2025,07/07/2026
A013,X1000130013,Isla Young,9,9A,320,305,7,8,95.3,0,No Concern,01/09/2025,07/07/2026
A014,X1000140014,Freddie King,10,10A,320,297,11,12,92.7,0,Monitor,01/09/2025,07/07/2026
A015,X1000150015,Mia Wright,11,11A,320,280,20,20,87.4,8,Persistent Absence,01/09/2025,07/07/2026
A016,X1000160016,Leo Scott,7,7B,320,289,15,16,90.2,1,Monitor,01/09/2025,07/07/2026
A017,X1000170017,Ella Green,8,8B,320,314,3,3,98.2,4,No Concern,01/09/2025,07/07/2026
A018,X1000180018,Oscar Baker,9,9B,320,255,32,33,79.6,18,Persistent Absence,01/09/2025,07/07/2026
A019,X1000190019,Ruby Adams,10,10B,320,293,13,14,91.5,0,Monitor,01/09/2025,07/07/2026
A020,X1000200020,Archie Nelson,11,11B,320,272,24,24,85.1,10,Persistent Absence,01/09/2025,07/07/2026`;

const CPOMS_CSV = `Incident ID,Incident Date,Admission No,UPN,Student Name,Category,Subcategory,Incident Summary,Status,Assigned To,Severity
INC-003-2026,28/06/2026,A003,X1000030003,Olivia Smith,Bullying,Peer conflict,Reported name calling and exclusion at lunch,Open,Mr Grey,Pastoral
INC-005-2026,01/07/2026,A005,X1000050005,Ava Wilson,Safeguarding,Home concern,Student disclosed parent intoxication and feeling unsafe,Open,DSL,High
INC-009-2026,02/07/2026,A009,X1000090009,Amelia Harris,Wellbeing,Mental health,"Low mood, tearful, friendship breakdown",Open,Pastoral Lead,Medium
INC-012-2026,26/06/2026,A012,X1000120012,Charlie Allen,SEND / Wellbeing,Anxiety,Overwhelmed during transitions; reduced timetable discussed,Open,SENCO,Medium
INC-015-2026,04/07/2026,A015,X1000150015,Mia Wright,Mental Health,Anxiety,Panic symptoms before assessments,Open,Pastoral Lead,Medium
INC-018-2026,25/06/2026,A018,X1000180018,Oscar Baker,Neglect,Attendance / home,Parent unreachable; repeated unexplained absence,Open,Attendance Officer,High
INC-020-2026,03/07/2026,A020,X1000200020,Archie Nelson,Family Support,Financial hardship,Arrived without lunch or equipment twice this week,Open,Tutor,Medium`;

const PASTORAL_CSV = `Date,Admission No,UPN,Student Name,Year,Entered By,Note,Priority,Status
05/07/2026,A005,X1000050005,Ava Wilson,9,Head of Year,Parent unreachable after 5 attempts; check-in requested,High,Open
05/07/2026,A009,X1000090009,Amelia Harris,11,Tutor,Friendship group breakdown; monitor at break and lunch,Medium,Open
03/07/2026,A012,X1000120012,Charlie Allen,8,SENCO,Missed intervention twice this fortnight,Medium,Open
06/07/2026,A018,X1000180018,Oscar Baker,9,Attendance Officer,Home visit requested; transport issues reported,High,Open
04/07/2026,A020,X1000200020,Archie Nelson,11,Tutor,Uniform and equipment concerns; possible hardship,Medium,Open
02/07/2026,A003,X1000030003,Olivia Smith,8,Pastoral,Peer issue continuing; lunchtime safe space offered,Medium,Open`;

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split('\n');
  const headers = parseCSVLine(lines[0]);
  return lines.slice(1).map(line => {
    const values = parseCSVLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] || ''; });
    return row;
  });
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
    else { current += ch; }
  }
  result.push(current.trim());
  return result;
}

function normaliseYearGroup(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return 'Unknown';
  if (/^Year\s+\d+$/i.test(trimmed)) return trimmed.replace(/^year\s+/i, 'Year ');
  const num = trimmed.replace(/\D/g, '');
  if (num && parseInt(num) >= 1 && parseInt(num) <= 13) return `Year ${num}`;
  return trimmed;
}

function parseDateDMY(raw: string): string {
  // Convert DD/MM/YYYY to YYYY-MM-DD
  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) return `${match[3]}-${match[2].padStart(2,'0')}-${match[1].padStart(2,'0')}`;
  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return new Date().toISOString().split('T')[0];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const { school_id } = await req.json();
    if (!school_id) throw new Error("school_id required");

    const log: string[] = [];

    // ── STEP 1: Parse all CSVs ────────────────────────────────────────────────
    const simsRows = parseCSV(SIMS_CSV);
    const behRows = parseCSV(BEHAVIOUR_CSV);
    const attRows = parseCSV(ATTENDANCE_CSV);
    const cpomsRows = parseCSV(CPOMS_CSV);
    const pastoralRows = parseCSV(PASTORAL_CSV);
    log.push(`Parsed: ${simsRows.length} SIMS, ${behRows.length} behaviour, ${attRows.length} attendance, ${cpomsRows.length} CPOMS, ${pastoralRows.length} pastoral`);

    // ── STEP 2: Build student map from SIMS (primary identity source) ─────────
    const studentMap = new Map<string, any>();
    for (const row of simsRows) {
      const name = `${row['Legal Forename']} ${row['Legal Surname']}`.trim();
      const upn = row['UPN'] || null;
      const extId = row['Admission No'] || null;
      const key = upn ?? extId ?? name.toLowerCase();
      studentMap.set(key, {
        name,
        upn,
        external_student_id: extId,
        year_group: normaliseYearGroup(row['Year Group'] || ''),
        form: row['Reg Group'] || 'Unknown',
        send_status: row['SEN Status'] || null,
        pupil_premium: ['yes','true','1','y'].includes((row['Pupil Premium'] || '').toLowerCase()),
        preferred_name: row['Preferred Name'] || null,
        eal: ['yes','true','1','y'].includes((row['EAL'] || '').toLowerCase()),
        looked_after: ['yes','true','1','y'].includes((row['Looked After'] || '').toLowerCase()),
      });
    }

    // Build secondary index by ext_id so behaviour/attendance CSVs don't re-add
    const extIdIndex = new Map<string, string>();
    for (const [key, s] of studentMap) {
      if (s.external_student_id) extIdIndex.set(s.external_student_id, key);
    }

    // ── STEP 3: Fetch existing students ───────────────────────────────────────
    const { data: existingStudents } = await supabase
      .from('students').select('id, name, upn, external_student_id').eq('school_id', school_id);

    const existingByUpn = new Map<string, string>();
    const existingByExtId = new Map<string, string>();
    const existingByName = new Map<string, string>();
    for (const s of existingStudents ?? []) {
      if (s.upn) existingByUpn.set(s.upn.toLowerCase(), s.id);
      if (s.external_student_id) existingByExtId.set(s.external_student_id.toLowerCase(), s.id);
      existingByName.set(s.name.toLowerCase().trim(), s.id);
    }

    // ── STEP 4: Insert/update students ────────────────────────────────────────
    const toInsert: any[] = [];
    const toUpdate: { id: string; patch: any }[] = [];

    for (const [, s] of studentMap) {
      const existingId =
        (s.upn && existingByUpn.get(s.upn.toLowerCase())) ||
        (s.external_student_id && existingByExtId.get(s.external_student_id.toLowerCase())) ||
        existingByName.get(s.name.toLowerCase().trim());
      const row = { school_id, ...s };
      if (existingId) { toUpdate.push({ id: existingId, patch: row }); }
      else { toInsert.push(row); }
    }

    for (const { id, patch } of toUpdate) {
      await supabase.from('students').update(patch).eq('id', id);
    }
    if (toInsert.length > 0) {
      const { error } = await supabase.from('students').insert(toInsert);
      if (error) throw new Error(`Student insert: ${error.message}`);
    }
    log.push(`Students: ${toInsert.length} inserted, ${toUpdate.length} updated`);

    // ── STEP 5: Build ID lookup ───────────────────────────────────────────────
    const { data: allStudents } = await supabase
      .from('students').select('id, name, upn, external_student_id').eq('school_id', school_id);

    const upnToId = new Map<string, string>();
    const extIdToId = new Map<string, string>();
    const nameToId = new Map<string, string>();
    for (const s of allStudents ?? []) {
      nameToId.set(s.name.toLowerCase(), s.id);
      if (s.upn) { upnToId.set(s.upn, s.id); extIdToId.set(s.upn, s.id); }
      if (s.external_student_id) extIdToId.set(s.external_student_id, s.id);
    }

    function resolveId(admissionNo?: string, upn?: string, name?: string): string | undefined {
      if (upn && upnToId.get(upn)) return upnToId.get(upn);
      if (admissionNo && extIdToId.get(admissionNo)) return extIdToId.get(admissionNo);
      if (name) return nameToId.get(name.toLowerCase().trim());
      return undefined;
    }

    // ── STEP 6: Process behaviour records ─────────────────────────────────────
    const behaviourInserts: any[] = [];
    for (const row of behRows) {
      const studentId = resolveId(row['Admission No'], undefined, row['Pupil Name']);
      if (!studentId) continue;
      const rawPoints = parseInt(row['Points']) || 0;
      behaviourInserts.push({
        student_id: studentId, school_id,
        date: parseDateDMY(row['Date']),
        incident_type: row['Reason'] || 'Unknown',
        behaviour_points: rawPoints < 0 ? Math.abs(rawPoints) : 0,
        positive_points: rawPoints > 0 ? rawPoints : 0,
        lesson_period: row['Lesson'] || null,
        subject: row['Lesson'] || null,
        staff_member: row['Awarded By'] || null,
        comment: row['Reason'] || null,
        safeguarding_note: null,
      });
    }
    if (behaviourInserts.length > 0) {
      const { error } = await supabase.from('behaviour_records')
        .upsert(behaviourInserts, { onConflict: 'school_id,student_id,date,incident_type', ignoreDuplicates: true });
      if (error) throw new Error(`Behaviour insert: ${error.message}`);
    }
    log.push(`Behaviour records: ${behaviourInserts.length}`);

    // ── STEP 7: Process attendance records ────────────────────────────────────
    const attendanceInserts: any[] = [];
    for (const row of attRows) {
      const studentId = resolveId(row['Student ID'], row['UPN'], row['Student Name']);
      if (!studentId) continue;
      const attPct = parseFloat(row['Attendance %']) || null;
      attendanceInserts.push({
        student_id: studentId, school_id,
        record_date: parseDateDMY(row['Start Date'] || ''),
        attendance_percentage: attPct,
        sessions_attended: parseInt(row['Present Sessions']) || null,
        sessions_possible: parseInt(row['Possible Sessions']) || null,
        comment: row['Attendance Concern'] || null,
        source_file: 'Arbor_Attendance_Export.csv',
      });
    }
    if (attendanceInserts.length > 0) {
      const { error } = await supabase.from('attendance_records')
        .upsert(attendanceInserts, { onConflict: 'school_id,student_id,record_date', ignoreDuplicates: true });
      if (error) throw new Error(`Attendance insert: ${error.message}`);
    }
    log.push(`Attendance records: ${attendanceInserts.length}`);

    // ── STEP 8: Process safeguarding records ──────────────────────────────────
    const safeguardingInserts: any[] = [];
    for (const row of cpomsRows) {
      const studentId = resolveId(row['Admission No'], row['UPN'], row['Student Name']);
      if (!studentId) continue;
      safeguardingInserts.push({
        student_id: studentId, school_id,
        incident_date: parseDateDMY(row['Incident Date']),
        incident_type: row['Category'] || null,
        summary: row['Incident Summary'] || null,
        assigned_to: row['Assigned To'] || null,
        severity: row['Severity'] || null,
        source_file: 'CPOMS_Incident_Export.csv',
      });
    }
    if (safeguardingInserts.length > 0) {
      // Idempotent: delete old from same source file first
      await supabase.from('safeguarding_records').delete().eq('school_id', school_id).eq('source_file', 'CPOMS_Incident_Export.csv');
      const { error } = await supabase.from('safeguarding_records').insert(safeguardingInserts);
      if (error) throw new Error(`Safeguarding insert: ${error.message}`);
    }
    log.push(`Safeguarding records: ${safeguardingInserts.length}`);

    // ── STEP 9: Process pastoral notes ────────────────────────────────────────
    const pastoralInserts: any[] = [];
    for (const row of pastoralRows) {
      const studentId = resolveId(row['Admission No'], row['UPN'], row['Student Name']);
      if (!studentId) continue;
      pastoralInserts.push({
        student_id: studentId, school_id,
        note_date: parseDateDMY(row['Date']),
        note: row['Note'] || null,
        priority: row['Priority'] || null,
        status: row['Status'] || null,
        entered_by: row['Entered By'] || null,
        source_file: 'Manual_Pastoral_Notes.csv',
      });
    }
    if (pastoralInserts.length > 0) {
      await supabase.from('pastoral_notes').delete().eq('school_id', school_id).eq('source_file', 'Manual_Pastoral_Notes.csv');
      const { error } = await supabase.from('pastoral_notes').insert(pastoralInserts);
      if (error) throw new Error(`Pastoral insert: ${error.message}`);
    }
    log.push(`Pastoral notes: ${pastoralInserts.length}`);

    // ── STEP 10: Log uploads ──────────────────────────────────────────────────
    await supabase.from('uploads').insert([
      { school_id, filename: 'SIMS_Pupil_Export.csv', row_count: simsRows.length, status: 'completed' },
      { school_id, filename: 'ClassCharts_Behaviour_Export.csv', row_count: behRows.length, status: 'completed' },
      { school_id, filename: 'Arbor_Attendance_Export.csv', row_count: attRows.length, status: 'completed' },
      { school_id, filename: 'CPOMS_Incident_Export.csv', row_count: cpomsRows.length, status: 'completed' },
      { school_id, filename: 'Manual_Pastoral_Notes.csv', row_count: pastoralRows.length, status: 'completed' },
    ]);

    log.push('Upload complete. Ready for analysis.');

    return new Response(JSON.stringify({ success: true, log }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

