export const HYDRATION_GOAL = 8;

const WELLNESS_PATCH_KEYS = new Set([
  'hydrationGlasses',
  'steps',
  'restingHr',
  'sleepQuality',
  'sleepHours',
  'energy',
  'stress',
  'digestionQuality',
  'bowelRegularity',
  'notes',
]);

/** Strip to fields the wellness API accepts (avoids empty-patch 400s). */
export function pickWellnessPatch(patch = {}) {
  const out = {};
  for (const key of WELLNESS_PATCH_KEYS) {
    if (patch[key] !== undefined) out[key] = patch[key];
  }
  return out;
}

/** Last N calendar days ending today (UTC date keys). */
export function buildDayWindow(history = [], dayCount = 7) {
  const labels = [];
  const dates = [];
  const byDate = Object.fromEntries((history || []).map((row) => [row.date, row]));

  for (let i = dayCount - 1; i >= 0; i -= 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    dates.push(key);
    labels.push(d.toLocaleDateString('en-US', { weekday: 'short' }));
  }

  return { labels, dates, byDate };
}

export function hasCheckInData(log) {
  return (
    log &&
    (Number(log.sleepHours) > 0 ||
      log.sleepQuality ||
      log.energy ||
      log.stress ||
      log.digestionQuality ||
      log.bowelRegularity ||
      String(log.notes || '').trim().length > 0)
  );
}

export function wellnessScoreFromLog(log) {
  if (!log) return null;
  const parts = [log.sleepQuality, log.energy, log.stress, log.digestionQuality, log.bowelRegularity].filter((n) =>
    Number.isFinite(n),
  );
  if (!parts.length) return null;
  const avg = parts.reduce((a, b) => a + b, 0) / parts.length;
  return Math.round((avg / 5) * 100);
}

/** Map 1–5 sleep quality to approximate hours for bar chart */
export function sleepHoursFromQuality(q) {
  if (!q) return 0;
  return [4.5, 5.5, 6.5, 7.5, 8.5][Math.max(0, Math.min(4, q - 1))];
}

/** Prefer logged sleep hours; fall back to quality-derived estimate */
export function resolveSleepHours(log) {
  if (!log) return 0;
  const h = Number(log.sleepHours);
  if (Number.isFinite(h) && h > 0) return Math.min(24, Math.round(h * 10) / 10);
  return sleepHoursFromQuality(log.sleepQuality);
}
