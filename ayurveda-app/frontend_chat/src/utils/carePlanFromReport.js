import { parseReportPayload } from './reportPayload';

/**
 * Turn long AI prose into short pointer lines for the care plan UI.
 * Handles newlines, bullets, numbers, semicolons, and sentence splits.
 */
export function splitAiTextIntoPoints(text) {
  if (text == null) return [];
  const raw = typeof text === 'object' ? JSON.stringify(text) : String(text);
  let t = raw.replace(/\r\n/g, '\n').trim();
  if (!t) return [];

  const stripPrefix = (line) =>
    line.replace(/^(?:[•\*\-−–►▪·]|\d+[\.)]\s*)\s*/u, '').trim();

  const parts = t.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  if (parts.length > 1) {
    const out = parts.map(stripPrefix).filter(Boolean);
    if (out.length) return out;
  }

  const single = parts[0] || t;

  if (single.includes(';')) {
    const semi = single.split(/;\s+/).map((s) => s.trim()).filter((s) => s.length > 4);
    if (semi.length > 1) return semi.map(stripPrefix);
  }

  const numbered = single.split(/\s+(?=\d+[\.)]\s)/).map(stripPrefix).filter(Boolean);
  if (numbered.length > 1) return numbered;

  if (single.length > 100) {
    const sents = single
      .split(/\.\s+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s, i, arr) => (i < arr.length - 1 && !/[.!?]$/.test(s) ? `${s}.` : s))
      .filter((s) => s.length > 12);
    if (sents.length > 1) return sents;
  }

  return [single];
}

function reportPayload(report) {
  if (!report) return null;
  const rd = report.reportData;
  if (rd && typeof rd === 'object' && rd.fullDiagnosisText) {
    return parseReportPayload(rd.fullDiagnosisText);
  }
  if (typeof report.diagnosis === 'string') {
    return parseReportPayload(report.diagnosis);
  }
  if (rd && typeof rd === 'object') {
    return parseReportPayload(JSON.stringify(rd));
  }
  return null;
}

/**
 * Readable sections derived from latest Vaidya / clinical report payload (Ayurvedic diagnosis bundle).
 */
export function extractAiCareSections(report) {
  const payload = reportPayload(report);
  if (!payload?.reports?.length) return [];

  const sections = [];

  const pushBullets = (title, bullets, variant = 'default') => {
    const list = (bullets || []).map((x) => String(x).trim()).filter(Boolean);
    if (list.length) sections.push({ title, variant, bullets: list });
  };

  for (const item of payload.reports) {
    const type = String(item.reportType || '').trim();
    const data = item.reportData || {};

    if (type === 'Lifestyle Report' && Array.isArray(data.routine_steps)) {
      pushBullets('Lifestyle guidance (AI)', data.routine_steps, 'leaf');
    }
    if (type === 'Treatment Plan Report') {
      const bullets = [];
      if (Array.isArray(data.remedies)) bullets.push(...data.remedies);
      if (Array.isArray(data.medicinesAndSupports)) bullets.push(...data.medicinesAndSupports);
      if (typeof data.content === 'string' && data.content.trim()) {
        bullets.unshift(...splitAiTextIntoPoints(data.content));
      }
      pushBullets('Supportive care & remedies (AI)', bullets, 'emerald');
    }
    if (type === 'Risk Report') {
      const bullets = [];
      if (typeof data.content === 'string' && data.content.trim()) {
        bullets.push(...splitAiTextIntoPoints(data.content));
      }
      if (typeof data.prognosis === 'string' && data.prognosis.trim()) {
        bullets.push(`Prognosis: ${data.prognosis.trim()}`);
      }
      if (Array.isArray(data.red_flags)) bullets.push(...data.red_flags);
      pushBullets('After-care cautions / red flags (AI)', bullets, 'amber');
    }
    if (type === 'Master Report') {
      if (typeof data.clinical_protocol === 'string' && data.clinical_protocol.trim()) {
        pushBullets(
          'Holistic protocol (AI)',
          splitAiTextIntoPoints(data.clinical_protocol),
          'indigo',
        );
      }
      if (typeof data.integrated_synthesis === 'string' && data.integrated_synthesis.trim()) {
        pushBullets('Summary (AI)', splitAiTextIntoPoints(data.integrated_synthesis), 'slate');
      }
    }
    if (type === 'Root Cause Report' && typeof data.content === 'string' && data.content.trim()) {
      pushBullets('Root context (AI)', splitAiTextIntoPoints(data.content), 'violet');
    }
    if (type === 'Diagnosis Report') {
      if (data.clinicalImpression != null) {
        const imp =
          typeof data.clinicalImpression === 'string'
            ? data.clinicalImpression
            : typeof data.clinicalImpression === 'object'
              ? JSON.stringify(data.clinicalImpression)
              : String(data.clinicalImpression);
        if (imp.trim()) {
          pushBullets('Clinical picture (AI)', splitAiTextIntoPoints(imp), 'blue');
        }
      }
    }
  }

  return sections;
}
