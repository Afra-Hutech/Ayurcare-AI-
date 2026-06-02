// Actual medical emergencies — always High regardless of other signals
const EMERGENCY_PHRASES = [
  'chest pain',
  'heart attack',
  'difficulty breathing',
  "can't breathe",
  'cannot breathe',
  'severe bleeding',
  'vomiting blood',
  'coughing blood',
  'unconscious',
  'fainting',
  'stroke',
  'seizure',
  'anaphylaxis',
  'cardiac arrest',
];

// Extreme pain language — very uncommon in routine Ayurvedic reports
const HIGH_MARKERS = ['unbearable', 'crushing', 'excruciating', 'worst pain', 'agonizing'];

// Moderate indicators — "severe" and "intense" sit here, not High
const MODERATE_MARKERS = [
  'severe', 'intense', 'significant', 'persistent', 'chronic',
  'recurring', 'progressive', 'debilitating', 'worsening', 'acute',
];

// Mild / routine indicators
const LOW_MARKERS = [
  'mild', 'slight', 'minor', 'occasional', 'sometimes', 'a little',
  'manageable', 'low-grade', 'gentle', 'subtle', 'intermittent', 'light',
];

export function canonicalThreatLevel(raw) {
  const t = String(raw || '').trim().toLowerCase();
  if (!t) return null;
  // "severe" stored label → treat as Moderate display (AI often over-classifies)
  if (/(^high$|^critical$|^urgent$|^emergency$)/.test(t)) return 'High';
  if (/(moderate|medium|mod|severe)/.test(t)) return 'Moderate';
  if (/(low|mild|minor)/.test(t)) return 'Low';
  return null;
}

/**
 * Derive a meaningful threat level from report text signals.
 * Priority: emergency phrases > extreme pain markers > mild markers > default Moderate.
 * "Severe" in AI-generated text no longer maps to High — it maps to Moderate.
 */
export function deriveThreatLevel(report = {}, reportData = {}) {
  const diag = reportData?.diagnosis || {};
  const textParts = [
    report.symptoms,
    report.diagnosis,
    diag.name,
    diag.reasoning,
    reportData?.clinicalImpression,
    ...(reportData?.symptomsReported || []),
    ...(reportData?.pain_points || []),
    ...(reportData?.supportingFindings || []),
  ]
    .flat()
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (!textParts) return 'Moderate';

  // Step 1: genuine medical emergencies
  for (const phrase of EMERGENCY_PHRASES) {
    if (textParts.includes(phrase)) return 'High';
  }

  // Step 2: extreme pain descriptors
  const highHits = HIGH_MARKERS.filter((m) => textParts.includes(m)).length;
  if (highHits >= 1) return 'High';

  // Step 3: mild language signals Low
  const lowHits = LOW_MARKERS.filter((m) => textParts.includes(m)).length;
  const moderateHits = MODERATE_MARKERS.filter((m) => textParts.includes(m)).length;

  if (lowHits >= 2 && moderateHits === 0) return 'Low';
  if (lowHits >= 1 && moderateHits === 0) return 'Low';

  // Step 4: stored label as secondary signal (already re-mapped above)
  const stored = canonicalThreatLevel(report.threatLevel || report.severity);
  if (stored === 'Low') return 'Low';
  if (stored === 'High') return 'Moderate'; // AI over-classified — downgrade to Moderate

  // Default: most Ayurvedic conditions are Moderate
  return 'Moderate';
}
