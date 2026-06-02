import { parseReportPayload } from './reportPayload';

export function extractRemediesFromReportPayload(payload) {
  if (!payload) return [];
  const remedies = new Set();

  const addList = (list) => {
    if (!Array.isArray(list)) return;
    list.forEach((item) => {
      const text = typeof item === 'string' ? item : item?.name || item?.label || '';
      const clean = String(text || '').trim();
      if (clean.length > 2 && clean.length < 120) remedies.add(clean);
    });
  };

  const reports = payload?.reports || [];
  reports.forEach((report) => {
    const data = report?.reportData || report;
    addList(data?.remedies);
    addList(data?.herbalPreparations);
    addList(data?.herbal_meds);
    addList(data?.medicinesAndSupports);
    addList(data?.herbal_medications);
    addList(data?.herbalMeds);
  });

  if (payload?.remedies) addList(payload.remedies);
  return Array.from(remedies).slice(0, 8);
}

export function extractRemediesFromPatientReport(report) {
  if (!report) return [];
  if (report.reportData) {
    return extractRemediesFromReportPayload({ reports: [{ reportData: report.reportData }] });
  }
  if (report.diagnosis) {
    const payload = parseReportPayload(report.diagnosis);
    return extractRemediesFromReportPayload(payload);
  }
  return [];
}
