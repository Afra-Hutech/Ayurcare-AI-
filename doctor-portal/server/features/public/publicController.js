'use strict';
const { Op }         = require('sequelize');
const { Doctor, Appointment } = require('../../models');
const {
  buildSlotsForDoctorOnDate,
  localTimeKey,
} = require('../schedule/scheduleController');

const getNearbyDoctors = async (req, res) => {
  try {
    const { all } = req.query;
    const whereBase = { [Op.or]: [{ onLeave: false }, { onLeave: null }] };

    // Geospatial ($near) is not available in Sequelize without PostGIS.
    // Return all non-leave doctors; client-side filtering by location can be added later.
    const doctors = await Doctor.findAll({
      where: whereBase,
      order: [['created_at', 'DESC']],
    });
    return res.json(doctors);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getDoctorAvailability = async (req, res) => {
  try {
    const doctor = await Doctor.findByPk(req.params.id);
    if (!doctor) return res.status(404).json({ message: 'Doctor not found' });

    const appointments = await Appointment.findAll({
      where: {
        doctorId: req.params.id,
        status:   { [Op.in]: ['confirmed', 'scheduled', 'pending'] },
      },
      attributes: ['startTime', 'endTime', 'duration', 'status'],
    });

    res.json({ doctor, appointments });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const bookAppointment = async (req, res) => {
  try {
    const { doctorId, patientId, type, startTime, duration = 30, sessionData } = req.body;

    if (!doctorId || !patientId) {
      return res.status(400).json({ message: 'Both Doctor ID and Patient ID are required for booking.' });
    }

    if (!startTime) {
      return res.status(400).json({ message: 'startTime is required (ISO date string).' });
    }

    const doctor = await Doctor.findByPk(doctorId);
    if (!doctor) return res.status(404).json({ message: 'Doctor not found' });
    if (doctor.onLeave) {
      return res.status(409).json({ message: 'Doctor is currently on leave and not accepting bookings.' });
    }

    const start = new Date(startTime);
    if (Number.isNaN(start.getTime())) {
      return res.status(400).json({ message: 'Invalid startTime.' });
    }

    const dateStr  = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
    const timeStr  = localTimeKey(start);
    const slotPayload = await buildSlotsForDoctorOnDate(doctorId, dateStr);

    if (slotPayload.fullyBlocked) {
      return res.status(409).json({ message: 'Doctor is not available on the selected date.' });
    }

    const match = (slotPayload.slots || []).find((s) => s.time === timeStr);
    if (!match || !match.available) {
      return res.status(409).json({
        message: 'That time slot is no longer available. Please choose another slot.',
        reason:  match?.reason || 'unavailable',
      });
    }

    const slotMinutes     = Number(duration) || slotPayload.slotDuration || 30;
    const end             = new Date(start.getTime() + slotMinutes * 60 * 1000);
    const consultationFee = parseFeeValue(doctor.fees);

    const appointment = await Appointment.create({
      doctorId,
      patientId,
      type:          type === 'clinic' ? 'clinic' : 'online',
      startTime:     start,
      endTime:       end,
      duration:      slotMinutes,
      fee:           consultationFee || undefined,
      sessionData:   sessionData || {},
      status:        'pending',
      meetingStatus: 'scheduled',
    });

    res.status(201).json({ success: true, appointment });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const parseFeeValue = (raw) => {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

module.exports = {
  getNearbyDoctors,
  getDoctorAvailability,
  bookAppointment,
};
