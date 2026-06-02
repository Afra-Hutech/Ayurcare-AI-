'use strict';
/**
 * Prescription — Sequelize model (PostgreSQL)
 * Migrated from: Mongoose Prescription.js
 *
 * medicines[] stored as JSONB instead of a Mongoose sub-document array.
 * All enum constraints mirror the Mongoose schema exactly.
 */
const { DataTypes } = require('sequelize');
const sequelize = require('../db/sequelize');

const Prescription = sequelize.define('Prescription', {
  id: {
    type:         DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey:   true,
  },

  // Replaces: appointmentId: { type: ObjectId, ref: 'Appointment', required: true, unique: true }
  appointmentId: {
    type:      DataTypes.UUID,
    allowNull: false,
    unique:    true,
    field:     'appointment_id',
    validate:  { notNull: true, isUUID: 4 },
  },

  doctorId: {
    type:      DataTypes.UUID,
    allowNull: false,
    field:     'doctor_id',
    validate:  { notNull: true, isUUID: 4 },
  },

  patientId: {
    type:      DataTypes.UUID,
    allowNull: false,
    field:     'patient_id',
    validate:  { notNull: true, isUUID: 4 },
  },

  notes: {
    type:         DataTypes.TEXT,
    defaultValue: '',
  },

  // Replaces: medicines: [medicineSchema]  — stored as JSONB
  // Each element: { "name": "Triphala", "details": "1 tsp with warm water" }
  medicines: {
    type:         DataTypes.JSONB,
    defaultValue: [],
    validate: {
      isArray(value) {
        if (!Array.isArray(value)) throw new Error('medicines must be an array');
        for (const m of value) {
          if (typeof m !== 'object' || Array.isArray(m))
            throw new Error('Each medicine must be an object { name, details }');
        }
      },
    },
  },

  dietPathya: {
    type:         DataTypes.TEXT,
    defaultValue: '',
    field:        'diet_pathya',
  },

  dietApathya: {
    type:         DataTypes.TEXT,
    defaultValue: '',
    field:        'diet_apathya',
  },

  lifestylePlan: {
    type:         DataTypes.TEXT,
    defaultValue: '',
    field:        'lifestyle_plan',
  },

  followUpDate: {
    type:  DataTypes.DATEONLY,
    field: 'follow_up_date',
  },

  followUpNotes: {
    type:         DataTypes.TEXT,
    defaultValue: '',
    field:        'follow_up_notes',
  },

  // Replaces: status: { type: String, enum: ['draft','finalized'], default: 'draft' }
  status: {
    type:         DataTypes.STRING(20),
    defaultValue: 'draft',
    validate: {
      isIn: {
        args: [['draft', 'finalized']],
        msg:  'status must be draft or finalized',
      },
    },
  },

  finalizedAt: {
    type:  DataTypes.DATE,
    field: 'finalized_at',
  },
}, {
  tableName:   'prescriptions',
  underscored: true,
  indexes: [
    {
      fields: ['patient_id', 'status', 'updated_at'],
      name:   'prescriptions_patient_status_idx',
    },
  ],
});

Prescription.associate = (models) => {
  Prescription.belongsTo(models.Doctor, { foreignKey: 'doctorId',      as: 'doctor' });
  Prescription.belongsTo(models.User,   { foreignKey: 'patientId',     as: 'patient' });
};

module.exports = Prescription;
