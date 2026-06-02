export const REPORT_SCHEMA_VERSION = 'reports.v2';

const REQUIRED_BY_TYPE = {
  'Diagnosis Report': ['diagnosis', 'clinicalImpression', 'doshaProfile', 'threatLevel'],
  'Master Report': ['integrated_synthesis', 'clinical_protocol', 'master_kpis', 'master_pain_points'],
  'Root Cause Report': ['content', 'technical_notes'],
  'Lifestyle Report': ['content', 'routine_steps'],
  'Treatment Plan Report': ['content', 'remedies'],
  'Risk Report': ['content', 'prognosis', 'red_flags'],
};

const SUPPORTED_TYPES = Object.keys(REQUIRED_BY_TYPE);

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

const cleanJsonLikeText = (text) =>
  String(text || '')
    .replace(/```json/g, '')
    .replace(/```/g, '')
    .trim();

export function parseReportPayload(input) {
  if (!input) return null;
  if (isObject(input)) return input;

  try {
    const raw = String(input).includes('---REPORT_DATA---')
      ? String(input).split('---REPORT_DATA---').pop()
      : String(input);
    return JSON.parse(cleanJsonLikeText(raw));
  } catch (_err) {
    return null;
  }
}

function isValidDiagnosisObject(value) {
  return isObject(value) && typeof value.name === 'string' && value.name.trim();
}

function isValidArrayOfStrings(value) {
  return Array.isArray(value) && value.every((x) => typeof x === 'string');
}

function isValidKpis(value) {
  return Array.isArray(value) && value.every((x) => isObject(x) && typeof x.label === 'string' && typeof x.value === 'string');
}

function hasRequiredShape(reportType, data) {
  if (!isObject(data)) return false;
  const req = REQUIRED_BY_TYPE[reportType];
  if (!req) return false;
  if (!req.every((k) => Object.prototype.hasOwnProperty.call(data, k))) return false;

  if (reportType === 'Diagnosis Report') {
    return isValidDiagnosisObject(data.diagnosis);
  }
  if (reportType === 'Master Report') {
    return isValidKpis(data.master_kpis) && isValidArrayOfStrings(data.master_pain_points);
  }
  if (reportType === 'Lifestyle Report') return isValidArrayOfStrings(data.routine_steps);
  if (reportType === 'Treatment Plan Report') return isValidArrayOfStrings(data.remedies);
  if (reportType === 'Risk Report') return isValidArrayOfStrings(data.red_flags);
  return true;
}

export function validateAndNormalizeV2Payload(payload) {
  if (!isObject(payload)) return { valid: false, reason: 'Payload is not an object', reports: [] };
  if (payload.schemaVersion !== REPORT_SCHEMA_VERSION) {
    return { valid: false, reason: `Unsupported schemaVersion. Expected ${REPORT_SCHEMA_VERSION}`, reports: [] };
  }
  if (!Array.isArray(payload.reports) || payload.reports.length === 0) {
    return { valid: false, reason: 'Missing reports array', reports: [] };
  }

  const normalized = [];
  for (const item of payload.reports) {
    if (!isObject(item)) return { valid: false, reason: 'Invalid report entry', reports: [] };
    const reportType = typeof item.reportType === 'string' ? item.reportType.trim() : '';
    const title = typeof item.title === 'string' && item.title.trim() ? item.title.trim() : reportType;
    const reportData = item.reportData;

    if (!SUPPORTED_TYPES.includes(reportType)) {
      return { valid: false, reason: `Unsupported report type: ${reportType || 'unknown'}`, reports: [] };
    }
    if (!hasRequiredShape(reportType, reportData)) {
      return { valid: false, reason: `Invalid ${reportType} shape`, reports: [] };
    }

    normalized.push({ reportType, title, reportData });
  }

  const hasDiagnosis = normalized.some((r) => r.reportType === 'Diagnosis Report');
  const hasMaster = normalized.some((r) => r.reportType === 'Master Report');
  if (!hasDiagnosis || !hasMaster) {
    return { valid: false, reason: 'Missing mandatory Diagnosis Report or Master Report', reports: [] };
  }

  const priority = {
    'Diagnosis Report': 1,
    'Master Report': 2,
    'Root Cause Report': 3,
    'Lifestyle Report': 4,
    'Treatment Plan Report': 5,
    'Risk Report': 6,
  };

  normalized.sort((a, b) => (priority[a.reportType] || 99) - (priority[b.reportType] || 99));
  return { valid: true, reason: '', reports: normalized };
}

export function validateAndNormalizeReportList(list) {
  if (!Array.isArray(list) || !list.length) return { valid: false, reason: 'No reports', reports: [] };
  const payload = { schemaVersion: REPORT_SCHEMA_VERSION, reports: list };
  return validateAndNormalizeV2Payload(payload);
}

/** Primary downloadable synthesis (Master / Comprehensive). */
export function pickMainReport(reports) {
  if (!Array.isArray(reports) || !reports.length) return null;
  return (
    reports.find((r) => r.reportType === 'Master Report') ||
    reports.find((r) => r.reportType === 'Comprehensive Report') ||
    reports[0]
  );
}

/** Load all specialist reports from a chat session (strict then lenient). */
export function resolveReportsFromSession(session, fallbackPatientInfo = {}) {
  if (!session) return [];

  const patientInfo = session.patientInfo || fallbackPatientInfo || {};

  if (Array.isArray(session.reports) && session.reports.length > 0) {
    const fromStored = validateAndNormalizeReportList(
      session.reports.map((r) => ({
        reportType: r?.reportType || 'Diagnosis Report',
        title: r?.title || r?.reportTitle || r?.reportType || 'Clinical Report',
        reportData: {
          ...(r?.reportData || r || {}),
          patientInfo: r?.reportData?.patientInfo || patientInfo,
        },
      })),
    );
    if (fromStored.valid && fromStored.reports.length) return fromStored.reports;
  }

  const payload = parseReportPayload(session.diagnosis);
  if (!payload) return [];

  const normalized = validateAndNormalizeV2Payload(payload);
  if (normalized.valid && normalized.reports.length) {
    return normalized.reports.map((r) => ({
      ...r,
      reportData: { ...r.reportData, patientInfo: r.reportData?.patientInfo || patientInfo },
    }));
  }

  if (Array.isArray(payload.reports) && payload.reports.length) {
    return payload.reports
      .filter((r) => r && typeof r === 'object' && r.reportType)
      .map((r) => ({
        reportType: r.reportType,
        title: r.title || r.reportType,
        reportData: { ...(r.reportData || {}), patientInfo: r.reportData?.patientInfo || patientInfo },
      }));
  }

  return [];
}
