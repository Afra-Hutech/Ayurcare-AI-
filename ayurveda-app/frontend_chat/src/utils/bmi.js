/** Parse height string to cm (supports cm, m, ft/in). */
export function parseHeightCm(raw) {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim().toLowerCase();
  const cmMatch = s.match(/(\d+(?:\.\d+)?)\s*cm/);
  if (cmMatch) return Number(cmMatch[1]);
  const mMatch = s.match(/(\d+(?:\.\d+)?)\s*m(?!in)/);
  if (mMatch) return Number(mMatch[1]) * 100;
  const ftIn = s.match(/(\d+)\s*['′]?\s*(\d+)?/);
  if (ftIn) {
    const ft = Number(ftIn[1]);
    const inch = Number(ftIn[2] || 0);
    return ft * 30.48 + inch * 2.54;
  }
  const num = Number(s.replace(/[^\d.]/g, ''));
  if (!Number.isFinite(num) || num <= 0) return null;
  if (num > 3 && num < 3.5) return num * 100;
  // Bare number: assume cm (typical adult 50–250)
  if (num >= 50 && num <= 250) return num;
  if (num >= 3 && num <= 8) return num * 30.48;
  return null;
}

/** Parse weight string to kg (supports kg, lbs). */
export function parseWeightKg(raw) {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim().toLowerCase();
  const kgMatch = s.match(/(\d+(?:\.\d+)?)\s*kg/);
  if (kgMatch) return Number(kgMatch[1]);
  const lbMatch = s.match(/(\d+(?:\.\d+)?)\s*(?:lb|lbs|pound)/);
  if (lbMatch) return Number(lbMatch[1]) * 0.453592;
  const num = Number(s.replace(/[^\d.]/g, ''));
  if (!Number.isFinite(num) || num <= 0) return null;
  if (num > 200) return num * 0.453592;
  // Bare number: assume kg (typical adult 20–200)
  if (num >= 20 && num <= 200) return num;
  return num;
}

export function calculateBmi(heightCm, weightKg) {
  if (!heightCm || !weightKg || heightCm <= 0 || weightKg <= 0) return null;
  const m = heightCm / 100;
  const bmi = weightKg / (m * m);
  if (!Number.isFinite(bmi) || bmi < 10 || bmi > 80) return null;
  return Math.round(bmi * 10) / 10;
}

/** Append units when user enters plain numbers (e.g. 158 → 158 cm). */
export function normalizeHeightForStorage(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  if (/cm|m\b|ft|′|'/i.test(s)) return s;
  const n = Number(s.replace(/[^\d.]/g, ''));
  if (Number.isFinite(n) && n >= 50 && n <= 250) return `${Math.round(n)} cm`;
  return s;
}

export function normalizeWeightForStorage(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  if (/kg|lb|lbs|pound/i.test(s)) return s;
  const n = Number(s.replace(/[^\d.]/g, ''));
  if (Number.isFinite(n) && n >= 20 && n <= 200) return `${Math.round(n * 10) / 10} kg`;
  return s;
}

export function bmiCategory(bmi) {
  if (bmi == null || bmi <= 0) return null;
  if (bmi < 18.5) return { label: 'Underweight', tone: 'amber' };
  if (bmi < 25) return { label: 'Normal', tone: 'emerald' };
  if (bmi < 30) return { label: 'Overweight', tone: 'amber' };
  return { label: 'Obese', tone: 'rose' };
}

export function formatHeightDisplay(raw) {
  const cm = parseHeightCm(raw);
  if (!cm) return raw || '—';
  return `${Math.round(cm)} cm`;
}

export function formatWeightDisplay(raw) {
  const kg = parseWeightKg(raw);
  if (!kg) return raw || '—';
  return `${Math.round(kg * 10) / 10} kg`;
}
