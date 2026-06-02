'use strict';
const { PatientDailyLog, Doctor, Appointment } = require('../../models');

const todayKey = () => new Date().toISOString().slice(0, 10);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const sanitizeWellnessPayload = (body = {}) => {
  const out = {};
  if (body.hydrationGlasses !== undefined) {
    out.hydrationGlasses = clamp(Math.round(Number(body.hydrationGlasses) || 0), 0, 24);
  }
  if (body.steps !== undefined) {
    out.steps = clamp(Math.round(Number(body.steps) || 0), 0, 99999);
  }
  if (body.restingHr !== undefined) {
    const hr = Math.round(Number(body.restingHr) || 0);
    out.restingHr = hr > 0 ? clamp(hr, 35, 220) : 0;
  }
  if (body.sleepQuality !== undefined) {
    const n = Number(body.sleepQuality);
    if (Number.isFinite(n)) out.sleepQuality = clamp(Math.round(n), 1, 5);
  }
  if (body.sleepHours !== undefined) {
    const h = Number(body.sleepHours);
    if (Number.isFinite(h) && h > 0) out.sleepHours = Math.round(h * 2) / 2;
    else if (h === 0) out.sleepHours = 0;
  }
  if (body.energy !== undefined) {
    const n = Number(body.energy);
    if (Number.isFinite(n)) out.energy = clamp(Math.round(n), 1, 5);
  }
  if (body.stress !== undefined) {
    const n = Number(body.stress);
    if (Number.isFinite(n)) out.stress = clamp(Math.round(n), 1, 5);
  }
  if (body.digestionQuality !== undefined) {
    const n = Number(body.digestionQuality);
    if (Number.isFinite(n)) out.digestionQuality = clamp(Math.round(n), 1, 5);
  }
  if (body.bowelRegularity !== undefined) {
    const n = Number(body.bowelRegularity);
    if (Number.isFinite(n)) out.bowelRegularity = clamp(Math.round(n), 1, 5);
  }
  if (body.notes !== undefined) {
    out.notes = String(body.notes || '').slice(0, 500);
  }
  return out;
};

const emptyTodayLog = (patientId) => ({
  patientId,
  date:             todayKey(),
  hydrationGlasses: 0,
  steps:            0,
  restingHr:        0,
  sleepQuality:     null,
  sleepHours:       null,
  energy:           null,
  stress:           null,
  digestionQuality: null,
  bowelRegularity:  null,
  notes:            '',
});

const getOrCreateTodayLog = async (patientId) => {
  const date = todayKey();
  const [log] = await PatientDailyLog.findOrCreate({
    where:    { patientId, date },
    defaults: emptyTodayLog(patientId),
  });
  return log;
};

const listHistory = async (patientId, days = 14) => {
  const horizon = clamp(Math.round(Number(days) || 14), 1, 90);
  const logs = await PatientDailyLog.findAll({
    where: { patientId },
    order: [['date', 'DESC']],
    limit: horizon,
  });
  return [...logs].reverse();
};

const doctorCanViewPatient = async (doctorUserId, patientId) => {
  const doctor = await Doctor.findOne({ where: { userId: doctorUserId }, attributes: ['id'] });
  if (!doctor) return false;
  const count = await Appointment.count({ where: { doctorId: doctor.id, patientId } });
  return count > 0;
};

module.exports = {
  todayKey,
  sanitizeWellnessPayload,
  getOrCreateTodayLog,
  listHistory,
  doctorCanViewPatient,
};
