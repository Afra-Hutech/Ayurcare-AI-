import {
  getAppointmentStatusBucket,
  getPatientKey,
  isSameLocalDay,
  normalizeStatus,
  resolveAppointmentStart,
} from './appointments';

/** Re-fetch dashboard / schedule when appointments change elsewhere in the app. */
export function notifyAppointmentsChanged() {
  window.dispatchEvent(new CustomEvent('doctor-appointments-changed'));
}

/**
 * Dashboard tile counts — all "today" metrics use the local calendar day on startTime.
 */
export function computeDoctorDashboardStats(appointments, now = new Date()) {
  const list = Array.isArray(appointments) ? appointments : [];

  const allPatientIds = new Set();
  list.forEach((a) => {
    const k = getPatientKey(a);
    if (k) allPatientIds.add(k);
  });

  const onToday = list.filter((a) => {
    const t = resolveAppointmentStart(a);
    return t && isSameLocalDay(t, now);
  });

  const todayMeaningful = onToday.filter((a) => {
    const s = normalizeStatus(a.status);
    return s !== 'cancelled' && s !== 'canceled';
  });

  const todayPatientIds = new Set();
  todayMeaningful.forEach((a) => {
    const k = getPatientKey(a);
    if (k) todayPatientIds.add(k);
  });

  const todayVisits = todayMeaningful.length;
  const todayPatients = todayPatientIds.size;

  /** Use stored status for dashboard tiles — not time-based buckets (past confirmed slots are not "completed"). */
  const todayConfirmed = todayMeaningful.filter((a) => {
    const s = normalizeStatus(a.status);
    return s === 'confirmed' || s === 'scheduled';
  }).length;

  const todayPending = todayMeaningful.filter(
    (a) => normalizeStatus(a.status) === 'pending',
  ).length;

  const todayCompleted = todayMeaningful.filter((a) => {
    const s = normalizeStatus(a.status);
    return s === 'completed' || s === 'finished';
  }).length;

  const pendingAll = list.filter(
    (a) => getAppointmentStatusBucket(a, now) === 'pending',
  ).length;

  const confirmedAll = list.filter(
    (a) => getAppointmentStatusBucket(a, now) === 'confirmed',
  ).length;

  return {
    totalPatients: allPatientIds.size,
    todayPatients,
    todayVisits,
    todayConfirmed,
    todayPending,
    todayCompleted,
    pendingAll,
    confirmedAll,
  };
}
