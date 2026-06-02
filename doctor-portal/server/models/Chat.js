'use strict';
/**
 * Chat — Sequelize model (PostgreSQL)
 * Migrated from: Mongoose Chat.js
 */
const { DataTypes } = require('sequelize');
const sequelize = require('../db/sequelize');

const Chat = sequelize.define('Chat', {
  id: {
    type:         DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey:   true,
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
  lastMessage: {
    type:         DataTypes.TEXT,
    defaultValue: '',
    field:        'last_message',
  },
}, {
  tableName:   'chats',
  underscored: true,
  indexes: [
    { unique: true, fields: ['doctor_id', 'user_id'], name: 'chats_doctor_user_unique' },
    { fields: ['updated_at'], name: 'chats_updated_at_idx' },
  ],
});

Chat.associate = (models) => {
  Chat.belongsTo(models.Doctor,    { foreignKey: 'doctorId', as: 'doctor' });
  Chat.belongsTo(models.User,      { foreignKey: 'userId',   as: 'user' });
  Chat.hasMany(models.Message,     { foreignKey: 'chatId',   as: 'messages' });
  Chat.hasMany(models.Negotiation, { foreignKey: 'chatId',   as: 'negotiations' });
};

module.exports = Chat;
