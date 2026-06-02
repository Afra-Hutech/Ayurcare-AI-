'use strict';
/**
 * MedicalRecord — Sequelize model (PostgreSQL)
 * Migrated from: Mongoose MedicalRecord.js
 */
const { DataTypes } = require('sequelize');
const sequelize = require('../db/sequelize');

const MedicalRecord = sequelize.define('MedicalRecord', {
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
  originalName: {
    type:      DataTypes.STRING(500),
    allowNull: false,
    field:     'original_name',
  },
  filename: {
    type:      DataTypes.STRING(500),
    allowNull: false,
  },
  fileType: {
    type:      DataTypes.STRING(100),
    allowNull: false,
    field:     'file_type',
  },
  fileSize: {
    type:      DataTypes.INTEGER,
    allowNull: false,
    field:     'file_size',
  },
  category: {
    type:         DataTypes.STRING(100),
    defaultValue: 'Other',
  },
  uploadedAt: {
    type:         DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field:        'uploaded_at',
  },
}, {
  tableName:   'medical_records',
  underscored: true,
  indexes: [
    { fields: ['patient_id'], name: 'medical_records_patient_idx' },
  ],
});

MedicalRecord.associate = (models) => {
  MedicalRecord.belongsTo(models.User, { foreignKey: 'patientId', as: 'patient' });
};

module.exports = MedicalRecord;
