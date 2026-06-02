'use strict';
const { Doctor, Appointment } = require('../../models');

const normalizeMedicineRows = (rows) => {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const name    = String(item.name    || '').trim();
      const details = String(item.details || '').trim();
      if (!name && !details) return null;
      return { name, details };
    })
    .filter(Boolean);
};

const buildJitsiRoom = (appointmentId) => {
  const token = require('crypto').randomBytes(4).toString('hex');
  return `appt-${appointmentId}-${token}`.toLowerCase();
};

const buildJitsiLink = (roomId) =>
  `https://meet.jit.si/${encodeURIComponent(roomId)}#config.prejoinPageEnabled=false`;

const findOwnedAppointment = async (appointmentId, userId) => {
  const appointment = await Appointment.findByPk(appointmentId);
  if (!appointment) return null;

  if (appointment.patientId === userId) return appointment;

  const doctor = await Doctor.findOne({ where: { userId }, attributes: ['id'] });
  if (doctor && appointment.doctorId === doctor.id) return appointment;

  return null;
};

module.exports = {
  normalizeMedicineRows,
  buildJitsiRoom,
  buildJitsiLink,
  findOwnedAppointment,
};
