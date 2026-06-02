'use strict';
/**
 * Report — Sequelize model (PostgreSQL)
 * Migrated from: Mongoose Report.js
 *
 * Key invariants preserved from AyurCare-Doc.docx:
 *   isVerified     → DEFAULT false, NOT NULL  (immutable AI init state)
 *   hiddenByPatient → DEFAULT false, NOT NULL  (doctor-visible at creation)
 *   UNIQUE (patientId, sessionId)              → upsert idempotency
 *   reportData JSONB                           → preserves full nested AI payload
 */
const { DataTypes } = require('sequelize');
const sequelize = require('../db/sequelize');

const Report = sequelize.define('Report', {
  id: {
    type:         DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey:   true,
  },

  // ── Foreign key: patient ─────────────────────────────────────────────────
  // Replaces: patientId: { type: ObjectId, ref: 'User', required: true }
  patientId: {
    type:      DataTypes.UUID,
    allowNull: false,
    field:     'patient_id',
    validate: {
      notNull: { msg: 'patientId is required' },
      isUUID: { args: 4, msg: 'patientId must be a valid UUID' },
    },
  },

  // ── Session ID (nullable — AI sessions live in bot-brain, stored as string) ──
  // Stored as TEXT to support both UUIDs and MongoDB ObjectId strings.
  sessionId: {
    type:      DataTypes.STRING(64),
    allowNull: true,
    field:     'session_id',
  },

  reportType: {
    type:  DataTypes.STRING(100),
    field: 'report_type',
  },

  reportTitle: {
    type:  DataTypes.STRING(500),
    field: 'report_title',
  },

  // ── JSONB: full AI report payload ─────────────────────────────────────────
  // Replaces: reportData: { type: Mixed }
  // Structure example (schemaVersion 'reports.v2'):
  //   {
  //     "schemaVersion": "reports.v2",
  //     "patientInfo":   { "name": "...", "age": 34, "gender": "male" },
  //     "reports": [{
  //       "reportType": "Diagnosis Report",
  //       "reportData": {
  //         "threatLevel": "Moderate",
  //         "doshaProfile": { "dominant": "Pitta",
  //                           "percentages": { "Vata": 20, "Pitta": 55, "Kapha": 25 } },
  //         "kpis": [{ "label": "Primary Dosha", "value": "Pitta" }]
  //       }
  //     }]
  //   }
  reportData: {
    type:  DataTypes.JSONB,
    field: 'report_data',
  },

  // ── Required clinical text fields ─────────────────────────────────────────
  diagnosis: {
    type:      DataTypes.TEXT,
    allowNull: false,
    validate: {
      notNull:  { msg: 'diagnosis is required' },
      notEmpty: { msg: 'diagnosis cannot be empty' },
    },
  },

  symptoms: {
    type:         DataTypes.STRING(500),
    defaultValue: '',
  },

  recommendations: {
    type:         DataTypes.TEXT,
    defaultValue: '',
  },

  // ── Clinical metadata ─────────────────────────────────────────────────────
  threatLevel: {
    type:  DataTypes.STRING(50),
    field: 'threat_level',
    validate: {
      isIn: {
        args: [['Low', 'Moderate', 'High', null]],
        msg:  'threatLevel must be Low, Moderate, or High',
      },
    },
  },

  severity: {
    type: DataTypes.STRING(50),
  },

  date: {
    type:  DataTypes.DATEONLY,
  },

  // ── IMMUTABLE INITIALIZATION STATE ────────────────────────────────────────
  // isVerified: false at creation — doctors update this after reviewing
  // Replaces: Mongoose had no isVerified; AyurCare-Doc.docx mandates it
  isVerified: {
    type:         DataTypes.BOOLEAN,
    allowNull:    false,
    defaultValue: false,
    field:        'is_verified',
    validate: {
      notNull: { msg: 'isVerified is required' },
    },
  },

  // hiddenByPatient: false at creation — report is always doctor-visible initially
  // Replaces: hiddenByPatient: { type: Boolean, default: false }
  hiddenByPatient: {
    type:         DataTypes.BOOLEAN,
    allowNull:    false,
    defaultValue: false,
    field:        'hidden_by_patient',
    validate: {
      notNull: { msg: 'hiddenByPatient is required' },
    },
  },
}, {
  tableName:  'reports',
  underscored: true,

  // UNIQUE (patient_id, session_id) → enforces upsert idempotency.
  // ON CONFLICT uses this name:  reports_patient_session_unique
  indexes: [
    {
      unique: true,
      fields: ['patient_id', 'session_id'],
      name:   'reports_patient_session_unique',
    },
    {
      fields: ['patient_id', 'created_at'],
      name:   'reports_patient_id_created_idx',
    },
    {
      fields: ['threat_level'],
      name:   'reports_threat_level_idx',
    },
  ],
});

// ── Associations ─────────────────────────────────────────────────────────────
Report.associate = (models) => {
  Report.belongsTo(models.User, {
    foreignKey: 'patientId',
    as:         'patient',
  });
};

module.exports = Report;
