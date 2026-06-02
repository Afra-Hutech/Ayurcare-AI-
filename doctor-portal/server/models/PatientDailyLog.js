'use strict';
/**
 * PatientDailyLog — Sequelize model (PostgreSQL)
 * Migrated from: Mongoose PatientDailyLog.js
 */
const { DataTypes } = require('sequelize');
const sequelize = require('../db/sequelize');

const PatientDailyLog = sequelize.define('PatientDailyLog', {
  id: {
    type:         DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey:   true,
  },
  patientId: {
    type:      DataTypes.UUID,
    allowNull: false,
    field:     'patient_id',
  },
  date: {
    type:      DataTypes.STRING(10),
    allowNull: false,
  },
  hydrationGlasses: { type: DataTypes.INTEGER,      defaultValue: 0,    field: 'hydration_glasses' },
  steps:            { type: DataTypes.INTEGER,      defaultValue: 0 },
  restingHr:        { type: DataTypes.INTEGER,      defaultValue: 0,    field: 'resting_hr' },
  sleepQuality:     { type: DataTypes.SMALLINT,                         field: 'sleep_quality' },
  sleepHours:       { type: DataTypes.DECIMAL(4,1),                     field: 'sleep_hours' },
  energy:           { type: DataTypes.SMALLINT },
  stress:           { type: DataTypes.SMALLINT },
  digestionQuality: { type: DataTypes.SMALLINT,                         field: 'digestion_quality' },
  bowelRegularity:  { type: DataTypes.SMALLINT,                         field: 'bowel_regularity' },
  notes:            { type: DataTypes.STRING(500),  defaultValue: '' },
}, {
  tableName:   'patient_daily_logs',
  underscored: true,
  indexes: [
    {
      unique: true,
      fields: ['patient_id', 'date'],
      name:   'pdl_patient_date_unique',
    },
  ],
});

PatientDailyLog.associate = (models) => {
  PatientDailyLog.belongsTo(models.User, { foreignKey: 'patientId', as: 'patient' });
};

module.exports = PatientDailyLog;
