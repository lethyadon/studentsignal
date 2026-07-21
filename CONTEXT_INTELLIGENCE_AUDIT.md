# Contextual Intelligence Audit — product vs implementation (19 Jul 2026)

Question: does teacher-, lesson-, period-, class- and cohort-level analysis
already exist, and is it genuinely powered by real data rather than
placeholder/demo logic?

## Verified as EXISTING and genuinely data-powered

`src/lib/schoolIntelligence.ts` (698 lines) queries live `students`,
`behaviour_records`, `safeguarding_records`, `interventions` etc. for the
signed-in school, computes the following, and persists to the
`intelligence_insights` table (surfaced by `SchoolIntelligence.tsx`):

| Requirement pattern | Existing implementation |
|---|---|
| 4. cohort shared rise | Year-group attendance/behaviour vs school average; form-level outliers; PP-vs-non-PP and SEND-vs-non-SEND gap analysis |
| 5. day/period clustering | Peak lesson-period detection; day-of-week incident clustering; safeguarding-by-day clustering; same-day+period incident grouping |
| 1/7 (partial). subject/staff concentration | Subject share-of-incidents; staff-within-subject comparison |
| 6. related students | Repeat student-pair co-involvement ("relationship" insights) |
| 8 (partial). trends | "Emerging": attendance decline followed by behaviour deterioration; risk-escalation-despite-intervention |
| 9 (partial). intervention effectiveness | Successful vs unsuccessful completed interventions (whole-pupil level, not per-lesson) |

`src/pages/StaffDevelopment.tsx` computes per-teacher analysis client-side
from live records in real mode: incidents vs staff average, positive-record
ratio, repeat-pattern students per teacher, per-staff subjects/periods,
intervention success rate. `DEMO_STAFF` is used only as a datalist suggestion
and in demo mode — the analysis itself is real-data in real mode.

Canonical engine (`_shared/engine.ts`, as of today): per-pupil
subject/period/staff concentration + repeated patterns, peer links,
year-cohort aggregates, structured late-marks / attendance-concern /
open-closed / progress-status intelligence.

**Conclusion: cohort, form, subject, staff, period and day-of-week analysis
exist and are real. They are NOT re-implemented in this pass.**

## Verified as MISSING (implemented in this pass, canonical engine only)

1. **Reward-pattern / incentive-effectiveness intelligence** — nothing
   anywhere performs temporal reward analysis: post-incident reward bursts,
   deterioration after a burst ends, rewards rising without corresponding
   improvement, cohort/campaign inflation vs individual recovery,
   whole-class-intervention explanation, sustained-recovery classification.
2. **Pupil-vs-own-baseline trend** — engine trend labels are threshold-based,
   not relative to the pupil's own earlier record.
3. **Per-pupil context-dependence** — "sanctions AND unusually frequent
   rewards concentrated in one lesson while behaving normally elsewhere"
   (scenario D) has no detector.
4. **Location / time-of-day / event-type / department retention** — no
   columns, no preset aliases. Added so they are retained and queryable
   wherever a source supplies them (the six mock exports do not).
5. **Per-lesson intervention effectiveness** (pattern 9) — only whole-pupil
   intervention outcomes exist.

## Known architectural debt (flagged, not silently "fixed")

`schoolIntelligence.ts` is a second, frontend-only analysis path: its
insights are not produced by `run-analysis`, so scheduled/server-side runs
will not generate school-level insights. Consolidating it into the canonical
shared engine is recommended follow-up work; it was NOT duplicated or moved
in this pass to avoid re-implementing working features.

`StaffDevelopment.tsx` computes teacher baselines in page code with a crude
"vs average" (mean difference, no volume normalisation). The canonical
reward/staff-baseline module added in this pass provides the
statistically-safer comparison; the page can adopt it as follow-up work.
