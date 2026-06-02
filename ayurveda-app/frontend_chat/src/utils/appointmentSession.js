export function getSessionLabel(appointment) {
  if (!appointment) return '';
  if (appointment.consultationCompleted) return 'Consultation completed';
  const ms = String(appointment.meetingStatus || 'scheduled').toLowerCase();
  if (ms === 'ended' || appointment.sessionEnded) {
    return appointment.sessionEndedAwaitingNotes
      ? 'Session ended — prescription pending'
      : 'Session ended';
  }
  if (ms === 'live' && appointment.canJoinMeeting) return 'Live now — join available';
  if (ms === 'live') return 'Live';
  return 'Scheduled';
}

export function canPatientJoinMeeting(appointment) {
  if (!appointment) return false;
  return !!(
    appointment.canJoinMeeting
    || (appointment.meetingLink && String(appointment.meetingStatus || '').toLowerCase() === 'live')
  );
}
