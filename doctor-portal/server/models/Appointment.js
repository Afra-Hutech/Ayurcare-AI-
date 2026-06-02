'use strict';
/**
 * Appointment — Sequelize model (PostgreSQL)
 * Migrated from: Mongoose Appointment.js
 */
const { DataTypes } = require('sequelize');
const sequelize = require('../db/sequelize');

const Appointment = sequelize.define('Appointment', {
  id: {
    type:         DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey:   true,
  },
  doctorId: {
    type:      DataTypes.UUID,
    allowNull: false,
    field:     'doctor_id',
  },
  patientId: {
    type:      DataTypes.UUID,
    allowNull: false,
    field:     'patient_id',
  },
  prescriptionId: {
    type:  DataTypes.UUID,
    field: 'prescription_id',
  },
  status: {
    type:         DataTypes.STRING(30),
    defaultValue: 'pending',
  },
  type: {
    type:         DataTypes.STRING(20),
    defaultValue: 'clinic',
  },
  startTime:  { type: DataTypes.DATE, field: 'start_time' },
  endTime:    { type: DataTypes.DATE, field: 'end_time' },
  duration:   { type: DataTypes.INTEGER, defaultValue: 30 },
  notes:      { type: DataTypes.TEXT },
  fee:        { type: DataTypes.DECIMAL(10, 2) },
  meetingType: {
    type:         DataTypes.STRING(20),
    defaultValue: 'livekit',
    field:        'meeting_type',
  },
  roomId:      { type: DataTypes.STRING(255), field: 'room_id' },
  meetingLink: { type: DataTypes.TEXT,        field: 'meeting_link' },
  meetingStatus: {
    type:         DataTypes.STRING(20),
    defaultValue: 'scheduled',
    field:        'meeting_status',
  },
  startedAt: { type: DataTypes.DATE, field: 'started_at' },
  endedAt:   { type: DataTypes.DATE, field: 'ended_at' },
  consultationCompleted: {
    type:         DataTypes.BOOLEAN,
    defaultValue: false,
    field:        'consultation_completed',
  },
  sessionData: {
    type:         DataTypes.JSONB,
    defaultValue: {},
    field:        'session_data',
  },
  cancelledByPatient: {
    type:         DataTypes.BOOLEAN,
    defaultValue: false,
    field:        'cancelled_by_patient',
  },
  cancelledAt:      { type: DataTypes.DATE, field: 'cancelled_at' },
  cancellationNote: { type: DataTypes.TEXT, field: 'cancellation_note' },
  attachments: {
    type:         DataTypes.JSONB,
    defaultValue: [],
  },
  paymentStatus: {
    type:         DataTypes.STRING(20),
    defaultValue: 'unpaid',
    field:        'payment_status',
  },
  hiddenByPatient: {
    type:         DataTypes.BOOLEAN,
    defaultValue: false,
    field:        'hidden_by_patient',
  },
  meetNotificationSentAt: {
    type:  DataTypes.DATE,
    field: 'meet_notification_sent_at',
  },
  meetNotificationChannels: {
    type:         DataTypes.ARRAY(DataTypes.TEXT),
    defaultValue: [],
    field:        'meet_notification_channels',
  },
}, {
  tableName:   'appointments',
  underscored: true,
  indexes: [
    { fields: ['doctor_id', 'start_time'], name: 'appts_doctor_start_idx' },
    { fields: ['patient_id'],              name: 'appts_patient_idx' },
    { fields: ['status'],                  name: 'appts_status_idx' },
    { fields: ['payment_status'],          name: 'appts_payment_status_idx' },
  ],
});

Appointment.associate = (models) => {
  Appointment.belongsTo(models.Doctor,       { foreignKey: 'doctorId',       as: 'doctor' });
  Appointment.belongsTo(models.User,         { foreignKey: 'patientId',       as: 'patient' });
  Appointment.belongsTo(models.Prescription, { foreignKey: 'prescriptionId',  as: 'prescription' });
  Appointment.hasOne(models.Payment,         { foreignKey: 'appointmentId',   as: 'payment' });
};

module.exports = Appointment;
