const storageKey = (userId) => `ayurcare_med_doses:${userId || 'anon'}`;

/** @returns {Record<string, Record<string, boolean>>} dateStr -> { "appointmentId:index": true } */
export function readAllMedDoses(userId) {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed ? parsed : {};
  } catch {
    return {};
  }
}

export function isMedicineTakenToday(userId, appointmentId, medIndex, dateStr) {
  const day = readAllMedDoses(userId)[dateStr];
  if (!day) return false;
  const k = `${appointmentId}:${medIndex}`;
  return !!day[k];
}

export function setMedicineTakenToday(userId, appointmentId, medIndex, dateStr, taken) {
  const all = readAllMedDoses(userId);
  if (!all[dateStr]) all[dateStr] = {};
  const k = `${appointmentId}:${medIndex}`;
  if (taken) all[dateStr][k] = true;
  else delete all[dateStr][k];
  if (Object.keys(all[dateStr]).length === 0) delete all[dateStr];
  localStorage.setItem(storageKey(userId), JSON.stringify(all));
}
