'use strict';
/**
 * User — Sequelize model (PostgreSQL)
 * Replaces: Mongoose User.js
 *
 * Key changes:
 *   - Password stored in `password_hash` column (no virtual field)
 *   - Email normalisation (trim + toLowerCase) moved into a Sequelize setter,
 *     which means it fires on every write — equivalent to the Mongoose pre('save')
 *   - comparePassword preserved as an instance method
 *   - hashAndCreate() static replaces `new User({password}).save()`
 */
const { DataTypes } = require('sequelize');
const bcrypt = require('bcryptjs');
const sequelize = require('../db/sequelize');

const User = sequelize.define('User', {
  id: {
    type:         DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey:   true,
  },

  // Normalised to lowercase on write via custom setter
  email: {
    type:      DataTypes.STRING(320),
    allowNull: false,
    unique:    true,
    validate: {
      notNull:  { msg: 'email is required' },
      isEmail:  { msg: 'must be a valid email address' },
      notEmpty: true,
    },
    // Mirrors: String(email || '').trim().toLowerCase() in authController
    set(raw) {
      this.setDataValue('email', String(raw || '').trim().toLowerCase());
    },
  },

  // bcrypt hash stored directly — no Mongoose virtual `password` field
  passwordHash: {
    type:      DataTypes.STRING(255),
    allowNull: false,
    field:     'password_hash',
  },

  name:         { type: DataTypes.STRING(255) },
  age:          { type: DataTypes.SMALLINT, validate: { min: 0, max: 150 } },
  gender:       { type: DataTypes.STRING(20) },
  height:       { type: DataTypes.DECIMAL(5, 2) },
  weight:       { type: DataTypes.DECIMAL(5, 2) },
  phone:        { type: DataTypes.STRING(25) },
  address:      { type: DataTypes.TEXT },
  profileImage: { type: DataTypes.STRING(1000), field: 'profile_image' },

  role: {
    type:         DataTypes.STRING(20),
    defaultValue: 'patient',
    validate: {
      isIn: {
        args: [['patient', 'doctor', 'admin']],
        msg:  'role must be patient, doctor, or admin',
      },
    },
  },

  isOnboarded: {
    type:         DataTypes.BOOLEAN,
    defaultValue: false,
    field:        'is_onboarded',
  },

  resetTokenHash:    { type: DataTypes.STRING(255), field: 'reset_token_hash' },
  resetTokenExpires: { type: DataTypes.DATE,        field: 'reset_token_expires' },
}, {
  tableName:   'users',
  underscored: true,

  // Exclude password_hash from all default JSON serialisations
  defaultScope: {
    attributes: { exclude: ['passwordHash'] },
  },
  scopes: {
    withPassword: { attributes: { include: ['passwordHash'] } },
  },
});

// ── Instance method: comparePassword ─────────────────────────────────────────
// Replaces: userSchema.methods.comparePassword
User.prototype.comparePassword = async function (plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

// ── Static: hashAndCreate ─────────────────────────────────────────────────────
// Replaces:  const user = new User({ email, password, name }); await user.save();
// Usage:     const user = await User.hashAndCreate({ email, password, name });
User.hashAndCreate = async (attrs) => {
  const { password, ...rest } = attrs;
  const passwordHash = await bcrypt.hash(password, 12);
  return User.create({ ...rest, passwordHash });
};

User.associate = (models) => {
  User.hasOne(models.Doctor,  { foreignKey: 'userId', as: 'doctorProfile' });
  User.hasMany(models.Report, { foreignKey: 'patientId', as: 'reports' });
};

module.exports = User;
