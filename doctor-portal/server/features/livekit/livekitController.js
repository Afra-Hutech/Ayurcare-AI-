'use strict';
const { Doctor, Appointment, User } = require('../../models');
const { findOwnedAppointment } = require('../common/helpers');
const {
  isJoinWindowOpen,
  isSessionEnded,
  shouldExposeMeetingLink,
} = require('../common/appointmentSession');
const {
  isLiveKitConfigured,
  buildLiveKitRoomName,
  createLiveKitParticipantToken,
} = require('./livekitService');

async function resolveParticipant(req, appointment) {
  const userId = req.userId;

  if (appointment.patientId === userId) {
    const name =
      appointment.patient?.name ||
      appointment.patient?.email?.split('@')[0] ||
      'Patient';
    return { role: 'patient', identity: `patient-${userId}`, name };
  }

  const doctor = await Doctor.findOne({ where: { userId }, attributes: ['id', 'name'] });
  if (doctor && appointment.doctorId === doctor.id) {
    const name = doctor.name || 'Doctor';
    return {
      role:     'doctor',
      identity: `doctor-${userId}`,
      name:     `Dr. ${name}`.replace(/^Dr\.\s*Dr\./i, 'Dr. '),
    };
  }

  return null;
}

const getLiveKitToken = async (req, res) => {
  try {
    if (!isLiveKitConfigured()) {
      return res.status(503).json({ message: 'LiveKit video is not configured on this server' });
    }

    const { appointmentId } = req.params;
    const owned = await findOwnedAppointment(appointmentId, req.userId);
    if (!owned) return res.status(404).json({ message: 'Appointment not found' });

    // Reload with patient data (replaces Mongoose .populate())
    const appointment = await Appointment.findByPk(owned.id, {
      include: [{ model: User, as: 'patient', attributes: ['id', 'name', 'email'] }],
    });
    if (!appointment) return res.status(404).json({ message: 'Appointment not found' });

    if (String(appointment.type || '').toLowerCase() !== 'online') {
      return res.status(409).json({ message: 'This appointment is not a video consultation' });
    }
    if (isSessionEnded(appointment)) {
      return res.status(409).json({ message: 'This consultation has ended' });
    }
    if (!isJoinWindowOpen(appointment)) {
      return res.status(409).json({ message: 'Video consultation opens 10 minutes before the scheduled start time' });
    }

    const participant = await resolveParticipant(req, appointment);
    if (!participant) {
      return res.status(403).json({ message: 'Not allowed to join this consultation' });
    }

    const ms = String(appointment.meetingStatus || 'scheduled').toLowerCase();
    if (participant.role === 'patient' && ms !== 'live' && !shouldExposeMeetingLink(appointment)) {
      return res.status(409).json({ message: 'The doctor has not started the video session yet' });
    }

    const roomName = appointment.roomId || buildLiveKitRoomName(appointment.id);
    const payload  = await createLiveKitParticipantToken({
      roomName,
      identity: participant.identity,
      name:     participant.name,
    });

    res.json({
      ...payload,
      role:          participant.role,
      appointmentId: String(appointment.id),
    });
  } catch (err) {
    console.error('[getLiveKitToken]', err.message || err);
    res.status(500).json({ message: err.message || 'Failed to create LiveKit token' });
  }
};

module.exports = { getLiveKitToken };
