'use strict';
const { Doctor, Appointment } = require('../../models');
const { findOwnedAppointment }         = require('../common/helpers');
const { stampAppointmentFeeIfMissing } = require('../common/revenueHelpers');
const { processRefund }                = require('../payments/paymentController');
const {
  appointmentNeedsMeet,
  isCancelledStatus,
  clearVideoSession,
  ensureLiveKitForAppointment,
} = require('../livekit/livekitMeet');

const updateAppointment = async (req, res) => {
  try {
    const appointment = await findOwnedAppointment(req.params.id, req.userId);
    if (!appointment) return res.status(404).json({ message: 'Appointment not found' });

    // Strip immutable fields
    const { doctorId, patientId, prescriptionId, createdAt, id, _id, ...mutableUpdateData } =
      req.body || {};

    await Appointment.update(mutableUpdateData, { where: { id: req.params.id } });
    const updated = await Appointment.findByPk(req.params.id);

    if (updated && appointmentNeedsMeet(updated)) {
      await ensureLiveKitForAppointment(updated.id);
    }
    if (updated && isCancelledStatus(updated.status)) {
      await clearVideoSession(updated.id);
    }
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const updateAppointmentStatus = async (req, res) => {
  try {
    const { status, cancellationNote } = req.body || {};
    const appointment = await findOwnedAppointment(req.params.id, req.userId);
    if (!appointment) return res.status(404).json({ message: 'Appointment not found' });

    const nextStatus = String(status || '').toLowerCase().trim();
    const extras = {};

    if (nextStatus === 'cancelled' || nextStatus === 'canceled') {
      extras.cancelledAt       = new Date();
      extras.cancelledByPatient = false;
      extras.cancellationNote  =
        typeof cancellationNote === 'string' && cancellationNote.trim()
          ? cancellationNote.trim()
          : 'Your appointment was declined by the clinic. Please open Book Appointment to choose another slot.';
      processRefund(appointment.id, 'Doctor cancelled the consultation').catch((e) =>
        console.error('[Payment] Auto-refund failed:', e.message),
      );
    }
    if (nextStatus === 'completed') {
      extras.consultationCompleted = true;
      extras.meetingStatus         = 'ended';
      extras.endedAt               = new Date();
      await stampAppointmentFeeIfMissing(appointment, appointment.doctorId);
    }

    await Appointment.update(
      { status: nextStatus, ...extras },
      { where: { id: req.params.id } },
    );
    const updated = await Appointment.findByPk(req.params.id);

    if (updated && appointmentNeedsMeet(updated)) {
      await ensureLiveKitForAppointment(updated.id);
    }
    if (updated && isCancelledStatus(updated.status)) {
      await clearVideoSession(updated.id);
    }
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const uploadAttachments = async (req, res) => {
  try {
    const doctor = await Doctor.findOne({ where: { userId: req.userId }, attributes: ['id'] });
    if (!doctor) return res.status(404).json({ message: 'Doctor profile not found' });

    const appointment = await Appointment.findOne({
      where: { id: req.params.id, doctorId: doctor.id },
    });
    if (!appointment) return res.status(404).json({ message: 'Appointment not found' });

    const uploadedFiles    = Array.isArray(req.files) ? req.files : [];
    const fileAttachments  = uploadedFiles.map((file) => ({
      originalName: file.originalname,
      fileName:     file.filename,
      mimeType:     file.mimetype,
      size:         file.size,
      url:          `${req.protocol}://${req.get('host')}/uploads/${file.filename}`,
      uploadedAt:   new Date(),
    }));

    const nextStatus = String(req.body.status || '').toLowerCase().trim();
    const extras     = {};

    if (nextStatus === 'completed') {
      extras.status                = 'completed';
      extras.consultationCompleted = true;
      extras.meetingStatus         = 'ended';
      extras.endedAt               = new Date();
      await stampAppointmentFeeIfMissing(appointment, appointment.doctorId);
    } else if (nextStatus === 'cancelled' || nextStatus === 'canceled') {
      extras.status                = 'cancelled';
      extras.consultationCompleted = false;
      extras.meetingStatus         = 'ended';
      extras.endedAt               = new Date();
    }

    await Appointment.update(
      { attachments: [...(appointment.attachments || []), ...fileAttachments], ...extras },
      { where: { id: appointment.id } },
    );

    if (nextStatus === 'cancelled' || nextStatus === 'canceled') {
      await clearVideoSession(appointment.id);
    }

    const refreshed = await Appointment.findByPk(appointment.id);
    res.json({ success: true, appointment: refreshed, attachments: fileAttachments });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  updateAppointment,
  updateAppointmentStatus,
  uploadAttachments,
};
