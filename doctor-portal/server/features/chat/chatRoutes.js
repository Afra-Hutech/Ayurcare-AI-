const express = require('express');
const {
  initiateChat,
  listChats,
  getMessages,
  sendMessage,
  markChatAsRead,
  createNegotiation,
  acceptNegotiation,
  counterNegotiation,
  deleteChat,
} = require('./chatController');

const router = express.Router();

router.post('/initiate', initiateChat);
router.get('/list', listChats);
router.get('/:chatId/messages', getMessages);
router.delete('/:chatId', deleteChat);
router.patch('/:chatId/read', markChatAsRead);
router.post('/messages', sendMessage);
router.post('/negotiations', createNegotiation);
router.post('/negotiations/:negotiationId/accept', acceptNegotiation);
router.post('/negotiations/:negotiationId/counter', counterNegotiation);

module.exports = router;
