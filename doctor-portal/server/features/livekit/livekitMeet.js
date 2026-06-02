'use strict';
const { Appointment, User } = require('../../models');
const {
  isLiveKitConfigured,
  buildLiveKitRoomName,
  buildPatientVideoUrl,
} = require('./livekitService');

const ONLINE_CONFIRM_STATUSES = new Set(['confirmed', 'scheduled']);

function appointmentNeedsMeet(appt) {
  if (!appt || String(appt.type || '').toLowerCase() !== 'online') return false;
  return ONLINE_CONFIRM_STATUSES.has(String(appt.status || '').toLowerCase());
}

function isCancelledStatus(status) {
  const s = String(status || '').toLowerCase();
  return s === 'cancelled' || s === 'canceled';
}

async function clearVideoSession(appointmentId) {
  await Appointment.update(
    { meetingLink: null },
    { where: { id: appointmentId } },
  );
  return { ok: true };
}

async function ensureLiveKitForAppointment(appointmentId) {
  if (!isLiveKitConfigured()) {
    return { ok: false, reason: 'livekit_not_configured' };
  }

  const appt = await Appointment.findByPk(appointmentId, {
    include: [{ model: User, as: 'patient', attributes: ['name', 'email'] }],
  });
  if (!appt) return { ok: false, reason: 'not_found' };
  if (!appointmentNeedsMeet(appt)) {
    return { ok: false, reason: 'skipped_not_online_or_not_ready' };
  }

  const roomName = buildLiveKitRoomName(appt.id);
  const meetLink = buildPatientVideoUrl(appt.id);

  if (appt.roomId === roomName && appt.meetingType === 'livekit' && appt.meetingLink) {
    return { ok: true, skipped: true, meetLink: appt.meetingLink, roomName, livekit: true };
  }

  await Appointment.update(
    { roomId: roomName, meetingType: 'livekit', meetingLink: meetLink },
    { where: { id: appt.id } },
  );

  try {
    const { notifyPatientMeetLink } = require('../notifications/appointmentNotifier');
    await notifyPatientMeetLink(appt.id);
  } catch (notifyErr) {
    console.warn('[ensureLiveKitForAppointment] notify:', notifyErr.message || notifyErr);
  }

  return { ok: true, meetLink, roomName, livekit: true };
}

async function provisionLiveKitForAppointment(appointmentId) {
  const result = await ensureLiveKitForAppointment(appointmentId);
  const appt = await Appointment.findByPk(appointmentId);
  if (appt?.meetingLink && appt.meetingType === 'livekit') {
    return { ok: true, appointment: appt, meetLink: appt.meetingLink, livekit: true, ...result };
  }
  return {
    ok:          false,
    appointment: appt,
    reason:      result.reason || 'livekit_room_not_ready',
    livekit:     true,
  };
}

module.exports = {
  appointmentNeedsMeet,
  isCancelledStatus,
  clearVideoSession,
  ensureLiveKitForAppointment,
  provisionLiveKitForAppointment,
};
