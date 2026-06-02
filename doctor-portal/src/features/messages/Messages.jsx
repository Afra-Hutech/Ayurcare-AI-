import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  CalendarDays,
  Circle,
  Clock3,
  Handshake,
  IndianRupee,
  Loader2,
  MessageCircleMore,
  MessageSquare,
  PhoneCall,
  Plus,
  Send,
  UserRound,
  Video,
  Trash2,
  Check,
} from 'lucide-react';
import Sidebar from '../../components/ui/Sidebar';
import Navbar from '../../components/ui/Navbar';
import { doctorChatService, doctorService } from '../../services/api';
import { toLocalDateKey } from '../../utils/appointments';
import { createDoctorPortalChatSocket } from '../chat/socketService';
import AvailabilityScheduler from '../registry/components/AvailabilityScheduler';

const MODE_OPTIONS = ['VIDEO', 'AUDIO', 'CHAT'];

const MODE_META = {
  VIDEO: { label: 'Video Call', icon: Video },
  AUDIO: { label: 'Audio Call', icon: PhoneCall },
  CHAT: { label: 'Chat', icon: MessageCircleMore },
};

const createOfferDraft = () => ({
  date: toLocalDateKey(),
  time: '',
  amount: '',
  mode: 'VIDEO',
  duration: 30,
});

const upsertMessageList = (messages, nextMessage) => {
  if (!nextMessage?._id) return messages;
  const existingIndex = messages.findIndex((item) => item._id === nextMessage._id);
  if (existingIndex === -1) {
    return [...messages, nextMessage].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  }

  const nextMessages = [...messages];
  nextMessages[existingIndex] = { ...nextMessages[existingIndex], ...nextMessage };
  return nextMessages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
};

const chatStorageKey = (chatId) => String(chatId || '');

const updateNegotiationInMessages = (messages, negotiation) => messages.map((message) => (
  String(message.negotiationId || message.negotiation?._id || '') === String(negotiation?._id || '')
    ? { ...message, negotiationId: negotiation._id, negotiation }
    : message
));

const formatMoney = (amount) => new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
}).format(amount || 0);

const formatOfferDate = (value) => new Date(value).toLocaleDateString('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

const NegotiationCard = ({ message, currentRole, onAccept, onCounter, acceptingId }) => {
  const negotiation = message.negotiation;
  if (!negotiation?._id) return null;

  const modeMeta = MODE_META[negotiation?.mode] || MODE_META.CHAT;
  const ModeIcon = modeMeta.icon;
  const status = negotiation?.status || 'PENDING';
  const bothAccepted = !!negotiation?.acceptedByDoctor && !!negotiation?.acceptedByUser;
  const isLocked = status === 'LOCKED' || status === 'ACCEPTED' || bothAccepted;
  const isCountered = status === 'COUNTERED';
  const didAccept = currentRole === 'DOCTOR' ? !!negotiation?.acceptedByDoctor : !!negotiation?.acceptedByUser;
  const otherAccepted = currentRole === 'DOCTOR' ? !!negotiation?.acceptedByUser : !!negotiation?.acceptedByDoctor;
  const canAct = !isLocked && !isCountered && !didAccept;
  const isAccepting = acceptingId === negotiation?._id;

  return (
    <div className="w-full max-w-[340px] rounded-2xl border border-[var(--practo-border)] bg-[var(--practo-white)] p-3.5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-primary-600 dark:text-[#14bef0]">
            <Handshake size={13} />
            <span>Consultation Offer</span>
          </div>
          <p className="mt-1 text-xs font-medium text-[var(--practo-text-light)] line-clamp-2">
            {message.senderRole === currentRole ? 'You proposed consultation terms.' : 'Patient proposed consultation terms.'}
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider shrink-0 ${
          isLocked ? 'bg-primary-600 text-white' : 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200'
        }`}>
          {isLocked ? 'LOCKED' : (negotiation?.status || 'PENDING')}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-[var(--practo-text)]">
        <div className="rounded-xl bg-[var(--practo-bg)] px-2.5 py-2 border border-[var(--practo-border)]">
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-[var(--practo-text-light)]"><CalendarDays size={12} /> Date</div>
          <div className="mt-1 text-xs font-bold text-[var(--practo-text)]">{formatOfferDate(negotiation?.date)}</div>
        </div>
        <div className="rounded-xl bg-[var(--practo-bg)] px-2.5 py-2 border border-[var(--practo-border)]">
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-[var(--practo-text-light)]"><Clock3 size={12} /> Time</div>
          <div className="mt-1 text-xs font-bold text-[var(--practo-text)]">{negotiation?.time}</div>
        </div>
        <div className="rounded-xl bg-[var(--practo-bg)] px-2.5 py-2 border border-[var(--practo-border)]">
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-[var(--practo-text-light)]"><IndianRupee size={12} /> Amount</div>
          <div className="mt-1 text-xs font-bold text-[var(--practo-text)]">{formatMoney(negotiation?.amount)}</div>
        </div>
        <div className="rounded-xl bg-[var(--practo-bg)] px-2.5 py-2 border border-[var(--practo-border)]">
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-[var(--practo-text-light)]"><ModeIcon size={12} /> Mode</div>
          <div className="mt-1 text-xs font-bold text-[var(--practo-text)] truncate" title={modeMeta.label}>{modeMeta.label}</div>
        </div>
      </div>

      {isLocked ? (
        <p className="mt-2.5 text-xs font-semibold text-primary-600 dark:text-[#14bef0]">Deal confirmed. Consultation terms are locked.</p>
      ) : didAccept ? (
        <p className="mt-2.5 text-xs text-[var(--practo-text-light)]">Waiting for other party…</p>
      ) : otherAccepted ? (
        <p className="mt-2.5 text-xs font-semibold text-primary-600 dark:text-[#14bef0]">Other party accepted — accept or counter</p>
      ) : (
        <p className="mt-2.5 text-xs text-[var(--practo-text-light)]">Accept to lock schedule &amp; terms</p>
      )}

      <div className="mt-2.5">
        {isLocked ? (
          <div className="rounded-xl bg-primary-600 px-3 py-2 text-center text-xs font-bold text-white">
            Deal Confirmed
          </div>
        ) : canAct ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onAccept(negotiation._id)}
              disabled={isAccepting}
              className="flex-1 rounded-xl bg-primary-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-primary-700 disabled:bg-[var(--practo-border)] disabled:text-[var(--practo-text-light)]"
            >
              {isAccepting ? 'Accepting…' : 'Accept'}
            </button>
            <button
              onClick={() => onCounter(negotiation)}
              disabled={isAccepting}
              className="flex-1 rounded-xl bg-[var(--practo-bg)] border border-[var(--practo-border)] px-3 py-2 text-xs font-bold text-[var(--practo-text)] transition hover:opacity-90 disabled:opacity-50"
            >
              Counter
            </button>
          </div>
        ) : (
          <div className="rounded-xl bg-[var(--practo-bg)] border border-[var(--practo-border)] px-3 py-2 text-center text-xs font-semibold text-[var(--practo-text-light)]">
            {isCountered ? 'This deal was countered.' : bothAccepted ? 'Deal confirmed.' : 'Waiting for other party…'}
          </div>
        )}
      </div>
    </div>
  );
};

const Messages = () => {
  const { chatId: routeChatId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = localStorage.getItem('token');
  const socketRef = useRef(null);
  const bottomRef = useRef(null);
  const offerPanelRef = useRef(null);
  const offerAnchorRef = useRef(null);
  const offerScrollRef = useRef(null);
  const [offerPanelPos, setOfferPanelPos] = useState({
    left: 16,
    bottom: 96,
    width: 400,
    maxHeight: 400,
  });
  const activeChatIdRef = useRef(null);
  const loadMessagesRef = useRef(null);

  const [chats, setChats] = useState([]);
  const [messagesByChat, setMessagesByChat] = useState({});
  const [loadingChats, setLoadingChats] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [input, setInput] = useState('');
  const [isUserTyping, setIsUserTyping] = useState(false);
  const [isOfferOpen, setIsOfferOpen] = useState(false);
  const [offerDraft, setOfferDraft] = useState(createOfferDraft());
  const [offerSending, setOfferSending] = useState(false);
  const [acceptingNegotiationId, setAcceptingNegotiationId] = useState('');
  const [counteringNegotiationId, setCounteringNegotiationId] = useState('');
  const [doctorData, setDoctorData] = useState(null);
  const [appointments, setAppointments] = useState([]);

  const activeChatId = routeChatId || chats[0]?._id || null;
  const activeChat = useMemo(() => chats.find((chat) => chat._id === activeChatId) || null, [chats, activeChatId]);
  const activeMessages = messagesByChat[chatStorageKey(activeChatId)] || [];

  const loadChats = async (preferredChatId = null) => {
    setLoadingChats(true);
    try {
      const nextChats = await doctorChatService.listChats();
      setChats(nextChats);
      const targetId = preferredChatId || routeChatId || nextChats[0]?._id;
      if (targetId && targetId !== routeChatId) {
        navigate(`/messages/${targetId}`, { replace: true });
      }
    } catch (error) {
      console.error('Failed to load doctor chats:', error);
    } finally {
      setLoadingChats(false);
    }
  };

  const fetchDoctorData = async () => {
    try {
      const [profile, apts] = await Promise.all([
        doctorService.getProfile(),
        doctorService.getAppointments()
      ]);
      setDoctorData(profile);
      setAppointments(apts);
    } catch (err) {
      console.error('Failed to load availability data for negotiation', err);
    }
  };

  useEffect(() => {
    loadChats();
    fetchDoctorData();
  }, []);

  useEffect(() => {
    const userId = searchParams.get('userId');
    if (!userId) return;

    const run = async () => {
      try {
        const chat = await doctorChatService.initiateChat({ userId });
        await loadChats(chat?._id);
        if (chat?._id) {
          navigate(`/messages/${chat._id}`, { replace: true });
        }
      } catch (error) {
        console.error('Failed to initiate patient chat:', error);
      }
    };

    run();
  }, [searchParams]);

  const loadMessages = async (chatIdOverride) => {
    const chatId = chatIdOverride || activeChatIdRef.current;
    const storageKey = chatStorageKey(chatId);
    if (!storageKey) return;
    setLoadingMessages(true);
    try {
      const nextMessages = await doctorChatService.getMessages(chatId);
      setMessagesByChat((prev) => ({ ...prev, [storageKey]: nextMessages }));
      await doctorChatService.markRead(chatId);
      setChats((prev) => prev.map((chat) => (
        chatStorageKey(chat._id) === storageKey ? { ...chat, unreadCount: 0 } : chat
      )));
    } catch (error) {
      console.error('Failed to load patient messages:', error);
    } finally {
      setLoadingMessages(false);
    }
  };

  activeChatIdRef.current = activeChatId;
  loadMessagesRef.current = loadMessages;

  useEffect(() => {
    if (!activeChatId) return;
    loadMessages();
    setIsOfferOpen(false);
    setOfferDraft(createOfferDraft());
  }, [activeChatId]);

  useEffect(() => {
    if (!token) return;
    const socket = createDoctorPortalChatSocket(token);
    socketRef.current = socket;

    socket.on('chat:updated', async ({ chatId } = {}) => {
      try {
        const nextChats = await doctorChatService.listChats();
        setChats(nextChats);
        if (chatId && chatStorageKey(chatId) === chatStorageKey(activeChatIdRef.current)) {
          await loadMessagesRef.current?.(chatId);
        }
      } catch (error) {
        console.error('Failed to sync charts dynamically', error);
      }
    });

    socket.on('chat:deleted', ({ chatId }) => {
       setChats((prev) => prev.filter((chat) => chat._id !== chatId));
       if (activeChatId === chatId) {
         navigate('/messages', { replace: true });
       }
    });

    socket.on('message:new', (message) => {
      const storageKey = chatStorageKey(message.chatId);
      setMessagesByChat((prev) => ({
        ...prev,
        [storageKey]: upsertMessageList(prev[storageKey] || [], message),
      }));

      setChats((prev) => prev.map((chat) => {
        if (chat._id !== message.chatId) return chat;
        const shouldIncrement = message.senderRole === 'USER' && message.chatId !== activeChatId;
        return {
          ...chat,
          lastMessage: message.message,
          unreadCount: shouldIncrement ? (chat.unreadCount || 0) + 1 : 0,
          updatedAt: message.timestamp,
        };
      }));
    });

    socket.on('message:read', ({ chatId }) => {
      setChats((prev) => prev.map((chat) => (
        chat._id === chatId ? { ...chat, unreadCount: 0 } : chat
      )));
    });

    socket.on('presence:update', ({ userId, isOnline }) => {
      setChats((prev) => prev.map((chat) => (
        chat.participantUserId === userId ? { ...chat, participantIsOnline: isOnline } : chat
      )));
    });

    socket.on('typing:update', ({ chatId, senderRole, isTyping }) => {
      if (chatId === activeChatId && senderRole === 'USER') {
        setIsUserTyping(!!isTyping);
      }
    });

    socket.on('negotiation:update', async (negotiation) => {
      const storageKey = chatStorageKey(negotiation?.chatId);
      if (!storageKey) return;
      setMessagesByChat((prev) => ({
        ...prev,
        [storageKey]: updateNegotiationInMessages(prev[storageKey] || [], negotiation),
      }));
      if (storageKey === chatStorageKey(activeChatIdRef.current)) {
        await loadMessagesRef.current?.(negotiation.chatId);
      }
      if (negotiation?.status === 'LOCKED' || (negotiation?.acceptedByDoctor && negotiation?.acceptedByUser)) {
        window.dispatchEvent(new CustomEvent('doctor-appointments-changed'));
      }
    });

    socket.on('appointments:updated', () => {
      window.dispatchEvent(new CustomEvent('doctor-appointments-changed'));
    });

    return () => socket.disconnect();
  }, [token]);

  useEffect(() => {
    if (!activeChatId || !socketRef.current) return;
    socketRef.current.emit('chat:join', { chatId: activeChatId });
  }, [activeChatId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeMessages, isUserTyping, loadingMessages]);

  const updateOfferPanelPosition = useCallback(() => {
    const anchor = offerAnchorRef.current;
    if (!anchor) return;

    const rect = anchor.getBoundingClientRect();
    const gap = 10;
    const maxHeight = Math.max(300, Math.min(440, rect.top - gap - 12));
    const width = Math.min(400, Math.max(300, window.innerWidth - rect.left - 20));

    setOfferPanelPos({
      left: Math.max(12, rect.left),
      bottom: window.innerHeight - rect.top + gap,
      width,
      maxHeight,
    });
  }, []);

  useLayoutEffect(() => {
    if (!isOfferOpen) return undefined;

    updateOfferPanelPosition();
    offerScrollRef.current?.scrollTo({ top: 0 });

    window.addEventListener('resize', updateOfferPanelPosition);
    window.addEventListener('scroll', updateOfferPanelPosition, true);
    return () => {
      window.removeEventListener('resize', updateOfferPanelPosition);
      window.removeEventListener('scroll', updateOfferPanelPosition, true);
    };
  }, [isOfferOpen, updateOfferPanelPosition]);

  useEffect(() => {
    if (!isOfferOpen) return undefined;

    const handlePointerDown = (event) => {
      if (offerPanelRef.current?.contains(event.target)) return;
      if (offerAnchorRef.current?.contains(event.target)) return;
      setIsOfferOpen(false);
      setOfferDraft(createOfferDraft());
      setCounteringNegotiationId('');
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [isOfferOpen]);

  const handleTyping = (value) => {
    setInput(value);
    if (socketRef.current && activeChatId) {
      socketRef.current.emit('typing:update', { chatId: activeChatId, isTyping: value.trim().length > 0 });
    }
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || !activeChatId || sending) return;

    setSending(true);
    setInput('');
    try {
      const message = await doctorChatService.sendMessage({ chatId: activeChatId, message: text });
      setMessagesByChat((prev) => ({
        ...prev,
        [chatStorageKey(activeChatId)]: upsertMessageList(prev[chatStorageKey(activeChatId)] || [], message),
      }));
      setChats((prev) => prev.map((chat) => (
        chat._id === activeChatId
          ? { ...chat, lastMessage: text, unreadCount: 0, updatedAt: message.timestamp }
          : chat
      )));
      socketRef.current?.emit('typing:update', { chatId: activeChatId, isTyping: false });
    } catch (error) {
      console.error('Failed to send doctor message:', error);
      setInput(text);
    } finally {
      setSending(false);
    }
  };

  const handleCreateNegotiation = async () => {
    if (!activeChatId || offerSending) return;

    const amount = Number(offerDraft.amount);
    if (!offerDraft.date || !offerDraft.time || !Number.isFinite(amount) || amount < 0) {
      window.alert('Please fill date, time, and a valid amount before sending the offer.');
      return;
    }

    setOfferSending(true);
    try {
      let message;
      if (counteringNegotiationId) {
        const res = await doctorChatService.counterNegotiation({
          negotiationId: counteringNegotiationId,
          date: offerDraft.date,
          time: offerDraft.time,
          amount,
          mode: offerDraft.mode,
        });
        message = res.newMessage;
        setMessagesByChat((prev) => ({
          ...prev,
          [chatStorageKey(activeChatId)]: updateNegotiationInMessages(prev[chatStorageKey(activeChatId)] || [], res.oldNegotiation),
        }));
      } else {
        message = await doctorChatService.createNegotiation({
          chatId: activeChatId,
          date: offerDraft.date,
          time: offerDraft.time,
          amount,
          mode: offerDraft.mode,
        });
      }
      setMessagesByChat((prev) => ({
        ...prev,
        [chatStorageKey(activeChatId)]: upsertMessageList(prev[chatStorageKey(activeChatId)] || [], message),
      }));
      setChats((prev) => prev.map((chat) => (
        chat._id === activeChatId
          ? { ...chat, lastMessage: message.message, updatedAt: message.timestamp, unreadCount: 0 }
          : chat
      )));
      setIsOfferOpen(false);
      setOfferDraft(createOfferDraft());
      setCounteringNegotiationId('');
    } catch (error) {
      console.error('Failed to create/counter negotiation:', error);
      window.alert(error?.message || 'Unable to create consultation offer right now.');
    } finally {
      setOfferSending(false);
    }
  };

  const handleCounter = (negotiation) => {
    setCounteringNegotiationId(negotiation._id);
    const d = new Date(negotiation.date);
    const dateStr = toLocalDateKey(d);
    setOfferDraft({
      date: dateStr,
      time: negotiation.time,
      amount: negotiation.amount,
      mode: negotiation.mode,
    });
    setIsOfferOpen(true);
  };

  const handleAcceptNegotiation = async (negotiationId) => {
    if (!negotiationId || acceptingNegotiationId) return;

    setAcceptingNegotiationId(negotiationId);
    try {
      const nextNegotiation = await doctorChatService.acceptNegotiation(negotiationId);
      const storageKey = chatStorageKey(nextNegotiation?.chatId || activeChatId);
      if (storageKey) {
        setMessagesByChat((prev) => ({
          ...prev,
          [storageKey]: updateNegotiationInMessages(prev[storageKey] || [], nextNegotiation),
        }));
      }
      if (activeChatId) {
        await loadMessages(activeChatId);
      }
      if (nextNegotiation?.status === 'LOCKED' || (
        nextNegotiation?.acceptedByDoctor && nextNegotiation?.acceptedByUser
      )) {
        window.dispatchEvent(new CustomEvent('doctor-appointments-changed'));
      }
    } catch (error) {
      console.error('Failed to accept negotiation:', error);
      window.alert(error?.message || 'Unable to accept this deal right now.');
    } finally {
      setAcceptingNegotiationId('');
    }
  };

  return (
    <div className="min-h-screen w-full bg-[var(--practo-bg)] flex">
      <Sidebar />
      <div className="flex-1 ml-64 min-w-0 flex flex-col h-screen overflow-hidden">
        <Navbar />
      <main className="flex-1 min-h-0 overflow-hidden">
        <div className="h-full min-h-0 grid grid-cols-[320px_1fr]">
          <aside className="bg-[var(--practo-white)] border-r border-[var(--practo-border)] h-full overflow-y-auto">
            <div className="p-6 border-b border-[var(--practo-border)]">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-2xl bg-primary-50 text-primary-600 flex items-center justify-center">
                  <MessageSquare size={22} />
                </div>
                <div>
                  <h1 className="text-xl font-black text-[var(--practo-text)] tracking-tight">Patient Chats</h1>
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[var(--practo-text-light)]">Live consultations</p>
                </div>
              </div>
            </div>

            <div className="p-3 space-y-2">
              {loadingChats ? (
                <div className="py-8 flex justify-center"><Loader2 className="animate-spin text-[var(--practo-text-light)]" /></div>
              ) : chats.length === 0 ? (
                <div className="p-6 text-sm text-[var(--practo-text-light)]">Patient chats will appear here once a consultation relationship exists.</div>
              ) : chats.map((chat) => (
                <div
                  key={chat._id}
                  className={`group flex items-center w-full text-left rounded-2xl border transition-all ${
                    chat._id === activeChatId
                      ? 'bg-[#0d9488] text-white border-[#0d9488] shadow-md shadow-indigo-900/25'
                      : 'bg-[var(--practo-bg)] text-[var(--practo-text)] border-[var(--practo-border)] hover:border-primary-500/35 dark:hover:border-[#14bef0]/35'
                  }`}
                >
                <button
                  onClick={() => navigate(`/messages/${chat._id}`)}
                  className="flex-1 w-full text-left p-4 min-w-0 flex items-center gap-3"
                >
                  <div className="w-10 h-10 rounded-full bg-[var(--practo-bg)] flex-shrink-0 overflow-hidden flex items-center justify-center border border-[var(--practo-border)]">
                    {chat.participantProfileImage ? (
                      <img src={chat.participantProfileImage} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <UserRound size={16} className={chat._id === activeChatId ? 'text-white/50' : 'text-[var(--practo-text-light)]'} />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-bold truncate">{chat.participantName}</div>
                        <div className={`text-xs truncate mt-1 ${chat._id === activeChatId ? 'text-white/80' : 'text-[var(--practo-text-light)]'}`}>
                          {chat.lastMessage || 'No messages yet'}
                        </div>
                      </div>
                      {chat.unreadCount > 0 && (
                        <span className="min-w-6 h-6 px-2 rounded-full bg-emerald-500 text-white text-xs font-bold flex items-center justify-center">
                          {chat.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
                <button
                   onClick={async (e) => {
                      e.stopPropagation();
                      if (window.confirm('Are you sure you want to delete this chat completely?')) {
                         try {
                            await doctorChatService.deleteChat(chat._id);
                            setChats(prev => prev.filter(c => c._id !== chat._id));
                            if (activeChatId === chat._id) navigate('/messages', { replace: true });
                         } catch (err) {
                            window.alert('Failed to delete chat');
                         }
                      }
                   }}
                   className={`p-4 transition-colors opacity-0 group-hover:opacity-100 ${chat._id === activeChatId ? 'text-white/70 hover:text-red-300' : 'text-[var(--practo-text-light)] hover:text-red-500'}`}
                >
                   <Trash2 size={16} />
                </button>
                </div>
              ))}
            </div>
          </aside>

          <section className="h-full min-h-0 flex flex-col overflow-hidden bg-[var(--practo-bg)]">
            {activeChat ? (
              <>
                <div className="sticky top-0 z-20 flex-shrink-0 px-8 py-5 bg-[var(--practo-white)]/95 backdrop-blur border-b border-[var(--practo-border)] flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-full bg-[var(--practo-bg)] flex items-center justify-center text-[var(--practo-text)] overflow-hidden border border-[var(--practo-border)]">
                      {activeChat.participantProfileImage ? (
                        <img src={activeChat.participantProfileImage} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <UserRound size={20} />
                      )}
                    </div>
                    <div>
                      <div className="text-lg font-bold text-[var(--practo-text)]">{activeChat.participantName}</div>
                      <div className="flex items-center gap-2 text-xs font-semibold text-[var(--practo-text-light)]">
                        <Circle size={10} fill={activeChat.participantIsOnline ? '#10b981' : '#cbd5e1'} strokeWidth={0} />
                        <span>{activeChat.participantIsOnline ? 'Online' : 'Offline'}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto px-8 py-6 space-y-4">
                  {loadingMessages ? (
                    <div className="h-full flex items-center justify-center"><Loader2 className="animate-spin text-[var(--practo-text-light)]" /></div>
                  ) : activeMessages.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-[var(--practo-text-light)] text-sm">Open the consultation with a quick update or greeting.</div>
                  ) : activeMessages.map((message) => {
                    const isOwn = message.senderRole === 'DOCTOR';
                    return (
                      <div key={message._id} className={`flex items-end gap-3 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
                        <div className="w-8 h-8 rounded-full bg-[var(--practo-bg)] flex-shrink-0 overflow-hidden flex items-center justify-center border border-[var(--practo-border)] mb-1">
                          {isOwn ? (
                            doctorData?.basicInfo?.profileImage ? (
                              <img src={doctorData.basicInfo.profileImage} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <UserRound size={14} className="text-[var(--practo-text-light)]" />
                            )
                          ) : (
                            activeChat.participantProfileImage ? (
                              <img src={activeChat.participantProfileImage} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <UserRound size={14} className="text-[var(--practo-text-light)]" />
                            )
                          )}
                        </div>
                        {message.type === 'NEGOTIATION' && message.negotiation ? (
                          <NegotiationCard
                            message={message}
                            currentRole="DOCTOR"
                            onAccept={handleAcceptNegotiation}                          onCounter={handleCounter}                            acceptingId={acceptingNegotiationId}
                          />
                        ) : (
                          <div className={`max-w-[70%] px-5 py-3 rounded-3xl ${
                            isOwn ? 'bg-primary-600 text-white rounded-br-md' : 'bg-[var(--practo-white)] border border-[var(--practo-border)] text-[var(--practo-text)] rounded-bl-md'
                          }`}>
                            <div className="text-sm leading-6">{message.message}</div>
                            <div className={`text-[11px] mt-2 ${isOwn ? 'text-primary-100' : 'text-[var(--practo-text-light)]'}`}>
                              {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {isUserTyping && <div className="text-xs font-semibold text-[var(--practo-text-light)]">Patient is typing...</div>}
                  <div ref={bottomRef} />
                </div>

                <div className="relative flex-shrink-0 p-6 border-t border-[var(--practo-border)] bg-[var(--practo-white)]">
                  {isOfferOpen && typeof document !== 'undefined' && createPortal(
                    <div
                      ref={offerPanelRef}
                      role="dialog"
                      aria-label="Consultation offer"
                      style={{
                        position: 'fixed',
                        left: offerPanelPos.left,
                        bottom: offerPanelPos.bottom,
                        width: offerPanelPos.width,
                        maxHeight: offerPanelPos.maxHeight,
                        zIndex: 200,
                      }}
                      className="rounded-2xl border border-[var(--practo-border)] bg-[var(--practo-white)] shadow-2xl shadow-slate-400/25 dark:shadow-black/40 flex flex-col min-h-0 overflow-hidden"
                    >
                      <div className="shrink-0 rounded-t-2xl bg-[var(--practo-bg)] px-4 pt-3 pb-2.5 border-b border-[var(--practo-border)]">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="h-8 w-8 rounded-lg bg-[var(--practo-white)] border border-[var(--practo-border)] text-primary-600 flex items-center justify-center shrink-0">
                              <Handshake size={15} />
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs font-black text-[var(--practo-text)] leading-tight">Consultation Offer</div>
                              <div className="text-[9px] font-bold uppercase tracking-wide text-[var(--practo-text-light)]">Fee, slot &amp; mode</div>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setIsOfferOpen(false)}
                            className="h-7 w-7 rounded-lg border border-[var(--practo-border)] bg-[var(--practo-white)] text-[var(--practo-text-light)] hover:text-[var(--practo-text)] flex items-center justify-center shrink-0"
                            aria-label="Close offer panel"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>

                      <div ref={offerScrollRef} className="flex-1 min-h-0 overflow-y-auto px-3.5 py-2.5 space-y-2.5 custom-scrollbar">
                      {counteringNegotiationId && (
                         <div className="rounded-2xl border border-[var(--practo-border)] bg-[var(--practo-bg)] p-4">
                           <div className="text-[10px] font-black text-[var(--practo-text-light)] uppercase tracking-[0.18em] mb-2">Patient&apos;s preferred slot</div>
                           <div className="flex items-center gap-3 text-xs font-bold text-[var(--practo-text)]">
                             <Clock3 size={14} className="text-primary-500 shrink-0" />
                             <span>{offerDraft.date} at {offerDraft.time}</span>
                           </div>
                         </div>
                      )}

                        <div className="rounded-xl border border-[var(--practo-border)] bg-[var(--practo-bg)] p-2.5">
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <label className="text-[9px] font-black text-[var(--practo-text-light)] uppercase tracking-wide px-0.5">Fee</label>
                              <div className="relative">
                                <IndianRupee className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-[var(--practo-text-light)]" />
                                <input
                                  type="number"
                                  value={offerDraft.amount}
                                  onChange={(e) => setOfferDraft((prev) => ({ ...prev, amount: e.target.value }))}
                                  className="w-full pl-7 pr-2 py-1.5 bg-[var(--practo-white)] border border-[var(--practo-border)] rounded-lg text-xs font-semibold text-[var(--practo-text)] focus:border-primary-400 outline-none"
                                  placeholder="Amount"
                                />
                              </div>
                            </div>
                            <div className="space-y-1">
                              <label className="text-[9px] font-black text-[var(--practo-text-light)] uppercase tracking-wide px-0.5">Duration</label>
                              <select
                                value={offerDraft.duration}
                                onChange={(e) => setOfferDraft((prev) => ({ ...prev, duration: Number(e.target.value) }))}
                                className="w-full px-2 py-1.5 bg-[var(--practo-white)] border border-[var(--practo-border)] rounded-lg text-xs font-semibold text-[var(--practo-text)] focus:border-primary-400 outline-none"
                              >
                                {[15, 30, 45, 60].map((d) => <option key={d} value={d}>{d} min</option>)}
                              </select>
                            </div>
                          </div>
                        </div>

                        <AvailabilityScheduler
                          availability={doctorData?.availability}
                          appointments={appointments}
                          selectedDate={offerDraft.date}
                          selectedTime={offerDraft.time}
                          duration={offerDraft.duration}
                          onDateChange={(date) => setOfferDraft((prev) => ({
                            ...prev,
                            date,
                            time: prev.date === date ? prev.time : '',
                          }))}
                          onTimeChange={(time) => setOfferDraft((prev) => ({ ...prev, time }))}
                          compact
                        />

                        <div className="rounded-xl border border-[var(--practo-border)] bg-[var(--practo-bg)] p-2.5 space-y-1.5">
                          <label className="text-[9px] font-black text-[var(--practo-text-light)] uppercase tracking-wide px-0.5">Mode</label>
                          <div className="grid grid-cols-3 gap-1.5">
                            {MODE_OPTIONS.map((mode) => {
                              const meta = MODE_META[mode];
                              const Icon = meta.icon;
                              const isActive = offerDraft.mode === mode;
                              return (
                                <button
                                  key={mode}
                                  type="button"
                                  onClick={() => setOfferDraft((prev) => ({ ...prev, mode }))}
                                  className={`py-2 rounded-lg border text-[10px] font-semibold transition-all flex flex-col items-center gap-1 ${
                                    isActive ? 'bg-[var(--practo-white)] border-primary-500 text-primary-700 dark:text-primary-300' : 'bg-[var(--practo-white)]/80 border-[var(--practo-border)] text-[var(--practo-text-light)]'
                                  }`}
                                >
                                  <Icon size={14} className="shrink-0" />
                                  <span className="leading-none">{mode === 'VIDEO' ? 'Video' : mode === 'AUDIO' ? 'Audio' : 'Chat'}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      <div className="shrink-0 px-3.5 py-2.5 border-t border-[var(--practo-border)] bg-[var(--practo-bg)] rounded-b-2xl">
                        <button
                          onClick={handleCreateNegotiation}
                          disabled={offerSending || !offerDraft.time}
                          className="w-full py-2 rounded-lg bg-primary-600 text-white text-[10px] font-black uppercase tracking-wide shadow-md hover:bg-primary-700 transition-all disabled:bg-[var(--practo-border)] disabled:text-[var(--practo-text-light)] flex items-center justify-center gap-1.5"
                        >
                          {offerSending ? (
                            <Loader2 className="animate-spin" size={14} />
                          ) : (
                            <>Send offer <Check size={12} strokeWidth={3} /></>
                          )}
                        </button>
                      </div>
                    </div>,
                    document.body,
                  )}

                  <div ref={offerAnchorRef} className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setIsOfferOpen((prev) => !prev)}
                      className="h-14 w-14 rounded-2xl border border-[var(--practo-border)] bg-[var(--practo-white)] text-[var(--practo-text)] flex items-center justify-center hover:border-primary-400 hover:text-primary-600 transition"
                    >
                      <Plus size={20} />
                    </button>
                    <textarea
                      value={input}
                      onChange={(e) => handleTyping(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSend();
                        }
                      }}
                      rows={1}
                      placeholder="Reply to the patient..."
                      className="flex-1 resize-none rounded-3xl border border-[var(--practo-border)] bg-[var(--practo-white)] text-[var(--practo-text)] px-5 py-4 outline-none focus:border-primary-400 placeholder:text-[var(--practo-text-light)]"
                    />
                    <button
                      onClick={handleSend}
                      disabled={sending || !input.trim()}
                      className="h-14 w-14 rounded-2xl bg-primary-600 text-white flex items-center justify-center disabled:bg-[var(--practo-border)] disabled:text-[var(--practo-text-light)]"
                    >
                      {sending ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="h-full flex items-center justify-center text-[var(--practo-text-light)]">Select a patient chat to continue.</div>
            )}
          </section>
        </div>
      </main>
      </div>
    </div>
  );
};

export default Messages;
