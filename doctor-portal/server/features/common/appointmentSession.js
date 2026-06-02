const { clearVideoSession } = require('../livekit/livekitMeet');

const JOIN_EARLY_MINUTES = 10;
const JOIN_GRACE_MINUTES = 15;
/** Doctors may start a bit after the slot ends (same-day charting / late join). */
const DOCTOR_START_GRACE_MINUTES = 120;

function parseLocalAppointmentDateTime(dateInput, timeInput = '09:00') {
  if (!dateInput) return null;
  let y;
  let mo;
  let d;
  if (dateInput instanceof Date && !Number.isNaN(dateInput.getTime())) {
    y = dateInput.getFullYear();
    mo = dateInput.getMonth() + 1;
    d = dateInput.getDate();
  } else if (typeof dateInput === 'string') {
    const slice = dateInput.includes('T') ? dateInput.slice(0, 10) : dateInput.trim().slice(0, 10);
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(slice);
    if (!m) return null;
    y = Number(m[1]);
    mo = Number(m[2]);
    d = Number(m[3]);
  } else {
    return null;
  }
  const tm = String(timeInput || '09:00').trim().match(/^(\d{1,2}):(\d{2})/);
  const hh = tm ? parseInt(tm[1], 10) : 9;
  const mm = tm ? parseInt(tm[2], 10) : 0;
  return new Date(y, mo - 1, d, hh, mm, 0, 0);
}

function resolveAppointmentStartTime(apt) {
  if (!apt) return null;
  if (apt.startTime) {
    const t = new Date(apt.startTime);
    if (!Number.isNaN(t.getTime())) return t;
  }
  if (apt.date) {
    return parseLocalAppointmentDateTime(apt.date, apt.time);
  }
  if (apt.scheduledAt) {
    const t = new Date(apt.scheduledAt);
    if (!Number.isNaN(t.getTime())) return t;
  }
  return null;
}

function getAppointmentEndTime(apt) {
  if (!apt) return null;
  if (apt.endTime) {
    const end = new Date(apt.endTime);
    if (!Number.isNaN(end.getTime())) return end;
  }
  const start = resolveAppointmentStartTime(apt);
  if (!start) return null;
  const duration = Number(apt.duration) || 30;
  return new Date(start.getTime() + duration * 60000);
}

function getJoinWindow(apt) {
  const start = resolveAppointmentStartTime(apt);
  if (!start) return null;
  const end = getAppointmentEndTime(apt);
  if (!end) return null;
  return {
    openFrom: new Date(start.getTime() - JOIN_EARLY_MINUTES * 60000),
    closeAt: new Date(end.getTime() + JOIN_GRACE_MINUTES * 60000),
    end,
    start,
  };
}

function isJoinWindowOpen(apt, now = new Date()) {
  const window = getJoinWindow(apt);
  if (!window) return false;
  return now >= window.openFrom && now <= window.closeAt;
}

/** Doctors can start video later the same day (charting / delayed start). */
function isDoctorStartWindowOpen(apt, now = new Date()) {
  const window = getJoinWindow(apt);
  if (!window) return true;
  const doctorClose = new Date(window.end.getTime() + DOCTOR_START_GRACE_MINUTES * 60000);
  return now >= window.openFrom && now <= doctorClose;
}

function shouldExposeMeetingLink(apt, now = new Date()) {
  if (!apt?.meetingLink) return false;
  const ms = String(apt.meetingStatus || 'scheduled').toLowerCase();
  if (ms !== 'live') return false;
  if (apt.consultationCompleted || String(apt.status || '').toLowerCase() === 'completed') {
    return false;
  }
  return isJoinWindowOpen(apt, now);
}

function isSessionEnded(apt, now = new Date()) {
  const ms = String(apt.meetingStatus || 'scheduled').toLowerCase();
  if (ms === 'ended' || apt.consultationCompleted) return true;
  if (String(apt.status || '').toLowerCase() === 'completed') return true;
  const end = getAppointmentEndTime(apt);
  if (!end) return false;
  const graceEnd = new Date(end.getTime() + JOIN_GRACE_MINUTES * 60000);
  return now > graceEnd;
}

async function expireStaleLiveSession(appointmentDoc) {
  const apt = appointmentDoc;
  if (!apt || String(apt.meetingStatus || '').toLowerCase() !== 'live') {
    return apt;
  }

  const end = getAppointmentEndTime(apt);
  if (!end) return apt;

  const graceEnd = new Date(end.getTime() + JOIN_GRACE_MINUTES * 60000);
  if (new Date() <= graceEnd) return apt;

  apt.meetingStatus = 'ended';
  apt.endedAt = apt.endedAt || new Date();
  await apt.save();

  await clearVideoSession(apt.id || apt._id);

  return apt;
}

function sanitizeAppointmentForClient(apt, { role = 'patient' } = {}) {
  // Support both Sequelize (.toJSON) and plain objects
  let o;
  if (typeof apt.toJSON === 'function') {
    o = apt.toJSON();
    // Rename Sequelize association aliases to Mongoose-compatible field names
    if (o.patient     !== undefined) { o.patientId     = o.patient;     delete o.patient; }
    if (o.doctor      !== undefined) { o.doctorId      = o.doctor;      delete o.doctor; }
    if (o.prescription !== undefined) { o.prescriptionId = o.prescription; delete o.prescription; }
  } else if (typeof apt.toObject === 'function') {
    o = apt.toObject();
  } else {
    o = { ...apt };
  }
  const now = new Date();

  if (!shouldExposeMeetingLink(o, now)) {
    o.meetingLink = null;
  }

  o.sessionEnded = isSessionEnded(o, now);
  o.joinWindowOpen = isJoinWindowOpen(o, now);
  o.canJoinMeeting = !!o.meetingLink && o.joinWindowOpen;

  if (role === 'patient' && o.sessionEnded && !o.consultationCompleted) {
    o.sessionEndedAwaitingNotes = String(o.meetingStatus || '').toLowerCase() === 'ended';
  }

  return o;
}

module.exports = {
  JOIN_EARLY_MINUTES,
  JOIN_GRACE_MINUTES,
  DOCTOR_START_GRACE_MINUTES,
  resolveAppointmentStartTime,
  getAppointmentEndTime,
  getJoinWindow,
  isJoinWindowOpen,
  isDoctorStartWindowOpen,
  shouldExposeMeetingLink,
  isSessionEnded,
  expireStaleLiveSession,
  sanitizeAppointmentForClient,
};
