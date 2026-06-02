import { parseReportPayload } from './reportPayload';
import { extractDiagnosisLabels, formatClinicalTitle } from './ayurvedicTerms';
import { mergePatientConsultationReports } from './consultationReports';
import { dedupeRoutineLines } from './recommendationDisplay';

const DOSHA_FALLBACK = {
  vata: 'vata',
  pitta: 'pitta',
  kapha: 'kapha',
};

function normalizeDosha(value) {
  const v = String(value || '').toLowerCase();
  for (const key of Object.keys(DOSHA_FALLBACK)) {
    if (v.includes(key)) return key;
  }
  if (v.includes('tri') || v.includes('mixed')) return 'tridoshic';
  return 'tridoshic';
}

function isPresentationFocusLine(text) {
  return String(text || '').toLowerCase().startsWith('primary focus for your presentation');
}

function remedyToHerbItem(line) {
  const t = String(line || '').trim();
  if (!t || isPresentationFocusLine(t)) return null;
  if (t.includes(':')) {
    const [name, how] = t.split(':');
    return {
      name: name.trim(),
      purpose: 'From your treatment plan',
      how: (how || '').trim() || 'Confirm with your physician',
    };
  }
  return {
    name: t,
    purpose: 'From your treatment plan',
    how: 'Discuss with your Ayurvedic physician',
  };
}

const DOSHA_WELLNESS = {
  vata: {
    yoga: [
      { name: 'Balasana (Child\'s pose)', benefit: 'Calms Vata nervous system', duration: '3–5 min' },
      { name: 'Gentle spinal twists', benefit: 'Eases tension', duration: '5 min each side' },
    ],
    pranayama: [
      { name: 'Nadi Shodhana', benefit: 'Balances flow', duration: '6–8 rounds' },
      { name: 'Bhramari', benefit: 'Settles worry', duration: '5 min before sleep' },
    ],
  },
  pitta: {
    yoga: [
      { name: 'Forward folds', benefit: 'Cooling for Pitta', duration: '8 min' },
      { name: 'Supta Baddha Konasana', benefit: 'Opens pelvis, reduces heat', duration: '5–8 min' },
    ],
    pranayama: [
      { name: 'Sheetali / Sitkari', benefit: 'Lowers internal heat', duration: '8 breaths' },
    ],
  },
  kapha: {
    yoga: [
      { name: 'Surya Namaskar (moderate)', benefit: 'Invigorates Kapha', duration: '5–6 rounds' },
      { name: 'Warrior II', benefit: 'Builds warmth', duration: '30 sec × 3' },
    ],
    pranayama: [
      { name: 'Kapalabhati (mild)', benefit: 'Clears dullness', duration: 'Under guidance only' },
    ],
  },
  tridoshic: {
    yoga: [{ name: 'Shavasana + gentle flow', benefit: 'Whole-body balance', duration: '10–15 min' }],
    pranayama: [{ name: 'Nadi Shodhana', benefit: 'Universal balancer', duration: '8 rounds twice daily' }],
  },
};

export function diagnosisTextFromReport(report) {
  if (!report) return '';
  const rd = report.reportData;
  if (rd?.fullDiagnosisText) return rd.fullDiagnosisText;
  if (typeof report.diagnosis === 'string') return report.diagnosis;
  if (rd && typeof rd === 'object') {
    const parsed = parseReportPayload(JSON.stringify(rd));
    if (parsed) return `---REPORT_DATA---\n${JSON.stringify(parsed)}`;
  }
  return '';
}

/** All past consultations the patient can switch between in the Ayurvedic guide. */
export function listDiagnosisHistory(reports = [], sessions = []) {
  const merged = mergePatientConsultationReports(reports, sessions);
  const seen = new Set();

  return merged
    .map((report) => {
      const sid = report.sessionId ? String(report.sessionId) : null;
      const key = sid ? `session-${sid}` : `report-${report._id}`;
      if (seen.has(key)) return null;
      seen.add(key);

      const labels = extractDiagnosisLabels(report);
      const title =
        formatClinicalTitle(labels.modern, labels.ayurvedic)
        || report.reportTitle
        || 'Clinical consultation';

      const diagnosisText = diagnosisTextFromReport(report);

      return {
        key,
        sessionId: sid,
        reportId: report._id,
        title,
        date: report.date || report.createdAt || report.updatedAt,
        diagnosisText,
        report,
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const ta = new Date(a.date || 0).getTime();
      const tb = new Date(b.date || 0).getTime();
      return tb - ta;
    });
}

/** Build a minimal plan from a stored patient report when the chat API is unavailable. */
export function buildRecommendationsFromReport(report) {
  if (!report) return null;

  let payload = null;
  const rd = report.reportData;
  if (rd?.fullDiagnosisText) {
    payload = parseReportPayload(rd.fullDiagnosisText);
  } else if (typeof report.diagnosis === 'string') {
    payload = parseReportPayload(report.diagnosis);
  } else if (rd && typeof rd === 'object') {
    payload = parseReportPayload(JSON.stringify(rd));
  }
  if (!payload?.reports?.length) return null;

  const symptoms = [];
  let dominantDosha = '';
  let doshaInterpretation = '';
  let clinicalSummary = '';
  let treatmentFocus = '';
  let diagnosisLabel = report.reportTitle || report.diagnosis || '';
  const herbLines = [];
  const dietPathya = [];
  const dietApathya = [];
  const routineSteps = [];
  const timeline = {};

  for (const item of payload.reports) {
    const type = item.reportType;
    const data = item.reportData || {};

    if (type === 'Diagnosis Report') {
      const diag = data.diagnosis || {};
      const name = diag.name || '';
      const ayur = diag.ayurvedicName || diag.ayurvedic_name || '';
      if (name && ayur) diagnosisLabel = `${name} (${ayur})`;
      else if (name) diagnosisLabel = name;

      const dosha = data.doshaProfile || {};
      dominantDosha = normalizeDosha(dosha.dominant);
      doshaInterpretation = dosha.interpretation || '';

      const impression = data.clinicalImpression || data.clinical_impression || '';
      if (impression) clinicalSummary = String(impression).trim();

      for (const key of ['symptomsReported', 'pain_points', 'supportingFindings']) {
        if (Array.isArray(data[key])) {
          data[key].forEach((s) => {
            const t = String(s).trim();
            if (t && !symptoms.includes(t)) symptoms.push(t);
          });
        }
      }
    }

    if (type === 'Treatment Plan Report' && Array.isArray(data.remedies)) {
      data.remedies.forEach((r) => {
        const t = String(r).trim();
        if (!t) return;
        if (isPresentationFocusLine(t)) {
          if (!treatmentFocus) treatmentFocus = t;
          return;
        }
        const herb = remedyToHerbItem(t);
        if (herb) herbLines.push(herb);
        const low = t.toLowerCase();
        if (/avoid|reduce|limit/.test(low)) {
          dietApathya.push({ name: t, purpose: 'Reduce', how: '' });
        } else if (/favor|eat|diet|food|spice|hydration/.test(low)) {
          dietPathya.push({ name: t, purpose: 'Favor', how: '' });
        }
      });
    }

    if (type === 'Lifestyle Report') {
      if (Array.isArray(data.routine_steps)) {
        routineSteps.push(...data.routine_steps.map((s) => String(s).trim()).filter(Boolean));
      }
      if (data.timeline && typeof data.timeline === 'object') {
        Object.assign(timeline, data.timeline);
      }
    }
  }

  const routines = {
    morning: timeline.morning ? [timeline.morning] : routineSteps.slice(0, 3),
    afternoon: timeline.afternoon ? [timeline.afternoon] : routineSteps.slice(3, 6),
    evening: timeline.evening ? [timeline.evening] : routineSteps.slice(6, 9),
    night: timeline.night ? [timeline.night] : [],
  };

  const doshaKey = dominantDosha || 'tridoshic';
  const wellness = DOSHA_WELLNESS[doshaKey] || DOSHA_WELLNESS.tridoshic;

  let summaryText = clinicalSummary;
  if (clinicalSummary && doshaInterpretation) {
    summaryText = `${clinicalSummary}\n\n${doshaInterpretation}`;
  } else if (!summaryText) {
    summaryText = doshaInterpretation || 'Derived from your stored Vaidya clinical report.';
  }

  return {
    engine: 'client_report_fallback',
    diagnosisLabel: diagnosisLabel || 'Ayurvedic care plan',
    dominantDosha: dominantDosha || 'tridoshic',
    clinicalSummary,
    treatmentFocus,
    doshaInterpretation: summaryText,
    symptoms: symptoms.slice(0, 12),
    herbs: herbLines.slice(0, 8),
    yoga: [...wellness.yoga],
    pranayama: [...wellness.pranayama],
    diet: {
      pathya: dietPathya.slice(0, 8),
      apathya: dietApathya.slice(0, 8),
    },
    routines,
    disclaimer:
      'Educational guidance from your stored report. For herbs and pranayama, consult a licensed practitioner.',
  };
}

function expandDietItems(items = []) {
  const out = [];
  for (const item of items) {
    const name = typeof item === 'string' ? item : item?.name;
    if (!name) continue;
    const parts = String(name)
      .split(/;|\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length <= 1) {
      out.push(typeof item === 'object' ? item : { name, purpose: '', how: '' });
      continue;
    }
    for (const part of parts) {
      out.push({
        ...(typeof item === 'object' ? item : {}),
        name: part,
        purpose: item?.purpose || '',
        how: item?.how || '',
      });
    }
  }
  return out;
}

export function normalizeRecommendationPlan(plan) {
  if (!plan || typeof plan !== 'object') return null;
  const rawSummary = plan.clinicalSummary || '';
  const rawInterp = plan.doshaInterpretation || '';
  const shortSummary =
    rawSummary.trim()
    || (rawInterp.split(/\n\n/)[0] || rawInterp).trim().slice(0, 220);

  return {
    ...plan,
    clinicalSummary: shortSummary.slice(0, 220),
    doshaInterpretation: rawInterp,
    herbs: Array.isArray(plan.herbs) ? plan.herbs : [],
    yoga: Array.isArray(plan.yoga) ? plan.yoga : [],
    pranayama: Array.isArray(plan.pranayama) ? plan.pranayama : [],
    diet: {
      pathya: expandDietItems(plan.diet?.pathya || []),
      apathya: expandDietItems(plan.diet?.apathya || []),
    },
    routines: (() => {
      const r = plan.routines || {};
      const phases = ['morning', 'afternoon', 'evening', 'night'];
      const out = {};
      for (const phase of phases) {
        out[phase] = dedupeRoutineLines(r[phase]);
      }
      return out;
    })(),
    symptoms: plan.symptoms || [],
    treatmentFocus: plan.treatmentFocus || '',
  };
}
