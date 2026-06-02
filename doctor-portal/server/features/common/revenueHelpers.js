'use strict';
const { Op } = require('sequelize');
const { Doctor, Appointment, Negotiation } = require('../../models');

const parseFeeValue = (raw) => {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return raw;
  const cleaned = String(raw).replace(/[^\d.]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const getDoctorListingFee = (doctorOrLean) => {
  const raw = doctorOrLean?.availability?.fees ?? doctorOrLean?.fees;
  return parseFeeValue(raw);
};

const storedAppointmentFee = (appointment) => parseFeeValue(appointment?.fee) || 0;

const inferDefaultListingFee = (doctorOrLean, appointments = []) => {
  const fromProfile = getDoctorListingFee(doctorOrLean);
  if (fromProfile) return fromProfile;
  const fees = (Array.isArray(appointments) ? appointments : [])
    .map(storedAppointmentFee)
    .filter((f) => f > 0);
  if (!fees.length) return null;
  return Math.max(...fees);
};

const effectiveAppointmentFee = (appointment, defaultListingFee = null) => {
  const stored = storedAppointmentFee(appointment);
  if (stored > 0) return stored;
  const status = String(appointment?.status || '').toLowerCase();
  if (status === 'completed' && defaultListingFee != null && defaultListingFee > 0) {
    return defaultListingFee;
  }
  return 0;
};

const negotiationFeeForAppointment = async (appointment, doctorId) => {
  const patientId = appointment?.patientId;
  const start = appointment?.startTime ? new Date(appointment.startTime) : null;
  if (!patientId || !start || Number.isNaN(start.getTime())) return null;

  const dayStr = start.toISOString().slice(0, 10);

  let neg = await Negotiation.findOne({
    where: {
      doctorId,
      userId:  patientId,
      status:  'LOCKED',
      amount:  { [Op.gt]: 0 },
      date:    dayStr,
    },
    order:      [['updated_at', 'DESC']],
    attributes: ['amount'],
  });

  if (!neg) {
    neg = await Negotiation.findOne({
      where:      { doctorId, userId: patientId, status: 'LOCKED', amount: { [Op.gt]: 0 } },
      order:      [['updated_at', 'DESC']],
      attributes: ['amount'],
    });
  }

  return parseFeeValue(neg?.amount);
};

const resolveCompletedAppointmentFee = async (appointment, doctorId, defaultListingFee) => {
  const stored = storedAppointmentFee(appointment);
  if (stored > 0) return stored;
  const fromProfile = defaultListingFee > 0 ? defaultListingFee : null;
  if (fromProfile) return fromProfile;
  const fromNeg = await negotiationFeeForAppointment(appointment, doctorId);
  if (fromNeg) return fromNeg;
  return 0;
};

const stampAppointmentFeeIfMissing = async (appointment, doctorId) => {
  if (!appointment || storedAppointmentFee(appointment) > 0) return appointment;
  const doctor = await Doctor.findByPk(doctorId, { attributes: ['id', 'fees'] });
  let fee = getDoctorListingFee(doctor);
  if (!fee) fee = await negotiationFeeForAppointment(appointment, doctorId);
  if (fee) appointment.fee = fee;
  return appointment;
};

const applyDefaultFeeToCompletedInMemory = (appointments, defaultListingFee) => {
  if (!defaultListingFee || defaultListingFee <= 0) return;
  (Array.isArray(appointments) ? appointments : []).forEach((a) => {
    if (String(a?.status || '').toLowerCase() !== 'completed') return;
    if (storedAppointmentFee(a) > 0) return;
    a.fee = defaultListingFee;
  });
};

const syncListingFeeToCompletedAppointments = async (doctorId, listingFee) => {
  const fee = parseFeeValue(listingFee);
  if (!doctorId || !fee) return 0;
  const [count] = await Appointment.update(
    { fee },
    {
      where: {
        doctorId,
        status: 'completed',
        [Op.or]: [{ fee: null }, { fee: 0 }],
      },
    },
  );
  return count || 0;
};

const backfillCompletedAppointmentFees = async (doctorId, defaultListingFee, appointments = []) => {
  if (!doctorId) return 0;
  const completed = (Array.isArray(appointments) ? appointments : []).filter(
    (a) => String(a?.status || '').toLowerCase() === 'completed' && storedAppointmentFee(a) <= 0,
  );
  if (!completed.length) return 0;
  let updated = 0;
  for (const appt of completed) {
    const fee = await resolveCompletedAppointmentFee(appt, doctorId, defaultListingFee);
    if (fee > 0) {
      await Appointment.update({ fee }, { where: { id: appt.id } });
      appt.fee = fee;
      updated += 1;
    }
  }
  return updated;
};

module.exports = {
  parseFeeValue,
  getDoctorListingFee,
  inferDefaultListingFee,
  storedAppointmentFee,
  effectiveAppointmentFee,
  applyDefaultFeeToCompletedInMemory,
  syncListingFeeToCompletedAppointments,
  stampAppointmentFeeIfMissing,
  backfillCompletedAppointmentFees,
  resolveCompletedAppointmentFee,
  negotiationFeeForAppointment,
};
