import { parseReportPayload, resolveReportsFromSession } from './reportPayload';

/** Common modern → classical Ayurvedic condition names (Sanskrit / traditional). */
const AYURVEDIC_NAME_MAP = {
  fever: 'Jwara',
  jwara: 'Jwara',
  cold: 'Pratishyaya',
  cough: 'Kasa',
  headache: 'Shirashoola',
  migraine: 'Ardhavabhedaka',
  acidity: 'Amlapitta',
  gastritis: 'Amlapitta',
  indigestion: 'Ajeerna',
  constipation: 'Vibandha',
  diarrhea: 'Atisara',
  diabetes: 'Madhumeha',
  hypertension: 'Raktagata Vata',
  'high blood pressure': 'Raktagata Vata',
  anxiety: 'Chittodvega',
  stress: 'Manasika Daurbalya',
  insomnia: 'Anidra',
  arthritis: 'Amavata',
  'joint pain': 'Sandhivata',
  'back pain': 'Prishtashoola',
  'skin rash': 'Kotha',
  eczema: 'Vicharchika',
  asthma: 'Shwasa',
  allergy: 'Asatmya',
  obesity: 'Sthoulya',
  fatigue: 'Klaibya',
  'chest pain': 'Hridayashoola',
  'chest tightness': 'Hridayashoola',
  anemia: 'Pandu',
  thyroid: 'Galaganda',
  pcod: 'Pushpaghni Janya Vikara',
  pcos: 'Pushpaghni Janya Vikara',
  'menstrual pain': 'Kashtartava',
  depression: 'Vishada',
  piles: 'Arsha',
  hemorrhoids: 'Arsha',
  urticaria: 'Sheetapitta',
  'acidity reflux': 'Amlapitta',
  bloating: 'Adhmana',
  nausea: 'Chardi',
  vomiting: 'Chardi',
};

const normalizeKey = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Resolve Ayurvedic name from explicit field or symptom/diagnosis label. */
export function resolveAyurvedicName(modernName, explicitAyurvedic) {
  const explicit = String(explicitAyurvedic || '').trim();
  if (explicit) return explicit;

  const key = normalizeKey(modernName);
  if (!key) return '';

  if (AYURVEDIC_NAME_MAP[key]) return AYURVEDIC_NAME_MAP[key];

  for (const [term, sanskrit] of Object.entries(AYURVEDIC_NAME_MAP)) {
    if (key.includes(term) || term.includes(key)) return sanskrit;
  }

  return '';
}

/** First character uppercase for patient-facing titles, e.g. "chest pain bro" → "Chest pain bro". */
export function capitalizeDisplayTitle(text) {
  const s = String(text || '').trim();
  if (!s) return '';
  return s[0].toLocaleUpperCase('en-US') + s.slice(1);
}

/** Parse titles already stored as "Fever (Jwara)". */
export function parseTitleWithAyurvedic(title) {
  const t = String(title || '').trim();
  if (!t || t === 'New Consultation') return null;
  const m = t.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (!m) return null;
  return { modern: m[1].trim(), ayurvedic: m[2].trim() };
}

/** e.g. "Fever (Jwara)" or "Jwara" when only Ayurvedic known. */
export function formatClinicalTitle(modernName, explicitAyurvedic) {
  const modern = String(modernName || '').trim();
  const ayurvedic = resolveAyurvedicName(modern, explicitAyurvedic);

  if (modern && ayurvedic) {
    const modernLower = modern.toLowerCase();
    const ayurLower = ayurvedic.toLowerCase();
    if (modernLower === ayurLower || modernLower.includes(ayurLower)) {
      return capitalizeDisplayTitle(modern);
    }
    return capitalizeDisplayTitle(`${modern} (${ayurvedic})`);
  }
  return capitalizeDisplayTitle(modern || ayurvedic || '');
}

function labelsFromReportsList(reports) {
  if (!Array.isArray(reports) || !reports.length) return null;

  const diagnosisReport =
    reports.find((r) => r?.reportType === 'Diagnosis Report') || reports[0];
  const data = diagnosisReport?.reportData || diagnosisReport;
  const diagnosis = data?.diagnosis;

  if (typeof diagnosis === 'object' && diagnosis) {
    return {
      modern: diagnosis.name || diagnosis.label || '',
      ayurvedic:
        diagnosis.ayurvedicName
        || diagnosis.ayurvedic_name
        || diagnosis.sanskritName
        || '',
    };
  }
  if (typeof diagnosis === 'string' && diagnosis.trim()) {
    return { modern: diagnosis.trim(), ayurvedic: resolveAyurvedicName(diagnosis.trim()) };
  }

  const master = reports.find((r) => r?.reportType === 'Master Report');
  const masterData = master?.reportData;
  const synthesis = String(
    masterData?.integrated_synthesis || masterData?.clinicalImpression || '',
  ).trim();
  if (synthesis) {
    const firstClause = synthesis.split(/[.!?\n]/)[0].trim();
    return { modern: firstClause.slice(0, 80), ayurvedic: resolveAyurvedicName(firstClause) };
  }

  return null;
}

export function extractDiagnosisLabels(sessionOrReport) {
  if (!sessionOrReport) return { modern: '', ayurvedic: '' };

  const resolved = labelsFromReportsList(resolveReportsFromSession(sessionOrReport));
  if (resolved?.modern || resolved?.ayurvedic) return resolved;

  const reports = sessionOrReport.reports;
  if (Array.isArray(reports) && reports.length > 0) {
    const fromList = labelsFromReportsList(reports);
    if (fromList) return fromList;
  }

  if (sessionOrReport.diagnosis) {
    const payload = parseReportPayload(sessionOrReport.diagnosis);
    if (payload) {
      const reportsList = payload?.reports || (Array.isArray(payload) ? payload : []);
      if (reportsList.length) return extractDiagnosisLabels({ reports: reportsList });
      const d = payload?.diagnosis;
      if (typeof d === 'object' && d) {
        return {
          modern: d.name || d.label || '',
          ayurvedic: d.ayurvedicName || d.ayurvedic_name || d.sanskritName || '',
        };
      }
      if (typeof d === 'string' && d.trim()) {
        return { modern: d.trim(), ayurvedic: resolveAyurvedicName(d.trim()) };
      }
    }
  }

  const reportMessage = sessionOrReport.messages?.find(
    (m) => m?.role === 'report' || (m?.text && String(m.text).includes('---REPORT_DATA---')),
  );
  if (reportMessage?.text) {
    const payload = parseReportPayload(reportMessage.text);
    if (payload) return extractDiagnosisLabels({ diagnosis: reportMessage.text, reports: payload.reports });
  }

  const title = sessionOrReport.title || '';
  if (title && title !== 'New Consultation') {
    const parsed = parseTitleWithAyurvedic(title);
    if (parsed) return parsed;
    return { modern: title, ayurvedic: resolveAyurvedicName(title) };
  }

  return { modern: '', ayurvedic: '' };
}

/** Header label: always prefer English (Ayurvedic) when possible. */
export function getChatHeaderTitle(session, diseaseNameOverride = '') {
  const override = String(diseaseNameOverride || '').trim();
  if (override) return override;

  const { modern, ayurvedic } = extractDiagnosisLabels(session);
  const formatted = formatClinicalTitle(modern, ayurvedic);
  if (formatted && formatted !== 'New Consultation') return formatted;

  const firstUser = session?.messages?.find((m) => m.role === 'user');
  if (firstUser?.text) {
    const snippet = String(firstUser.text).trim().split(/[.!?\n]/)[0].slice(0, 48);
    const inferred = formatClinicalTitle(snippet, resolveAyurvedicName(snippet));
    if (inferred) return inferred;
  }

  return 'New Consultation';
}

/** Resolve patient Mongo id from JWT when local user object is incomplete. */
export function resolvePatientUserId(user = null) {
  const u = user || {};
  const fromUser = u.id || u._id || u.userId;
  if (fromUser) return String(fromUser);
  try {
    const token = localStorage.getItem('token');
    if (!token) return '';
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return String(payload.sub || payload.userId || payload.patientId || '');
  } catch {
    return '';
  }
}

function truncateTitle(text, max = 40) {
  const t = String(text || '').trim();
  if (!t) return '';
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

/** Sidebar / history label — same clinical title as header (diagnosis-first). */
export function getSessionAyurvedicTitle(session) {
  return getSessionDisplayTitle(session);
}

/** Short sidebar label (1–3 words + Ayurvedic name in brackets), ChatGPT-style. */
export function getSessionDisplayTitle(session) {
  if (!session) return 'New Consultation';

  const storedTitle = String(session.title || '').trim();
  if (storedTitle && storedTitle !== 'New Consultation') {
    const parsed = parseTitleWithAyurvedic(storedTitle);
    if (parsed) {
      return truncateTitle(formatClinicalTitle(parsed.modern, parsed.ayurvedic));
    }
    const words = storedTitle.split(/\s+/).slice(0, 3).join(' ');
    const fromTitle = formatClinicalTitle(words, resolveAyurvedicName(storedTitle));
    if (fromTitle) return truncateTitle(fromTitle);
  }

  const { modern, ayurvedic } = extractDiagnosisLabels(session);
  if (modern) {
    const shortModern = modern.split(/\s+/).slice(0, 4).join(' ');
    const titled = formatClinicalTitle(shortModern, ayurvedic);
    if (titled) return truncateTitle(titled, 42);
  }
  if (ayurvedic) return truncateTitle(capitalizeDisplayTitle(ayurvedic), 42);

  const firstUser = session?.messages?.find((m) => m.role === 'user');
  if (firstUser?.text) {
    const snippet = String(firstUser.text).trim().split(/[.!?\n]/)[0];
    const words = snippet.split(/\s+/).slice(0, 3).join(' ');
    const inferred = formatClinicalTitle(words, resolveAyurvedicName(words));
    if (inferred) return inferred.length > 36 ? `${inferred.slice(0, 36)}…` : inferred;
  }

  return 'New Consultation';
}
