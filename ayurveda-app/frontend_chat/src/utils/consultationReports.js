import { formatClinicalTitle } from './ayurvedicTerms';

function extractReportPayload(text) {
  if (!text) return null;
  try {
    if (typeof text === 'object') return text;
    const raw = text.includes('---REPORT_DATA---') ? text.split('---REPORT_DATA---').pop() : text;
    const clean = raw.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(clean);
  } catch {
    return null;
  }
}

/** Build a report row from a Vaidya chat session (same logic as Clinical Reports page). */
export function buildReportRowFromSession(session) {
  if (!session?.diagnosis || !String(session.diagnosis).includes('---REPORT_DATA---')) {
    return null;
  }
  const payload = extractReportPayload(session.diagnosis);
  const bundle = payload?.reports && Array.isArray(payload.reports) ? payload : null;
  const diagEntry = bundle?.reports?.find((r) => r.reportType === 'Diagnosis Report');
  const rd = diagEntry?.reportData || {};
  const rawDiag = rd.diagnosis;
  let label = '';
  if (rawDiag && typeof rawDiag === 'object') {
    label = formatClinicalTitle(
      rawDiag.name || rawDiag.label || '',
      rawDiag.ayurvedicName || rawDiag.ayurvedic_name || rawDiag.sanskritName,
    );
  } else if (typeof rawDiag === 'string' && rawDiag.trim()) {
    label = formatClinicalTitle(rawDiag.trim(), '');
  }
  if (!String(label || '').trim()) {
    label = formatClinicalTitle(session.title || '', '') || 'AI Consultation';
  }

  return {
    _id: String(session._id || session.id),
    sessionId: session._id || session.id,
    reportType: 'AI Consultation',
    reportTitle: label,
    diagnosis: session.diagnosis,
    reportData: bundle || { source: 'ai_chat', fullDiagnosisText: session.diagnosis },
    createdAt: session.updatedAt || session.createdAt,
    date: session.updatedAt
      ? new Date(session.updatedAt).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10),
  };
}

/** Merge DB reports + chat sessions (deduped by sessionId), newest first. */
export function mergePatientConsultationReports(reports = [], sessions = []) {
  const dbReports = Array.isArray(reports) ? reports : [];
  const sessionIdsInDb = new Set(
    dbReports.filter((r) => r.sessionId).map((r) => String(r.sessionId)),
  );

  const fromChat = (Array.isArray(sessions) ? sessions : [])
    .map(buildReportRowFromSession)
    .filter(Boolean)
    .filter((row) => !sessionIdsInDb.has(String(row.sessionId)));

  return [...dbReports, ...fromChat].sort(
    (a, b) =>
      new Date(b.createdAt || b.date || 0).getTime()
      - new Date(a.createdAt || a.date || 0).getTime(),
  );
}

export function normalizeChatSessionsResponse(res) {
  const raw = res?.data;
  if (Array.isArray(raw?.data)) return raw.data;
  if (Array.isArray(raw)) return raw;
  return [];
}
