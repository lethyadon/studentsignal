/**
 * Student Signal — CSV ingestion core (extracted from UploadCsv.tsx, 19 Jul 2026)
 *
 * Pure and environment-neutral: no React, no Supabase client, no browser APIs.
 * UploadCsv.tsx consumes this module for parsing, preset detection, mapping
 * and payload construction; tests execute the same functions directly, so
 * what is tested is exactly what the page runs.
 *
 * Structured-field guarantees (approved design, 19 Jul 2026):
 *  - strict UK date handling via canonical.parseUkDate — invalid dates reject
 *    the row with a reported reason, never silently store corrupted values;
 *  - Arbor Late Marks → attendance_records.late_marks (integer, queryable);
 *  - Arbor Attendance Concern → attendance_records.attendance_concern (enum);
 *  - ClassCharts Type → behaviour_records.behaviour_class ('positive'|'negative'|'neutral');
 *  - CPOMS Category/Subcategory/Status → independent columns on safeguarding_records;
 *  - CPOMS Incident ID → external_record_id (dedupe identity);
 *  - Bromcom Progress Status → assessment_records.progress_status (enum);
 *  - Bromcom Assessment Cycle → assessment_records.assessment_cycle;
 *  - SIMS Enrolment Status → inactive pupils skipped (reported, not silent);
 *  - every row carries source_system + external_record_id (when available)
 *    + original values preserved in metadata.
 */

import {
  ImportValueError,
  parseUkDate,
  parseIntStrict,
  parseFloatStrict,
  yesNoToBool,
  canonicalBehaviourClass,
  canonicalCaseStatus,
  canonicalAttendanceConcern,
  canonicalProgressStatus,
  isActiveEnrolment,
  type SourceSystem,
} from '../../supabase/functions/_shared/canonical.ts';

// ─── Presets ──────────────────────────────────────────────────────────────────

export type PresetMap = Record<string, string[]>;

export const PRESETS: Record<string, PresetMap> = {
  SIMS: {
    upn:                          ['upn', 'uln'],
    external_student_id:          ['admission no', 'admissionno', 'admission number', 'admno'],
    name_forename:                ['legal forename', 'forename', 'first name', 'firstname', 'given name'],
    name_surname:                 ['legal surname', 'surname', 'last name', 'lastname', 'family name'],
    preferred_name:               ['preferred name', 'known as', 'preferred forename', 'preferredname'],
    year_group:                   ['year group', 'year', 'nc year', 'ncyear'],
    form_group:                   ['reg group', 'registration group', 'reggroup', 'form', 'form group'],
    send_status:                  ['sen status', 'sen', 'send status', 'senstatus'],
    pupil_premium:                ['pupil premium', 'pupilpremium', 'pp', 'fsm'],
    eal:                          ['eal', 'english as additional language'],
    looked_after:                 ['looked after', 'lac', 'looked after child', 'lookedafter'],
    enrolment_status:             ['enrolment status', 'enrollment status', 'enrolmentstatus', 'status'],
  },
  ClassCharts: {
    student_name:                 ['pupil name', 'student name', 'student_name', 'name', 'preferred name'],
    external_student_id:          ['student id', 'student_id', 'pupil id', 'admission no', 'admno'],
    record_date:                  ['date', 'activity date', 'record date'],
    incident_type:                ['reason', 'behaviour', 'activity', 'behaviour type', 'incident type'],
    positive_negative:            ['type'],
    category:                     ['category'],
    behaviour_points:             ['points', 'score', 'behaviour points', 'award value'],
    external_record_id:           ['activity id', 'record id', 'event id'],
    staff_member:                 ['awarded by chosen', 'awarded by', 'awarded by true', 'teacher', 'logged by', 'recorded by'],
    lesson_period:                ['lesson', 'period', 'lesson period'],
    subject:                      ['subject'],
    comment:                      ['note', 'notes', 'comment', 'comments', 'description'],
    year_group:                   ['year', 'year group'],
    form_group:                   ['form', 'class', 'form group', 'set'],
    send_status:                  ['sen', 'sen/aln', 'sen status'],
    pupil_premium:                ['pp', 'pupil premium'],
    attendance_percentage:        ['attendance', 'attendance %', 'attendance percentage'],
  },
  Arbor: {
    student_name:                 ['student name', 'student_name', 'name', 'pupil name', 'preferred name'],
    upn:                          ['upn'],
    external_student_id:          ['admission no', 'admissionno', 'student id', 'student_id'],
    year_group:                   ['year group', 'year_group', 'year'],
    form_group:                   ['form group', 'form_group', 'form', 'registration group', 'registration form'],
    attendance_percentage:        ['attendance %', 'attendance percentage', 'attendance_percentage', 'attendance'],
    attendance_sessions_attended: ['present sessions', 'sessions attended', 'sessions_attended', 'present', 'attended'],
    attendance_sessions_possible: ['possible sessions', 'sessions possible', 'sessions_possible', 'possible'],
    late_marks_count:             ['late marks', 'latemarks'],
    attendance_concern:           ['attendance concern', 'attendanceconcern', 'concern flag'],
    // Canonical observation date for an attendance summary export is the END
    // of the reporting period; the start is preserved in metadata. (The 17 Jul
    // patch mapped record_date to Start Date, which dated July attendance
    // snapshots to the previous September.)
    record_date:                  ['end date', 'enddate', 'date', 'record date'],
    period_start_date:            ['start date', 'startdate'],
    incident_type:                ['category', 'behaviour category', 'incident type', 'type'],
    behaviour_points:             ['points', 'behaviour points'],
    staff_member:                 ['reported by', 'teacher', 'staff'],
    comment:                      ['notes', 'note', 'comment'],
    send_status:                  ['sen status', 'sen_status', 'sen'],
    pupil_premium:                ['pupil premium', 'pupil_premium', 'pp'],
  },
  Bromcom: {
    student_name:        ['student name', 'student_name', 'name', 'pupil name'],
    external_student_id: ['student id', 'student_id', 'bromcom id', 'bromcomid', 'admission no'],
    year_group:          ['year group', 'year_group', 'year'],
    form_group:          ['form', 'form group', 'tutor group'],
    record_date:         ['assessment date', 'date'],
    assessment_cycle:    ['assessment cycle', 'assessmentcycle', 'cycle', 'term'],
    subject:             ['subject'],
    current_grade:       ['current grade', 'currentgrade', 'grade', 'result'],
    target_grade:        ['target grade', 'targetgrade'],
    progress_gap:        ['progress gap', 'progressgap'],
    // FIX (19 Jul 2026): the 17 Jul patch defined `comment` twice in this
    // preset; the second definition silently overwrote the first, making the
    // Progress Status mapping dead code. Progress Status is now a first-class
    // structured field, not a comment.
    progress_status:     ['progress status', 'progressstatus', 'status'],
    staff_member:        ['logged by', 'logged_by', 'staff', 'teacher'],
    comment:             ['description', 'notes', 'comment'],
    send_status:         ['sen status', 'sen_status', 'sen'],
    pupil_premium:       ['pupil premium', 'pupil_premium', 'pp'],
  },
  CPOMS: {
    student_name:        ['student name', 'student_name', 'name', 'pupil name', 'pupil'],
    upn:                 ['upn'],
    external_student_id: ['admission no', 'admissionno', 'student id'],
    external_record_id:  ['incident id', 'incidentid', 'reference', 'ref'],
    record_date:         ['incident date', 'date', 'created', 'created date', 'incidentdate'],
    category:            ['category', 'concern type', 'concern_type'],
    subcategory:         ['subcategory', 'sub category', 'sub_category'],
    comment:             ['incident summary', 'summary', 'notes', 'description', 'incidentsummary'],
    staff_member:        ['assigned to', 'assigned_to', 'recorded by', 'recorded_by'],
    severity:            ['severity', 'safeguarding', 'safeguarding note', 'safeguarding_note'],
    note_status:         ['status'],
    year_group:          ['year group', 'year_group', 'year'],
    form_group:          ['form group', 'form_group', 'form'],
    send_status:         ['sen', 'send status', 'sen_status'],
    pupil_premium:       ['pupil premium', 'pupil_premium', 'pp'],
  },
  'Other / Custom': {
    student_name:                 ['student name', 'student_name', 'pupil name', 'name', 'preferred name'],
    name_forename:                ['forename', 'first name', 'firstname', 'legal forename'],
    name_surname:                 ['surname', 'last name', 'lastname', 'legal surname'],
    upn:                          ['upn', 'uln'],
    external_student_id:          ['admission no', 'admissionno', 'admission number', 'student id', 'student_id', 'admno'],
    preferred_name:               ['preferred name', 'known as'],
    year_group:                   ['year', 'year group', 'year_group'],
    form_group:                   ['form', 'form group', 'reg group', 'registration group'],
    record_date:                  ['date', 'record date'],
    incident_type:                ['type', 'category', 'behaviour', 'incident type', 'reason'],
    behaviour_points:             ['points', 'score'],
    attendance_percentage:        ['attendance', 'attendance %', 'attendance percentage'],
    attendance_sessions_attended: ['sessions attended', 'present sessions', 'attended'],
    attendance_sessions_possible: ['sessions possible', 'possible sessions', 'possible'],
    lesson_period:                ['lesson', 'period'],
    subject:                      ['subject'],
    staff_member:                 ['staff', 'teacher', 'recorded by', 'logged by', 'entered by', 'enteredby', 'assigned to'],
    comment:                      ['notes', 'note', 'comment', 'description', 'reason', 'text'],
    note_priority:                ['priority', 'concern level'],
    note_status:                  ['status'],
    send_status:                  ['sen', 'sen status', 'send status'],
    pupil_premium:                ['pp', 'pupil premium'],
  },
};

export const SIGNATURES: Record<string, string[]> = {
  SIMS:        ['legalforename', 'legalsurname'],
  ClassCharts: ['pupilname', 'awardedbychosen', 'awardedbytrue'],
  Arbor:       ['latemarks', 'possiblesessions', 'presentsessions', 'authorisedabsence', 'unauthorisedabsence'],
  Bromcom:     ['currentgrade', 'targetgrade', 'progressgap', 'assessmentcycle'],
  CPOMS:       ['incidentdate', 'incidentsummary', 'assignedto', 'severity'],
};

export const PRESET_NAMES = Object.keys(PRESETS);

export const SOURCE_SYSTEM_BY_PRESET: Record<string, SourceSystem> = {
  SIMS: 'sims',
  ClassCharts: 'classcharts',
  Arbor: 'arbor',
  Bromcom: 'bromcom',
  CPOMS: 'cpoms',
  'Other / Custom': 'manual',
};

// ─── Matching helpers (moved verbatim from UploadCsv.tsx) ─────────────────────

export function norm(s: string) {
  return s.toLowerCase().replace(/[\s_\-\/\(\)\.]+/g, '');
}

export function detectPreset(headers: string[]): { preset: string; confidence: number; matched: number; total: number } {
  const normHeaders = new Set(headers.map(norm));

  let bestPreset = 'Other / Custom';
  let bestScore = 0;
  let bestMatched = 0;
  let bestTotal = 0;

  for (const [name, fields] of Object.entries(PRESETS)) {
    if (name === 'Other / Custom') continue;
    const sigs = SIGNATURES[name] || [];

    const sigMatches = sigs.filter(s => normHeaders.has(s)).length;
    if (sigMatches === 0) continue;
    const sigScore = sigMatches / sigs.length;

    const fieldKeys = Object.values(fields);
    let fieldMatches = 0;
    for (const aliases of fieldKeys) {
      if (aliases.some(a => normHeaders.has(norm(a)))) fieldMatches++;
    }
    const fieldScore = fieldKeys.length > 0 ? fieldMatches / fieldKeys.length : 0;

    const score = sigScore * 0.7 + fieldScore * 0.3;

    if (score > bestScore) {
      bestScore = score;
      bestPreset = name;
      bestMatched = fieldMatches;
      bestTotal = fieldKeys.length;
    }
  }

  if (bestPreset === 'Other / Custom') {
    const customFields = Object.values(PRESETS['Other / Custom']);
    let m = 0;
    for (const aliases of customFields) {
      if (aliases.some(a => normHeaders.has(norm(a)))) m++;
    }
    bestMatched = m;
    bestTotal = customFields.length;
  }

  const hasSig = bestPreset !== 'Other / Custom';
  const rawConf = hasSig ? 85 + bestScore * 15 : Math.round((bestMatched / Math.max(bestTotal, 1)) * 75);
  const confidence = Math.min(100, Math.round(rawConf));

  return { preset: bestPreset, confidence, matched: bestMatched, total: bestTotal };
}

export function buildMapping(headers: string[], presetName: string): Record<string, string> {
  const preset = PRESETS[presetName];
  if (!preset) return {};
  const normToReal = new Map<string, string>();
  headers.forEach(h => normToReal.set(norm(h), h));
  const mapping: Record<string, string> = {};
  for (const [fieldKey, aliases] of Object.entries(preset)) {
    for (const alias of aliases) {
      const real = normToReal.get(norm(alias));
      if (real) { mapping[fieldKey] = real; break; }
    }
  }
  return mapping;
}

export function headerFingerprint(headers: string[]): string {
  return [...headers].map(norm).sort().join('|');
}

// ─── CSV parsing (moved verbatim from UploadCsv.tsx) ──────────────────────────

export interface CsvRow { [key: string]: string }

export function parseCSVLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === ',' && !inQuotes) {
      cells.push(current.trim()); current = '';
    } else { current += ch; }
  }
  cells.push(current.trim());
  return cells;
}

export function parseCSV(text: string): { headers: string[]; rows: CsvRow[]; error?: string } {
  const clean = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
  const lines = clean.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return { headers: [], rows: [], error: 'File is empty or has no data rows' };
  const headers = parseCSVLine(lines[0]);
  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCSVLine(lines[i]);
    if (cells.length < 1) continue;
    const row: CsvRow = {};
    headers.forEach((h, idx) => { row[h] = cells[idx] || ''; });
    rows.push(row);
  }
  return { headers, rows };
}

export function getMappedValue(row: CsvRow, mapping: Record<string, string>, fieldKey: string) {
  const col = mapping[fieldKey];
  return col ? (row[col] || '') : '';
}

export function normaliseYearGroup(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (/^Year\s+\d+$/i.test(trimmed)) return trimmed.replace(/^year\s+/i, 'Year ');
  const num = trimmed.replace(/\D/g, '');
  if (num && parseInt(num) >= 1 && parseInt(num) <= 13) return `Year ${num}`;
  return trimmed;
}

export function resolveStudentName(row: CsvRow, mapping: Record<string, string>): string {
  const direct = getMappedValue(row, mapping, 'student_name').trim();
  if (direct) return direct;
  const forename = getMappedValue(row, mapping, 'name_forename').trim();
  const surname = getMappedValue(row, mapping, 'name_surname').trim();
  if (forename || surname) {
    const preferred = getMappedValue(row, mapping, 'preferred_name').trim();
    let prefFirst = preferred;
    if (preferred && surname) {
      const suffix = ' ' + surname.toLowerCase();
      if (preferred.toLowerCase().endsWith(suffix)) {
        prefFirst = preferred.slice(0, preferred.length - suffix.length).trim();
      }
    }
    const firstName = prefFirst || forename;
    return [firstName, surname].filter(Boolean).join(' ');
  }
  return '';
}

// ─── Import batch construction ────────────────────────────────────────────────

export interface ParsedFile {
  fileName: string;
  preset: string;
  mapping: Record<string, string>;
  rows: CsvRow[];
}

export interface StudentUpsert {
  key: string;
  name: string;
  upn: string | null;
  external_student_id: string | null;
  year_group: string;
  form: string;
  send_status: string | null;
  pupil_premium: boolean;
  preferred_name: string | null;
  eal: boolean;
  looked_after: boolean;
  enrolment_status: string | null;
}

export interface RejectedRow {
  fileName: string;
  rowIndex: number;   // 1-based data-row index (excludes header)
  studentName: string | null;
  reason: string;
}

export interface SkippedStudent {
  fileName: string;
  rowIndex: number;
  studentName: string;
  enrolmentStatus: string;
}

export interface ImportBatch {
  students: StudentUpsert[];
  behaviourRows: Array<Record<string, unknown>>;
  attendanceRows: Array<Record<string, unknown>>;
  assessmentRows: Array<Record<string, unknown>>;
  safeguardingRows: Array<Record<string, unknown>>;
  pastoralRows: Array<Record<string, unknown>>;
  rejectedRows: RejectedRow[];
  skippedInactive: SkippedStudent[];
}

/** Dedupe identities per table — the ON CONFLICT targets used at insert time.
 *  These must match the unique constraints/indexes in the schema. */
export const DEDUPE_KEYS = {
  behaviour: 'school_id,student_id,date,incident_type',
  attendance: 'school_id,student_id,record_date',
  assessment: 'school_id,student_id,assessment_cycle,subject',
  safeguarding_external: 'school_id,source_system,external_record_id',
} as const;

/**
 * Stage 1: collect unique students across all files, keyed UPN → external ID
 * → normalised name. SIMS rows with a non-active Enrolment Status are skipped
 * and reported; rows without any enrolment column are treated as current
 * pupils (an absent column must never exclude valid students).
 */
export function collectStudents(files: ParsedFile[]): {
  students: StudentUpsert[]; skippedInactive: SkippedStudent[];
} {
  const studentMap = new Map<string, StudentUpsert>();
  const skippedInactive: SkippedStudent[] = [];
  const byUpn = new Map<string, StudentUpsert>();
  const byExtId = new Map<string, StudentUpsert>();
  const byName = new Map<string, StudentUpsert>();

  files.forEach(uf => {
    uf.rows.forEach((row, i) => {
      const name = resolveStudentName(row, uf.mapping).trim();
      if (!name) return;

      const enrolRaw = getMappedValue(row, uf.mapping, 'enrolment_status').trim();
      if (enrolRaw && !isActiveEnrolment(enrolRaw)) {
        skippedInactive.push({
          fileName: uf.fileName, rowIndex: i + 1, studentName: name, enrolmentStatus: enrolRaw,
        });
        return;
      }

      const upn   = getMappedValue(row, uf.mapping, 'upn').trim() || null;
      const extId = getMappedValue(row, uf.mapping, 'external_student_id').trim() || null;
      // Identity merging (19 Jul 2026 fix): the same pupil appears in
      // different exports under different identifiers (SIMS keys by UPN,
      // ClassCharts by admission number, manual notes by name). First-key-wins
      // created duplicate pupils — one per identifier. A row now merges into
      // an existing entry when ANY identifier (UPN, external id, or
      // case-insensitive name) matches; new identifiers are back-filled onto
      // the canonical entry.
      const existing =
        (upn   && byUpn.get(upn)) ||
        (extId && byExtId.get(extId)) ||
        byName.get(name.toLowerCase()) ||
        null;
      if (existing) {
        if (upn && !existing.upn) { existing.upn = upn; byUpn.set(upn, existing); }
        if (extId && !existing.external_student_id) { existing.external_student_id = extId; byExtId.set(extId, existing); }
        return;
      }
      const key = upn ?? extId ?? name.toLowerCase();
      if (!studentMap.has(key)) {
        studentMap.set(key, {
          key,
          name,
          upn,
          external_student_id: extId,
          year_group:   normaliseYearGroup(getMappedValue(row, uf.mapping, 'year_group')) || 'Unknown',
          form:         getMappedValue(row, uf.mapping, 'form_group') || 'Unknown',
          send_status:  getMappedValue(row, uf.mapping, 'send_status') || null,
          pupil_premium:  yesNoToBool(getMappedValue(row, uf.mapping, 'pupil_premium')),
          preferred_name: getMappedValue(row, uf.mapping, 'preferred_name').trim() || null,
          eal:          yesNoToBool(getMappedValue(row, uf.mapping, 'eal')),
          looked_after: yesNoToBool(getMappedValue(row, uf.mapping, 'looked_after')),
          enrolment_status: enrolRaw || null,
        });
        const entry = studentMap.get(key)!;
        if (upn) byUpn.set(upn, entry);
        if (extId) byExtId.set(extId, entry);
        byName.set(name.toLowerCase(), entry);
      }
    });
  });

  return { students: [...studentMap.values()], skippedInactive };
}

export type StudentIdResolver = (row: CsvRow, mapping: Record<string, string>) => string | undefined;

/**
 * Stage 2: build record payloads for every file, routed per preset. Dates are
 * strictly validated; a bad date rejects that row (reported in rejectedRows)
 * without aborting the batch and without silently altering the value.
 * `todayIso` is injected for determinism in tests.
 */
export function buildRecordPayloads(
  files: ParsedFile[],
  schoolId: string,
  resolveStudentId: StudentIdResolver,
  todayIso: string,
): Omit<ImportBatch, 'students' | 'skippedInactive'> {
  const behaviourRows:    Array<Record<string, unknown>> = [];
  const attendanceRows:   Array<Record<string, unknown>> = [];
  const assessmentRows:   Array<Record<string, unknown>> = [];
  const safeguardingRows: Array<Record<string, unknown>> = [];
  const pastoralRows:     Array<Record<string, unknown>> = [];
  const rejectedRows:     RejectedRow[] = [];

  for (const uf of files) {
    const sourceSystem = SOURCE_SYSTEM_BY_PRESET[uf.preset] ?? 'csv_custom';

    uf.rows.forEach((row, i) => {
      const studentName = resolveStudentName(row, uf.mapping).trim() || null;
      try {
        const studentId = resolveStudentId(row, uf.mapping);
        if (!studentId) {
          // SIMS rows produce students, not records — an unmatched SIMS row
          // here means it was intentionally skipped (inactive) or nameless.
          if (uf.preset !== 'SIMS') {
            rejectedRows.push({
              fileName: uf.fileName, rowIndex: i + 1, studentName,
              reason: 'No matching student (UPN, ID and name all failed to match)',
            });
          }
          return;
        }

        const rawDate = getMappedValue(row, uf.mapping, 'record_date').trim();
        const recordDate = parseUkDate(rawDate, 'record date') ?? todayIso;

        if (uf.preset === 'Arbor') {
          const attPct = parseFloatStrict(getMappedValue(row, uf.mapping, 'attendance_percentage'), 'attendance %');
          const sessAttNum  = parseIntStrict(getMappedValue(row, uf.mapping, 'attendance_sessions_attended'), 'present sessions');
          const sessPossNum = parseIntStrict(getMappedValue(row, uf.mapping, 'attendance_sessions_possible'), 'possible sessions');
          const derivedPct = (sessAttNum != null && sessPossNum != null && sessPossNum > 0)
            ? Math.round((sessAttNum / sessPossNum) * 1000) / 10
            : null;
          const concernRaw = getMappedValue(row, uf.mapping, 'attendance_concern').trim();
          const lateMarks = parseIntStrict(getMappedValue(row, uf.mapping, 'late_marks_count'), 'late marks');
          const periodStart = parseUkDate(getMappedValue(row, uf.mapping, 'period_start_date'), 'start date');

          attendanceRows.push({
            student_id: studentId, school_id: schoolId,
            record_date: recordDate,
            attendance_percentage: attPct ?? derivedPct,
            sessions_attended:     sessAttNum,
            sessions_possible:     sessPossNum,
            // Structured fields — queryable, not prose:
            late_marks: lateMarks,
            attendance_concern: canonicalAttendanceConcern(concernRaw),
            comment: getMappedValue(row, uf.mapping, 'comment') || null,
            source_file: uf.fileName,
            source_system: sourceSystem,
            external_record_id: null,
            metadata: {
              period_start_date: periodStart,
              original: { attendance_concern: concernRaw || null, record_date: rawDate || null },
            },
          });

        } else if (uf.preset === 'ClassCharts') {
          const rawPointsStr = getMappedValue(row, uf.mapping, 'behaviour_points');
          const rawPoints = parseIntStrict(rawPointsStr, 'points') ?? 0;
          const typeRaw = getMappedValue(row, uf.mapping, 'positive_negative').trim();
          const behaviourClass = canonicalBehaviourClass(typeRaw, rawPoints);
          const extId = getMappedValue(row, uf.mapping, 'external_record_id').trim() || null;

          behaviourRows.push({
            student_id: studentId, school_id: schoolId,
            date:             recordDate,
            incident_type:    getMappedValue(row, uf.mapping, 'incident_type') || typeRaw || 'Unknown',
            // Positive and negative remain distinguishable in three ways:
            // behaviour_class (canonical), and the disjoint points columns.
            behaviour_class:  behaviourClass,
            behaviour_points: behaviourClass === 'negative' ? Math.abs(rawPoints) : 0,
            positive_points:  behaviourClass === 'positive' ? Math.abs(rawPoints) : 0,
            category:         getMappedValue(row, uf.mapping, 'category') || null,
            lesson_period:    getMappedValue(row, uf.mapping, 'lesson_period') || null,
            subject:          getMappedValue(row, uf.mapping, 'subject') || null,
            staff_member:     getMappedValue(row, uf.mapping, 'staff_member') || null,
            comment:          getMappedValue(row, uf.mapping, 'comment') || null,
            safeguarding_note: null,
            source_system: sourceSystem,
            external_record_id: extId,
            metadata: { original: { type: typeRaw || null, points: rawPointsStr || null, record_date: rawDate || null } },
          });

        } else if (uf.preset === 'CPOMS') {
          const category = getMappedValue(row, uf.mapping, 'category').trim() || null;
          const subcategory = getMappedValue(row, uf.mapping, 'subcategory').trim() || null;
          const statusRaw = getMappedValue(row, uf.mapping, 'note_status').trim();
          const extId = getMappedValue(row, uf.mapping, 'external_record_id').trim() || null;

          safeguardingRows.push({
            student_id: studentId, school_id: schoolId,
            incident_date: recordDate,
            // incident_type keeps the enriched display form for backwards
            // compatibility; category/subcategory/status are the queryable truth.
            incident_type: [category, subcategory].filter(Boolean).join(' — ') || null,
            category,
            subcategory,
            status: canonicalCaseStatus(statusRaw),
            summary: getMappedValue(row, uf.mapping, 'comment') || null,
            assigned_to: getMappedValue(row, uf.mapping, 'staff_member') || null,
            severity: getMappedValue(row, uf.mapping, 'severity') || null,
            source_file: uf.fileName,
            source_system: sourceSystem,
            external_record_id: extId,
            metadata: { original: { status: statusRaw || null, record_date: rawDate || null } },
          });

        } else if (uf.preset === 'Bromcom') {
          const cycle = getMappedValue(row, uf.mapping, 'assessment_cycle').trim() || null;
          const statusRaw = getMappedValue(row, uf.mapping, 'progress_status').trim();

          assessmentRows.push({
            student_id: studentId, school_id: schoolId,
            // Bromcom termly exports carry a cycle label, not a calendar date;
            // the import date is the observation date. If a real date column
            // exists it maps to record_date and is used instead.
            assessment_date: rawDate ? recordDate : todayIso,
            assessment_cycle: cycle,
            subject:       getMappedValue(row, uf.mapping, 'subject') || null,
            current_grade: getMappedValue(row, uf.mapping, 'current_grade') || null,
            target_grade:  getMappedValue(row, uf.mapping, 'target_grade') || null,
            progress_gap:  getMappedValue(row, uf.mapping, 'progress_gap') || null,
            progress_status: canonicalProgressStatus(statusRaw),
            staff_member:  getMappedValue(row, uf.mapping, 'staff_member') || null,
            comment:       getMappedValue(row, uf.mapping, 'comment') || null,
            source_file:   uf.fileName,
            source_system: sourceSystem,
            external_record_id: null,
            metadata: { original: { progress_status: statusRaw || null } },
          });

        } else {
          if (uf.preset === 'SIMS') return; // students only — no records
          const note = getMappedValue(row, uf.mapping, 'comment').trim();
          const statusRaw = getMappedValue(row, uf.mapping, 'note_status').trim();
          pastoralRows.push({
            student_id: studentId, school_id: schoolId,
            note_date:  recordDate,
            note:       note || null,
            priority:   getMappedValue(row, uf.mapping, 'note_priority') || null,
            status:     statusRaw ? canonicalCaseStatus(statusRaw) : null,
            entered_by: getMappedValue(row, uf.mapping, 'staff_member') || null,
            source_file: uf.fileName,
            source_system: sourceSystem,
            external_record_id: null,
            metadata: { original: { status: statusRaw || null, record_date: rawDate || null } },
          });
        }
      } catch (err) {
        if (err instanceof ImportValueError) {
          rejectedRows.push({
            fileName: uf.fileName, rowIndex: i + 1, studentName, reason: err.message,
          });
        } else {
          throw err;
        }
      }
    });
  }

  return { behaviourRows, attendanceRows, assessmentRows, safeguardingRows, pastoralRows, rejectedRows };
}
