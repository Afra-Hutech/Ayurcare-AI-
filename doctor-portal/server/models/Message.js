'use strict';
/**
 * Message — Sequelize model (PostgreSQL)
 * Migrated from: Mongoose Message.js
 */
const { DataTypes } = require('sequelize');
const sequelize = require('../db/sequelize');

const Message = sequelize.define('Message', {
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
  type: {
    type:         DataTypes.STRING(20),
    defaultValue: 'TEXT',
  },
  senderId: {
    type:      DataTypes.UUID,
    allowNull: false,
    field:     'sender_id',
  },
  senderRole: {
    type:      DataTypes.STRING(20),
    allowNull: false,
    field:     'sender_role',
  },
  message: { type: DataTypes.TEXT },
  negotiationId: {
    type:  DataTypes.UUID,
    field: 'negotiation_id',
  },
  timestamp: {
    type:         DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  read: {
    type:         DataTypes.BOOLEAN,
    defaultValue: false,
  },
}, {
  tableName:   'messages',
  underscored: true,
  indexes: [
    { fields: ['chat_id', 'timestamp'], name: 'messages_chat_ts_idx' },
    { fields: ['chat_id', 'read'],      name: 'messages_chat_read_idx' },
  ],
});

Message.associate = (models) => {
  Message.belongsTo(models.Chat,        { foreignKey: 'chatId',        as: 'chat' });
  Message.belongsTo(models.Negotiation, { foreignKey: 'negotiationId', as: 'negotiation' });
};

module.exports = Message;
