/** Resolve doctor working hours from profile availability (startTime/endTime or timings string). */

const DEFAULT_MIN = '10:00';
const DEFAULT_MAX = '18:00';

export function normalizeHHmm(value) {
  if (!value) return null;
  const raw = String(value).trim();
  const match24 = raw.match(/^(\d{1,2}):(\d{2})/);
  if (match24) {
    const h = Math.min(23, Math.max(0, parseInt(match24[1], 10)));
    const m = Math.min(59, Math.max(0, parseInt(match24[2], 10)));
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  const match12 = raw.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if (match12) {
    let h = parseInt(match12[1], 10);
    const m = match12[2] ? parseInt(match12[2], 10) : 0;
    const p = match12[3].toLowerCase();
    if (p === 'pm' && h < 12) h += 12;
    if (p === 'am' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  return null;
}

export function formatHHmm12(hhmm) {
  const norm = normalizeHHmm(hhmm);
  if (!norm) return '';
  const [hStr, mStr] = norm.split(':');
  let h = parseInt(hStr, 10);
  const period = h >= 12 ? 'PM' : 'AM';
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${mStr} ${period}`;
}

export function parseTimingsString(value) {
  if (!value) return { minTime: DEFAULT_MIN, maxTime: DEFAULT_MAX };

  const cleaned = String(value)
    .replace(/\([^)]*\)/g, '')
    .trim();

  const separators = [' to ', ' - ', '–', '—'];
  let startPart = '';
  let endPart = '';
  for (const sep of separators) {
    if (cleaned.includes(sep)) {
      [startPart, endPart] = cleaned.split(sep);
      break;
    }
  }

  if (!startPart || !endPart) {
    const single = normalizeHHmm(cleaned);
    if (single) return { minTime: single, maxTime: DEFAULT_MAX };
    return { minTime: DEFAULT_MIN, maxTime: DEFAULT_MAX };
  }

  return {
    minTime: normalizeHHmm(startPart) || DEFAULT_MIN,
    maxTime: normalizeHHmm(endPart) || DEFAULT_MAX,
  };
}

/** @returns {{ minTime: string, maxTime: string, displayLabel: string }} */
export function resolveAvailabilityHours(availability) {
  if (!availability || typeof availability !== 'object') {
    return {
      minTime: DEFAULT_MIN,
      maxTime: DEFAULT_MAX,
      displayLabel: `${formatHHmm12(DEFAULT_MIN)} – ${formatHHmm12(DEFAULT_MAX)}`,
    };
  }

  const start = availability.startTime || availability.start;
  const end = availability.endTime || availability.end;
  if (start && end) {
    const minTime = normalizeHHmm(start) || DEFAULT_MIN;
    const maxTime = normalizeHHmm(end) || DEFAULT_MAX;
    return {
      minTime,
      maxTime,
      displayLabel: `${formatHHmm12(minTime)} – ${formatHHmm12(maxTime)}`,
    };
  }

  if (availability.timings) {
    const { minTime, maxTime } = parseTimingsString(availability.timings);
    const built = `${formatHHmm12(minTime)} – ${formatHHmm12(maxTime)}`;
    const raw = String(availability.timings).trim();
    const displayLabel = /am|pm|:/i.test(raw) ? raw : built;
    return { minTime, maxTime, displayLabel };
  }

  return {
    minTime: DEFAULT_MIN,
    maxTime: DEFAULT_MAX,
    displayLabel: `${formatHHmm12(DEFAULT_MIN)} – ${formatHHmm12(DEFAULT_MAX)}`,
  };
}

export function buildAvailabilityTimeSlots({
  availability,
  selectedDate,
  duration = 30,
  appointments = [],
  normalizeStatus = (s) => String(s || '').toLowerCase(),
}) {
  const { minTime, maxTime } = resolveAvailabilityHours(availability);
  if (!selectedDate) return [];

  const [startHour, startMinute] = minTime.split(':').map(Number);
  const [endHour, endMinute] = maxTime.split(':').map(Number);

  const slots = [];
  let cursor = new Date(`${selectedDate}T00:00:00`);
  cursor.setHours(startHour, startMinute, 0, 0);
  const end = new Date(`${selectedDate}T00:00:00`);
  end.setHours(endHour, endMinute, 0, 0);

  const requestedDuration = Number(duration) || 30;
  const bufferMinutes = 15;
  const stepMinutes = requestedDuration >= 60 ? requestedDuration : requestedDuration + bufferMinutes;
  const now = new Date();
  const latestStart = new Date(end.getTime() - requestedDuration * 60 * 1000);
  const todayKey = (() => {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  })();

  while (cursor <= latestStart) {
    const timeValue = cursor.toTimeString().slice(0, 5);
    const slotStart = new Date(cursor.getTime());
    const slotEnd = new Date(slotStart.getTime() + requestedDuration * 60 * 1000);
    const isToday = selectedDate === todayKey;
    const isPast = isToday && slotStart < new Date(now.getTime() + bufferMinutes * 60 * 1000);

    const isBooked = appointments.some((appointment) => {
      const status = normalizeStatus(appointment.status);
      if (status !== 'confirmed' && status !== 'scheduled') return false;

      const appointmentStart = new Date(appointment.startTime);
      const appointmentEnd = appointment.endTime
        ? new Date(appointment.endTime)
        : new Date(appointmentStart.getTime() + (appointment.duration || 30) * 60 * 1000);
      const blockedStart = new Date(appointmentStart.getTime() - bufferMinutes * 60 * 1000);
      const blockedEnd = new Date(appointmentEnd.getTime() + bufferMinutes * 60 * 1000);

      return slotStart < blockedEnd && slotEnd > blockedStart;
    });

    slots.push({
      time: timeValue,
      label: cursor.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
      isBooked,
      isPast,
    });

    cursor = new Date(cursor.getTime() + stepMinutes * 60 * 1000);
  }

  const availableSlots = slots.filter((slot) => !slot.isBooked && !slot.isPast);
  const recommendedTimes = new Set();

  if (availableSlots.length > 0) {
    const targetCount = Math.min(4, availableSlots.length);
    const usedIndexes = new Set();

    for (let index = 0; index < targetCount; index += 1) {
      const rawIndex = targetCount === 1
        ? 0
        : Math.round((index * (availableSlots.length - 1)) / (targetCount - 1));

      let candidateIndex = rawIndex;
      while (candidateIndex < availableSlots.length && usedIndexes.has(candidateIndex)) {
        candidateIndex += 1;
      }
      if (candidateIndex >= availableSlots.length) {
        candidateIndex = rawIndex;
        while (candidateIndex >= 0 && usedIndexes.has(candidateIndex)) {
          candidateIndex -= 1;
        }
      }

      if (candidateIndex >= 0 && candidateIndex < availableSlots.length) {
        usedIndexes.add(candidateIndex);
        recommendedTimes.add(availableSlots[candidateIndex].time);
      }
    }
  }

  return slots.map((slot) => ({
    ...slot,
    isRecommended: recommendedTimes.has(slot.time),
  }));
}
