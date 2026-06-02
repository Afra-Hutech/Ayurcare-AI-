'use strict';
const { Doctor, User, Appointment, Prescription } = require('../../models');
const { normalizeMedicineRows, buildJitsiRoom }    = require('../common/helpers');
const { isLiveKitConfigured }                      = require('../livekit/livekitService');
const { provisionLiveKitForAppointment, clearVideoSession } = require('../livekit/livekitMeet');
const { listHistory, doctorCanViewPatient }        = require('../common/wellnessHelpers');
const {
  expireStaleLiveSession,
  sanitizeAppointmentForClient,
  isJoinWindowOpen,
  isDoctorStartWindowOpen,
  isSessionEnded,
} = require('../common/appointmentSession');
const {
  getDoctorListingFee,
  inferDefaultListingFee,
  storedAppointmentFee,
  stampAppointmentFeeIfMissing,
  backfillCompletedAppointmentFees,
  applyDefaultFeeToCompletedInMemory,
  syncListingFeeToCompletedAppointments,
  parseFeeValue,
} = require('../common/revenueHelpers');

// Convert flat Sequelize Doctor → nested MongoDB-compatible shape for the frontend.
// The frontend reads profile.basicInfo.name, profile.professionalInfo.specialization, etc.
const toNestedProfile = (d) => ({
  ...d,
  _id:  d.id,
  basicInfo: {
    name:         d.name,
    age:          d.age,
    gender:       d.gender,
    phone:        d.phone,
    email:        d.email,
    profileImage: d.profileImage,
  },
  professionalInfo: {
    qualification:  d.qualification,
    specialization: d.specialization,
    experience:     d.experience,
    treatments:     d.treatments || [],
  },
  clinicInfo: {
    clinicName: d.clinicName,
    address:    d.address,
    city:       d.city,
    state:      d.state,
    pincode:    d.pincode,
  },
  availability: {
    timings:   d.timings,
    fees:      d.fees    != null ? Number(d.fees) : null,
    languages: d.languages || [],
  },
  location: (d.longitude && d.latitude) ? {
    type:        'Point',
    coordinates: [Number(d.longitude), Number(d.latitude)],
  } : null,
});

// Flatten nested Mongoose-style body to Sequelize flat columns
const flattenDoctorBody = (body) => {
  const flat = {};
  const direct = [
    'name','age','gender','phone','email','profileImage',
    'qualification','specialization','experience','treatments',
    'clinicName','address','city','state','pincode',
    'timings','fees','languages','status','onLeave',
  ];
  for (const key of direct) {
    if (body[key] !== undefined) flat[key] = body[key];
  }
  if (body.basicInfo)       { for (const k of ['name','age','gender','phone','email','profileImage'])          if (body.basicInfo[k]       !== undefined) flat[k] = body.basicInfo[k]; }
  if (body.professionalInfo){ for (const k of ['qualification','specialization','experience','treatments'])    if (body.professionalInfo[k] !== undefined) flat[k] = body.professionalInfo[k]; }
  if (body.clinicInfo)      { for (const k of ['clinicName','address','city','state','pincode'])               if (body.clinicInfo[k]      !== undefined) flat[k] = body.clinicInfo[k]; }
  if (body.availability)    { for (const k of ['timings','fees','languages'])                                  if (body.availability[k]    !== undefined) flat[k] = body.availability[k]; }
  return flat;
};

function sanitizeTreatmentPlanPayload(body = {}) {
  const dietPathya    = String(body.dietPathya    ?? '').trim().slice(0, 4000);
  const dietApathya   = String(body.dietApathya   ?? '').trim().slice(0, 4000);
  const lifestylePlan = String(body.lifestylePlan ?? '').trim().slice(0, 4000);
  const followUpNotes = String(body.followUpNotes ?? '').trim().slice(0, 2000);
  let followUpDate = null;
  if (body.followUpDate) { const d = new Date(body.followUpDate); if (!Number.isNaN(d.getTime())) followUpDate = d; }
  return { dietPathya, dietApathya, lifestylePlan, followUpNotes, followUpDate };
}

const getProfile = async (req, res) => {
  try {
    const doctor = await Doctor.findOne({ where: { userId: req.userId } });
    if (!doctor) return res.status(404).json({ message: 'Doctor profile not found', exists: false });
    res.json({ ...toNestedProfile(doctor.toJSON()), exists: true, videoConfigured: isLiveKitConfigured() });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const updateProfile = async (req, res) => {
  try {
    const flatData = flattenDoctorBody(req.body);
    delete flatData.videoConfigured;

    if (flatData.fees != null) {
      const parsed = parseFeeValue(flatData.fees);
      if (parsed != null) flatData.fees = parsed;
    }
    if (req.body.location && Array.isArray(req.body.location)) {
      const lng = Number(req.body.location[0]);
      const lat = Number(req.body.location[1]);
      if (Number.isFinite(lng) && Number.isFinite(lat) && !(lng === 0 && lat === 0)) {
        flatData.longitude = lng; flatData.latitude = lat;
      }
    }
    await Doctor.update(flatData, { where: { userId: req.userId } });
    const doctor = await Doctor.findOne({ where: { userId: req.userId } });
    res.json({ ...toNestedProfile(doctor.toJSON()), exists: true, videoConfigured: isLiveKitConfigured() });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const toggleLeave = async (req, res) => {
  try {
    const doctor = await Doctor.findOne({ where: { userId: req.userId } });
    if (!doctor) return res.status(404).json({ message: 'Doctor profile not found' });
    await doctor.update({ onLeave: !doctor.onLeave });
    res.json({ onLeave: doctor.onLeave });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const onboarding = async (req, res) => {
  try {
    const flatData = flattenDoctorBody(req.body);
    flatData.userId = req.userId;
    delete flatData.videoConfigured;

    if (req.body.location && Array.isArray(req.body.location)) {
      const lng = Number(req.body.location[0]);
      const lat = Number(req.body.location[1]);
      if (Number.isFinite(lng) && Number.isFinite(lat) && !(lng === 0 && lat === 0)) {
        flatData.longitude = lng; flatData.latitude = lat;
      }
    }

    const [doc] = await Doctor.upsert(flatData, { returning: true });
    await User.update({ isOnboarded: true }, { where: { id: req.userId } });
    const doctor = doc || await Doctor.findOne({ where: { userId: req.userId } });
    res.status(201).json({ success: true, doctor: toNestedProfile(doctor.toJSON()) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const { ensureAppointmentsForDoctorLockedNegotiations } = require('../chat/negotiationAppointmentSync');

const listAppointments = async (req, res) => {
  try {
    const doctor = await Doctor.findOne({ where: { userId: req.userId }, attributes: ['id'] });
    if (!doctor) return res.status(404).json({ message: 'Doctor profile not found' });

    await ensureAppointmentsForDoctorLockedNegotiations(doctor.id);

    const appointments = await Appointment.findAll({
      where:   { doctorId: doctor.id },
      include: [
        { model: User,         as: 'patient',      attributes: ['id','name','email','profileImage','phone','age','gender','height','weight'] },
        { model: Prescription, as: 'prescription' },
      ],
      order: [['start_time','ASC'],['created_at','DESC']],
    });

    const enriched = [];
    for (const doc of appointments) {
      await expireStaleLiveSession(doc);
      const o = sanitizeAppointmentForClient(doc, { role: 'doctor' });
      if (o.startTime) {
        const st = new Date(o.startTime);
        if (!Number.isNaN(st.getTime())) {
          const y  = st.getFullYear();
          const mo = String(st.getMonth()+1).padStart(2,'0');
          const d  = String(st.getDate()).padStart(2,'0');
          o.date = `${y}-${mo}-${d}`;
          o.time = `${String(st.getHours()).padStart(2,'0')}:${String(st.getMinutes()).padStart(2,'0')}`;
        }
      }
      enriched.push(o);
    }
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getAppointment = async (req, res) => {
  try {
    const doctor = await Doctor.findOne({ where: { userId: req.userId }, attributes: ['id'] });
    if (!doctor) return res.status(404).json({ message: 'Doctor profile not found' });

    const appointment = await Appointment.findOne({
      where:   { id: req.params.id, doctorId: doctor.id },
      include: [
        { model: User,         as: 'patient',      attributes: ['id','name','email','profileImage','phone','age','gender','height','weight'] },
        { model: Prescription, as: 'prescription' },
      ],
    });
    if (!appointment) return res.status(404).json({ message: 'Appointment not found' });

    await expireStaleLiveSession(appointment);
    res.json(sanitizeAppointmentForClient(appointment, { role: 'doctor' }));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const startConsultation = async (req, res) => {
  try {
    const { appointmentId } = req.body;
    if (!appointmentId) return res.status(400).json({ message: 'appointmentId is required' });

    const doctor = await Doctor.findOne({ where: { userId: req.userId }, attributes: ['id'] });
    if (!doctor) return res.status(404).json({ message: 'Doctor profile not found' });

    let appointment = await Appointment.findOne({ where: { id: appointmentId, doctorId: doctor.id } });
    if (!appointment) return res.status(404).json({ message: 'Appointment not found' });
    if (String(appointment.status || '').toLowerCase() !== 'confirmed')
      return res.status(409).json({ message: 'Only confirmed appointments can start consultation' });
    if (String(appointment.type || '').toLowerCase() !== 'online')
      return res.status(409).json({ message: 'Consultation workspace is only available for online appointments' });
    if (isSessionEnded(appointment))
      return res.status(409).json({ message: 'This consultation window has ended' });
    if (!isDoctorStartWindowOpen(appointment))
      return res.status(409).json({ message: 'This consultation window has closed. The visit is outside the allowed start time.' });

    if (!isLiveKitConfigured()) {
      return res.status(503).json({
        message: 'LiveKit is not configured. Add LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET to the API server .env file.',
        code:    'LIVEKIT_NOT_CONFIGURED',
      });
    }

    const meetProvision = await provisionLiveKitForAppointment(appointment.id);
    appointment = meetProvision.appointment || await Appointment.findOne({ where: { id: appointmentId, doctorId: doctor.id } });

    if (!appointment.meetingLink) {
      return res.status(502).json({
        message: 'Could not prepare the LiveKit video room. Check LIVEKIT_* settings on the server.',
        code:    'LIVEKIT_PROVISION_FAILED',
        reason:  meetProvision.reason,
      });
    }

    await appointment.update({
      roomId:        appointment.roomId || buildJitsiRoom(appointment.id),
      meetingType:   'livekit',
      meetingStatus: 'live',
      startedAt:     appointment.startedAt || new Date(),
      endedAt:       null,
    });

    res.json({
      success:       true,
      appointment,
      meetingLink:   appointment.meetingLink,
      roomId:        appointment.roomId,
      meetingStatus: appointment.meetingStatus,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const endConsultation = async (req, res) => {
  try {
    const { appointmentId } = req.body;
    if (!appointmentId) return res.status(400).json({ message: 'appointmentId is required' });

    const doctor = await Doctor.findOne({ where: { userId: req.userId }, attributes: ['id'] });
    if (!doctor) return res.status(404).json({ message: 'Doctor profile not found' });

    const appointment = await Appointment.findOne({ where: { id: appointmentId, doctorId: doctor.id } });
    if (!appointment) return res.status(404).json({ message: 'Appointment not found' });

    await appointment.update({ meetingStatus: 'ended', endedAt: new Date() });
    await clearVideoSession(appointment.id);

    const refreshed = await Appointment.findByPk(appointment.id);
    res.json({
      success:     true,
      appointment: sanitizeAppointmentForClient(refreshed || appointment, { role: 'doctor' }),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getPrescription = async (req, res) => {
  try {
    const doctor = await Doctor.findOne({ where: { userId: req.userId }, attributes: ['id'] });
    if (!doctor) return res.status(404).json({ message: 'Doctor profile not found' });

    const appointment = await Appointment.findOne({
      where:      { id: req.params.appointmentId, doctorId: doctor.id },
      attributes: ['id','doctorId','patientId','meetingStatus','consultationCompleted'],
    });
    if (!appointment) return res.status(404).json({ message: 'Appointment not found' });

    const prescription = await Prescription.findOne({ where: { appointmentId: appointment.id } });
    if (!prescription) {
      return res.json({
        appointmentId: appointment.id, doctorId: appointment.doctorId, patientId: appointment.patientId,
        notes: '', medicines: [], dietPathya: '', dietApathya: '', lifestylePlan: '',
        followUpDate: null, followUpNotes: '', status: 'draft',
        meetingStatus: appointment.meetingStatus || 'scheduled',
        consultationCompleted: !!appointment.consultationCompleted,
        createdAt: null, updatedAt: null, finalizedAt: null,
      });
    }
    res.json({
      ...(prescription.toJSON ? prescription.toJSON() : { ...prescription }),
      meetingStatus:         appointment.meetingStatus || 'scheduled',
      consultationCompleted: !!appointment.consultationCompleted,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const draftPrescription = async (req, res) => {
  try {
    const { appointmentId, notes = '', medicines = [] } = req.body;
    if (!appointmentId) return res.status(400).json({ message: 'appointmentId is required' });

    const doctor = await Doctor.findOne({ where: { userId: req.userId }, attributes: ['id'] });
    if (!doctor) return res.status(404).json({ message: 'Doctor profile not found' });

    const appointment = await Appointment.findOne({
      where:      { id: appointmentId, doctorId: doctor.id },
      attributes: ['id','doctorId','patientId','meetingStatus','consultationCompleted'],
    });
    if (!appointment) return res.status(404).json({ message: 'Appointment not found' });

    const treatment = sanitizeTreatmentPlanPayload(req.body);

    await Prescription.upsert({
      appointmentId: appointment.id,
      doctorId:      appointment.doctorId,
      patientId:     appointment.patientId,
      notes:         String(notes || ''),
      medicines:     normalizeMedicineRows(medicines),
      ...treatment,
      status: 'draft',
    });
    const draft = await Prescription.findOne({ where: { appointmentId: appointment.id } });

    await appointment.update({ notes: String(notes || '') });
    res.json(draft);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const finalizePrescription = async (req, res) => {
  try {
    const { appointmentId, notes = '', medicines = [] } = req.body;
    if (!appointmentId) return res.status(400).json({ message: 'appointmentId is required' });

    const doctor = await Doctor.findOne({ where: { userId: req.userId }, attributes: ['id'] });
    if (!doctor) return res.status(404).json({ message: 'Doctor profile not found' });

    const appointment = await Appointment.findOne({ where: { id: appointmentId, doctorId: doctor.id } });
    if (!appointment) return res.status(404).json({ message: 'Appointment not found' });

    if ((appointment.meetingStatus || 'scheduled') === 'scheduled')
      return res.status(409).json({ message: 'Consultation has not started yet' });

    const treatment    = sanitizeTreatmentPlanPayload(req.body);
    const finalizedAt  = new Date();

    await Prescription.upsert({
      appointmentId: appointment.id,
      doctorId:      appointment.doctorId,
      patientId:     appointment.patientId,
      notes:         String(notes || ''),
      medicines:     normalizeMedicineRows(medicines),
      ...treatment,
      status:      'finalized',
      finalizedAt,
    });
    const prescription = await Prescription.findOne({ where: { appointmentId: appointment.id } });

    await stampAppointmentFeeIfMissing(appointment, doctor.id);
    await appointment.update({
      prescriptionId:        prescription.id,
      status:                'completed',
      notes:                 String(notes || ''),
      consultationCompleted: true,
      meetingStatus:         'ended',
      endedAt:               finalizedAt,
    });
    await clearVideoSession(appointment.id);

    const refreshed = await Appointment.findByPk(appointment.id);
    res.json({
      success:     true,
      prescription,
      appointment: sanitizeAppointmentForClient(refreshed || appointment, { role: 'doctor' }),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getPatientWellnessHistory = async (req, res) => {
  try {
    const { patientId } = req.params;
    if (!patientId) return res.status(400).json({ message: 'Patient ID is required' });

    const allowed = await doctorCanViewPatient(req.userId, patientId);
    if (!allowed) return res.status(403).json({ message: "You do not have access to this patient's wellness logs" });

    const logs = await listHistory(patientId, req.query.days);
    res.json({ logs, patientId });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getRevenueSummary = async (req, res) => {
  try {
    const doctor = await Doctor.findOne({
      where:      { userId: req.userId },
      attributes: ['id', 'fees'],
    });

    const apps = doctor?.id
      ? await Appointment.findAll({
          where:      { doctorId: doctor.id },
          attributes: ['id', 'status', 'fee', 'startTime', 'type', 'patientId'],
          include:    [{ model: User, as: 'patient', attributes: ['name', 'email'] }],
        })
      : [];

    const defaultListingFee = inferDefaultListingFee(doctor, apps);
    if (doctor?.id) {
      await backfillCompletedAppointmentFees(doctor.id, defaultListingFee, apps);
      if (defaultListingFee) await syncListingFeeToCompletedAppointments(doctor.id, defaultListingFee);
    }
    applyDefaultFeeToCompletedInMemory(apps, defaultListingFee);

    const feeOf       = (a) => storedAppointmentFee(a);
    const patientName = (a) => { const p = a?.patient; if (!p || typeof p !== 'object') return ''; return String(p.name || '').trim() || String(p.email || '').trim() || ''; };
    const patientEmail = (a) => { const p = a?.patient; if (!p || typeof p !== 'object') return ''; return String(p.email || '').trim(); };

    const now = new Date();
    const startOfToday = new Date(now); startOfToday.setHours(0,0,0,0);
    const thirtyAgo    = new Date(startOfToday); thirtyAgo.setDate(thirtyAgo.getDate()-30);

    const isCompleted = (a) => String(a.status || '').toLowerCase() === 'completed';
    const realized    = apps.filter(isCompleted);
    const totalRealized          = realized.reduce((s,a) => s + feeOf(a), 0);
    const realizedWithFeeCount   = realized.filter((a) => feeOf(a) > 0).length;

    const monthly = [];
    for (let i = 5; i >= 0; i--) {
      const d   = new Date(now.getFullYear(), now.getMonth()-i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      const label = d.toLocaleString('en-IN', { month:'short', year:'numeric' });
      let amount = 0; let visits = 0;
      realized.forEach((a) => {
        if (!a.startTime) return;
        const t = new Date(a.startTime);
        const k = `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}`;
        if (k !== key) return;
        const f = feeOf(a); amount += f; if (f>0) visits++;
      });
      monthly.push({ key, label, amount, visits });
    }

    let last30Days = 0;
    realized.forEach((a) => { if (!a.startTime) return; const t = new Date(a.startTime); if (t>=thirtyAgo && t<=now) last30Days += feeOf(a); });

    const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    const thisMonth    = monthly.find((m) => m.key === thisMonthKey)?.amount || 0;

    let upcomingExpected = 0; let upcomingCount = 0; const upcomingForExport = [];
    apps.forEach((a) => {
      const s = String(a.status||'').toLowerCase();
      if (!['pending','scheduled','confirmed'].includes(s)) return;
      if (!a.startTime) return;
      const t = new Date(a.startTime);
      if (Number.isNaN(t.getTime()) || t < startOfToday) return;
      const f = feeOf(a); if (f<=0) return;
      upcomingExpected += f; upcomingCount++; upcomingForExport.push(a);
    });

    const completedLineItems = [...realized].sort((a,b) => (b.startTime ? new Date(b.startTime).getTime():0)-(a.startTime?new Date(a.startTime).getTime():0))
      .map((a) => ({ patientName: patientName(a), patientEmail: patientEmail(a), visitIso: a.startTime ? new Date(a.startTime).toISOString():'', visitLocal: a.startTime ? new Date(a.startTime).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'}):'', feeInr: feeOf(a), visitType: a.type||'', status:'completed' }));

    const upcomingLineItems = [...upcomingForExport].sort((a,b) => (a.startTime?new Date(a.startTime).getTime():0)-(b.startTime?new Date(b.startTime).getTime():0))
      .map((a) => ({ patientName: patientName(a), patientEmail: patientEmail(a), visitIso: a.startTime ? new Date(a.startTime).toISOString():'', visitLocal: a.startTime ? new Date(a.startTime).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'}):'', expectedFeeInr: feeOf(a), visitType: a.type||'', status: String(a.status||'').toLowerCase() }));

    res.json({
      currency: 'INR',
      defaultListingFee: Number.isFinite(defaultListingFee) ? defaultListingFee : null,
      totals: { realized: totalRealized, realizedVisits: realized.length, realizedVisitsWithFee: realizedWithFeeCount, last30Days, thisMonth, upcomingExpected, upcomingCount },
      monthly,
      lineItems: { completed: completedLineItems, upcoming: upcomingLineItems },
      meta: { doctorProfileFound: !!doctor, defaultListingFee: defaultListingFee ?? null, needsProfileFee: realized.length>0 && realizedWithFeeCount===0 && !defaultListingFee, generatedAt: new Date().toISOString() },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  getProfile,
  updateProfile,
  toggleLeave,
  onboarding,
  listAppointments,
  getAppointment,
  startConsultation,
  endConsultation,
  getPrescription,
  draftPrescription,
  finalizePrescription,
  getPatientWellnessHistory,
  getRevenueSummary,
};
