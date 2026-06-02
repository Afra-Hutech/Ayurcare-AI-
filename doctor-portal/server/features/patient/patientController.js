'use strict';
/**
 * Patient Controller — PostgreSQL / Sequelize
 * Migrated from: MongoDB / Mongoose patientController.js
 *
 * CRITICAL MIGRATION: upsertConsultationReport()
 * ───────────────────────────────────────────────
 * MongoDB (old):
 *   db.reports.updateOne(
 *     { patientId, sessionId },
 *     { $set: payload, $setOnInsert: { createdAt: now } },
 *     { upsert: true }
 *   )
 *   → $setOnInsert protected createdAt from being overwritten on UPDATE
 *
 * PostgreSQL (new):
 *   INSERT INTO reports (..., created_at) VALUES (..., NOW())
 *   ON CONFLICT (patient_id, session_id)
 *   DO UPDATE SET
 *     report_type   = EXCLUDED.report_type,
 *     report_data   = EXCLUDED.report_data,
 *     ...
 *     updated_at    = NOW()
 *   -- created_at is NOT in the SET clause → protected from overwrite
 *   RETURNING *;
 *
 * This raw SQL approach guarantees that created_at is:
 *   a) Written exactly once on INSERT
 *   b) Never touched by subsequent UPDATE passes (ON CONFLICT)
 *   c) Atomic — no window for a duplicate INSERT between check and write
 */
const path     = require('path');
const fs       = require('fs');
const { Op }   = require('sequelize');
const sequelize = require('../../db/sequelize');
const { User, Report, Prescription } = require('../../models');

const { Appointment, MedicalRecord, PatientDailyLog } = require('../../models');

// Patients authenticated via bot-brain (MongoDB) have non-UUID IDs.
// Guard every Postgres query so they get empty results instead of a 500.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isPgUserId = (id) => UUID_RE.test(String(id || ''));

const { clearVideoSession }        = require('../livekit/livekitMeet');
const { sanitizeWellnessPayload, getOrCreateTodayLog, listHistory, todayKey } =
  require('../common/wellnessHelpers');
const { expireStaleLiveSession, sanitizeAppointmentForClient } =
  require('../common/appointmentSession');

const BOT_BRAIN_URL = (process.env.BOT_BRAIN_URL || 'http://127.0.0.1:5002').replace(/\/$/, '');

// ── listReports ───────────────────────────────────────────────────────────────
// Replaces: Report.find({ patientId: req.userId, hiddenByPatient: { $ne: true } })
//           .sort({ createdAt: -1 })
const listReports = async (req, res) => {
  try {
    if (!isPgUserId(req.userId)) return res.json([]);
    const reports = await Report.findAll({
      where: {
        patientId:       req.userId,
        hiddenByPatient: false,          // exact boolean — no $ne needed
      },
      order: [['created_at', 'DESC']],   // Sequelize uses column name or array
      raw: true,                         // return plain objects (lean() equivalent)
    });
    return res.json(reports);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// ── hideReport ────────────────────────────────────────────────────────────────
// Replaces: Report.findById(id) + report.patientId.toString() !== req.userId
const hideReport = async (req, res) => {
  try {
    if (!isPgUserId(req.userId)) return res.status(404).json({ message: 'Report not found' });
    const report = await Report.findByPk(req.params.id);

    if (!report || report.patientId !== req.userId) {
      return res.status(404).json({ message: 'Report not found' });
    }

    // Replaces: report.hiddenByPatient = true; await report.save();
    await report.update({ hiddenByPatient: true });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// ── upsertConsultationReport ──────────────────────────────────────────────────
// CRITICAL PATH — called by the bot-brain proxy after AI diagnosis completes.
// Replaces the Python api_server.py upsert_patient_consultation_report() logic
// when the Node.js portal needs to persist a report directly.
//
// MongoDB atomic upsert → PostgreSQL ON CONFLICT atomic upsert.
// created_at is NEVER in the DO UPDATE SET clause → immutable after first INSERT.
const upsertConsultationReport = async ({
  patientId,
  sessionId,
  reportType,
  reportTitle,
  reportData,
  diagnosis,
  symptoms,
  recommendations,
  threatLevel,
  severity,
  date,
}) => {
  // Raw SQL gives us full control over the ON CONFLICT clause.
  // Sequelize's Model.upsert() does not allow excluding created_at from the
  // UPDATE side, so we use sequelize.query() with proper escaping.
  //
  // All values are passed as positional $N parameters — the pg driver binds
  // them at the protocol level, preventing any SQL injection.
  const sql = `
    INSERT INTO reports (
      patient_id, session_id, report_type, report_title,
      report_data, diagnosis, symptoms, recommendations,
      threat_level, severity, date,
      is_verified, hidden_by_patient,
      created_at, updated_at
    ) VALUES (
      $1,  $2,  $3,  $4,
      $5,  $6,  $7,  $8,
      $9,  $10, $11,
      false, false,
      NOW(), NOW()
    )
    ON CONFLICT (patient_id, session_id)
    DO UPDATE SET
      report_type      = EXCLUDED.report_type,
      report_title     = EXCLUDED.report_title,
      report_data      = EXCLUDED.report_data,
      diagnosis        = EXCLUDED.diagnosis,
      symptoms         = EXCLUDED.symptoms,
      recommendations  = EXCLUDED.recommendations,
      threat_level     = EXCLUDED.threat_level,
      severity         = EXCLUDED.severity,
      date             = EXCLUDED.date,
      updated_at       = NOW()
      -- created_at intentionally OMITTED from DO UPDATE SET
      -- so the original insertion timestamp is never overwritten
    RETURNING *;
  `;

  const [rows] = await sequelize.query(sql, {
    bind: [
      patientId,
      sessionId   || null,
      reportType  || 'AI Consultation',
      reportTitle || null,
      reportData  ? JSON.stringify(reportData) : null,
      diagnosis,
      (symptoms || '').slice(0, 500),
      (recommendations || '').slice(0, 1200),
      threatLevel || 'Moderate',
      severity    || threatLevel || 'Moderate',
      date        || new Date().toISOString().slice(0, 10),
    ],
    type: sequelize.QueryTypes.SELECT,
  });

  return rows;
};

// ── updateProfile ─────────────────────────────────────────────────────────────
// Replaces: User.findByIdAndUpdate(req.userId, { $set: updateData }, { new: true })
const updateProfile = async (req, res) => {
  try {
    if (!isPgUserId(req.userId)) return res.status(404).json({ message: 'User not found' });
    const forbidden = ['password', 'passwordHash', 'role', 'email', 'id', '_id'];
    const raw = Object.fromEntries(
      Object.entries(req.body).filter(([k]) => !forbidden.includes(k))
    );

    // height / weight come as strings like "170 cm" — extract numeric portion
    // so they don't crash Postgres's DECIMAL column
    const parseNumeric = (v) => {
      if (v == null || v === '') return null;
      const n = parseFloat(String(v).replace(/[^\d.]/g, ''));
      return Number.isFinite(n) ? n : null;
    };
    if ('height' in raw) raw.height = parseNumeric(raw.height);
    if ('weight' in raw) raw.weight = parseNumeric(raw.weight);
    if ('age'    in raw) {
      const a = parseInt(raw.age, 10);
      raw.age = Number.isFinite(a) && a > 0 ? a : null;
    }

    const user = await User.findByPk(req.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    await user.update(raw);
    return res.json(await User.findByPk(req.userId));
  } catch (err) {
    console.error('[updateProfile]', err.message);
    return res.status(500).json({ message: err.message });
  }
};

// ── listPrescriptions ─────────────────────────────────────────────────────────
// Replaces: Prescription.find({ patientId, status: 'finalized' }).sort(...)
const listPrescriptions = async (req, res) => {
  try {
    if (!isPgUserId(req.userId)) return res.json([]);
    const prescriptions = await Prescription.findAll({
      where: {
        patientId: req.userId,
        status:    'finalized',
      },
      order: [['finalized_at', 'DESC']],
      limit: 100,
      raw:   true,
    });
    return res.json(prescriptions);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// ── getPrescription ───────────────────────────────────────────────────────────
// Replaces: Prescription.findOne({ appointmentId, patientId })
const getPrescription = async (req, res) => {
  try {
    if (!isPgUserId(req.userId)) return res.status(404).json({ message: 'Prescription not found' });
    const rx = await Prescription.findOne({
      where: {
        appointmentId: req.params.appointmentId,
        patientId:     req.userId,
      },
    });
    if (!rx) return res.status(404).json({ message: 'Prescription not found' });
    return res.json(rx);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// ── Ayurvedic recommendations proxy (unchanged — calls bot-brain HTTP) ────────
const getAyurvedicRecommendations = async (req, res) => {
  const { sessionId } = req.params;
  const { diagnosis, force } = req.body || {};
  if (!sessionId) return res.status(400).json({ message: 'Invalid session ID' });

  try {
    const url = `${BOT_BRAIN_URL}/api/chat/recommendations/${encodeURIComponent(sessionId)}`;
    const response = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ diagnosis, force: !!force }),
    });
    const raw  = await response.text();
    let   data = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch { data = { message: raw }; }
    if (!response.ok) {
      return res.status(response.status).json({
        message: data.detail || data.message || `Service error (${response.status})`,
      });
    }
    return res.json(data);
  } catch (err) {
    return res.status(503).json({
      message: 'Vaidya recommendation engine is offline.',
      detail:  err.message,
    });
  }
};

// ── listAppointments ──────────────────────────────────────────────────────────
const listAppointments = async (req, res) => {
  try {
    if (!isPgUserId(req.userId)) return res.json([]);
    const appointments = await Appointment.findAll({
      where: { patientId: req.userId, hiddenByPatient: false },
      order: [['start_time', 'DESC']],
    });
    return res.json(appointments);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// ── cancelAppointment ─────────────────────────────────────────────────────────
const cancelAppointment = async (req, res) => {
  try {
    if (!isPgUserId(req.userId)) return res.status(404).json({ message: 'Appointment not found' });
    const appt = await Appointment.findOne({ where: { id: req.params.id, patientId: req.userId } });
    if (!appt) return res.status(404).json({ message: 'Appointment not found' });
    if (['cancelled', 'completed'].includes(appt.status)) {
      return res.status(400).json({ message: `Appointment is already ${appt.status}` });
    }
    await appt.update({ status: 'cancelled', cancelledByPatient: true, cancelledAt: new Date() });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// ── listMedicalRecords ────────────────────────────────────────────────────────
const listMedicalRecords = async (req, res) => {
  try {
    if (!isPgUserId(req.userId)) return res.json([]);
    const records = await MedicalRecord.findAll({
      where: { patientId: req.userId },
      order: [['uploaded_at', 'DESC']],
    });
    return res.json(records);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// ── uploadMedicalRecord ───────────────────────────────────────────────────────
const uploadMedicalRecord = async (req, res) => {
  try {
    if (!isPgUserId(req.userId)) return res.status(400).json({ message: 'Patient account not linked to this system' });
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    const record = await MedicalRecord.create({
      patientId:    req.userId,
      originalName: req.file.originalname,
      filename:     req.file.filename,
      fileType:     req.file.mimetype,
      fileSize:     req.file.size,
      category:     req.body.category || 'Other',
    });
    return res.status(201).json(record);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// ── deleteMedicalRecord ───────────────────────────────────────────────────────
const deleteMedicalRecord = async (req, res) => {
  try {
    if (!isPgUserId(req.userId)) return res.status(404).json({ message: 'Record not found' });
    const record = await MedicalRecord.findOne({ where: { id: req.params.id, patientId: req.userId } });
    if (!record) return res.status(404).json({ message: 'Record not found' });
    const filePath = path.join(__dirname, '../../uploads', record.filename);
    fs.unlink(filePath, () => {});
    await record.destroy();
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// ── downloadMedicalRecord ─────────────────────────────────────────────────────
const downloadMedicalRecord = async (req, res) => {
  try {
    if (!isPgUserId(req.userId)) return res.status(404).json({ message: 'Record not found' });
    const record = await MedicalRecord.findOne({ where: { id: req.params.id, patientId: req.userId } });
    if (!record) return res.status(404).json({ message: 'Record not found' });
    const filePath = path.join(__dirname, '../../uploads', record.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ message: 'File not found on disk' });
    res.download(filePath, record.originalName);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// ── getWellnessToday ──────────────────────────────────────────────────────────
const EMPTY_WELLNESS = { hydrationGlasses: 0, steps: 0, restingHr: 0, sleepQuality: null, sleepHours: null, energy: null, stress: null, digestionQuality: null, bowelRegularity: null, notes: '' };

const getWellnessToday = async (req, res) => {
  try {
    if (!isPgUserId(req.userId)) return res.json({ ...EMPTY_WELLNESS, date: todayKey() });
    const log = await getOrCreateTodayLog(req.userId);
    return res.json(log);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// ── upsertWellnessToday ───────────────────────────────────────────────────────
const upsertWellnessToday = async (req, res) => {
  try {
    if (!isPgUserId(req.userId)) return res.json({ ...EMPTY_WELLNESS, date: todayKey(), ...sanitizeWellnessPayload(req.body) });
    const patch = sanitizeWellnessPayload(req.body);
    const date  = todayKey();
    await PatientDailyLog.upsert({ patientId: req.userId, date, ...patch });
    const log = await PatientDailyLog.findOne({ where: { patientId: req.userId, date } });
    return res.json(log);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// ── getWellnessHistory ────────────────────────────────────────────────────────
const getWellnessHistory = async (req, res) => {
  try {
    if (!isPgUserId(req.userId)) return res.json([]);
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 14, 1), 90);
    const logs = await listHistory(req.userId, days);
    return res.json(logs);
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

module.exports = {
  listReports,
  hideReport,
  upsertConsultationReport,
  updateProfile,
  listPrescriptions,
  getPrescription,
  getAyurvedicRecommendations,
  listAppointments,
  cancelAppointment,
  listMedicalRecords,
  uploadMedicalRecord,
  deleteMedicalRecord,
  downloadMedicalRecord,
  getWellnessToday,
  upsertWellnessToday,
  getWellnessHistory,
};
