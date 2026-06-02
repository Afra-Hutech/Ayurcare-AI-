'use strict';
/**
 * DoctorSchedule — Sequelize model (PostgreSQL)
 * Migrated from: Mongoose DoctorSchedule.js
 *
 * weeklySlots/blockedSlots stored as JSONB; blockedDates as TEXT[].
 */
const { DataTypes } = require('sequelize');
const sequelize = require('../db/sequelize');

const DoctorSchedule = sequelize.define('DoctorSchedule', {
  id: {
    type:         DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey:   true,
  },
  doctorId: {
    type:      DataTypes.UUID,
    allowNull: false,
    unique:    true,
    field:     'doctor_id',
  },
  weeklySlots: {
    type:         DataTypes.JSONB,
    defaultValue: [],
    field:        'weekly_slots',
  },
  blockedDates: {
    type:         DataTypes.ARRAY(DataTypes.TEXT),
    defaultValue: [],
    field:        'blocked_dates',
  },
  blockedSlots: {
    type:         DataTypes.JSONB,
    defaultValue: [],
    field:        'blocked_slots',
  },
}, {
  tableName:   'doctor_schedules',
  underscored: true,
});

DoctorSchedule.associate = (models) => {
  DoctorSchedule.belongsTo(models.Doctor, { foreignKey: 'doctorId', as: 'doctor' });
};

module.exports = DoctorSchedule;
