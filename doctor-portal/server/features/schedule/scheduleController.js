'use strict';
const { Op } = require('sequelize');
const { Doctor, DoctorSchedule, Appointment } = require('../../models');

const toMinutes   = (timeStr) => { const [h, m] = (timeStr || '00:00').split(':').map(Number); return h * 60 + (m || 0); };
const fromMinutes = (mins)    => { const h = Math.floor(mins / 60) % 24; const m = mins % 60; return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`; };

const generateSlots = (startTime, endTime, slotDuration) => {
  const start = toMinutes(startTime);
  const end   = toMinutes(endTime);
  const dur   = slotDuration || 30;
  const slots = [];
  for (let t = start; t + dur <= end; t += dur) slots.push(fromMinutes(t));
  return slots;
};

const buildDefaultWeeklySlots = () =>
  [0,1,2,3,4,5,6].map((day) => ({
    dayOfWeek:    day,
    isAvailable:  day >= 1 && day <= 6,
    startTime:    '09:00',
    endTime:      '17:00',
    slotDuration: 30,
  }));

const parseLocalDateStr = (dateStr) => { const [y, m, d] = String(dateStr).split('-').map(Number); return new Date(y, m - 1, d); };
const localDateKey = (date) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
const localTimeKey = (date) => `${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
const localDayBounds = (dateStr) => {
  const start = parseLocalDateStr(dateStr); start.setHours(0,0,0,0);
  const end   = new Date(start);            end.setHours(23,59,59,999);
  return { start, end };
};

const buildSlotsForDoctorOnDate = async (doctorId, dateStr) => {
  let schedule = await DoctorSchedule.findOne({ where: { doctorId } });
  const schedObj = schedule
    ? (schedule.toJSON ? schedule.toJSON() : schedule)
    : { weeklySlots: buildDefaultWeeklySlots(), blockedDates: [], blockedSlots: [] };

  const requestedDate = parseLocalDateStr(dateStr);
  const dayOfWeek     = requestedDate.getDay();
  const isDateBlocked = (schedObj.blockedDates || []).includes(dateStr);
  const dayConfig     = (schedObj.weeklySlots  || []).find((s) => s.dayOfWeek === dayOfWeek);

  if (isDateBlocked || !dayConfig || !dayConfig.isAvailable) {
    return { date: dateStr, doctorId, slotDuration: dayConfig?.slotDuration || 30, slots: [], fullyBlocked: true };
  }

  const allSlots  = generateSlots(dayConfig.startTime, dayConfig.endTime, dayConfig.slotDuration);
  const { start: startOfDay, end: endOfDay } = localDayBounds(dateStr);

  const existing = await Appointment.findAll({
    where: {
      doctorId,
      status:    { [Op.in]: ['confirmed', 'scheduled', 'pending'] },
      startTime: { [Op.gte]: startOfDay, [Op.lte]: endOfDay },
    },
    attributes: ['startTime', 'duration'],
  });

  const bookedTimes = new Set(
    existing.map((a) => a.startTime ? localTimeKey(new Date(a.startTime)) : null).filter(Boolean),
  );
  const manuallyBlockedTimes = new Set(
    (schedObj.blockedSlots || []).filter((s) => s.date === dateStr).map((s) => s.time),
  );

  const now            = new Date();
  const todayStr       = localDateKey(now);
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const slots = allSlots.map((time) => {
    const slotMinutes       = toMinutes(time);
    const isPast            = dateStr === todayStr && slotMinutes <= currentMinutes;
    const isBooked          = bookedTimes.has(time);
    const isManuallyBlocked = manuallyBlockedTimes.has(time);
    return {
      time,
      available: !isPast && !isBooked && !isManuallyBlocked,
      reason:    isPast ? 'past' : isBooked ? 'booked' : isManuallyBlocked ? 'blocked' : null,
    };
  });

  return { date: dateStr, doctorId, slotDuration: dayConfig.slotDuration, slots, fullyBlocked: false };
};

const getSchedule = async (req, res) => {
  try {
    const doctor = await Doctor.findOne({ where: { userId: req.userId }, attributes: ['id'] });
    if (!doctor) return res.status(404).json({ message: 'Doctor profile not found' });

    const [schedule] = await DoctorSchedule.findOrCreate({
      where:    { doctorId: doctor.id },
      defaults: { doctorId: doctor.id, weeklySlots: buildDefaultWeeklySlots(), blockedDates: [], blockedSlots: [] },
    });
    res.json(schedule);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const updateSchedule = async (req, res) => {
  try {
    const doctor = await Doctor.findOne({ where: { userId: req.userId }, attributes: ['id'] });
    if (!doctor) return res.status(404).json({ message: 'Doctor profile not found' });

    const { weeklySlots, blockedDates, blockedSlots } = req.body;

    const [sched] = await DoctorSchedule.findOrCreate({
      where:    { doctorId: doctor.id },
      defaults: { weeklySlots: buildDefaultWeeklySlots(), blockedDates: [], blockedSlots: [] },
    });
    const patch = {};
    if (weeklySlots !== undefined) patch.weeklySlots = weeklySlots;
    if (blockedDates !== undefined) patch.blockedDates = blockedDates;
    if (blockedSlots !== undefined) patch.blockedSlots = blockedSlots;
    await sched.update(patch);
    res.json(sched);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const toggleBlockDate = async (req, res) => {
  try {
    const doctor = await Doctor.findOne({ where: { userId: req.userId }, attributes: ['id'] });
    if (!doctor) return res.status(404).json({ message: 'Doctor profile not found' });

    const { date, block } = req.body;
    if (!date) return res.status(400).json({ message: 'date is required' });

    const [sched] = await DoctorSchedule.findOrCreate({
      where:    { doctorId: doctor.id },
      defaults: { weeklySlots: buildDefaultWeeklySlots(), blockedDates: [], blockedSlots: [] },
    });
    const current = sched.blockedDates || [];
    const updated = block
      ? [...new Set([...current, date])]
      : current.filter((d) => d !== date);
    await sched.update({ blockedDates: updated });
    res.json(sched);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const toggleBlockSlot = async (req, res) => {
  try {
    const doctor = await Doctor.findOne({ where: { userId: req.userId }, attributes: ['id'] });
    if (!doctor) return res.status(404).json({ message: 'Doctor profile not found' });

    const { date, time, block } = req.body;
    if (!date || !time) return res.status(400).json({ message: 'date and time are required' });

    const [sched] = await DoctorSchedule.findOrCreate({
      where:    { doctorId: doctor.id },
      defaults: { weeklySlots: buildDefaultWeeklySlots(), blockedDates: [], blockedSlots: [] },
    });
    const current = sched.blockedSlots || [];
    const without = current.filter((s) => !(s.date === date && s.time === time));
    const updated = block ? [...without, { date, time }] : without;
    await sched.update({ blockedSlots: updated });
    res.json(sched);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getDoctorSlots = async (req, res) => {
  try {
    const { id }   = req.params;
    const { date } = req.query;
    if (!date) return res.status(400).json({ message: 'date query param is required' });

    const doctor = await Doctor.findByPk(id);
    if (!doctor) return res.status(404).json({ message: 'Doctor not found' });

    const payload = await buildSlotsForDoctorOnDate(id, date);
    res.json(payload);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  getSchedule,
  updateSchedule,
  toggleBlockDate,
  toggleBlockSlot,
  getDoctorSlots,
  buildSlotsForDoctorOnDate,
  parseLocalDateStr,
  localTimeKey,
};
