'use strict';
/**
 * Negotiation — Sequelize model (PostgreSQL)
 * Migrated from: Mongoose Negotiation.js
 */
const { DataTypes } = require('sequelize');
const sequelize = require('../db/sequelize');

const Negotiation = sequelize.define('Negotiation', {
  id: {
    type:         DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey:   true,
  },
  chatId: {
    type:      DataTypes.UUID,
    allowNull: false,
    field:     'chat_id',
  },
  doctorId: {
    type:      DataTypes.UUID,
    allowNull: false,
    field:     'doctor_id',
  },
  userId: {
    type:      DataTypes.UUID,
    allowNull: false,
    field:     'user_id',
  },
  date:   { type: DataTypes.STRING(20) },
  time:   { type: DataTypes.STRING(10) },
  amount: { type: DataTypes.DECIMAL(10, 2) },
  mode: {
    type:         DataTypes.STRING(10),
    defaultValue: 'VIDEO',
  },
  status: {
    type:         DataTypes.STRING(20),
    defaultValue: 'PENDING',
  },
  acceptedByDoctor: {
    type:         DataTypes.BOOLEAN,
    defaultValue: false,
    field:        'accepted_by_doctor',
  },
  acceptedByUser: {
    type:         DataTypes.BOOLEAN,
    defaultValue: false,
    field:        'accepted_by_user',
  },
}, {
  tableName:   'negotiations',
  underscored: true,
  indexes: [
    { fields: ['chat_id'],             name: 'negotiations_chat_idx' },
    { fields: ['doctor_id', 'status'], name: 'negotiations_doctor_status_idx' },
  ],
});

Negotiation.associate = (models) => {
  Negotiation.belongsTo(models.Chat,   { foreignKey: 'chatId',   as: 'chat' });
  Negotiation.belongsTo(models.Doctor, { foreignKey: 'doctorId', as: 'doctor' });
  Negotiation.belongsTo(models.User,   { foreignKey: 'userId',   as: 'user' });
};

module.exports = Negotiation;
