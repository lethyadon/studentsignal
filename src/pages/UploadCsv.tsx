import { useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { seedMockData } from '../lib/data';
import { generateSchoolIntelligence } from '../lib/schoolIntelligence';
import { runAnalysisImmediate } from '../lib/analysistrigger';
import {
  Upload, FileSpreadsheet, CheckCircle, AlertCircle, ArrowRight,
  FileText, Shield, Check, Loader2, ArrowLeft, Database,
  Sparkles, ChevronDown, ChevronUp, X, Plus, Zap, Info,
  Users, Activity, Eye, Star,
} from 'lucide-react';

// ─── Target fields ─────────────────────────────────────────────────────────────

interface TargetField {
  key: string;
  label: string;
  required: 'identifier' | 'name' | false;
  group: 'identity' | 'demographics' | 'behaviour' | 'attendance' | 'safeguarding' | 'careers';
  hidden?: boolean; // internal synthesis helpers
}

const TARGET_FIELDS: TargetField[] = [
  // Identity
  { key: 'student_name',                 label: 'Student name',              required: 'name',       group: 'identity' },
  { key: 'name_forename',               label: 'Legal / first name',          required: false,        group: 'identity', hidden: false },
  { key: 'name_surname',                label: 'Legal surname',               required: false,        group: 'identity', hidden: false },
  { key: 'preferred_name',              label: 'Preferred name',              required: false,        group: 'identity' },
  { key: 'upn',                          label: 'UPN',                         required: 'identifier', group: 'identity' },
  { key: 'external_student_id',         label: 'Admission No / Student ID',   required: 'identifier', group: 'identity' },
  // Demographics
  { key: 'year_group',                  label: 'Year group',                  required: false,        group: 'demographics' },
  { key: 'form_group',                  label: 'Form / reg group',            required: false,        group: 'demographics' },
  { key: 'send_status',                 label: 'SEND status',                 required: false,        group: 'demographics' },
  { key: 'pupil_premium',               label: 'Pupil premium',               required: false,        group: 'demographics' },
  { key: 'eal',                         label: 'EAL',                         required: false,        group: 'demographics' },
  { key: 'looked_after',                label: 'Looked after (LAC)',          required: false,        group: 'demographics' },
  // Behaviour / incidents
  { key: 'record_date',                 label: 'Date',                        required: false,        group: 'behaviour' },
  { key: 'incident_type',               label: 'Incident / behaviour type',   required: false,        group: 'behaviour' },
  { key: 'behaviour_points',            label: 'Points / score',              required: false,        group: 'behaviour' },
  { key: 'lesson_period',               label: 'Lesson / period',             required: false,        group: 'behaviour' },
  { key: 'subject',                     label: 'Subject',                     required: false,        group: 'behaviour' },
  { key: 'staff_member',                label: 'Staff / teacher',             required: false,        group: 'behaviour' },
  { key: 'comment',                     label: 'Notes / comment',             required: false,        group: 'behaviour' },
  // Attendance
  { key: 'attendance_percentage',       label: 'Attendance % (direct)',       required: false,        group: 'attendance' },
  { key: 'attendance_sessions_attended',label: 'Sessions attended',           required: false,        group: 'attendance' },
  { key: 'attendance_sessions_possible',label: 'Sessions possible',           required: false,        group: 'attendance' },
  // Safeguarding / careers
  { key: 'safeguarding_note',           label: 'Safeguarding note',           required: false,        group: 'safeguarding' },
  { key: 'career_interest',             label: 'Career interest',             required: false,        group: 'careers' },
  { key: 'destination_risk',            label: 'Destination risk',            required: false,        group: 'careers' },
  // Bromcom-specific assessment fields (hidden from generic UI)
  { key: 'current_grade',  label: 'Current grade',  required: false, group: 'behaviour', hidden: true },
  { key: 'target_grade',   label: 'Target grade',   required: false, group: 'behaviour', hidden: true },
  { key: 'progress_gap',   label: 'Progress gap',   required: false, group: 'behaviour', hidden: true },
  // Pastoral note fields (hidden from generic UI)
  { key: 'note_priority',  label: 'Note priority',  required: false, group: 'behaviour', hidden: true },
  { key: 'note_status',    label: 'Note status',    required: false, group: 'behaviour', hidden: true },
];


// ─── Parsing / mapping core ────────────────────────────────────────────────────
// Extracted to src/lib/csvIngest.ts (19 Jul 2026) so tests execute the exact
// functions this page runs. Strict UK date validation lives in
// supabase/functions/_shared/canonical.ts; invalid dates reject the row with
// a reported reason instead of being silently stored.

import {
  PRESETS, PRESET_NAMES, DEDUPE_KEYS,
  detectPreset, buildMapping, headerFingerprint,
  parseCSV, getMappedValue, normaliseYearGroup, resolveStudentName,
  collectStudents, buildRecordPayloads,
  type CsvRow, type ParsedFile, type RejectedRow, type SkippedStudent,
} from '../lib/csvIngest';

const MEMORY_KEY = 'ss_csv_memory';
type CsvMemory = Record<string, { preset: string; label?: string }>;

function loadMemory(): CsvMemory {
  try { return JSON.parse(localStorage.getItem(MEMORY_KEY) || '{}'); } catch { return {}; }
}
function saveMemory(fp: string, preset: string) {
  const m = loadMemory();
  m[fp] = { preset };
  localStorage.setItem(MEMORY_KEY, JSON.stringify(m));
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface UploadedFile {
  id: string;
  file: File;
  headers: string[];
  rows: CsvRow[];
  mapping: Record<string, string>;
  preset: string;
  confidence: number;
  matchedFields: number;
  totalPresetFields: number;
  detecting: boolean;
  seenBefore: boolean;
  expanded: boolean;
  error?: string;
}

interface ImportResults {
  studentsImported: number;
  recordsImported: number;
  behaviourCount: number;
  attendanceCount: number;
  assessmentCount: number;
  safeguardingCount: number;
  pastoralCount: number;
  attendanceConcerns: number;
  duplicatesSkipped: number;
  rejectedRows: RejectedRow[];
  skippedInactive: SkippedStudent[];
}

type Step = 'upload' | 'review' | 'importing' | 'results';

// ─── Main component ────────────────────────────────────────────────────────────

export default function UploadCsv() {
  const { profile, demoMode } = useAuth();
  const navigate = useNavigate();
  const [dragActive, setDragActive] = useState(false);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [step, setStep] = useState<Step>('upload');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [importResults, setImportResults] = useState<ImportResults | null>(null);
  const [loadingDemo, setLoadingDemo] = useState<string | null>(null);
  const [demoSuccess, setDemoSuccess] = useState('');
  const idCounterRef = useRef(0);

  // ── File ingestion ─────────────────────────────────────────────────────────

  const ingestFile = useCallback((f: File) => {
    if (!f.name.toLowerCase().endsWith('.csv')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const { headers, rows, error } = parseCSV(e.target?.result as string);
      const fp = headerFingerprint(headers);
      const memory = loadMemory();
      const seenBefore = !!memory[fp];
      const savedPreset = memory[fp]?.preset;

      let preset: string;
      let confidence: number;
      let matchedFields: number;
      let totalPresetFields: number;

      if (savedPreset && PRESETS[savedPreset]) {
        preset = savedPreset;
        const det = detectPreset(headers);
        confidence = 100; // seen before = 100%
        matchedFields = det.matched;
        totalPresetFields = det.total;
      } else {
        const det = detectPreset(headers);
        preset = error ? 'Other / Custom' : det.preset;
        confidence = error ? 0 : det.confidence;
        matchedFields = det.matched;
        totalPresetFields = det.total;
      }

      const mapping = error ? {} : buildMapping(headers, preset);
      idCounterRef.current += 1;
      const id = `file-${idCounterRef.current}-${Date.now()}`;

      setFiles(prev => {
        const isDup = prev.some(x => x.file.name === f.name && x.rows.length === rows.length);
        if (isDup) return prev;
        return [...prev, { id, file: f, headers, rows, mapping, preset, confidence, matchedFields, totalPresetFields, detecting: true, seenBefore, expanded: false, error }];
      });

      // Brief "detecting" animation, then reveal result
      setTimeout(() => {
        setFiles(prev => prev.map(x => x.id === id ? { ...x, detecting: false } : x));
      }, 700);
    };
    reader.readAsText(f);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragActive(false);
    Array.from(e.dataTransfer.files).forEach(ingestFile);
  }, [ingestFile]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    Array.from(e.target.files || []).forEach(ingestFile);
    e.target.value = '';
  }, [ingestFile]);

  // ── File mutations ─────────────────────────────────────────────────────────

  function removeFile(id: string) { setFiles(prev => prev.filter(f => f.id !== id)); }
  function toggleExpand(id: string) { setFiles(prev => prev.map(f => f.id === id ? { ...f, expanded: !f.expanded } : f)); }

  function changePreset(id: string, presetName: string) {
    setFiles(prev => prev.map(f => {
      if (f.id !== id) return f;
      const mapping = buildMapping(f.headers, presetName);
      const det = detectPreset(f.headers);
      return { ...f, preset: presetName, mapping, matchedFields: det.matched, totalPresetFields: det.total };
    }));
  }

  function changeMapping(id: string, fieldKey: string, value: string) {
    setFiles(prev => prev.map(f => f.id !== id ? f : { ...f, mapping: { ...f.mapping, [fieldKey]: value } }));
  }

  // ── Derived state ──────────────────────────────────────────────────────────

  function hasIdentifier(mapping: Record<string, string>): boolean {
    return !!(mapping['upn'] || mapping['external_student_id'] || mapping['student_name'] || (mapping['name_forename'] && mapping['name_surname']));
  }

  const allReady = files.length > 0 && files.every(f => !f.detecting && !f.error && hasIdentifier(f.mapping));

  const totalRows = files.reduce((s, f) => s + f.rows.length, 0);
  const uniqueStudentNames = (() => {
    const names = new Set<string>();
    files.forEach(f => f.rows.forEach(r => {
      const n = resolveStudentName(r, f.mapping);
      if (n) names.add(n.toLowerCase());
    }));
    return names.size;
  })();

  // Per-type record count breakdown for the Review step
  const typeCounts = (() => {
    let behaviour = 0, attendance = 0, safeguarding = 0, assessment = 0, pastoral = 0;
    files.forEach(f => {
      if (f.preset === 'ClassCharts') behaviour += f.rows.length;
      else if (f.preset === 'Arbor') attendance += f.rows.length;
      else if (f.preset === 'CPOMS') safeguarding += f.rows.length;
      else if (f.preset === 'Bromcom') assessment += f.rows.length;
      else if (f.preset !== 'SIMS') pastoral += f.rows.length;
    });
    return { behaviour, attendance, safeguarding, assessment, pastoral };
  })();

  // For the preview table: prefer a file that has student identity fields mapped
  const previewFile = (() => {
    const identityScore = (f: UploadedFile) => {
      let score = 0;
      if (f.mapping['student_name'] || (f.mapping['name_forename'] && f.mapping['name_surname'])) score += 3;
      if (f.mapping['year_group']) score += 2;
      if (f.mapping['form_group']) score += 1;
      return score;
    };
    return files.slice().sort((a, b) => identityScore(b) - identityScore(a))[0] ?? files[0];
  })();

  // ── Processing ────────────────────────────────────────────────────────────

  async function handleUpload() {
    const schoolId = demoMode ? null : (profile?.school_id ?? null);
    if (!schoolId) { navigate('/analysis'); return; }
    setUploading(true);
    setUploadError('');
    setStep('importing');

    try {
      // Save remembered mappings
      files.forEach(f => {
        saveMemory(headerFingerprint(f.headers), f.preset);
      });

      // ── 1. Collect unique students across all files (csvIngest core) ──────
      // SIMS rows with a non-active Enrolment Status are skipped and reported;
      // rows without the column are treated as current pupils.
      const parsedFiles: ParsedFile[] = files.map(uf => ({
        fileName: uf.file.name, preset: uf.preset, mapping: uf.mapping, rows: uf.rows,
      }));
      const { students: collectedStudents, skippedInactive } = collectStudents(parsedFiles);
      const studentMap = new Map(collectedStudents.map(s => [s.key, s]));

      // ── 2. Fetch existing students to enable safe merge ───────────────────
      // Fetching first avoids multi-constraint INSERT conflicts: we UPDATE rows
      // we can match, and only INSERT genuinely new students.
      const { data: existingStudents, error: fetchExistingErr } = await supabase
        .from('students')
        .select('id, name, upn, external_student_id')
        .eq('school_id', schoolId);
      if (fetchExistingErr) throw fetchExistingErr;

      const existingByUpn   = new Map<string, string>(); // upn -> id
      const existingByExtId = new Map<string, string>(); // external_student_id -> id
      const existingByName  = new Map<string, string>(); // name.toLowerCase() -> id
      for (const s of existingStudents ?? []) {
        if (s.upn)                 existingByUpn.set(s.upn.toLowerCase(),                 s.id);
        if (s.external_student_id) existingByExtId.set(s.external_student_id.toLowerCase(), s.id);
        existingByName.set(s.name.toLowerCase().trim(), s.id);
      }

      // ── 3. Resolve each student: update existing or queue for insert ───────
      const toInsert: any[] = [];
      const toUpdate: { id: string; patch: any }[] = [];

      for (const [, s] of studentMap) {
        const existingId =
          (s.upn                 && existingByUpn.get(s.upn.toLowerCase()))               ||
          (s.external_student_id && existingByExtId.get(s.external_student_id.toLowerCase())) ||
          existingByName.get(s.name.toLowerCase().trim());

        const { key: _ignoredKey, ...studentCols } = s;
        const row = { school_id: schoolId, ...studentCols };
        if (existingId) {
          toUpdate.push({ id: existingId, patch: row });
        } else {
          toInsert.push(row);
        }
      }

      // Update matched students (by PK — no unique constraint conflicts possible)
      for (const { id, patch } of toUpdate) {
        const { error } = await supabase.from('students').update(patch).eq('id', id);
        if (error) throw error;
      }
      // Insert genuinely new students
      if (toInsert.length > 0) {
        const { error } = await supabase.from('students').insert(toInsert);
        if (error) throw error;
      }

      // ── 4. Fetch all students to build comprehensive ID lookup maps ────────
      const { data: allStudents, error: fetchErr } = await supabase
        .from('students')
        .select('id, name, upn, external_student_id')
        .eq('school_id', schoolId);
      if (fetchErr) throw fetchErr;

      const upnToId   = new Map<string, string>();
      const extIdToId = new Map<string, string>();
      const nameToId  = new Map<string, string>();
      (allStudents ?? []).forEach((s: any) => {
        nameToId.set(s.name.toLowerCase(), s.id);
        if (s.upn)                extIdToId.set(s.upn,                s.id); // also index upn in extId for safety
        if (s.upn)                upnToId.set(s.upn,                  s.id);
        if (s.external_student_id) extIdToId.set(s.external_student_id, s.id);
      });

      function resolveStudentId(row: CsvRow, mapping: Record<string,string>): string | undefined {
        const upn   = getMappedValue(row, mapping, 'upn').trim();
        const extId = getMappedValue(row, mapping, 'external_student_id').trim();
        const name  = resolveStudentName(row, mapping).trim().toLowerCase();
        return (upn && upnToId.get(upn)) || (extId && extIdToId.get(extId)) || nameToId.get(name);
      }

      // ── 5. Build record payloads (csvIngest core: strict dates, structured
      //       fields, provenance, per-row rejection) ─────────────────────────
      const today = new Date().toISOString().split('T')[0];
      const {
        behaviourRows, attendanceRows, assessmentRows, safeguardingRows,
        pastoralRows, rejectedRows,
      } = buildRecordPayloads(parsedFiles, schoolId, resolveStudentId, today);

      // ── 6. Insert / upsert records against declared dedupe identities ──────
      // Identities live in csvIngest.DEDUPE_KEYS and match the schema's unique
      // constraints/indexes, so re-importing an identical export creates zero
      // duplicates.
      if (behaviourRows.length > 0) {
        const withExtId = behaviourRows.filter((r: any) => r.external_record_id);
        const withoutExtId = behaviourRows.filter((r: any) => !r.external_record_id);
        if (withExtId.length > 0) {
          const { error } = await supabase.from('behaviour_records')
            .upsert(withExtId, { onConflict: DEDUPE_KEYS.safeguarding_external, ignoreDuplicates: true });
          if (error) throw error;
        }
        if (withoutExtId.length > 0) {
          const { error } = await supabase.from('behaviour_records')
            .upsert(withoutExtId, { onConflict: DEDUPE_KEYS.behaviour, ignoreDuplicates: true });
          if (error) throw error;
        }
      }
      if (attendanceRows.length > 0) {
        const { error } = await supabase.from('attendance_records')
          .upsert(attendanceRows, { onConflict: DEDUPE_KEYS.attendance, ignoreDuplicates: true });
        if (error) throw error;
      }
      if (assessmentRows.length > 0) {
        // Identified rows (cycle + subject) upsert on the assessment identity;
        // unidentified rows fall back to delete-by-source-file idempotency.
        const identified = assessmentRows.filter((r: any) => r.assessment_cycle && r.subject);
        const unidentified = assessmentRows.filter((r: any) => !r.assessment_cycle || !r.subject);
        if (identified.length > 0) {
          const { error } = await supabase.from('assessment_records')
            .upsert(identified, { onConflict: DEDUPE_KEYS.assessment, ignoreDuplicates: false });
          if (error) throw error;
        }
        if (unidentified.length > 0) {
          const files2 = [...new Set(unidentified.map((r: any) => r.source_file).filter(Boolean))];
          for (const fname of files2) {
            await supabase.from('assessment_records').delete()
              .eq('school_id', schoolId).eq('source_file', fname)
              .is('assessment_cycle', null);
          }
          const { error } = await supabase.from('assessment_records').insert(unidentified);
          if (error) throw error;
        }
      }
      if (safeguardingRows.length > 0) {
        // CPOMS supplies Incident IDs → upsert on the external identity so a
        // re-import updates (e.g. Open → Closed) instead of duplicating.
        const withId = safeguardingRows.filter((r: any) => r.external_record_id);
        const withoutId = safeguardingRows.filter((r: any) => !r.external_record_id);
        if (withId.length > 0) {
          const { error } = await supabase.from('safeguarding_records')
            .upsert(withId, { onConflict: DEDUPE_KEYS.safeguarding_external, ignoreDuplicates: false });
          if (error) throw error;
        }
        if (withoutId.length > 0) {
          const files2 = [...new Set(withoutId.map((r: any) => r.source_file).filter(Boolean))];
          for (const fname of files2) {
            await supabase.from('safeguarding_records').delete()
              .eq('school_id', schoolId).eq('source_file', fname)
              .is('external_record_id', null);
          }
          const { error } = await supabase.from('safeguarding_records').insert(withoutId);
          if (error) throw error;
        }
      }
      if (pastoralRows.length > 0) {
        const pastoralFiles = [...new Set(pastoralRows.map((r: any) => r.source_file).filter(Boolean))];
        for (const fname of pastoralFiles) {
          await supabase.from('pastoral_notes').delete().eq('school_id', schoolId).eq('source_file', fname);
        }
        const { error } = await supabase.from('pastoral_notes').insert(pastoralRows);
        if (error) throw error;
      }

      // ── 7. Log uploads ─────────────────────────────────────────────────────
      await Promise.all(files.map(uf =>
        supabase.from('uploads').insert({
          school_id: schoolId, uploaded_by: profile!.id,
          filename: uf.file.name, row_count: uf.rows.length, status: 'completed',
        })
      ));

      // ── 8. Run analysis and collect stats ──────────────────────────────────
      const { attendanceConcerns } = await runAnalysisImmediate(schoolId);

      // ── 9. Generate school-wide intelligence insights ──────────────────────
      await generateSchoolIntelligence(schoolId, new Date().toISOString()).catch(() => {});

      const totalRecords = behaviourRows.length + attendanceRows.length + assessmentRows.length + safeguardingRows.length + pastoralRows.length;

      setImportResults({
        studentsImported: allStudents?.length ?? studentMap.size,
        recordsImported: totalRecords,
        behaviourCount: behaviourRows.length,
        attendanceCount: attendanceRows.length,
        assessmentCount: assessmentRows.length,
        safeguardingCount: safeguardingRows.length,
        pastoralCount: pastoralRows.length,
        attendanceConcerns,
        duplicatesSkipped: totalRows - totalRecords,
        rejectedRows,
        skippedInactive,
      });
      setStep('results');
    } catch (err: any) {
      setUploadError(err.message || 'Upload failed');
      setStep('review');
    } finally {
      setUploading(false);
    }
  }


  // ── Demo data ──────────────────────────────────────────────────────────────

  async function loadDemoData(type: string) {
    if (!profile?.school_id) {
      setDemoSuccess('Demo data loaded. Explore the dashboard and student profiles.');
      setTimeout(() => navigate('/dashboard'), 1500);
      return;
    }
    setLoadingDemo(type);
    try {
      await seedMockData(profile.school_id);
      setDemoSuccess('Demo dataset loaded.');
      setTimeout(() => navigate('/analysis'), 2000);
    } catch {
      setDemoSuccess('Demo data ready — navigate to the dashboard to explore.');
    } finally { setLoadingDemo(null); }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  //  Render helpers
  // ─────────────────────────────────────────────────────────────────────────────

  function confidenceBadge(uf: UploadedFile) {
    if (uf.seenBefore) return <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[11px] font-semibold border border-blue-100">Seen before</span>;
    const col = uf.confidence >= 90 ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : uf.confidence >= 70 ? 'bg-amber-50 text-amber-700 border-amber-100' : 'bg-slate-50 text-slate-600 border-slate-200';
    return <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${col}`}>{uf.confidence}% match</span>;
  }

  // Preview rows — synthesise student name for display
  function previewRows(uf: UploadedFile, limit = 5) {
    return uf.rows.slice(0, limit).map(row => ({
      name: resolveStudentName(row, uf.mapping) || '—',
      year: getMappedValue(row, uf.mapping, 'year_group') || '—',
      form: getMappedValue(row, uf.mapping, 'form_group') || '—',
      send: getMappedValue(row, uf.mapping, 'send_status') || '—',
      pp: getMappedValue(row, uf.mapping, 'pupil_premium') || '—',
    }));
  }

  // ─────────────────────────────────────────────────────────────────────────────
  //  Render
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Upload CSV</h1>
        <p className="text-sm text-slate-500 mt-1">
          Drop your school MIS exports — Student Signal detects the source and maps all fields automatically.
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-3 text-sm">
        {(['upload', 'review', 'importing', 'results'] as Step[]).map((s, i) => {
          const labels: Record<Step, string> = { upload: 'Upload', review: 'Review', importing: 'Import', results: 'Results' };
          const stepIdx = ['upload', 'review', 'importing', 'results'].indexOf(step);
          const isActive = step === s;
          const isDone = stepIdx > i;
          return (
            <div key={s} className="flex items-center gap-3">
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium text-xs ${
                isActive ? 'bg-teal-50 text-teal-700 border border-teal-200' :
                isDone   ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                           'bg-slate-50 text-slate-400 border border-slate-200'
              }`}>
                {isDone ? <Check className="w-3 h-3" /> : <span className="w-3 h-3 rounded-full border border-current inline-block" />}
                {labels[s]}
              </div>
              {i < 3 && <div className={`w-6 h-px ${isDone ? 'bg-emerald-300' : 'bg-slate-200'}`} />}
            </div>
          );
        })}
      </div>

      {/* ── Upload step ──────────────────────────────────────────────────────── */}
      {step === 'upload' && (
        <div className="space-y-6">
          {/* Sample CSV files */}
          <div className="card-premium p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-xl bg-slate-50 flex items-center justify-center shrink-0"><FileText className="w-4 h-4 text-slate-600" /></div>
              <div>
                <h3 className="font-semibold text-slate-900 text-sm">Try with sample export files</h3>
                <p className="text-xs text-slate-500">Real-format sample exports — load one or all to test the full import pipeline.</p>
              </div>
            </div>
            <div className="grid sm:grid-cols-3 gap-2">
              {[
                { file: 'SIMS_Pupil_Export.csv',         label: 'SIMS',        desc: '20 students · pupil register' },
                { file: 'Arbor_Attendance_Export.csv',    label: 'Arbor',       desc: '20 records · attendance' },
                { file: 'ClassCharts_Behaviour_Export.csv',label: 'ClassCharts',desc: '34 records · behaviour' },
                { file: 'CPOMS_Incident_Export.csv',      label: 'CPOMS',       desc: '7 records · safeguarding' },
                { file: 'Bromcom_Assessment_Export.csv',  label: 'Bromcom',     desc: '60 records · assessment' },
                { file: 'Manual_Pastoral_Notes.csv',      label: 'Manual',      desc: '6 records · pastoral notes' },
              ].map(d => (
                <button key={d.file}
                  onClick={async () => {
                    try {
                      const res = await fetch(`/uploads/csv/${d.file}`);
                      const text = await res.text();
                      const blob = new Blob([text], { type: 'text/csv' });
                      ingestFile(new File([blob], d.file, { type: 'text/csv' }));
                    } catch { /* ignore */ }
                  }}
                  className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:border-teal-300 hover:bg-teal-50/40 transition-all text-left group">
                  <div className="w-7 h-7 rounded-lg bg-slate-50 group-hover:bg-teal-100 flex items-center justify-center shrink-0 transition-colors">
                    <FileSpreadsheet className="w-3.5 h-3.5 text-slate-400 group-hover:text-teal-600" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-slate-800 group-hover:text-teal-700">{d.label}</div>
                    <div className="text-[11px] text-slate-400">{d.desc}</div>
                  </div>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-400 mt-3">Click individual files to add them, or drop real exports below — detection is automatic.</p>
          </div>

          {/* Demo data */}
          <div className="card-premium p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-xl bg-teal-50 flex items-center justify-center shrink-0"><Sparkles className="w-4 h-4 text-teal-600" /></div>
              <div>
                <h3 className="font-semibold text-slate-900 text-sm">Explore with built-in demo data</h3>
                <p className="text-xs text-slate-500">Load a pre-seeded dataset to see Student Signal without uploading anything.</p>
              </div>
            </div>
            <div className="grid sm:grid-cols-3 gap-2">
              {[
                { key: 'classcharts', label: 'ClassCharts sample', desc: 'Behaviour events' },
                { key: 'arbor',       label: 'Arbor sample',       desc: 'Attendance + MIS' },
                { key: 'sims',        label: 'SIMS sample',        desc: 'Student register' },
              ].map(d => (
                <button key={d.key} onClick={() => loadDemoData(d.key)} disabled={loadingDemo !== null}
                  className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:border-teal-300 hover:bg-teal-50/40 transition-all text-left group">
                  <div className="w-7 h-7 rounded-lg bg-slate-50 group-hover:bg-teal-100 flex items-center justify-center shrink-0 transition-colors">
                    {loadingDemo === d.key ? <Loader2 className="w-3.5 h-3.5 text-teal-600 animate-spin" /> : <Database className="w-3.5 h-3.5 text-slate-400 group-hover:text-teal-600" />}
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-slate-800 group-hover:text-teal-700">{d.label}</div>
                    <div className="text-[11px] text-slate-400">{d.desc}</div>
                  </div>
                </button>
              ))}
            </div>
            {demoSuccess && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium mt-3">
                <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />{demoSuccess}
              </div>
            )}
          </div>

          {/* Drop zone */}
          <div
            className={`border-2 border-dashed rounded-2xl p-12 text-center transition-all cursor-pointer ${
              dragActive ? 'border-teal-500 bg-teal-50/60' : 'border-slate-300 bg-white hover:border-teal-400 hover:bg-slate-50/40'
            }`}
            onDragOver={e => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            onClick={() => document.getElementById('csv-input')?.click()}
          >
            <div className="w-14 h-14 rounded-2xl bg-teal-50 flex items-center justify-center mx-auto mb-4">
              <Upload className="w-7 h-7 text-teal-600" />
            </div>
            <p className="text-base font-semibold text-slate-800 mb-1">Drop your CSV exports here</p>
            <p className="text-sm text-slate-500 mb-4">You can add multiple files — source system detected automatically</p>
            <div className="flex items-center justify-center gap-2 flex-wrap">
              {['SIMS', 'ClassCharts', 'Arbor', 'Bromcom', 'CPOMS'].map(name => (
                <span key={name} className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 text-xs text-slate-600">
                  <Zap className="w-3 h-3 text-teal-500" />{name}
                </span>
              ))}
            </div>
            <input id="csv-input" type="file" accept=".csv" multiple onChange={handleInputChange} className="hidden" />
          </div>

          {/* Files list */}
          {files.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-800">{files.length} file{files.length > 1 ? 's' : ''} added</h3>
                <button onClick={() => document.getElementById('csv-input')?.click()}
                  className="flex items-center gap-1.5 text-xs font-medium text-teal-600 hover:text-teal-700 transition-colors">
                  <Plus className="w-3.5 h-3.5" />Add another file
                </button>
              </div>

              {files.map(uf => (
                <FileCard key={uf.id} uf={uf} onRemove={removeFile} onToggleExpand={toggleExpand}
                  onChangePreset={changePreset} onChangeMapping={changeMapping}
                  confidenceBadge={confidenceBadge(uf)} resolveStudentName={resolveStudentName} />
              ))}
            </div>
          )}

          {files.length > 0 && (
            <div className="flex justify-end">
              <button onClick={() => setStep('review')} disabled={!allReady}
                className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed">
                Review import <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Review step ──────────────────────────────────────────────────────── */}
      {step === 'review' && (
        <div className="space-y-6">
          <div className="card-premium p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center"><CheckCircle className="w-5 h-5 text-emerald-600" /></div>
              <div>
                <h2 className="font-semibold text-slate-900">Ready to import</h2>
                <p className="text-xs text-slate-500">Confirm the details below, then import and analyse.</p>
              </div>
            </div>

            {/* Import summary — per type */}
            <div className="mb-6">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">What will be imported</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[
                  { label: 'Students', value: uniqueStudentNames, icon: Users, color: 'text-teal-600 bg-teal-50 border-teal-100', always: true },
                  { label: 'Behaviour records', value: typeCounts.behaviour, icon: Activity, color: 'text-blue-600 bg-blue-50 border-blue-100', always: false },
                  { label: 'Attendance records', value: typeCounts.attendance, icon: CheckCircle, color: 'text-emerald-600 bg-emerald-50 border-emerald-100', always: false },
                  { label: 'Safeguarding records', value: typeCounts.safeguarding, icon: Shield, color: 'text-red-600 bg-red-50 border-red-100', always: false },
                  { label: 'Assessment records', value: typeCounts.assessment, icon: Star, color: 'text-amber-600 bg-amber-50 border-amber-100', always: false },
                  { label: 'Pastoral notes', value: typeCounts.pastoral, icon: FileText, color: 'text-slate-600 bg-slate-50 border-slate-200', always: false },
                ]
                  .filter(s => s.always || s.value > 0)
                  .map(stat => {
                    const Icon = stat.icon;
                    return (
                      <div key={stat.label} className={`flex items-center gap-3 p-3 rounded-xl border ${stat.color}`}>
                        <div className="w-8 h-8 rounded-lg bg-white/60 flex items-center justify-center shrink-0">
                          <Icon className={`w-4 h-4 ${stat.color.split(' ')[0]}`} />
                        </div>
                        <div>
                          <div className="text-lg font-bold text-slate-900 leading-none">{stat.value.toLocaleString()}</div>
                          <div className="text-xs text-slate-500 mt-0.5">{stat.label}</div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* Per-file summary */}
            <div className="space-y-2 mb-6">
              {files.map(uf => (
                <div key={uf.id} className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 bg-slate-50/60">
                  <FileSpreadsheet className="w-4 h-4 text-teal-600 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-slate-800 truncate block">{uf.file.name}</span>
                    <span className="text-xs text-slate-400">{uf.rows.length.toLocaleString()} rows · {uf.matchedFields}/{uf.totalPresetFields} fields</span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 text-[11px] font-semibold border border-teal-100">{uf.preset}</span>
                  {confidenceBadge(uf)}
                  <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                </div>
              ))}
            </div>

            {/* Preview table of best identity file */}
            {previewFile && previewFile.rows.length > 0 && (() => {
              const rows = previewRows(previewFile);
              const hasIdentityData = rows.some(r => r.name !== '—');
              if (!hasIdentityData) return null;
              return (
                <>
                  <div className="flex items-center gap-2 mb-2">
                    <Eye className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Student Preview (Merged)</span>
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          {['Student', 'Year', 'Form', 'SEND', 'PP'].map(h => (
                            <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r, i) => (
                          <tr key={i} className="border-b border-slate-100 hover:bg-slate-50/60">
                            <td className="px-4 py-2.5 font-medium text-slate-800">{r.name}</td>
                            <td className="px-4 py-2.5 text-slate-600">{r.year}</td>
                            <td className="px-4 py-2.5 text-slate-600">{r.form}</td>
                            <td className="px-4 py-2.5 text-slate-600">{r.send}</td>
                            <td className="px-4 py-2.5 text-slate-600">{r.pp}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {previewFile.rows.length > 5 && (
                    <p className="text-xs text-slate-400 mt-2 text-center">Showing 5 of {previewFile.rows.length.toLocaleString()} rows</p>
                  )}
                </>
              );
            })()}

            <div className="flex items-start gap-2 mt-4 p-3 bg-blue-50 border border-blue-100 rounded-xl">
              <Info className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
              <div className="text-xs text-blue-700 space-y-1">
                <p><strong>After import,</strong> Student Signal will merge these records, analyse behaviour, attendance and safeguarding patterns, then generate a risk signal for each student — ready to view on the Signal Queue and student profiles.</p>
                <p>Re-uploading the same file is safe — duplicate records are detected and ignored. For automated daily sync without manual exports, visit <strong>Settings → Data &amp; Integrations</strong>.</p>
              </div>
            </div>
          </div>

          {uploadError && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />{uploadError}
            </div>
          )}

          <div className="flex items-center justify-between">
            <button onClick={() => setStep('upload')} className="btn-secondary">
              <ArrowLeft className="w-4 h-4" />Back to files
            </button>
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-400 flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-teal-500" />School-scoped RLS
              </span>
              <button onClick={handleUpload} disabled={uploading} className="btn-primary disabled:opacity-60">
                {uploading && <Loader2 className="w-4 h-4 animate-spin" />}
                {uploading ? 'Importing…' : 'Import & analyse'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Importing step ───────────────────────────────────────────────────── */}
      {step === 'importing' && (
        <div className="card-premium p-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-teal-50 flex items-center justify-center mx-auto mb-5">
            <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
          </div>
          <h2 className="text-xl font-semibold text-slate-900 mb-2">Importing &amp; analysing</h2>
          <p className="text-sm text-slate-500">Running pastoral intelligence across your data — please do not close this page.</p>
          <div className="flex items-center justify-center gap-6 mt-6 text-xs text-slate-400">
            {files.map(f => (
              <div key={f.id} className="flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin text-teal-400" />
                {f.file.name}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Results step ─────────────────────────────────────────────────────── */}
      {step === 'results' && importResults && (
        <div className="space-y-6">
          <div className="card-premium p-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-emerald-600" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-1">Import complete</h2>
            <p className="text-sm text-slate-500 mb-8">Student Signal has analysed your data and generated pastoral intelligence.</p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8 text-left">
              <ResultStat icon={<Users className="w-5 h-5 text-teal-600" />} value={importResults.studentsImported} label="Students imported" bg="bg-teal-50" />
              {importResults.behaviourCount > 0 && (
                <ResultStat icon={<Activity className="w-5 h-5 text-blue-600" />} value={importResults.behaviourCount.toLocaleString()} label="Behaviour records" bg="bg-blue-50" />
              )}
              {importResults.attendanceCount > 0 && (
                <ResultStat icon={<CheckCircle className="w-5 h-5 text-emerald-600" />} value={importResults.attendanceCount.toLocaleString()} label="Attendance records" bg="bg-emerald-50" />
              )}
              {importResults.assessmentCount > 0 && (
                <ResultStat icon={<Star className="w-5 h-5 text-amber-600" />} value={importResults.assessmentCount.toLocaleString()} label="Assessment records" bg="bg-amber-50" />
              )}
              {importResults.safeguardingCount > 0 && (
                <ResultStat icon={<AlertCircle className="w-5 h-5 text-red-600" />} value={importResults.safeguardingCount} label="Safeguarding records" bg="bg-red-50" highlight />
              )}
              {importResults.pastoralCount > 0 && (
                <ResultStat icon={<FileText className="w-5 h-5 text-slate-500" />} value={importResults.pastoralCount.toLocaleString()} label="Pastoral notes" bg="bg-slate-100" />
              )}
              {importResults.attendanceConcerns > 0 && (
                <ResultStat icon={<Eye className="w-5 h-5 text-amber-600" />} value={importResults.attendanceConcerns} label="Attendance concerns" bg="bg-amber-50" />
              )}
              {importResults.duplicatesSkipped > 0 && (
                <ResultStat icon={<Check className="w-5 h-5 text-slate-500" />} value={importResults.duplicatesSkipped} label="Duplicates skipped" bg="bg-slate-100" />
              )}
              {importResults.safeguardingCount === 0 && importResults.attendanceConcerns === 0 && (
                <ResultStat icon={<Star className="w-5 h-5 text-emerald-600" />} value="All clear" label="No safeguarding flags" bg="bg-emerald-50" />
              )}
            </div>

            {importResults.rejectedRows.length > 0 && (
              <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-left">
                <p className="font-semibold text-amber-900 mb-2">
                  {importResults.rejectedRows.length} row{importResults.rejectedRows.length > 1 ? 's were' : ' was'} rejected and NOT imported
                </p>
                <ul className="text-sm text-amber-800 space-y-1 max-h-40 overflow-y-auto">
                  {importResults.rejectedRows.slice(0, 20).map((r, i) => (
                    <li key={i}>
                      <span className="font-medium">{r.fileName}</span> row {r.rowIndex}
                      {r.studentName ? ` (${r.studentName})` : ''}: {r.reason}
                    </li>
                  ))}
                  {importResults.rejectedRows.length > 20 && (
                    <li>…and {importResults.rejectedRows.length - 20} more</li>
                  )}
                </ul>
              </div>
            )}

            {importResults.skippedInactive.length > 0 && (
              <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50 p-4 text-left">
                <p className="font-semibold text-slate-700 mb-2">
                  {importResults.skippedInactive.length} pupil{importResults.skippedInactive.length > 1 ? 's' : ''} skipped (not currently on roll)
                </p>
                <ul className="text-sm text-slate-600 space-y-1 max-h-32 overflow-y-auto">
                  {importResults.skippedInactive.slice(0, 10).map((sk, i) => (
                    <li key={i}>{sk.studentName} — enrolment status "{sk.enrolmentStatus}" ({sk.fileName} row {sk.rowIndex})</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <button onClick={() => navigate('/analysis')} className="btn-primary w-full sm:w-auto">
                <Sparkles className="w-4 h-4" />View analysis results
                <ArrowRight className="w-4 h-4" />
              </button>
              <button onClick={() => navigate('/dashboard')} className="btn-secondary w-full sm:w-auto">
                Go to dashboard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── FileCard ──────────────────────────────────────────────────────────────────

function FileCard({ uf, onRemove, onToggleExpand, onChangePreset, onChangeMapping, confidenceBadge, resolveStudentName }: {
  uf: UploadedFile;
  onRemove: (id: string) => void;
  onToggleExpand: (id: string) => void;
  onChangePreset: (id: string, preset: string) => void;
  onChangeMapping: (id: string, fieldKey: string, value: string) => void;
  confidenceBadge: React.ReactNode;
  resolveStudentName: (row: CsvRow, mapping: Record<string, string>) => string;
}) {
  return (
    <div className="card-premium overflow-hidden">
      {/* Header row */}
      <div className="flex items-center gap-4 p-4">
        <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center shrink-0">
          {uf.detecting
            ? <Loader2 className="w-5 h-5 text-teal-500 animate-spin" />
            : <FileSpreadsheet className="w-5 h-5 text-teal-600" />}
        </div>

        <div className="flex-1 min-w-0">
          {uf.detecting ? (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-slate-500 animate-pulse">Detecting source system…</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-slate-900 truncate">{uf.file.name}</span>
              {uf.error ? (
                <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-600 text-[11px] font-semibold border border-red-100">Error: {uf.error}</span>
              ) : (
                <>
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 text-[11px] font-semibold border border-teal-100">
                    <Zap className="w-2.5 h-2.5" />{uf.preset} detected
                  </span>
                  {confidenceBadge}
                </>
              )}
            </div>
          )}
          {!uf.detecting && !uf.error && (
            <div className="text-xs text-slate-400 mt-0.5">
              {uf.rows.length.toLocaleString()} rows · {uf.matchedFields}/{uf.totalPresetFields} fields mapped automatically
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!uf.detecting && (
            <button onClick={() => onToggleExpand(uf.id)}
              className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 transition-colors">
              {uf.expanded ? <><ChevronUp className="w-3.5 h-3.5" />Hide</> : <><ChevronDown className="w-3.5 h-3.5" />Configure</>}
            </button>
          )}
          <button onClick={() => onRemove(uf.id)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Expanded panel */}
      {uf.expanded && !uf.detecting && !uf.error && (
        <div className="border-t border-slate-100 p-5 bg-slate-50/60">
          {/* Preset selector */}
          <div className="mb-4">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Source system</div>
            <div className="flex flex-wrap gap-2">
              {PRESET_NAMES.map(name => (
                <button key={name} onClick={() => onChangePreset(uf.id, name)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                    uf.preset === name ? 'bg-teal-50 text-teal-700 border-teal-200' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}>
                  {name}
                </button>
              ))}
            </div>
          </div>

          {/* SIMS name synthesis notice */}
          {(uf.mapping['name_forename'] || uf.mapping['name_surname']) && (
            <div className="flex items-start gap-2 p-3 bg-teal-50 border border-teal-100 rounded-xl mb-4 text-xs text-teal-800">
              <Zap className="w-3.5 h-3.5 mt-0.5 shrink-0 text-teal-600" />
              Student Name will be automatically created from <strong>Legal Forename + Legal Surname</strong>{uf.mapping['preferred_name'] ? ' (Preferred Name used when available)' : ''}.
            </div>
          )}

          {/* Mapped required + identity fields */}
          <div className="space-y-1.5 mb-3">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Required &amp; identifier fields</div>
            {TARGET_FIELDS.filter(f => f.required || f.group === 'identity').map(field => (
              <MappingRow key={field.key} field={field} headers={uf.headers} value={uf.mapping[field.key] || ''} onChange={v => onChangeMapping(uf.id, field.key, v)} />
            ))}
          </div>

          {/* Mapped optional fields */}
          {TARGET_FIELDS.filter(f => !f.required && f.group !== 'identity' && uf.mapping[f.key]).length > 0 && (
            <div className="space-y-1.5 mb-3">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Auto-mapped fields</div>
              {TARGET_FIELDS.filter(f => !f.required && f.group !== 'identity' && uf.mapping[f.key]).map(field => (
                <MappingRow key={field.key} field={field} headers={uf.headers} value={uf.mapping[field.key] || ''} onChange={v => onChangeMapping(uf.id, field.key, v)} />
              ))}
            </div>
          )}

          {/* Unmapped optionals — collapsed */}
          <UnmappedOptionals uf={uf} onChange={onChangeMapping} />
        </div>
      )}
    </div>
  );
}

// ─── MappingRow ────────────────────────────────────────────────────────────────

function MappingRow({ field, headers, value, onChange }: {
  field: TargetField;
  headers: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-slate-100">
      <span className={`text-[10px] font-bold uppercase tracking-wider w-6 text-center shrink-0 ${
        field.required === 'identifier' ? 'text-blue-500' :
        field.required === 'name' ? 'text-red-500' : 'text-slate-300'
      }`}>
        {field.required === 'identifier' ? 'ID' : field.required === 'name' ? 'REQ' : 'OPT'}
      </span>
      <span className="text-xs font-medium text-slate-700 w-40 shrink-0 truncate">{field.label}</span>
      <ArrowRight className="w-3 h-3 text-slate-300 shrink-0" />
      <select value={value} onChange={e => onChange(e.target.value)}
        className={`flex-1 px-2.5 py-1.5 rounded-lg border text-xs focus:outline-none focus:ring-2 focus:ring-teal-400 ${
          value ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-50 border-slate-200 text-slate-400'
        }`}>
        <option value="">— Unmapped —</option>
        {headers.map(h => <option key={h} value={h}>{h}</option>)}
      </select>
      {value && <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
    </div>
  );
}

// ─── UnmappedOptionals ────────────────────────────────────────────────────────

function UnmappedOptionals({ uf, onChange }: {
  uf: UploadedFile;
  onChange: (id: string, fieldKey: string, value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const unmapped = TARGET_FIELDS.filter(f => !f.required && f.group !== 'identity' && !uf.mapping[f.key]);
  if (unmapped.length === 0) return null;
  return (
    <div>
      <button onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 transition-colors px-1 mt-1">
        {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        {open ? 'Hide' : 'Show'} {unmapped.length} unmapped optional field{unmapped.length > 1 ? 's' : ''}
      </button>
      {open && (
        <div className="space-y-1.5 mt-2">
          {unmapped.map(field => (
            <MappingRow key={field.key} field={field} headers={uf.headers} value={uf.mapping[field.key] || ''} onChange={v => onChange(uf.id, field.key, v)} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── ResultStat ────────────────────────────────────────────────────────────────

function ResultStat({ icon, value, label, bg, highlight }: {
  icon: React.ReactNode; value: string | number; label: string; bg: string; highlight?: boolean;
}) {
  return (
    <div className={`${bg} rounded-2xl p-5 border ${highlight ? 'border-red-200' : 'border-transparent'}`}>
      <div className="flex items-center gap-2 mb-2">{icon}</div>
      <div className={`text-2xl font-bold ${highlight ? 'text-red-700' : 'text-slate-800'}`}>{value}</div>
      <div className="text-xs text-slate-500 mt-0.5">{label}</div>
    </div>
  );
}

