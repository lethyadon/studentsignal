/**
 * Test harness — builds an EngineInput from the REAL sample CSVs by running
 * the exact production ingestion code (csvIngest), not a reimplementation.
 * Payload rows are the same shapes the app upserts into Postgres, so feeding
 * them to runEngine reproduces the live pipeline minus the database.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseCSV, detectPreset, buildMapping, collectStudents, buildRecordPayloads,
  resolveStudentName,
  type ParsedFile, type CsvRow,
} from '../../src/lib/csvIngest.ts';
import type {
  EngineInput, StudentRow, BehaviourRow, AttendanceRow, SafeguardingRow,
  PastoralRow, AssessmentRow,
} from '../../supabase/functions/_shared/engine.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
export const FIXTURES = join(HERE, '..', 'fixtures');
export const SCHOOL_ID = '00000000-0000-0000-0000-00000000c0de';
export const TODAY = '2026-07-19';

export const REAL_FILES = [
  'SIMS_Pupil_Export.csv',
  'Arbor_Attendance_Export.csv',
  'ClassCharts_Behaviour_Export.csv',
  'CPOMS_Incident_Export.csv',
  'Bromcom_Assessment_Export.csv',
  'Manual_Pastoral_Notes.csv',
];

export function loadParsedFile(fileName: string, dir = FIXTURES): ParsedFile {
  const raw = readFileSync(join(dir, fileName), 'utf-8');
  const { headers, rows } = parseCSV(raw);
  const detection = detectPreset(headers);
  const preset = detection.preset;
  const mapping = buildMapping(headers, preset);
  return { fileName, preset, mapping, rows };
}

export interface RealIngest {
  parsedFiles: ParsedFile[];
  students: ReturnType<typeof collectStudents>['students'];
  skippedInactive: ReturnType<typeof collectStudents>['skippedInactive'];
  idByName: Map<string, string>;
  payloads: ReturnType<typeof buildRecordPayloads>;
}

/** Run the full ingestion path over the real fixtures (deterministic ids). */
export function ingestRealCsvs(files: string[] = REAL_FILES, dir = FIXTURES): RealIngest {
  const parsedFiles = files.map(f => loadParsedFile(f, dir));
  const { students, skippedInactive } = collectStudents(parsedFiles);
  // Deterministic student ids: uuid-shaped, derived from admission number/name.
  const idByName = new Map<string, string>();
  students.forEach((s, i) => {
    const id = `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`;
    idByName.set(s.name.toLowerCase(), id);
  });
  // Same resolver shape the UploadCsv page uses: (row, mapping) → id | null.
  const resolveStudentId = (row: CsvRow, mapping: Record<string, string>) => {
    const name = resolveStudentName(row, mapping);
    return name ? (idByName.get(name.toLowerCase()) ?? null) : null;
  };
  const payloads = buildRecordPayloads(parsedFiles, SCHOOL_ID, resolveStudentId, TODAY);
  return { parsedFiles, students, skippedInactive, idByName, payloads };
}

/** Convert ingestion payloads into an EngineInput (the DB round-trip shape). */
export function engineInputFromIngest(ing: RealIngest): EngineInput {
  const students: StudentRow[] = ing.students.map(s => ({
    id: ing.idByName.get(s.name.toLowerCase())!,
    name: s.name,
    year_group: s.year_group,
    form: (s as { form?: string | null }).form ?? null,
    send_status: (s as { send_status?: string | null }).send_status ?? null,
    pupil_premium: Boolean((s as { pupil_premium?: boolean }).pupil_premium),
    attendance_pct: (s as { attendance_pct?: number | null }).attendance_pct ?? null,
  }));
  return {
    schoolId: SCHOOL_ID,
    students,
    behaviour: ing.payloads.behaviourRows as unknown as BehaviourRow[],
    attendance: ing.payloads.attendanceRows as unknown as AttendanceRow[],
    safeguarding: ing.payloads.safeguardingRows as unknown as SafeguardingRow[],
    pastoral: ing.payloads.pastoralRows as unknown as PastoralRow[],
    careers: [],
    communications: [],
    assessments: ing.payloads.assessmentRows as unknown as AssessmentRow[],
    interventions: [],
  };
}
