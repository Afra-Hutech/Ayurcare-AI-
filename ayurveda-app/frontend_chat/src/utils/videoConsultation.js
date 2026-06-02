export function isLiveKitAppointment(appointment) {
  if (!appointment) return false;
  if (String(appointment.meetingType || '').toLowerCase() === 'livekit') return true;
  const link = String(appointment.meetingLink || '');
  return /\/video\//i.test(link);
}

export function liveKitJoinPath(appointment) {
  const id = appointment?._id || appointment?.id;
  if (!id) return '/appointments';
  return `/video/${id}`;
}
