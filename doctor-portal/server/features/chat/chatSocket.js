const jwt = require('jsonwebtoken');
const { getActorContext, ensureChatAccess } = require('./chatController');

const getEntityId = (value) => String(value?.id || value?._id || value);
const roomIdFor = (chat) => `${getEntityId(chat.doctorId)}_${getEntityId(chat.userId)}`;

const registerChatSocket = ({ io, jwtSecret }) => {
  const fallbackSecrets = [
    'doctor_portal_secret_key_123',
    'doctor_portal_secure_key_123',
    'ayurcare_secret_2025',
  ].filter((secret) => secret && secret !== jwtSecret);
  const onlineUsers = new Map();

  const incrementOnline = (userId) => {
    const key = String(userId);
    onlineUsers.set(key, (onlineUsers.get(key) || 0) + 1);
  };

  const decrementOnline = (userId) => {
    const key = String(userId);
    const next = (onlineUsers.get(key) || 1) - 1;
    if (next <= 0) {
      onlineUsers.delete(key);
      return;
    }
    onlineUsers.set(key, next);
  };

  io.use(async (socket, next) => {
    try {
      const rawToken = socket.handshake.auth?.token
        || socket.handshake.headers?.authorization?.split(' ')[1];

      if (!rawToken) {
        return next(new Error('Authentication required'));
      }

      let decoded;
      try {
        decoded = jwt.verify(rawToken, jwtSecret);
      } catch (primaryError) {
        let verified = false;
        for (const fallbackSecret of fallbackSecrets) {
          try {
            decoded = jwt.verify(rawToken, fallbackSecret);
            verified = true;
            break;
          } catch (_fallbackError) {
            // try next fallback
          }
        }

        if (!verified) {
          throw primaryError;
        }
      }

      const actor = await getActorContext(decoded.userId || decoded.sub);
      socket.data.actor = actor;
      socket.data.joinedRooms = new Set();
      incrementOnline(actor.authUserId);
      next();
    } catch (error) {
      next(new Error('Invalid socket token'));
    }
  });

  io.on('connection', (socket) => {
    const actor = socket.data.actor;
    socket.join(String(actor.actorId)); // Join personal global room for dynamic new chat alerts

    socket.on('chat:join', async ({ chatId }, ack = () => {}) => {
      try {
        const chat = await ensureChatAccess(chatId, actor);
        const roomId = roomIdFor(chat);
        socket.join(roomId);
        socket.data.joinedRooms.add(roomId);

        io.to(roomId).emit('presence:update', {
          chatId: String(chat.id || chat._id),
          userId: actor.authUserId,
          isOnline: true,
        });

        ack({ ok: true, roomId });
      } catch (error) {
        ack({ ok: false, message: error.message });
      }
    });

    socket.on('typing:update', async ({ chatId, isTyping }, ack = () => {}) => {
      try {
        const chat = await ensureChatAccess(chatId, actor);
        io.to(roomIdFor(chat)).emit('typing:update', {
          chatId: String(chat.id || chat._id),
          senderRole: actor.actorRole,
          isTyping: !!isTyping,
        });
        ack({ ok: true });
      } catch (error) {
        ack({ ok: false, message: error.message });
      }
    });

    socket.on('disconnect', () => {
      decrementOnline(actor.authUserId);
      for (const roomId of socket.data.joinedRooms || []) {
        io.to(roomId).emit('presence:update', {
          userId: actor.authUserId,
          isOnline: false,
        });
      }
    });
  });

  return {
    buildRoomId: roomIdFor,
    emitToRoom: (roomId, eventName, payload) => io.to(roomId).emit(eventName, payload),
    isUserOnline: (userId) => onlineUsers.has(String(userId)),
  };
};

module.exports = { registerChatSocket };
