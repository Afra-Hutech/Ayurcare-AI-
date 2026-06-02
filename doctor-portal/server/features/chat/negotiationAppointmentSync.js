'use strict';
const { Op } = require('sequelize');
const { Appointment, Negotiation } = require('../../models');
const { ensureLiveKitForAppointment } = require('../livekit/livekitMeet');

const buildStartTimeFromNegotiation = (negotiation) => {
  const dateInput = negotiation?.date;
  const timeStr = String(negotiation?.time || '09:00').trim();
  let y; let mo; let d;
  if (dateInput instanceof Date && !Number.isNaN(dateInput.getTime())) {
    y  = dateInput.getUTCFullYear();
    mo = dateInput.getUTCMonth() + 1;
    d  = dateInput.getUTCDate();
  } else if (typeof dateInput === 'string') {
    const slice = dateInput.slice(0, 10);
    [y, mo, d] = slice.split('-').map(Number);
  } else {
    return new Date(NaN);
  }
  const match = timeStr.match(/^(\d{1,2}):(\d{2})/);
  const hh = match ? parseInt(match[1], 10) : 9;
  const mm = match ? parseInt(match[2], 10) : 0;
  return new Date(y, mo - 1, d, hh, mm, 0, 0);
};

const parseNegotiationDateInput = (date) => {
  if (!date) return null;
  if (typeof date === 'string') {
    const slice = date.includes('T') ? date.slice(0, 10) : date.trim().slice(0, 10);
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(slice);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
  }
  if (date instanceof Date && !Number.isNaN(date.getTime())) {
    return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12, 0, 0, 0);
  }
  return null;
};

const syncAppointmentFromNegotiation = async (negotiation) => {
  const doctorId  = negotiation.doctorId;
  const patientId = negotiation.userId;
  const startTime = buildStartTimeFromNegotiation(negotiation);
  if (Number.isNaN(startTime.getTime())) return null;

  const duration = 30;
  const endTime  = new Date(startTime.getTime() + duration * 60 * 1000);
  const apptType = 'online';

  const dayStart = new Date(startTime);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(startTime);
  dayEnd.setHours(23, 59, 59, 999);

  let existing = await Appointment.findOne({
    where: {
      doctorId,
      patientId,
      startTime: { [Op.gte]: dayStart, [Op.lte]: dayEnd },
      status:    { [Op.notIn]: ['cancelled', 'canceled'] },
    },
    attributes: ['id', 'startTime', 'status'],
  });

  if (existing) {
    const existingStart = existing.startTime ? new Date(existing.startTime) : null;
    if (
      existingStart?.getTime() !== startTime.getTime() ||
      existing.status !== 'confirmed'
    ) {
      await Appointment.update(
        {
          startTime,
          endTime,
          duration,
          fee:           Number(negotiation.amount) || 0,
          status:        'confirmed',
          type:          apptType,
          meetingStatus: 'scheduled',
        },
        { where: { id: existing.id } },
      );
    }
  } else {
    existing = await Appointment.create({
      doctorId,
      patientId,
      type:          apptType,
      startTime,
      endTime,
      duration,
      fee:           Number(negotiation.amount) || 0,
      status:        'confirmed',
      meetingStatus: 'scheduled',
      notes:         `Booked via chat offer (${negotiation.mode || 'VIDEO'})`,
    });
  }

  try {
    await ensureLiveKitForAppointment(existing.id);
  } catch (err) {
    console.warn('[syncAppointmentFromNegotiation] LiveKit:', err.message || err);
  }

  return existing;
};

const ensureAppointmentsForDoctorLockedNegotiations = async (doctorId) => {
  const locked = await Negotiation.findAll({
    where: { doctorId, status: 'LOCKED' },
    order: [['updated_at', 'DESC']],
  });
  for (const negotiation of locked) {
    try {
      await syncAppointmentFromNegotiation(negotiation);
    } catch (err) {
      console.warn('[chat] backfill appointment from negotiation failed:', err.message);
    }
  }
};

module.exports = {
  parseNegotiationDateInput,
  buildStartTimeFromNegotiation,
  syncAppointmentFromNegotiation,
  ensureAppointmentsForDoctorLockedNegotiations,
};
