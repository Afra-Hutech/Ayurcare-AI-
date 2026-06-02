/** Stable Mongo user id for chat sessions, bookings, and API calls. */
export function resolvePatientUserId(user) {
  const raw = user ?? (() => {
    try {
      return JSON.parse(localStorage.getItem('user') || '{}');
    } catch {
      return {};
    }
  })();

  const candidates = [raw.id, raw._id, raw.userId, raw.sub];
  for (const value of candidates) {
    const id = normalizeIdValue(value);
    if (id) return id;
  }

  return resolvePatientUserIdFromToken();
}

function normalizeIdValue(value) {
  if (value == null) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    // Accept Postgres UUIDs  (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) return trimmed;
    // Accept MongoDB ObjectIds (24-char hex)
    if (/^[a-f0-9]{24}$/i.test(trimmed)) return trimmed;
    return null;
  }
  if (typeof value === 'object') {
    if (value.$oid && typeof value.$oid === 'string') return normalizeIdValue(value.$oid);
    if (typeof value.toString === 'function') return normalizeIdValue(String(value));
  }
  return null;
}

export function resolvePatientUserIdFromToken() {
  try {
    const token = localStorage.getItem('token');
    if (!token) return null;
    const part = token.split('.')[1];
    if (!part) return null;
    const payload = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
    return normalizeIdValue(payload.userId) || normalizeIdValue(payload.sub);
  } catch {
    return null;
  }
}

/** Keep `id` and `_id` aligned whenever user is written to localStorage. */
export function persistPatientUser(user) {
  if (!user || typeof user !== 'object') return user;
  const id = resolvePatientUserId(user);
  const next = id ? { ...user, id, _id: id } : { ...user };
  localStorage.setItem('user', JSON.stringify(next));
  return next;
}
