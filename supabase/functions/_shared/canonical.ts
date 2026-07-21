/**
 * Student Signal — Canonical value handling (RE-AUTHORED 19 Jul 2026)
 *
 * Environment-neutral: no React, no browser APIs, no Supabase client, no Deno
 * APIs. Imported by the frontend (Vite), edge functions (Deno) and tests.
 *
 * Strict UK date handling per approved design:
 *  - DD/MM/YYYY (and DD-MM-YYYY, D/M/YYYY) converted explicitly.
 *  - ISO YYYY-MM-DD preserved.
 *  - date-only vs datetime distinguished (parseUkDate vs parseSourceTimestamp).
 *  - Impossible or ambiguous dates raise ImportValueError — never silently
 *    reinterpreted, never passed through. JS `new Date(string)` is never used
 *    for parsing source values.
 */

export class ImportValueError extends Error {
  readonly field: string;
  readonly value: string;
  constructor(field: string, value: string, reason: string) {
    super(`${field}: "${value}" — ${reason}`);
    this.name = 'ImportValueError';
    this.field = field;
    this.value = value;
  }
}

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function isLeap(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function isRealDate(y: number, m: number, d: number): boolean {
  if (y < 1900 || y > 2100) return false;
  if (m < 1 || m > 12) return false;
  const max = m === 2 && isLeap(y) ? 29 : DAYS_IN_MONTH[m - 1];
  return d >= 1 && d <= max;
}

/**
 * Parse a date-only value from a UK MIS export into ISO YYYY-MM-DD.
 *
 * Accepted: YYYY-MM-DD (ISO, also with time suffix which is truncated),
 * DD/MM/YYYY, DD-MM-YYYY, D/M/YYYY.
 * Rejected with ImportValueError: impossible dates (31/02/2026), ambiguous
 * two-digit years, and anything unparseable.
 * Returns null for empty input (caller decides whether empty is allowed).
 */
export function parseUkDate(raw: string | null | undefined, field = 'date'): string | null {
  const s = (raw ?? '').trim();
  if (!s) return null;

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})([T ].*)?$/);
  if (iso) {
    const [, y, m, d] = iso;
    if (!isRealDate(+y, +m, +d)) {
      throw new ImportValueError(field, s, 'impossible calendar date');
    }
    return `${y}-${m}-${d}`;
  }

  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) {
    const [, dRaw, mRaw, y] = dmy;
    const d = +dRaw, m = +mRaw;
    // UK exports are day-first. If the day slot exceeds 12 the reading is
    // unambiguous. If BOTH slots are <= 12 the string is formally ambiguous
    // between DD/MM and MM/DD; per approved design we treat UK sources as
    // day-first, which is the documented format for SIMS/Arbor/Bromcom/
    // CPOMS/ClassCharts exports. A value that is impossible as day-first is
    // rejected, not silently reinterpreted as month-first.
    if (!isRealDate(+y, m, d)) {
      throw new ImportValueError(field, s, 'impossible calendar date (day-first DD/MM/YYYY reading)');
    }
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2}$/.test(s)) {
    throw new ImportValueError(field, s, 'two-digit year is ambiguous; export with four-digit years');
  }

  throw new ImportValueError(field, s, 'unrecognised date format');
}

/**
 * Parse a full timestamp (datetime) into ISO 8601, or null when only a
 * date-only value is available. Date-only inputs are NOT promoted to
 * midnight timestamps — callers store them via parseUkDate instead, keeping
 * date and datetime semantics separate.
 */
export function parseSourceTimestamp(raw: string | null | undefined, field = 'timestamp'): string | null {
  const s = (raw ?? '').trim();
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(:(\d{2}))?/);
  if (!m) return null; // date-only or unparseable → no fabricated time component
  const [, y, mo, d, h, mi, , sec] = m;
  if (!isRealDate(+y, +mo, +d) || +h > 23 || +mi > 59 || +(sec ?? '0') > 59) {
    throw new ImportValueError(field, s, 'impossible timestamp');
  }
  return `${y}-${mo}-${d}T${h}:${mi}:${sec ?? '00'}Z`;
}

/** True when s is a valid ISO YYYY-MM-DD calendar date. */
export function isValidIsoDate(s: string | null | undefined): boolean {
  if (!s) return false;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return !!m && isRealDate(+m[1], +m[2], +m[3]);
}

/** Integer parse that never NaNs and never accepts trailing junk numbers as valid. */
export function parseIntStrict(raw: string | null | undefined, field = 'value'): number | null {
  const s = (raw ?? '').trim();
  if (!s) return null;
  if (!/^[+-]?\d+$/.test(s)) throw new ImportValueError(field, s, 'not an integer');
  return parseInt(s, 10);
}

export function parseFloatStrict(raw: string | null | undefined, field = 'value'): number | null {
  const s = (raw ?? '').trim();
  if (!s) return null;
  if (!/^[+-]?\d+(\.\d+)?$/.test(s)) throw new ImportValueError(field, s, 'not a number');
  return parseFloat(s);
}

export function yesNoToBool(raw: string | null | undefined): boolean {
  return ['true', '1', 'yes', 'y'].includes((raw ?? '').trim().toLowerCase());
}

// ── Canonical enumerations ────────────────────────────────────────────────────

export type BehaviourClass = 'positive' | 'negative' | 'neutral';
export type CaseStatus = 'open' | 'closed';

/** Canonicalise ClassCharts-style Type + signed points into a behaviour class. */
export function canonicalBehaviourClass(
  typeRaw: string | null | undefined,
  points: number | null,
): BehaviourClass {
  const t = (typeRaw ?? '').trim().toLowerCase();
  if (t === 'positive' || t === 'achievement' || t === 'praise') return 'positive';
  if (t === 'negative' || t === 'behaviour' || t === 'sanction') return 'negative';
  // Only when the source gives no classification do points decide.
  if (points != null && points > 0) return 'positive';
  if (points != null && points < 0) return 'negative';
  return 'neutral';
}

/** Canonicalise CPOMS/pastoral Status into open/closed; unknown → open (safe default: a concern is live until known closed). */
export function canonicalCaseStatus(raw: string | null | undefined): CaseStatus {
  const s = (raw ?? '').trim().toLowerCase();
  if (['closed', 'resolved', 'complete', 'completed', 'no further action', 'nfa'].includes(s)) return 'closed';
  return 'open';
}

/** Canonicalise Arbor Attendance Concern into a comparable level. */
export type AttendanceConcernLevel = 'none' | 'monitor' | 'persistent_absence';
export function canonicalAttendanceConcern(raw: string | null | undefined): AttendanceConcernLevel | null {
  const s = (raw ?? '').trim().toLowerCase();
  if (!s) return null;
  if (s.includes('persistent')) return 'persistent_absence';
  if (s.includes('monitor')) return 'monitor';
  if (s.includes('no concern') || s === 'none') return 'none';
  return 'monitor'; // any other non-empty flag is at least worth monitoring
}

/** Canonicalise Bromcom Progress Status. */
export type ProgressStatus = 'on_track' | 'below_target' | 'above_target';
export function canonicalProgressStatus(raw: string | null | undefined): ProgressStatus | null {
  const s = (raw ?? '').trim().toLowerCase();
  if (!s) return null;
  if (s.includes('below')) return 'below_target';
  if (s.includes('above') || s.includes('exceed')) return 'above_target';
  if (s.includes('on track') || s.includes('ontrack')) return 'on_track';
  return null;
}

/** SIMS-style enrolment status → is the pupil a current pupil? */
export function isActiveEnrolment(raw: string | null | undefined): boolean {
  const s = (raw ?? '').trim().toLowerCase();
  if (!s) return true; // absent column ⇒ export contains current pupils only; do not exclude valid pupils
  return ['active', 'current', 'on roll', 'onroll', 'single registration', 'main - single registration', 'm'].includes(s);
}

// ── Provenance ────────────────────────────────────────────────────────────────

export type SourceSystem =
  | 'sims' | 'arbor' | 'classcharts' | 'bromcom' | 'cpoms'
  | 'manual' | 'csv_custom' | 'api';

export interface Provenance {
  source_system: SourceSystem;
  external_record_id: string | null;   // e.g. CPOMS Incident ID
  source_timestamp: string | null;     // datetime from source, if it had one
  source_date: string | null;          // date-only from source (ISO), if date-only
}
