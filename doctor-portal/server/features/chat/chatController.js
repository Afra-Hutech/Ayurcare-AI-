'use strict';
const { fn, col, Op } = require('sequelize');
const { Chat, Message, Negotiation, Doctor, User, Appointment } = require('../../models');
const {
  parseNegotiationDateInput,
  syncAppointmentFromNegotiation,
} = require('./negotiationAppointmentSync');

const UUID_RE_CHAT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isValidUUID = (value) => UUID_RE_CHAT.test(String(value || ''));

const createHttpError = (message, statusCode) =>
  Object.assign(new Error(message), { statusCode });

const NEGOTIATION_MODE_LABELS = { VIDEO: 'Video Call', AUDIO: 'Audio Call', CHAT: 'Chat' };

const buildNegotiationMessageText = ({ amount, mode, date, time }) => {
  const dateText = new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  return `Consultation offer: ${NEGOTIATION_MODE_LABELS[mode] || mode} on ${dateText} at ${time} for Rs. ${amount}`;
};

const resolveDoctorConsultationFee = async (doctorId) => {
  if (!doctorId) return null;
  const doctor = await Doctor.findByPk(doctorId, { attributes: ['fees'] });
  const fee = Number(doctor?.fees);
  return Number.isFinite(fee) && fee >= 0 ? fee : null;
};

const isPopulatedNegotiation = (ref) => ref != null && typeof ref === 'object';

const serializeNegotiation = (negotiationDoc) => {
  if (!isPopulatedNegotiation(negotiationDoc)) return null;
  const n = negotiationDoc.toJSON ? negotiationDoc.toJSON() : { ...negotiationDoc };
  return {
    _id:             n.id,
    id:              n.id,
    chatId:          n.chatId,
    doctorId:        n.doctorId,
    userId:          n.userId,
    date:            n.date,
    time:            n.time,
    amount:          n.amount,
    mode:            n.mode,
    status:          n.status || 'PENDING',
    acceptedByDoctor: !!n.acceptedByDoctor,
    acceptedByUser:  !!n.acceptedByUser,
    createdAt:       n.createdAt,
    updatedAt:       n.updatedAt,
  };
};

const serializeMessage = (messageDoc) => {
  const m             = messageDoc.toJSON ? messageDoc.toJSON() : messageDoc;
  const negotiationDoc = m.negotiation || null;
  return {
    _id:           m.id,
    id:            m.id,
    chatId:        m.chatId,
    type:          m.type || 'TEXT',
    senderId:      m.senderId,
    senderRole:    m.senderRole,
    message:       m.message,
    negotiationId: negotiationDoc?.id || m.negotiationId || null,
    negotiation:   serializeNegotiation(negotiationDoc),
    timestamp:     m.timestamp,
    read:          m.read,
  };
};

const getRealtime = (req) => req.app.get('chatRealtime');

const emitAppointmentsUpdated = (req, chat) => {
  try {
    const realtime = getRealtime(req);
    if (!realtime) return;
    realtime.emitToRoom(String(chat.doctorId), 'appointments:updated', { chatId: String(chat.id) });
  } catch (_) { /* non-fatal */ }
};

const emitChatMessage = (req, chat, message) => {
  const realtime = getRealtime(req);
  if (!realtime) return;
  realtime.emitToRoom(realtime.buildRoomId(chat), 'message:new', serializeMessage(message));
  realtime.emitToRoom(String(chat.doctorId), 'chat:updated', { chatId: String(chat.id) });
  realtime.emitToRoom(String(chat.userId),   'chat:updated', { chatId: String(chat.id) });
};

const emitNegotiationUpdate = (req, chat, negotiation) => {
  try {
    const realtime = getRealtime(req);
    if (!realtime) return;
    const payload     = serializeNegotiation(negotiation);
    if (!payload) return;
    const chatRoom    = realtime.buildRoomId(chat);
    const doctorRoom  = String(chat.doctorId);
    const userRoom    = String(chat.userId);
    const chatUpdated = { chatId: String(chat.id) };
    realtime.emitToRoom(chatRoom,   'negotiation:update', payload);
    realtime.emitToRoom(doctorRoom, 'negotiation:update', payload);
    realtime.emitToRoom(userRoom,   'negotiation:update', payload);
    realtime.emitToRoom(doctorRoom, 'chat:updated', chatUpdated);
    realtime.emitToRoom(userRoom,   'chat:updated', chatUpdated);
  } catch (err) { console.warn('[chat] negotiation realtime emit failed:', err.message); }
};

const emitReadUpdate = (req, chat, readerRole) => {
  const realtime = getRealtime(req);
  if (!realtime) return;
  realtime.emitToRoom(realtime.buildRoomId(chat), 'message:read', { chatId: String(chat.id), readerRole });
};

const handleChatError = (res, error, fallbackMessage) => {
  console.error(`[chat] ${fallbackMessage}:`, error);
  if (error?.name === 'SequelizeUniqueConstraintError') {
    return res.status(409).json({ message: 'Only one active negotiation is allowed per chat' });
  }
  return res.status(error.statusCode || 500).json({ message: error.message || fallbackMessage });
};

// ── Actor resolution ─────────────────────────────────────────────────────────

const resolvePatientUser = async (authUserId) => {
  if (!isValidUUID(authUserId)) return null;
  return User.findByPk(authUserId, { attributes: ['id', 'name', 'email', 'profileImage'] });
};

const getActorContext = async (authUserId) => {
  if (!authUserId) throw createHttpError('Authentication required', 401);

  // Non-UUID IDs (e.g. patient tokens from bot-brain) cannot exist in Postgres
  if (!isValidUUID(authUserId)) {
    throw createHttpError('User not found. Please log out and sign in again.', 404);
  }

  const doctor = await Doctor.findOne({
    where:      { userId: authUserId },
    attributes: ['id', 'userId', 'name', 'profileImage'],
  });
  if (doctor) {
    return { authUserId: String(authUserId), actorRole: 'DOCTOR', actorId: doctor.id, doctorProfile: doctor };
  }

  const user = await resolvePatientUser(authUserId);
  if (!user) throw createHttpError('User not found. Please log out and sign in again.', 404);

  return { authUserId: String(authUserId), actorRole: 'USER', actorId: user.id, user };
};

const resolveDoctorIdentifier = async (doctorId) => {
  if (!doctorId)              throw createHttpError('doctorId is required', 400);
  if (!isValidUUID(doctorId)) throw createHttpError('Invalid doctorId format', 400);

  const byPk = await Doctor.findByPk(doctorId, { attributes: ['id', 'userId', 'name', 'profileImage'] });
  if (byPk) return byPk;

  const byUserId = await Doctor.findOne({ where: { userId: doctorId }, attributes: ['id', 'userId', 'name', 'profileImage'] });
  if (byUserId) return byUserId;

  throw createHttpError('Doctor not found', 404);
};

const resolveUserIdentifier = async (userId) => {
  if (!userId)              throw createHttpError('userId is required', 400);
  if (!isValidUUID(userId)) throw createHttpError('Invalid userId format', 400);
  const user = await User.findByPk(userId, { attributes: ['id', 'name', 'email'] });
  if (!user) throw createHttpError('User not found', 404);
  return user;
};

const validateDoctorUserRelationship = async ({ doctorId, userId, actorRole }) => {
  const hasAppt = await Appointment.count({ where: { doctorId, patientId: userId } }) > 0;
  if (hasAppt) return;
  const hasChat = await Chat.count({ where: { doctorId, userId } }) > 0;
  if (hasChat) return;
  if (actorRole === 'USER') return;
  throw Object.assign(new Error('Doctor-patient relationship not found'), { statusCode: 403 });
};

const createOrReuseChat = async (doctorId, userId) => {
  try {
    const [chat] = await Chat.upsert({ doctorId, userId }, { returning: true });
    return chat || await Chat.findOne({ where: { doctorId, userId } });
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      return Chat.findOne({ where: { doctorId, userId } });
    }
    throw err;
  }
};

const DOCTOR_INCLUDE = [
  { model: Doctor, as: 'doctor', attributes: ['id', 'userId', 'name', 'profileImage'] },
  { model: User,   as: 'user',   attributes: ['id', 'name',   'email', 'profileImage'] },
];

const ensureChatAccess = async (chatId, actor) => {
  const chat = await Chat.findByPk(chatId, { include: DOCTOR_INCLUDE });
  if (!chat) throw createHttpError('Chat not found', 404);
  const hasAccess = actor.actorRole === 'DOCTOR'
    ? chat.doctorId === actor.actorId
    : chat.userId   === actor.actorId;
  if (!hasAccess) throw createHttpError('Unauthorized chat access', 403);
  return chat;
};

const ensureNegotiationAccess = async (negotiationId, actor) => {
  const negotiation = await Negotiation.findByPk(negotiationId);
  if (!negotiation) throw createHttpError('Negotiation not found', 404);
  const hasAccess = actor.actorRole === 'DOCTOR'
    ? negotiation.doctorId === actor.actorId
    : negotiation.userId   === actor.actorId;
  if (!hasAccess) throw createHttpError('Unauthorized negotiation access', 403);
  return negotiation;
};

const ensureNoActiveNegotiation = async (chatId) => {
  const existing = await Negotiation.findOne({ where: { chatId, status: 'PENDING' }, attributes: ['id'] });
  if (existing) throw createHttpError('Only one active negotiation is allowed per chat', 409);
};

const mapChatSummary = async (chatDoc, actor, unreadCount = 0, realtime = null) => {
  const doctor = chatDoc.doctor;
  const user   = chatDoc.user;
  const isDoctorView     = actor.actorRole === 'DOCTOR';
  const counterpartName  = isDoctorView
    ? (user?.name || user?.email?.split('@')[0] || 'Patient')
    : (doctor?.name || 'Doctor');
  const counterpartUserId      = isDoctorView ? String(user?.id || '') : String(doctor?.userId || '');
  const counterpartProfileImage = isDoctorView ? (user?.profileImage || '') : (doctor?.profileImage || '');
  return {
    _id:                    chatDoc.id,
    id:                     chatDoc.id,
    doctorId:               String(doctor?.id || chatDoc.doctorId),
    userId:                 String(user?.id   || chatDoc.userId),
    participantName:        counterpartName,
    participantLabel:       isDoctorView ? 'USER' : 'DOCTOR',
    participantUserId:      counterpartUserId,
    participantProfileImage: counterpartProfileImage,
    participantIsOnline:    realtime ? realtime.isUserOnline(counterpartUserId) : false,
    lastMessage:            chatDoc.lastMessage || '',
    unreadCount,
    createdAt:              chatDoc.createdAt,
    updatedAt:              chatDoc.updatedAt,
  };
};

// ── Route handlers ───────────────────────────────────────────────────────────

const initiateChat = async (req, res) => {
  try {
    const actor          = await getActorContext(req.userId);
    const doctorProfile  = actor.actorRole === 'DOCTOR' ? actor.doctorProfile : await resolveDoctorIdentifier(req.body.doctorId);
    const user           = actor.actorRole === 'USER'   ? actor.user          : await resolveUserIdentifier(req.body.userId);
    const doctorId = doctorProfile.id;
    const userId   = user.id;
    if (!doctorId || !userId) return res.status(400).json({ message: 'doctorId and userId are required' });

    await validateDoctorUserRelationship({ doctorId, userId, actorRole: actor.actorRole });
    const chatDoc      = await createOrReuseChat(doctorId, userId);
    if (!chatDoc) throw createHttpError('Unable to create or locate chat', 500);
    const hydratedChat = await Chat.findByPk(chatDoc.id, { include: DOCTOR_INCLUDE });
    const summary      = await mapChatSummary(hydratedChat, actor, 0, getRealtime(req));
    res.json(summary);
  } catch (error) { handleChatError(res, error, 'Failed to initiate chat'); }
};

const listChats = async (req, res) => {
  try {
    const actor = await getActorContext(req.userId);
    const where = actor.actorRole === 'DOCTOR' ? { doctorId: actor.actorId } : { userId: actor.actorId };


    const chats = await Chat.findAll({ where, order: [['updated_at','DESC']], include: DOCTOR_INCLUDE });

    const unreadRows = await Message.findAll({
      where: {
        chatId:     { [Op.in]: chats.map((c) => c.id) },
        read:       false,
        senderRole: actor.actorRole === 'DOCTOR' ? 'USER' : 'DOCTOR',
      },
      attributes: ['chatId', [fn('COUNT', col('id')), 'count']],
      group:      ['chatId'],
      raw:        true,
    });
    const unreadMap = new Map(unreadRows.map((r) => [r.chatId, Number(r.count)]));
    const realtime  = getRealtime(req);
    const payload   = await Promise.all(chats.map((c) => mapChatSummary(c, actor, unreadMap.get(c.id) || 0, realtime)));
    res.json(payload);
  } catch (error) {
    // Non-UUID patient or user not in Postgres → return empty list, not an error
    if (error.statusCode === 404 || error.statusCode === 401) return res.json([]);
    handleChatError(res, error, 'Failed to list chats');
  }
};

const getMessages = async (req, res) => {
  try {
    const actor    = await getActorContext(req.userId);
    const chat     = await ensureChatAccess(req.params.chatId, actor);
    const messages = await Message.findAll({
      where:   { chatId: chat.id },
      order:   [['timestamp','ASC']],
      include: [{ model: Negotiation, as: 'negotiation' }],
    });
    res.json(messages.map(serializeMessage));
  } catch (error) { handleChatError(res, error, 'Failed to load messages'); }
};

const markChatAsRead = async (req, res) => {
  try {
    const actor = await getActorContext(req.userId);
    const chat  = await ensureChatAccess(req.params.chatId, actor);
    await Message.update(
      { read: true },
      { where: { chatId: chat.id, senderRole: actor.actorRole === 'DOCTOR' ? 'USER' : 'DOCTOR', read: false } },
    );
    emitReadUpdate(req, chat, actor.actorRole);
    res.json({ success: true });
  } catch (error) { handleChatError(res, error, 'Failed to update read status'); }
};

const sendMessage = async (req, res) => {
  try {
    const actor = await getActorContext(req.userId);
    const text  = String(req.body.message || '').trim();
    if (!text) return res.status(400).json({ message: 'message is required' });

    let chat = null;
    if (req.body.chatId) {
      chat = await ensureChatAccess(req.body.chatId, actor);
    } else {
      const doctorProfile = actor.actorRole === 'DOCTOR' ? actor.doctorProfile : await resolveDoctorIdentifier(req.body.doctorId);
      const user          = actor.actorRole === 'USER'   ? actor.user          : await resolveUserIdentifier(req.body.userId);
      const doctorId = doctorProfile.id; const userId = user.id;
      if (!doctorId || !userId) return res.status(400).json({ message: 'chatId or doctorId/userId is required' });
      await validateDoctorUserRelationship({ doctorId, userId, actorRole: actor.actorRole });
      const chatDoc = await createOrReuseChat(doctorId, userId);
      if (!chatDoc) throw createHttpError('Unable to create or locate chat', 500);
      chat = await Chat.findByPk(chatDoc.id, { include: DOCTOR_INCLUDE });
    }

    const now     = new Date();
    const message = await Message.create({
      chatId: chat.id, type: 'TEXT', senderId: actor.actorId,
      senderRole: actor.actorRole, message: text, timestamp: now, read: false,
    });
    await Chat.update({ lastMessage: text }, { where: { id: chat.id } });
    emitChatMessage(req, chat, message);
    res.status(201).json(serializeMessage(message));
  } catch (error) { handleChatError(res, error, 'Failed to send message'); }
};

const createNegotiation = async (req, res) => {
  try {
    const actor    = await getActorContext(req.userId);
    const chat     = await ensureChatAccess(req.body.chatId, actor);
    const { date, time, mode } = req.body;
    const parsedDate   = parseNegotiationDateInput(date);
    const doctorId     = chat.doctorId;
    const parsedAmount = await resolveDoctorConsultationFee(doctorId);

    if (!parsedDate || Number.isNaN(parsedDate.getTime())) return res.status(400).json({ message: 'A valid date is required' });
    if (!String(time||'').trim())   return res.status(400).json({ message: 'time is required' });
    if (parsedAmount == null)       return res.status(400).json({ message: 'Doctor has not set a consultation fee in their profile.' });
    if (!['VIDEO','AUDIO','CHAT'].includes(mode)) return res.status(400).json({ message: 'mode must be VIDEO, AUDIO, or CHAT' });

    await ensureNoActiveNegotiation(chat.id);

    const dateStr     = parsedDate.toISOString().slice(0, 10);
    const now         = new Date();
    const negotiation = await Negotiation.create({
      chatId: chat.id, doctorId: chat.doctorId, userId: chat.userId,
      date: dateStr, time: String(time).trim(), amount: parsedAmount,
      mode, status: 'PENDING', acceptedByDoctor: false, acceptedByUser: false,
    });

    const messageText = buildNegotiationMessageText({ amount: parsedAmount, mode, date: parsedDate, time: String(time).trim() });
    const message = await Message.create({
      chatId: chat.id, type: 'NEGOTIATION', senderId: actor.actorId,
      senderRole: actor.actorRole, message: messageText,
      negotiationId: negotiation.id, timestamp: now, read: false,
    });
    await Chat.update({ lastMessage: messageText }, { where: { id: chat.id } });

    const hydrated = await Message.findByPk(message.id, { include: [{ model: Negotiation, as: 'negotiation' }] });
    emitChatMessage(req, chat, hydrated);
    res.status(201).json(serializeMessage(hydrated));
  } catch (error) { handleChatError(res, error, 'Failed to create negotiation'); }
};

const acceptNegotiation = async (req, res) => {
  try {
    const actor       = await getActorContext(req.userId);
    const negotiation = await ensureNegotiationAccess(req.params.negotiationId, actor);
    const chat        = await ensureChatAccess(negotiation.chatId, actor);

    if (negotiation.status === 'LOCKED') {
      try { await syncAppointmentFromNegotiation(negotiation); emitAppointmentsUpdated(req, chat); } catch (e) { console.warn('[chat] appointment sync (locked) failed:', e.message); }
      return res.json(serializeNegotiation(negotiation));
    }

    const alreadyAccepted = actor.actorRole === 'DOCTOR' ? negotiation.acceptedByDoctor : negotiation.acceptedByUser;
    if (!alreadyAccepted) {
      if (actor.actorRole === 'DOCTOR') negotiation.acceptedByDoctor = true;
      else                              negotiation.acceptedByUser   = true;

      if (negotiation.acceptedByDoctor && negotiation.acceptedByUser) {
        negotiation.status = 'LOCKED';
        await negotiation.save();
        try { await syncAppointmentFromNegotiation(negotiation); emitAppointmentsUpdated(req, chat); } catch (e) { console.warn('[chat] appointment sync failed:', e.message); }
      } else {
        await negotiation.save();
      }
      emitNegotiationUpdate(req, chat, negotiation);
    }
    res.json(serializeNegotiation(negotiation));
  } catch (error) { handleChatError(res, error, 'Failed to accept negotiation'); }
};

const counterNegotiation = async (req, res) => {
  try {
    const actor          = await getActorContext(req.userId);
    const oldNegotiation = await ensureNegotiationAccess(req.params.negotiationId, actor);
    const chat           = await ensureChatAccess(oldNegotiation.chatId, actor);
    const { date, time, mode } = req.body;

    if (oldNegotiation.status !== 'PENDING') return res.status(400).json({ message: 'Only pending negotiations can be countered.' });

    const parsedDate   = parseNegotiationDateInput(date);
    const parsedAmount = await resolveDoctorConsultationFee(chat.doctorId);

    if (!parsedDate || Number.isNaN(parsedDate.getTime())) return res.status(400).json({ message: 'A valid date is required' });
    if (!String(time||'').trim())   return res.status(400).json({ message: 'time is required' });
    if (parsedAmount == null)       return res.status(400).json({ message: 'Doctor has not set a consultation fee in their profile.' });
    if (!['VIDEO','AUDIO','CHAT'].includes(mode)) return res.status(400).json({ message: 'mode must be VIDEO, AUDIO, or CHAT' });

    oldNegotiation.status = 'COUNTERED';
    await oldNegotiation.save();
    emitNegotiationUpdate(req, chat, oldNegotiation);

    const dateStr        = parsedDate.toISOString().slice(0, 10);
    const now            = new Date();
    const newNegotiation = await Negotiation.create({
      chatId: chat.id, doctorId: chat.doctorId, userId: chat.userId,
      date: dateStr, time: String(time).trim(), amount: parsedAmount,
      mode, status: 'PENDING', acceptedByDoctor: false, acceptedByUser: false,
    });

    const messageText = buildNegotiationMessageText({ amount: parsedAmount, mode, date: parsedDate, time: String(time).trim() });
    const message = await Message.create({
      chatId: chat.id, type: 'NEGOTIATION', senderId: actor.actorId,
      senderRole: actor.actorRole, message: messageText,
      negotiationId: newNegotiation.id, timestamp: now, read: false,
    });
    await Chat.update({ lastMessage: messageText }, { where: { id: chat.id } });

    const hydrated = await Message.findByPk(message.id, { include: [{ model: Negotiation, as: 'negotiation' }] });
    emitChatMessage(req, chat, hydrated);
    res.status(201).json({ oldNegotiation: serializeNegotiation(oldNegotiation), newMessage: serializeMessage(hydrated) });
  } catch (error) { handleChatError(res, error, 'Failed to counter negotiation'); }
};

const deleteChat = async (req, res) => {
  try {
    const actor = await getActorContext(req.userId);
    const chat  = await ensureChatAccess(req.params.chatId, actor);

    await Message.destroy(    { where: { chatId: chat.id } });
    await Negotiation.destroy({ where: { chatId: chat.id } });
    await Chat.destroy(       { where: { id:     chat.id } });

    const realtime = getRealtime(req);
    if (realtime) {
      realtime.emitToRoom(String(chat.doctorId), 'chat:deleted', { chatId: String(chat.id) });
      realtime.emitToRoom(String(chat.userId),   'chat:deleted', { chatId: String(chat.id) });
    }
    res.json({ success: true });
  } catch (error) { handleChatError(res, error, 'Failed to delete chat'); }
};

module.exports = {
  getActorContext,
  ensureChatAccess,
  initiateChat,
  listChats,
  getMessages,
  markChatAsRead,
  sendMessage,
  createNegotiation,
  acceptNegotiation,
  counterNegotiation,
  deleteChat,
};
