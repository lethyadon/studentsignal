// Shared safeguarding keyword detection used across all note-taking and action-completion modals.
// Any text field in the app that could carry a concern should run detectSafeguarding() live.

export type SafeguardingLevel = 'urgent' | 'high' | 'medium';
export type SafeguardingCategory =
  | 'self_harm'
  | 'physical_abuse'
  | 'sexual_abuse'
  | 'bullying'
  | 'emotional_abuse'
  | 'neglect'
  | 'safeguarding'
  | 'general';

export interface SafeguardingDetection {
  level: SafeguardingLevel;
  category: SafeguardingCategory;
  triggers: string[];          // readable matched phrases shown to user
  message: string;             // plain-English guidance
  dslName: string;
  suggestedAction: string;     // action type to auto-create
  suggestedPriority: 'urgent' | 'high' | 'medium';
}

// ── Keyword sets (grouped by category for display) ────────────────────────────

const SELF_HARM = [
  'self-harm', 'self harm', 'self harming', 'harming myself', 'hurting myself',
  'cut myself', 'cutting myself', 'suicid', 'want to die', "don't want to live",
  'end my life', 'overdose', 'not worth living', 'kill myself',
];

const PHYSICAL_ABUSE = [
  'been hit', 'getting hit', 'hits me', 'hit by', 'hitting me',
  'been hurt', 'getting hurt', 'hurts me', 'punch', 'punched',
  'kicked', 'kicking me', 'slapped', 'slapping', 'beaten', 'beating',
  'bruise', 'bruises', 'bruised', 'mark on', 'marks on', 'injury',
];

const SEXUAL_ABUSE = [
  'sexual', 'touched me', 'inappropriate touching', 'inappropriate contact',
  'made me', 'grooming', 'groomed',
];

const BULLYING = [
  'bullying', 'bullied', 'bully', 'being bullied', 'cyberbullying',
  'name calling', 'threatening me', 'threatened', 'gang', 'intimidat',
  'excluding me', 'left out on purpose', 'spreading rumours',
];

const EMOTIONAL_ABUSE = [
  'emotional abuse', 'emotional harm', 'scared of', 'afraid of',
  'frightened', 'terrified', 'screaming at', 'shouting at me',
  'called me names', 'put me down', 'makes me feel worthless', 'humiliat',
];

const NEGLECT = [
  'no food', "haven't eaten", 'going hungry', 'hungry at home',
  'no heating', 'cold at home', 'homeless', 'no home', 'being evicted',
  'sleeping rough', 'neglect', 'not being cared for', 'left alone',
  'no one at home', 'not being fed',
];

const HOME_SAFETY = [
  "don't want to go home", "doesn't want to go home", 'not safe at home',
  'unsafe at home', 'scared at home', 'afraid to go home',
  'worried about going home', 'something happening at home',
  'domestic', 'violence at home', 'dad hit', 'mum hit', 'stepdad hit', 'stepmum hit',
  'parents fighting', 'family violence',
];

const SAFEGUARDING_TERMS = [
  'disclosure', 'disclosed', 'safeguarding', 'safeguard',
  'mash', 'social care', 'early help', 'cpoms', 'referral to',
  'child protection', 'section 47', 'looked after', 'care order',
];

// ── Detection ─────────────────────────────────────────────────────────────────

function matchKeywords(text: string, keywords: string[]): string[] {
  const lower = text.toLowerCase();
  return keywords.filter(k => lower.includes(k.toLowerCase()));
}

const CATEGORY_LABELS: Record<SafeguardingCategory, string> = {
  self_harm:       'Self-harm / suicidal ideation',
  physical_abuse:  'Possible physical abuse or harm',
  sexual_abuse:    'Possible sexual abuse concern',
  bullying:        'Bullying concern',
  emotional_abuse: 'Emotional abuse / distress',
  neglect:         'Possible neglect or home safety concern',
  safeguarding:    'Safeguarding disclosure or referral',
  general:         'Welfare concern',
};

const CATEGORY_MESSAGES: Record<SafeguardingCategory, string> = {
  self_harm:       'Self-harm or suicidal language detected — DSL must be informed immediately. Do not leave this student alone.',
  physical_abuse:  'Language suggesting possible physical harm or abuse — a DSL welfare review is required today.',
  sexual_abuse:    'Possible sexual abuse concern — refer to DSL immediately and do not ask leading questions.',
  bullying:        'Bullying language detected — DSL or pastoral lead should review and a formal action logged.',
  emotional_abuse: 'Emotional abuse or significant distress detected — DSL should be informed.',
  neglect:         'Possible neglect or home safety concern — DSL should assess and consider a referral.',
  safeguarding:    'Safeguarding language or disclosure detected — DSL must be informed immediately.',
  general:         'Welfare concern language detected — consider involving the DSL or pastoral lead.',
};

const CATEGORY_ACTIONS: Record<SafeguardingCategory, string> = {
  self_harm:       'Urgent safeguarding welfare review',
  physical_abuse:  'DSL welfare review',
  sexual_abuse:    'Safeguarding referral',
  bullying:        'Bullying investigation',
  emotional_abuse: 'DSL welfare review',
  neglect:         'DSL welfare review',
  safeguarding:    'DSL welfare review',
  general:         'Pastoral welfare check',
};

export function detectSafeguarding(text: string): SafeguardingDetection | null {
  if (!text || text.trim().length < 8) return null;

  const selfHarmMatches    = matchKeywords(text, SELF_HARM);
  const physicalMatches    = matchKeywords(text, PHYSICAL_ABUSE);
  const sexualMatches      = matchKeywords(text, SEXUAL_ABUSE);
  const bullyingMatches    = matchKeywords(text, BULLYING);
  const emotionalMatches   = matchKeywords(text, EMOTIONAL_ABUSE);
  const neglectMatches     = matchKeywords(text, NEGLECT);
  const homeMatches        = matchKeywords(text, HOME_SAFETY);
  const safeguardMatches   = matchKeywords(text, SAFEGUARDING_TERMS);

  const allMatches = [
    ...selfHarmMatches, ...physicalMatches, ...sexualMatches,
    ...bullyingMatches, ...emotionalMatches, ...neglectMatches,
    ...homeMatches, ...safeguardMatches,
  ];

  if (allMatches.length === 0) return null;

  // Priority order: most serious first
  let category: SafeguardingCategory = 'general';
  let triggers: string[] = [];
  let level: SafeguardingLevel = 'medium';

  if (selfHarmMatches.length > 0) {
    category = 'self_harm'; triggers = selfHarmMatches; level = 'urgent';
  } else if (sexualMatches.length > 0) {
    category = 'sexual_abuse'; triggers = sexualMatches; level = 'urgent';
  } else if (safeguardMatches.length > 0) {
    category = 'safeguarding'; triggers = safeguardMatches; level = 'urgent';
  } else if (physicalMatches.length > 0) {
    category = 'physical_abuse'; triggers = physicalMatches; level = 'urgent';
  } else if (homeMatches.length > 0) {
    category = 'neglect'; triggers = homeMatches; level = 'high';
  } else if (emotionalMatches.length > 0) {
    category = 'emotional_abuse'; triggers = emotionalMatches; level = 'high';
  } else if (bullyingMatches.length > 0) {
    category = 'bullying'; triggers = bullyingMatches; level = 'high';
  } else if (neglectMatches.length > 0) {
    category = 'neglect'; triggers = neglectMatches; level = 'high';
  }

  const uniqueTriggers = [...new Set(triggers)].slice(0, 4);

  return {
    level,
    category,
    triggers: uniqueTriggers,
    message: CATEGORY_MESSAGES[category],
    dslName: 'Mr Ahmed (DSL)',
    suggestedAction: CATEGORY_ACTIONS[category],
    suggestedPriority: level === 'urgent' ? 'urgent' : level === 'high' ? 'high' : 'medium',
  };
}

export { CATEGORY_LABELS };

