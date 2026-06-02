/** Normalize API appointment list responses */
/** Local calendar date as YYYY-MM-DD (for date pickers; avoids UTC day shift). */
export function toLocalDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function normalizeAppointmentsList(raw) {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.data)) return raw.data;
  if (Array.isArray(raw?.appointments)) return raw.appointments;
  return [];
}

/** Calendar YYYY-MM-DD parts (avoids UTC midnight shifting the day). */
export function extractCalendarDateParts(dateInput) {
  if (!dateInput) return null;
  if (typeof dateInput === 'string') {
    const slice = dateInput.includes('T') ? dateInput.slice(0, 10) : dateInput.trim().slice(0, 10);
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(slice);
    if (m) return { y: Number(m[1]), mo: Number(m[2]), d: Number(m[3]) };
  }
  if (dateInput instanceof Date && !Number.isNaN(dateInput.getTime())) {
    return {
      y: dateInput.getUTCFullYear(),
      mo: dateInput.getUTCMonth() + 1,
      d: dateInput.getUTCDate(),
    };
  }
  return null;
}

/** Build a local Date from calendar date + HH:mm (not UTC ISO strings). */
export function parseLocalAppointmentDateTime(dateInput, timeInput = '09:00') {
  const parts = extractCalendarDateParts(dateInput);
  if (!parts) return null;
  const tm = String(timeInput || '09:00').trim().match(/^(\d{1,2}):(\d{2})/);
  const hh = tm ? parseInt(tm[1], 10) : 9;
  const mm = tm ? parseInt(tm[2], 10) : 0;
  return new Date(parts.y, parts.mo - 1, parts.d, hh, mm, 0, 0);
}

/** Resolve when an appointment occurs (local time). */
export function resolveAppointmentStart(apt) {
  if (!apt) return null;

  if (apt.date) {
    const local = parseLocalAppointmentDateTime(apt.date, apt.time);
    if (local) return local;
  }

  if (apt.startTime) {
    const t = new Date(apt.startTime);
    if (!Number.isNaN(t.getTime())) return t;
  }

  if (apt.scheduledAt) {
    const t = new Date(apt.scheduledAt);
    if (!Number.isNaN(t.getTime())) return t;
  }

  if (apt.createdAt) {
    const t = new Date(apt.createdAt);
    if (!Number.isNaN(t.getTime())) return t;
  }

  return null;
}

export function isSameLocalDay(a, b) {
  if (!a || !b) return false;
  return (
    a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()
  );
}

export function normalizeStatus(status) {
  return String(status || 'pending').toLowerCase();
}

export function getPatientKey(apt) {
  const p = apt?.patientId;
  if (!p) return null;
  if (typeof p === 'object' && p._id != null) return String(p._id);
  return String(p);
}

export function getAppointmentEndTime(apt) {
  const start = resolveAppointmentStart(apt);
  if (!start) return null;
  if (apt?.endTime) {
    const end = new Date(apt.endTime);
    if (!Number.isNaN(end.getTime())) return end;
  }
  const duration = Number(apt?.duration) || 30;
  return new Date(start.getTime() + duration * 60000);
}

const JOIN_EARLY_MINUTES = 10;
const JOIN_GRACE_MINUTES = 15;

/** True when the visit is inside the join window (10 min before start → end + grace). */
export function isAppointmentJoinWindowOpen(apt, now = new Date()) {
  const start = resolveAppointmentStart(apt);
  const end = getAppointmentEndTime(apt);
  if (!start || !end) return false;
  const openFrom = new Date(start.getTime() - JOIN_EARLY_MINUTES * 60000);
  const closeAt = new Date(end.getTime() + JOIN_GRACE_MINUTES * 60000);
  return now >= openFrom && now <= closeAt;
}

/** True after the scheduled slot (+ grace) has passed. */
export function isAppointmentSlotPast(apt, now = new Date()) {
  const end = getAppointmentEndTime(apt);
  if (!end) return false;
  const closeAt = new Date(end.getTime() + JOIN_GRACE_MINUTES * 60000);
  return now > closeAt;
}

/** Same buckets as My Schedule tabs (confirmed / pending / finished / cancelled). */
export function getAppointmentStatusBucket(apt, now = new Date()) {
  const status = normalizeStatus(apt?.status);
  if (status === 'cancelled' || status === 'canceled') return 'cancelled';
  if (status === 'finished' || status === 'completed') return 'finished';
  if (status === 'pending' || status === 'scheduled') return 'pending';
  if (status === 'confirmed') {
    const end = getAppointmentEndTime(apt);
    if (end && now > end) return 'finished';
    return 'confirmed';
  }
  return status || 'pending';
}
