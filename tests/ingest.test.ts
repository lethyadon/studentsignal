import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseUkDate, parseIntStrict, canonicalBehaviourClass, canonicalCaseStatus,
  canonicalAttendanceConcern, canonicalProgressStatus, isActiveEnrolment,
} from '../supabase/functions/_shared/canonical.ts';
import { PRESETS, detectPreset, buildMapping, collectStudents, buildRecordPayloads } from '../src/lib/csvIngest.ts';
import { ImportValueError } from '../supabase/functions/_shared/canonical.ts';
import { ingestRealCsvs, loadParsedFile } from './helpers/engineHarness.ts';

// ─── Strict UK dates ──────────────────────────────────────────────────────────

test('parseUkDate: valid UK dates convert to ISO', () => {
  assert.equal(parseUkDate('07/07/2026', 'd'), '2026-07-07');
  assert.equal(parseUkDate('01/09/2025', 'd'), '2025-09-01');
  assert.equal(parseUkDate('29/02/2024', 'd'), '2024-02-29'); // real leap day
  assert.equal(parseUkDate('2026-07-07', 'd'), '2026-07-07'); // ISO passthrough
});

test('parseUkDate: impossible or ambiguous dates THROW (strict), empty returns null', () => {
  // Strict contract: invalid values raise ImportValueError so the ingestion
  // layer rejects the ROW with a reason — nothing corrupt is ever stored.
  assert.throws(() => parseUkDate('31/02/2026', 'd'), ImportValueError); // impossible day
  assert.throws(() => parseUkDate('29/02/2026', 'd'), ImportValueError); // not a leap year
  assert.throws(() => parseUkDate('00/01/2026', 'd'), ImportValueError);
  assert.throws(() => parseUkDate('12/13/2026', 'd'), ImportValueError); // month 13
  assert.throws(() => parseUkDate('07/07/26', 'd'), ImportValueError);   // 2-digit year
  assert.throws(() => parseUkDate('not a date', 'd'), ImportValueError);
  assert.equal(parseUkDate('', 'd'), null);            // absent value = no date, not an error
});

test('parseIntStrict rejects junk (throws), accepts integers', () => {
  assert.equal(parseIntStrict('14', 'f'), 14);
  assert.equal(parseIntStrict(' 3 ', 'f'), 3);
  assert.equal(parseIntStrict('', 'f'), null);
  assert.throws(() => parseIntStrict('3.7', 'f'), ImportValueError);
  assert.throws(() => parseIntStrict('abc', 'f'), ImportValueError);
});

// ─── Canonical vocabularies ───────────────────────────────────────────────────

test('canonical enums normalise source vocabulary', () => {
  assert.equal(canonicalBehaviourClass('Positive', -2), 'positive');
  assert.equal(canonicalBehaviourClass('Negative', -2), 'negative');
  assert.equal(canonicalBehaviourClass(null, -2), 'negative');   // sign fallback
  assert.equal(canonicalBehaviourClass(null, 3), 'positive');
  assert.equal(canonicalCaseStatus('Open'), 'open');
  assert.equal(canonicalCaseStatus('CLOSED'), 'closed');
  assert.equal(canonicalCaseStatus('weird'), 'open');            // unknown → open (safe)
  assert.equal(canonicalAttendanceConcern('Persistent Absence'), 'persistent_absence');
  assert.equal(canonicalAttendanceConcern('None'), 'none');
  assert.equal(canonicalProgressStatus('Below Target'), 'below_target');
  assert.equal(canonicalProgressStatus('On Track'), 'on_track');
  assert.equal(isActiveEnrolment('Active'), true);
  assert.equal(isActiveEnrolment(''), true);                     // absent column = on roll
  assert.equal(isActiveEnrolment('Left'), false);
});

// ─── Preset detection against the REAL export headers ─────────────────────────

test('every real export detects its correct preset', () => {
  const expectations: Record<string, string> = {
    'SIMS_Pupil_Export.csv': 'SIMS',
    'Arbor_Attendance_Export.csv': 'Arbor',
    'ClassCharts_Behaviour_Export.csv': 'ClassCharts',
    'CPOMS_Incident_Export.csv': 'CPOMS',
    'Bromcom_Assessment_Export.csv': 'Bromcom',
    'Manual_Pastoral_Notes.csv': 'Other / Custom',
  };
  for (const [file, preset] of Object.entries(expectations)) {
    const pf = loadParsedFile(file);
    assert.equal(pf.preset, preset, `${file} should detect as ${preset}, got ${pf.preset}`);
  }
});

test('Bromcom preset maps progress_status separately from comment (17 Jul defect fixed)', () => {
  const pf = loadParsedFile('Bromcom_Assessment_Export.csv');
  assert.ok(pf.mapping['progress_status'], 'progress_status must be mapped');
  assert.ok(pf.mapping['assessment_cycle'], 'assessment_cycle must be mapped');
  assert.notEqual(pf.mapping['progress_status'], pf.mapping['comment']);
});

// ─── Payload structure from the real files ────────────────────────────────────

test('real ingestion: structured fields, provenance and no silent corruption', () => {
  const ing = ingestRealCsvs();
  assert.equal(ing.students.length, 20, 'all 20 SIMS pupils are Active and imported');
  assert.equal(ing.skippedInactive.length, 0, 'real file contains no inactive pupils');
  assert.equal(ing.payloads.rejectedRows.length, 0, 'real files contain no invalid rows');

  // Arbor: record_date = period END date (07/07/2026), start retained in metadata.
  for (const row of ing.payloads.attendanceRows as Array<Record<string, unknown>>) {
    assert.equal(row.record_date, '2026-07-07', 'attendance record_date must be the period end');
    assert.equal(row.source_system, 'arbor');
    assert.equal(typeof row.late_marks, 'number');
    assert.ok(['none', 'monitor', 'persistent_absence'].includes(String(row.attendance_concern)));
  }

  // CPOMS: external id, canonical status, category/subcategory all structured.
  const saf = ing.payloads.safeguardingRows as Array<Record<string, unknown>>;
  assert.ok(saf.length >= 5);
  for (const row of saf) {
    assert.match(String(row.external_record_id), /^INC-\d{3}-2026$/);
    assert.equal(row.status, 'open');
    assert.equal(row.source_system, 'cpoms');
    assert.ok(row.category, 'category retained');
  }

  // ClassCharts: positives and negatives split into distinct point columns.
  const beh = ing.payloads.behaviourRows as Array<Record<string, unknown>>;
  const positives = beh.filter(b => b.behaviour_class === 'positive');
  const negatives = beh.filter(b => b.behaviour_class === 'negative');
  assert.ok(positives.length > 0 && negatives.length > 0);
  for (const p of positives) {
    assert.equal(p.behaviour_points, 0, 'positive rows carry no negative points');
    assert.ok(Number(p.positive_points) > 0);
  }
  for (const n of negatives) {
    assert.ok(Number(n.behaviour_points) > 0, 'negative rows carry positive-magnitude behaviour_points');
    assert.equal(n.positive_points, 0);
  }

  // Bromcom: assessment identity fields present on every row.
  for (const a of ing.payloads.assessmentRows as Array<Record<string, unknown>>) {
    assert.equal(a.assessment_cycle, 'Summer 2026');
    assert.ok(a.subject);
    assert.ok(['on_track', 'below_target', 'above_target'].includes(String(a.progress_status)));
  }

  // Manual notes: entered_by retained.
  for (const p of ing.payloads.pastoralRows as Array<Record<string, unknown>>) {
    assert.ok(p.entered_by, 'entered_by must be retained');
  }
});

test('SYNTHETIC: an inactive SIMS row is skipped and reported', () => {
  // Clone the real SIMS file with one clearly-synthetic left pupil appended.
  const pf = loadParsedFile('SIMS_Pupil_Export.csv');
  const leftRow: Record<string, string> = {};
  for (const h of Object.keys(pf.rows[0])) leftRow[h] = pf.rows[0][h];
  // SIMS names are split across Legal Forename / Legal Surname / Preferred
  // Name — set them all consistently for the synthetic leaver.
  for (const k of Object.keys(leftRow)) {
    if (/forename/i.test(k)) leftRow[k] = 'SYNTHETIC';
    else if (/surname/i.test(k)) leftRow[k] = 'Leaver';
    else if (/name/i.test(k)) leftRow[k] = 'SYNTHETIC Leaver';
    else if (/upn/i.test(k)) leftRow[k] = 'X9999999999';
    else if (/admission/i.test(k)) leftRow[k] = 'A999';
    else if (/enrolment|status/i.test(k)) leftRow[k] = 'Left';
  }
  const files = [{ ...pf, rows: [...pf.rows, leftRow] }];
  const { students, skippedInactive } = collectStudents(files);
  assert.equal(students.length, 20, 'active pupils unchanged');
  assert.equal(skippedInactive.length, 1);
  assert.match(skippedInactive[0].studentName, /SYNTHETIC|Leaver/);
  assert.equal(skippedInactive[0].enrolmentStatus, 'Left');
});

test('SYNTHETIC: a row with an impossible date is rejected with a reason, not stored', async () => {
  const pf = loadParsedFile('ClassCharts_Behaviour_Export.csv');
  const bad: Record<string, string> = { ...pf.rows[0] };
  // ClassCharts mapping key is 'record_date', which maps to the 'Date' header.
  const dateKey = pf.mapping['record_date'];
  bad[dateKey] = '31/02/2026';
  const files = [{ ...pf, rows: [bad] }];
  const ing = ingestRealCsvs();  // for id resolution
  const { resolveStudentName } = await import('../src/lib/csvIngest.ts');
  const resolve = (row: Record<string, string>, mapping: Record<string, string>) => {
    const nm = resolveStudentName(row, mapping);
    return nm ? (ing.idByName.get(nm.toLowerCase()) ?? null) : null;
  };
  const payloads = buildRecordPayloads(files, 'school-x', resolve, '2026-07-19');
  assert.equal(payloads.behaviourRows.length, 0);
  assert.equal(payloads.rejectedRows.length, 1);
  assert.match(payloads.rejectedRows[0].reason, /date/i);
});
