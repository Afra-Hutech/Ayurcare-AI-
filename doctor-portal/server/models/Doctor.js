'use strict';
/**
 * Doctor — Sequelize model (PostgreSQL)
 * Migrated from: Mongoose Doctor.js (nested sub-documents flattened to columns)
 *
 * Mongoose sub-documents (basicInfo, professionalInfo, clinicInfo, availability)
 * are flattened into a single table — the nesting was purely organizational,
 * not structural.  Geospatial: longitude/latitude columns replace the
 * GeoJSON { type: 'Point', coordinates: [lng, lat] } document.
 */
const { DataTypes } = require('sequelize');
const sequelize = require('../db/sequelize');

const Doctor = sequelize.define('Doctor', {
  id: {
    type:         DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey:   true,
  },

  // ── Auth link ─────────────────────────────────────────────────────────────
  // Replaces: userId: { type: ObjectId, ref: 'User', required: true, unique: true }
  userId: {
    type:      DataTypes.UUID,
    allowNull: false,
    unique:    true,
    field:     'user_id',
    validate: { notNull: true, isUUID: 4 },
  },

  // ── basicInfo (flattened) ─────────────────────────────────────────────────
  name: {
    type:      DataTypes.STRING(255),
    allowNull: false,
    validate:  { notNull: true, notEmpty: true },
  },
  age:          { type: DataTypes.SMALLINT },
  gender:       { type: DataTypes.STRING(20) },
  phone:        { type: DataTypes.STRING(25) },
  email:        { type: DataTypes.STRING(320) },
  profileImage: { type: DataTypes.STRING(1000), field: 'profile_image' },

  // ── professionalInfo (flattened) ──────────────────────────────────────────
  qualification: { type: DataTypes.STRING(255) },
  specialization:{ type: DataTypes.STRING(255) },
  experience:    { type: DataTypes.SMALLINT },
  // Replaces: treatments: [String]  — PostgreSQL native TEXT[]
  treatments: {
    type:         DataTypes.ARRAY(DataTypes.TEXT),
    defaultValue: [],
  },

  // ── clinicInfo (flattened) ────────────────────────────────────────────────
  clinicName: { type: DataTypes.STRING(255), field: 'clinic_name' },
  address:    { type: DataTypes.TEXT },
  city:       { type: DataTypes.STRING(100) },
  state:      { type: DataTypes.STRING(100) },
  pincode:    { type: DataTypes.STRING(20) },

  // ── availability (flattened) ──────────────────────────────────────────────
  timings:   { type: DataTypes.STRING(255) },
  fees:      { type: DataTypes.DECIMAL(10, 2) },
  languages: {
    type:         DataTypes.ARRAY(DataTypes.TEXT),
    defaultValue: [],
  },

  // ── Geospatial (replaces GeoJSON sub-document) ────────────────────────────
  // GeoJSON: coordinates: [longitude, latitude]
  longitude: { type: DataTypes.DECIMAL(11, 7) },
  latitude:  { type: DataTypes.DECIMAL(10, 7) },

  // ── Operational state ─────────────────────────────────────────────────────
  // Replaces: status: { type: String, enum: [...], default: 'available' }
  status: {
    type:         DataTypes.STRING(20),
    defaultValue: 'available',
    validate: {
      isIn: {
        args: [['available', 'busy', 'unavailable']],
        msg:  'status must be available, busy, or unavailable',
      },
    },
  },

  onLeave: {
    type:         DataTypes.BOOLEAN,
    defaultValue: false,
    field:        'on_leave',
  },
}, {
  tableName:   'doctors',
  underscored: true,
  indexes: [
    { fields: ['city'],           name: 'doctors_city_idx' },
    { fields: ['specialization'], name: 'doctors_specialization_idx' },
    { fields: ['status'],         name: 'doctors_status_idx' },
  ],
});

Doctor.associate = (models) => {
  Doctor.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
};

module.exports = Doctor;
