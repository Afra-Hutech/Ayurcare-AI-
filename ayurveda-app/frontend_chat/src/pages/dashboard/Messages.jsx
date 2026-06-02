import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  Lock,
  Check,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { doctorChatApi, publicApi } from '../../services/api';
import { toLocalDateKey } from '../../utils/dateUtils';
import { formatDoctorFee, getDoctorConsultationFee } from '../../utils/doctorFees';

const normalizeStatus = (status) => {
  if (!status) return 'pending';
  const s = status.toLowerCase();
  if (s === 'confirmed' || s === 'scheduled') return 'confirmed';
  if (s === 'cancelled' || s === 'canceled') return 'cancelled';
  return s;
};

const parseTimingsString = (str) => {
  if (!str || !str.includes(' to ')) return { minTime: '10:00', maxTime: '18:00' };
  try {
    const [startPart, endPart] = str.split(' to ');
    const parse = (timeStr) => {
      const match = timeStr.match(/(\d+):(\d+)\s*(am|pm)/i);
      if (!match) return '10:00';
      let [_, h, m, p] = match;
      h = parseInt(h);
      if (p.toLowerCase() === 'pm' && h < 12) h += 12;
      if (p.toLowerCase() === 'am' && h === 12) h = 0;
      return `${h.toString().padStart(2, '0')}:${m}`;
    };
    return { minTime: parse(startPart), maxTime: parse(endPart) };
  } catch (e) {
    return { minTime: '10:00', maxTime: '18:00' };
  }
};

import { createDoctorChatSocket } from '../../features/chat/socketService';

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
    <div className="w-full max-w-[420px] rounded-[28px] border border-emerald-200/80 dark:border-emerald-800/60 bg-gradient-to-br from-white via-emerald-50/60 to-lime-50/70 dark:from-slate-900 dark:via-emerald-950/40 dark:to-slate-900 p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.24em] text-emerald-700">
            <Handshake size={14} />
            <span>Consultation Offer</span>
          </div>
          <div className="mt-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
            {message.senderRole === currentRole ? 'You proposed a consultation deal.' : 'New consultation terms received.'}
          </div>
        </div>
        <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] ${
          isLocked ? 'bg-emerald-600 text-white' : 'bg-amber-100 text-amber-700'
        }`}>
          {isLocked ? 'LOCKED' : (negotiation?.status || 'PENDING')}
        </span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 text-sm text-slate-700 dark:text-slate-200">
        <div className="rounded-2xl bg-white/85 dark:bg-slate-800/90 px-4 py-3 border border-white dark:border-slate-600">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400"><CalendarDays size={14} /> Date</div>
          <div className="mt-2 font-bold text-slate-900 dark:text-slate-50">{formatOfferDate(negotiation?.date)}</div>
        </div>
        <div className="rounded-2xl bg-white/85 dark:bg-slate-800/90 px-4 py-3 border border-white dark:border-slate-600">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400"><Clock3 size={14} /> Time</div>
          <div className="mt-2 font-bold text-slate-900 dark:text-slate-50">{negotiation?.time}</div>
        </div>
        <div className="rounded-2xl bg-white/85 dark:bg-slate-800/90 px-4 py-3 border border-white dark:border-slate-600">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400"><IndianRupee size={14} /> Consultation fee</div>
          <div className="mt-2 font-bold text-slate-900 dark:text-slate-50">{formatMoney(negotiation?.amount)}</div>
        </div>
        <div className="rounded-2xl bg-white/85 dark:bg-slate-800/90 px-4 py-3 border border-white dark:border-slate-600">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400"><ModeIcon size={14} /> Mode</div>
          <div className="mt-2 font-bold text-slate-900 dark:text-slate-50">{modeMeta.label}</div>
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-emerald-100 dark:border-emerald-900/50 bg-white/80 dark:bg-slate-800/60 px-4 py-3 text-sm">
        {isLocked ? (
          <div className="font-bold text-emerald-700">Deal confirmed. This consultation offer is locked.</div>
        ) : didAccept ? (
          <div className="font-semibold text-slate-600">Waiting for the other party to accept this deal.</div>
        ) : otherAccepted ? (
          <div className="font-semibold text-emerald-700">The other party has accepted the deal! Do you want to accept or counter?</div>
        ) : (
          <div className="font-semibold text-slate-600">Accept this deal to lock the consultation terms for both sides.</div>
        )}
      </div>

      <div className="mt-4">
        {isLocked ? (
          <div className="rounded-2xl bg-emerald-600 px-4 py-3 text-center text-sm font-bold text-white">
            Deal Confirmed
          </div>
        ) : canAct ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onAccept(negotiation._id)}
              disabled={isAccepting}
              className={`rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white transition hover:bg-slate-800 disabled:bg-slate-300 ${currentRole === 'USER' ? 'w-full' : 'flex-1'}`}
            >
              {isAccepting ? 'Accepting...' : 'Accept'}
            </button>
            {currentRole !== 'USER' && onCounter ? (
              <button
                type="button"
                onClick={() => onCounter(negotiation)}
                disabled={isAccepting}
                className="flex-1 rounded-2xl bg-white border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:bg-slate-100"
              >
                Counter
              </button>
            ) : null}
          </div>
        ) : (
          <div className="rounded-2xl bg-slate-100 px-4 py-3 text-center text-sm font-semibold text-slate-600">
            {isCountered ? 'This deal was countered.' : bothAccepted ? 'Deal confirmed.' : 'Waiting for other party...'}
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
  const userData = JSON.parse(localStorage.getItem('user') || '{}');
  const messagesEndRef = useRef(null);
  const socketRef = useRef(null);
  const offerPanelRef = useRef(null);
  const activeChatIdRef = useRef(null);
  const loadMessagesRef = useRef(null);

  const [chats, setChats] = useState([]);
  const [messagesByChat, setMessagesByChat] = useState({});
  const [loadingChats, setLoadingChats] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [input, setInput] = useState('');
  const [isDoctorTyping, setIsDoctorTyping] = useState(false);
  const [isOfferOpen, setIsOfferOpen] = useState(false);
  const [offerDraft, setOfferDraft] = useState(createOfferDraft());
  const [offerSending, setOfferSending] = useState(false);
  const [acceptingNegotiationId, setAcceptingNegotiationId] = useState('');
  const [counteringNegotiationId, setCounteringNegotiationId] = useState('');
  const [doctorData, setDoctorData] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [isNarrowViewport, setIsNarrowViewport] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 1024
  );

  useEffect(() => {
    const onResize = () => setIsNarrowViewport(window.innerWidth < 1024);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const activeChatId = routeChatId || (!isNarrowViewport ? chats[0]?._id : null) || null;
  const showListPanel = !isNarrowViewport || !activeChatId;
  const showChatPanel = !isNarrowViewport || !!activeChatId;
  const activeChat = useMemo(
    () => chats.find((chat) => chat._id === activeChatId) || null,
    [chats, activeChatId]
  );
  const activeMessages = messagesByChat[chatStorageKey(activeChatId)] || [];

  const loadChats = async (preferredChatId = null) => {
    setLoadingChats(true);
    try {
      const res = await doctorChatApi.listChats();
      const nextChats = res.data || [];
      setChats(nextChats);

      const targetId = preferredChatId || routeChatId || nextChats[0]?._id;
      if (targetId && targetId !== routeChatId) {
        navigate(`/messages/${targetId}`, { replace: true });
      }
    } catch (error) {
      console.error('Failed to load chats:', error);
    } finally {
      setLoadingChats(false);
    }
  };

  useEffect(() => {
    loadChats();
  }, []);

  useEffect(() => {
    const doctorId = searchParams.get('doctorId');
    if (!doctorId) return;

    const run = async () => {
      try {
        const res = await doctorChatApi.initiateChat({ doctorId });
        await loadChats(res.data?._id);
        if (res.data?._id) {
          navigate(`/messages/${res.data._id}`, { replace: true });
        }
      } catch (error) {
        console.error('Failed to initiate doctor chat:', error);
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
      const res = await doctorChatApi.getMessages(chatId);
      setMessagesByChat((prev) => ({ ...prev, [storageKey]: res.data || [] }));
      await doctorChatApi.markRead(chatId);
      setChats((prev) => prev.map((chat) => (
        chatStorageKey(chat._id) === storageKey ? { ...chat, unreadCount: 0 } : chat
      )));
    } catch (error) {
      console.error('Failed to load chat messages:', error);
    } finally {
      setLoadingMessages(false);
    }
  };

  activeChatIdRef.current = activeChatId;
  loadMessagesRef.current = loadMessages;

  const fetchDoctorAvailability = async (doctorId) => {
    if (!doctorId) return;
    try {
        const res = await publicApi.getDoctorAvailability(doctorId);
        if (res.data) {
            setDoctorData(res.data.doctor);
            setAppointments(res.data.appointments);
        }
    } catch (err) {
        console.error("Failed to fetch doctor availability:", err);
    }
  };

  useEffect(() => {
    if (!activeChatId) return;
    loadMessages();
    if (activeChat?.doctorId) {
      fetchDoctorAvailability(activeChat.doctorId);
    }
    setIsOfferOpen(false);
    setOfferDraft(createOfferDraft());
  }, [activeChatId, activeChat?.doctorId]);

  useEffect(() => {
    if (!token) return;
    const socket = createDoctorChatSocket(token);
    socketRef.current = socket;

    socket.on('chat:updated', async ({ chatId } = {}) => {
      try {
        const res = await doctorChatApi.listChats();
        setChats(res.data || []);
        if (chatId && chatStorageKey(chatId) === chatStorageKey(activeChatIdRef.current)) {
          await loadMessagesRef.current?.(chatId);
        }
      } catch (error) {
        console.error('Failed to sync chats dynamically', error);
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
        const shouldIncrement = message.senderRole === 'DOCTOR' && message.chatId !== activeChatId;
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
      if (chatId === activeChatId && senderRole === 'DOCTOR') {
        setIsDoctorTyping(!!isTyping);
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
    });

    return () => {
      socket.disconnect();
    };
  }, [token]);

  useEffect(() => {
    if (!activeChatId || !socketRef.current) return;
    socketRef.current.emit('chat:join', { chatId: activeChatId });
  }, [activeChatId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeMessages, isDoctorTyping, loadingMessages]);

  useEffect(() => {
    if (!isOfferOpen) return undefined;

    const handlePointerDown = (event) => {
      if (offerPanelRef.current && !offerPanelRef.current.contains(event.target)) {
        setIsOfferOpen(false);
        setOfferDraft(createOfferDraft());
        setCounteringNegotiationId('');
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [isOfferOpen]);

  const handleTyping = (value) => {
    setInput(value);
    if (socketRef.current && activeChatId) {
      socketRef.current.emit('typing:update', {
        chatId: activeChatId,
        isTyping: value.trim().length > 0,
      });
    }
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || !activeChatId || sending) return;

    setSending(true);
    setInput('');
    try {
      const res = await doctorChatApi.sendMessage({ chatId: activeChatId, message: text });
      const message = res.data;

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
      console.error('Failed to send message:', error);
      setInput(text);
    } finally {
      setSending(false);
    }
  };

  const doctorConsultationFee = useMemo(
    () => getDoctorConsultationFee(doctorData),
    [doctorData],
  );

  useEffect(() => {
    if (!doctorData) return;
    const fee = getDoctorConsultationFee(doctorData);
    if (fee != null) {
      setOfferDraft((prev) => ({ ...prev, amount: String(fee) }));
    }
  }, [doctorData]);

  const handleCreateNegotiation = async () => {
    if (!activeChatId || offerSending) return;

    const amount = doctorConsultationFee;
    if (!offerDraft.date || !offerDraft.time) {
      window.alert('Please select a date and time before sending the offer.');
      return;
    }
    if (amount == null) {
      window.alert('This doctor has not set a consultation fee on their profile yet.');
      return;
    }

    setOfferSending(true);
    try {
      let message;
      if (counteringNegotiationId) {
        const res = await doctorChatApi.counterNegotiation({
          negotiationId: counteringNegotiationId,
          date: offerDraft.date,
          time: offerDraft.time,
          amount,
          mode: offerDraft.mode,
        });
        message = res.data.newMessage;
        setMessagesByChat((prev) => ({
          ...prev,
          [chatStorageKey(activeChatId)]: updateNegotiationInMessages(prev[chatStorageKey(activeChatId)] || [], res.data.oldNegotiation),
        }));
      } else {
        const res = await doctorChatApi.createNegotiation({
          chatId: activeChatId,
          date: offerDraft.date,
          time: offerDraft.time,
          amount,
          mode: offerDraft.mode,
        });
        message = res.data;
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
      window.alert(error?.response?.data?.message || 'Unable to create consultation offer right now.');
    } finally {
      setOfferSending(false);
    }
  };

  const availableDays = useMemo(() => {
    const days = [];
    for (let i = 0; i < 14; i++) {
        const d = new Date();
        d.setDate(d.getDate() + i);
        days.push(d);
    }
    return days;
  }, []);

  const timeSlots = useMemo(() => {
    if (!doctorData?.availability?.timings || !offerDraft.date) return [];
    
    const { minTime, maxTime } = parseTimingsString(doctorData.availability.timings);
    const [startH, startM] = minTime.split(':').map(Number);
    const [endH, endM] = maxTime.split(':').map(Number);
    
    const slots = [];
    const baseDate = offerDraft.date; 
    let curr = new Date(`${baseDate}T00:00:00`);
    curr.setHours(startH, startM, 0, 0);
    const end = new Date(`${baseDate}T00:00:00`);
    end.setHours(endH, endM, 0, 0);
    
    const requestedDuration = Number(offerDraft.duration) || 30;
    const now = new Date();
    let foundRecommended = false;

    while (curr < end) {
      const timeStr = curr.toTimeString().slice(0, 5);
      const sStart = new Date(curr.getTime());
      const sEnd = new Date(sStart.getTime() + requestedDuration * 60 * 1000);

      const isBooked = appointments.some(apt => {
        const status = normalizeStatus(apt.status);
        if (status !== 'confirmed' && status !== 'scheduled') return false;
        const aStart = new Date(apt.startTime);
        let aEnd = apt.endTime ? new Date(apt.endTime) : new Date(aStart.getTime() + (apt.duration || 30) * 60 * 1000);
        return (sStart < aEnd && sEnd > aStart);
      });
      
      let isRecommended = false;
      const isPast = sStart < new Date(now.getTime() + 15 * 60 * 1000);
      const isToday = baseDate === toLocalDateKey();
      if (!isBooked && !foundRecommended) {
        if (!isToday || !isPast) {
          isRecommended = true;
          foundRecommended = true;
        }
      }

      slots.push({
        time: timeStr,
        label: curr.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isBooked,
        isRecommended: isRecommended && !isBooked
      });
      curr = new Date(curr.getTime() + 15 * 60 * 1000); 
    }
    return slots;
  }, [doctorData, offerDraft.date, offerDraft.duration, appointments]);

  const handleCounter = (negotiation) => {
    setCounteringNegotiationId(negotiation._id);
    const d = new Date(negotiation.date);
    const dateStr = toLocalDateKey(d);
    const fee = getDoctorConsultationFee(doctorData);
    setOfferDraft({
      date: dateStr,
      time: negotiation.time,
      amount: fee != null ? String(fee) : String(negotiation.amount ?? ''),
      mode: negotiation.mode,
    });
    setIsOfferOpen(true);
  };

  const handleAcceptNegotiation = async (negotiationId) => {
    if (!negotiationId || acceptingNegotiationId) return;

    setAcceptingNegotiationId(negotiationId);
    try {
      const res = await doctorChatApi.acceptNegotiation(negotiationId);
      const nextNegotiation = res.data;
      const storageKey = chatStorageKey(nextNegotiation?.chatId || activeChatId);
      if (storageKey) {
        setMessagesByChat((prev) => ({
          ...prev,
          [storageKey]: updateNegotiationInMessages(prev[storageKey] || [], nextNegotiation),
        }));
      }
      if (activeChatId) {
        await loadMessages();
      }
    } catch (error) {
      console.error('Failed to accept negotiation:', error);
      window.alert(error?.response?.data?.message || 'Unable to accept this deal right now.');
    } finally {
      setAcceptingNegotiationId('');
    }
  };

  const handleBackToList = () => navigate('/messages', { replace: true });

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--practo-bg)]">
      <div className={`flex flex-1 min-h-0 overflow-hidden ${isNarrowViewport ? 'flex-col' : 'flex-row'}`}>
        {showListPanel && (
        <aside className={`flex flex-col min-h-0 bg-[var(--practo-white)] border-[var(--practo-border)] md:border-r ${isNarrowViewport ? 'flex-1 w-full' : 'w-[min(100%,300px)] shrink-0'}`}>
          <div className="flex-shrink-0 px-3 py-3 border-b border-[#f0f4f7] dark:border-slate-700 flex items-center justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Conversations{chats.length ? ` (${chats.length})` : ''}
            </p>
            <button
              type="button"
              onClick={() => navigate('/find-doctors')}
              className="text-[11px] font-semibold text-[#28328c] dark:text-indigo-400 hover:underline"
            >
              Find doctor
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1 custom-scrollbar">
            {loadingChats ? (
              <div className="py-8 flex justify-center"><Loader2 className="animate-spin text-slate-400" /></div>
            ) : chats.length === 0 ? (
              <div className="p-6 text-center">
                <div className="w-12 h-12 rounded-2xl bg-[#28328c]/10 text-[#28328c] flex items-center justify-center mx-auto mb-3">
                  <MessageCircleMore size={22} />
                </div>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">No conversations yet</p>
                <p className="text-xs text-slate-400 dark:text-slate-500 leading-relaxed">Find a specialist and start a direct consultation thread.</p>
              </div>
            ) : chats.map((chat) => (
              <div
                key={chat._id}
                className={`group flex items-center w-full text-left rounded-xl transition-all ${
                  chat._id === activeChatId
                    ? 'bg-[#28328c] text-white shadow-sm'
                    : 'hover:bg-[#f0f4f7] dark:hover:bg-slate-800/90 text-slate-900 dark:text-slate-100'
                }`}
              >
              <button
                onClick={() => navigate(`/messages/${chat._id}`)}
                className="flex-1 w-full text-left p-3 min-w-0 flex items-center gap-3"
              >
                <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-700 flex-shrink-0 overflow-hidden flex items-center justify-center border border-slate-100 dark:border-slate-600">
                  {chat.participantProfileImage ? (
                    <img src={chat.participantProfileImage} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <UserRound size={16} className="text-slate-400" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-bold truncate">{chat.participantName}</div>
                      <div className={`text-xs truncate mt-1 ${chat._id === activeChatId ? 'text-slate-300' : 'text-slate-500'}`}>
                        {chat.lastMessage || 'Start the conversation'}
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
                          await doctorChatApi.deleteChat(chat._id);
                          setChats(prev => prev.filter(c => c._id !== chat._id));
                          if (activeChatId === chat._id) navigate('/messages', { replace: true });
                       } catch (err) {
                          window.alert('Failed to delete chat');
                       }
                    }
                 }}
                 className={`p-3 sm:p-4 transition-colors opacity-100 sm:opacity-0 sm:group-hover:opacity-100 ${chat._id === activeChatId ? 'text-slate-300 hover:text-red-400' : 'text-slate-400 hover:text-red-500'}`}
              >
                 <Trash2 size={16} />
              </button>
              </div>
            ))}
          </div>
        </aside>
        )}

        {showChatPanel && (
        <section className={`flex flex-1 min-h-0 flex-col overflow-hidden bg-[var(--practo-bg)] ${isNarrowViewport ? 'w-full' : ''}`}>
          {activeChat ? (
            <>
              <div className="flex-shrink-0 px-4 py-3 bg-[var(--practo-white)] border-b border-[var(--practo-border)] flex items-center justify-between gap-3 shadow-[0_1px_0_rgba(15,23,42,0.04)] dark:shadow-[0_1px_0_rgba(0,0,0,0.35)]">
                <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                  {isNarrowViewport && (
                    <button
                      type="button"
                      onClick={handleBackToList}
                      className="h-10 w-10 flex-shrink-0 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center justify-center hover:bg-slate-50 dark:hover:bg-slate-700"
                      aria-label="Back to conversations"
                    >
                      <ChevronLeft size={20} />
                    </button>
                  )}
                  <div className="h-10 w-10 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200 overflow-hidden flex-shrink-0">
                    {activeChat.participantProfileImage ? (
                      <img src={activeChat.participantProfileImage} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <UserRound size={20} />
                    )}
                  </div>
                  <div>
                    <div className="text-lg font-bold text-[var(--practo-text)]">{activeChat.participantName}</div>
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                      <Circle size={10} fill={activeChat.participantIsOnline ? '#10b981' : '#cbd5e1'} strokeWidth={0} />
                      <span>{activeChat.participantIsOnline ? 'Online' : 'Offline'}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 custom-scrollbar bg-[var(--practo-bg)]">
                <div className="max-w-2xl mx-auto space-y-3">
                {loadingMessages ? (
                  <div className="h-full flex items-center justify-center"><Loader2 className="animate-spin text-slate-400" /></div>
                ) : activeMessages.length === 0 ? (
                  <div className="py-16 flex items-center justify-center text-slate-500 dark:text-slate-400 text-sm text-center px-4">Say hello to start this consultation thread.</div>
                ) : activeMessages.map((message) => {
                  const isOwn = message.senderRole === 'USER';
                  return (
                    <div key={message._id} className={`flex items-end gap-3 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
                      <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex-shrink-0 overflow-hidden flex items-center justify-center border border-slate-200 dark:border-slate-600 mb-1">
                        {isOwn ? (
                          userData.profileImage ? (
                            <img src={userData.profileImage} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <UserRound size={14} className="text-slate-400" />
                          )
                        ) : (
                          activeChat.participantProfileImage ? (
                            <img src={activeChat.participantProfileImage} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <UserRound size={14} className="text-slate-400" />
                          )
                        )}
                      </div>
                      {message.type === 'NEGOTIATION' && message.negotiation ? (
                        <NegotiationCard
                          message={message}
                          currentRole="USER"
                          onAccept={handleAcceptNegotiation}
                          onCounter={handleCounter}
                          acceptingId={acceptingNegotiationId}
                        />
                      ) : (
                        <div className={`max-w-[85%] sm:max-w-[72%] px-4 py-2.5 rounded-2xl shadow-sm ${
                          isOwn ? 'bg-[#28328c] text-white rounded-br-sm' : 'bg-[var(--practo-white)] border border-[var(--practo-border)] text-[var(--practo-text)] rounded-bl-sm'
                        }`}>
                          <div className="text-sm leading-relaxed whitespace-pre-wrap break-words">{message.message}</div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {isDoctorTyping && (
                  <div className="text-xs font-semibold text-slate-400 dark:text-slate-500">Doctor is typing...</div>
                )}
                <div ref={messagesEndRef} />
                </div>
              </div>

              <div className="relative flex-shrink-0 p-3 sm:p-4 border-t border-[var(--practo-border)] bg-[var(--practo-white)]">
                {isOfferOpen && (
                  <div ref={offerPanelRef} className="absolute bottom-[calc(100%+12px)] left-4 right-4 sm:left-6 sm:right-auto sm:w-[440px] rounded-[2rem] sm:rounded-[2.5rem] border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 p-4 sm:p-6 shadow-2xl shadow-slate-300/40 dark:shadow-black/50 flex flex-col gap-6 max-h-[min(600px,70vh)] overflow-y-auto z-50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-11 w-11 rounded-2xl bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                          <Handshake size={18} />
                        </div>
                        <div>
                          <div className="text-sm font-black text-slate-900 dark:text-slate-50">Book consultation</div>
                          <div className="text-[10px] font-black uppercase tracking-widest text-[#aaaaaa] dark:text-slate-500 mt-0.5">Choose date & time</div>
                        </div>
                      </div>
                      <button onClick={() => setIsOfferOpen(false)} className="text-slate-300 dark:text-slate-600 hover:text-slate-500 dark:hover:text-slate-400 transition-colors"><Trash2 size={16} /></button>
                    </div>

                    {/* Initial Timing Display (if countering) */}
                    {counteringNegotiationId && (
                       <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-600">
                         <div className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Doctor's Preferred Slot</div>
                         <div className="flex items-center gap-3 text-xs font-bold text-slate-600 dark:text-slate-300">
                           <Clock3 size={14} className="text-emerald-600" />
                           <span>{offerDraft.date} at {offerDraft.time}</span>
                         </div>
                       </div>
                    )}

                    <div className="space-y-6">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5 col-span-2 sm:col-span-1">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Consultation fee</label>
                          <div className="flex items-center gap-2 w-full px-4 py-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-2xl">
                            <IndianRupee className="h-4 w-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
                            <span className="text-sm font-black text-slate-900 dark:text-slate-50">
                              {formatDoctorFee(doctorData) || 'Not set by doctor'}
                            </span>
                          </div>
                          <p className="text-[9px] font-bold text-slate-400 px-1 uppercase tracking-wide">
                            Fixed from doctor profile · not negotiable
                          </p>
                        </div>
                        <div className="space-y-1.5 col-span-2 sm:col-span-1">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Duration (m)</label>
                          <select
                            value={offerDraft.duration}
                            onChange={(e) => setOfferDraft((prev) => ({ ...prev, duration: Number(e.target.value) }))}
                            className="w-full px-4 py-3 bg-[#f8fafc] border border-slate-200 rounded-2xl text-sm font-bold focus:border-emerald-400 outline-none transition-all appearance-none"
                          >
                            {[15, 30, 45, 60].map(d => <option key={d} value={d}>{d} mins</option>)}
                          </select>
                        </div>
                      </div>

                      {/* Date Carousel */}
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Select Date</label>
                        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none snap-x">
                          {availableDays.map((date, i) => {
                            const dateStr = toLocalDateKey(date);
                            const isSelected = offerDraft.date === dateStr;
                            return (
                              <button
                                key={i}
                                type="button"
                                onClick={() => setOfferDraft({ ...offerDraft, date: dateStr })}
                                className={`flex-shrink-0 w-16 h-16 rounded-2xl border transition-all flex flex-col items-center justify-center gap-0.5 snap-start ${
                                  isSelected ? 'bg-emerald-600 border-emerald-600 text-white shadow-lg shadow-emerald-100' : 'bg-white border-slate-100 text-slate-500 hover:border-emerald-200'
                                }`}
                              >
                                <span className="text-[8px] font-black uppercase tracking-widest">{date.toLocaleDateString('en-US', { weekday: 'short' })}</span>
                                <span className="text-sm font-black">{date.getDate()}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Time Grid */}
                      <div className="space-y-2">
                         <div className="flex items-center justify-between">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Choose Specialist Available Slot</label>
                            {doctorData?.availability?.timings && (
                              <span className="text-[8px] font-black text-amber-600 uppercase bg-amber-50 px-2 py-0.5 rounded-md">{doctorData.availability.timings}</span>
                            )}
                         </div>
                         <div className="grid grid-cols-4 gap-2">
                            {timeSlots.map((slot, i) => (
                              <button
                                key={i}
                                type="button"
                                disabled={slot.isBooked}
                                onClick={() => setOfferDraft({ ...offerDraft, time: slot.time })}
                                className={`relative py-3 rounded-xl text-[10px] font-black transition-all flex flex-col items-center gap-1 ${
                                  slot.isBooked ? 'bg-[#f8fafc] text-slate-200 border-slate-100 cursor-not-allowed' :
                                  offerDraft.time === slot.time ? 'bg-emerald-600 text-white shadow-lg border-emerald-600' :
                                  'bg-white border-slate-200 text-slate-600 hover:border-emerald-400'
                                } ${slot.isRecommended && !slot.isBooked && offerDraft.time !== slot.time ? 'ring-2 ring-emerald-400 ring-offset-1' : ''}`}
                              >
                                {slot.isRecommended && !slot.isBooked && offerDraft.time !== slot.time && (
                                   <div className="absolute -top-1.5 -right-1 bg-emerald-500 text-white text-[6px] px-1 py-0.5 rounded-full ring-2 ring-white">BEST</div>
                                )}
                                <span>{slot.label}</span>
                                {slot.isBooked && <Lock size={10} />}
                              </button>
                            ))}
                         </div>
                      </div>

                      {/* Mode Selection */}
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Consultation Mode</label>
                        <div className="grid grid-cols-3 gap-2">
                          {MODE_OPTIONS.map((mode) => {
                            const meta = MODE_META[mode];
                            const Icon = meta.icon;
                            const isActive = offerDraft.mode === mode;
                            return (
                              <button
                                key={mode}
                                onClick={() => setOfferDraft({ ...offerDraft, mode })}
                                className={`py-3 rounded-2xl border text-[9px] font-black uppercase tracking-widest transition-all space-y-1.5 ${
                                  isActive ? 'bg-emerald-50 dark:bg-emerald-950/70 border-emerald-500 text-emerald-700 dark:text-emerald-300' : 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-600 text-[#aaaaaa] dark:text-slate-500 hover:border-emerald-200 dark:hover:border-emerald-700'
                                }`}
                              >
                                <Icon size={14} className="mx-auto" />
                                <span>{meta.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    <div className="pt-2">
                      <button
                        onClick={handleCreateNegotiation}
                        disabled={offerSending || !offerDraft.time || doctorConsultationFee == null}
                        className="w-full py-4 rounded-[1.5rem] bg-emerald-700 text-white text-xs font-black uppercase tracking-[0.2em] shadow-xl shadow-emerald-700/20 hover:bg-emerald-800 transition-all active:scale-95 disabled:bg-slate-100 disabled:text-slate-300 flex items-center justify-center gap-3"
                      >
                        {offerSending ? (
                          <Loader2 className="animate-spin" size={16} />
                        ) : (
                          <>Send consultation offer <Check size={14} strokeWidth={3} /></>
                        )}
                      </button>
                      <p className="text-[8px] font-bold text-[#aaaaaa] text-center mt-3 uppercase tracking-widest leading-relaxed">
                         Your offer is sent to the practitioner for review once you confirm.
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setIsOfferOpen((prev) => !prev)}
                    className="h-14 w-14 rounded-2xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center justify-center hover:border-emerald-400 dark:hover:border-emerald-600 hover:text-emerald-600 dark:hover:text-emerald-400 transition"
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
                    placeholder="Message your doctor..."
                    className="flex-1 resize-none rounded-2xl border border-[var(--practo-border)] bg-[var(--practo-bg)] px-4 py-3 text-sm text-[var(--practo-text)] placeholder:text-[var(--practo-text-light)] outline-none focus:border-[#28328c]/40 dark:focus:border-[#14bef0]/45 focus:ring-2 focus:ring-[#28328c]/10 dark:focus:ring-[#14bef0]/15 max-h-32"
                  />
                  <button
                    onClick={handleSend}
                    disabled={sending || !input.trim()}
                    className="h-11 w-11 rounded-xl bg-[#28328c] dark:bg-indigo-600 text-white flex items-center justify-center disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:text-slate-500 shrink-0"
                  >
                    {sending ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="h-full flex flex-col items-center justify-center gap-4 text-center px-8 bg-[var(--practo-bg)]">
              <div className="w-16 h-16 rounded-3xl bg-[#28328c]/10 dark:bg-indigo-500/20 text-[#28328c] dark:text-indigo-300 flex items-center justify-center">
                <MessageCircleMore size={28} />
              </div>
              <div>
                <p className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-1">Chat with Your Doctor</p>
                <p className="text-sm text-slate-400 dark:text-slate-500 max-w-xs leading-relaxed">
                  Select a conversation from the left, or find a specialist to start a new direct consultation thread.
                </p>
              </div>
              <button
                onClick={() => navigate('/find-doctors')}
                className="mt-2 px-6 py-3 rounded-2xl bg-[#28328c] text-white text-sm font-bold hover:bg-[#1e2570] transition-all shadow-md shadow-[#28328c]/20"
              >
                Find a Specialist
              </button>
            </div>
          )}
        </section>
        )}
      </div>
    </div>
  );
};

export default Messages;
