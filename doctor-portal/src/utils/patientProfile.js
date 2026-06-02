const PATIENT_POPULATE_FIELDS = 'name email profileImage phone age gender height weight';

export { PATIENT_POPULATE_FIELDS };

export function getPatientUser(appointment) {
  const patient = appointment?.patientId;
  if (patient && typeof patient === 'object') return patient;
  return null;
}

/** Pull patientInfo from AI consultation payload stored on the appointment. */
export function extractPatientInfoFromSession(sessionData) {
  const raw = sessionData?.diagnosis;
  if (!raw) return {};
  try {
    const parts = String(raw).split('---REPORT_DATA---');
    let jsonStr = (parts.length > 1 ? parts[1] : raw)
      .replace(/```json/gi, '')
      .replace(/```/gi, '')
      .trim();
    const start = jsonStr.indexOf('{');
    const end = jsonStr.lastIndexOf('}');
    if (start === -1 || end === -1) return {};
    const payload = JSON.parse(jsonStr.substring(start, end + 1));
    return payload?.patientInfo && typeof payload.patientInfo === 'object'
      ? payload.patientInfo
      : {};
  } catch {
    return {};
  }
}

function coalesce(...values) {
  for (const value of values) {
    if (value == null) continue;
    const text = String(value).trim();
    if (!text || text.toLowerCase() === 'n/a' || text.toLowerCase() === 'na') continue;
    return value;
  }
  return null;
}

/** Merge registered user profile with demographics captured during Vaidya AI intake. */
export function resolvePatientProfile(appointment) {
  const user = getPatientUser(appointment);
  const fromChat = extractPatientInfoFromSession(appointment?.sessionData);

  const name =
    coalesce(user?.name, fromChat.name) ||
    (user?.email ? user.email.split('@')[0] : null) ||
    'Patient';

  return {
    name,
    age: coalesce(user?.age, fromChat.age),
    gender: coalesce(user?.gender, fromChat.gender),
    height: coalesce(user?.height, fromChat.height),
    weight: coalesce(user?.weight, fromChat.weight),
    phone: coalesce(user?.phone, fromChat.phone),
    email: coalesce(user?.email, fromChat.email),
    constitution: coalesce(fromChat.constitution),
    profileImage: user?.profileImage || null,
  };
}

export function formatProfileValue(value, fallback = '—') {
  if (value == null || value === '') return fallback;
  const text = String(value).trim();
  if (!text || text.toLowerCase() === 'n/a') return fallback;
  return text;
}

export function formatAge(value) {
  const formatted = formatProfileValue(value, null);
  if (!formatted) return null;
  if (/year|yo|y\/o/i.test(formatted)) return formatted;
  const num = Number(formatted);
  if (Number.isFinite(num) && num > 0 && num < 130) return `${num} yrs`;
  return formatted;
}
