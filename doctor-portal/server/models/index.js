'use strict';
/**
 * Sequelize model registry — PostgreSQL.
 * All Mongoose models have been replaced. No MongoDB dependencies remain.
 */
const sequelize = require('../db/sequelize');

const User          = require('./User');
const Doctor        = require('./Doctor');
const Report        = require('./Report');
const Prescription  = require('./Prescription');
const Appointment   = require('./Appointment');
const PatientDailyLog = require('./PatientDailyLog');
const MedicalRecord = require('./MedicalRecord');
const DoctorSchedule = require('./DoctorSchedule');
const Chat          = require('./Chat');
const Message       = require('./Message');
const Negotiation   = require('./Negotiation');
const Payment       = require('./Payment');

const models = {
  User,
  Doctor,
  Report,
  Prescription,
  Appointment,
  PatientDailyLog,
  MedicalRecord,
  DoctorSchedule,
  Chat,
  Message,
  Negotiation,
  Payment,
  sequelize,
};

Object.values(models).forEach((model) => {
  if (typeof model.associate === 'function') {
    model.associate(models);
  }
});

module.exports = models;
