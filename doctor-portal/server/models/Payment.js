'use strict';
/**
 * Payment — Sequelize model (PostgreSQL)
 * Migrated from: Mongoose Payment.js
 */
const { DataTypes } = require('sequelize');
const sequelize = require('../db/sequelize');

const Payment = sequelize.define('Payment', {
  id: {
    type:         DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey:   true,
  },
  appointmentId: {
    type:      DataTypes.UUID,
    allowNull: false,
    field:     'appointment_id',
  },
  patientId: {
    type:      DataTypes.UUID,
    allowNull: false,
    field:     'patient_id',
  },
  doctorId: {
    type:      DataTypes.UUID,
    allowNull: false,
    field:     'doctor_id',
  },
  amount:   { type: DataTypes.DECIMAL(10, 2) },
  currency: { type: DataTypes.STRING(10), defaultValue: 'INR' },
  status:   { type: DataTypes.STRING(30), defaultValue: 'pending' },
  stripePaymentIntentId: { type: DataTypes.STRING(255), field: 'stripe_payment_intent_id' },
  refundId:     { type: DataTypes.STRING(255), field: 'refund_id' },
  refundAmount: { type: DataTypes.DECIMAL(10, 2), field: 'refund_amount' },
  refundReason: { type: DataTypes.TEXT,           field: 'refund_reason' },
  refundedAt:   { type: DataTypes.DATE,           field: 'refunded_at' },
}, {
  tableName:   'payments',
  underscored: true,
  indexes: [
    { fields: ['appointment_id'], name: 'payments_appointment_idx' },
    { fields: ['patient_id'],     name: 'payments_patient_idx' },
    { fields: ['status'],         name: 'payments_status_idx' },
  ],
});

Payment.associate = (models) => {
  Payment.belongsTo(models.Appointment, { foreignKey: 'appointmentId', as: 'appointment' });
  Payment.belongsTo(models.User,        { foreignKey: 'patientId',     as: 'patient' });
  Payment.belongsTo(models.Doctor,      { foreignKey: 'doctorId',      as: 'doctor' });
};

module.exports = Payment;
