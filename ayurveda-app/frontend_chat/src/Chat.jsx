import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate, Link, useLocation } from 'react-router-dom';
import {
  Send,
  Plus,
  User,
  Download,
  ChevronRight,
  MessageSquare,
  CheckCircle2,
  Stethoscope,
  Heart,
  Calendar,
  Zap,
  MoreVertical,
  Loader2,
  Activity,
  X,
  Sparkles,
  ShieldCheck,
  Mic,
  MicOff,
  Volume2,
  Square,
  Trash2,
  Clock,
  ChevronLeft,
  Leaf,
  UtensilsCrossed,
  FileText,
  Search,
} from 'lucide-react';
import './report.css';
import ReportRenderer from './ReportRenderer';
import VaidyaAvatar from './components/chat/VaidyaAvatar';
import AudioPlayerBar from './components/chat/AudioPlayerBar';
import ClinicalReportCard from './components/chat/ClinicalReportCard';
import PDFChartContainer from './components/PDFChartContainer';
import RecipesView from './pages/RecipesView';
import FindDoctors from './pages/dashboard/FindDoctors';
import { sanitizeMarkdownText } from './utils/textUtils';
import { downloadMedicalReportPDF } from './utils/pdfExport';
import {
  parseReportPayload,
  validateAndNormalizeV2Payload,
  validateAndNormalizeReportList,
  pickMainReport,
  resolveReportsFromSession,
} from './utils/reportPayload';
import { chatApi } from './services/api';
import { extractDiagnosisLabels, formatClinicalTitle, getSessionDisplayTitle, getSessionAyurvedicTitle, getChatHeaderTitle } from './utils/ayurvedicTerms';
import { parseServerDate, formatRelativeTime } from './utils/dateUtils';
import { resolvePatientUserId, persistPatientUser } from './utils/patientUser';
import { expandBotMessages, botMessagesFromReply } from './utils/chatMessages';
const Chat = () => {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const { sessionId: routeSessionId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(routeSessionId);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isMessagesLoading, setIsMessagesLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speechError, setSpeechError] = useState('');
  const [speakingMessageId, setSpeakingMessageId] = useState(null);
  const [ttsStatus, setTtsStatus] = useState('idle');
  const [ttsLabel, setTtsLabel] = useState('');
  const [activeSidePanel, setActiveSidePanel] = useState(null);
  const [panelWidth, setPanelWidth] = useState(480);
  const [diagnosisCompleted, setDiagnosisCompleted] = useState(false);
  const [diseaseName, setDiseaseName] = useState("");
  const [reportSchemaError, setReportSchemaError] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(
    () => typeof window === 'undefined' || window.innerWidth >= 1024,
  );
  const [isNarrowViewport, setIsNarrowViewport] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 1024,
  );

  useEffect(() => {
    const onResize = () => {
      const narrow = window.innerWidth < 1024;
      setIsNarrowViewport(narrow);
      if (narrow) setSidebarOpen(false);
      else setSidebarOpen(true);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const [historySearch, setHistorySearch] = useState('');
  const [sessionsLoadError, setSessionsLoadError] = useState('');
  const [showWellnessBanner, setShowWellnessBanner] = useState(false);
  const [wellnessPopupDismissed, setWellnessPopupDismissed] = useState(false);
  const [showReportPrompt, setShowReportPrompt] = useState(false);
  const [showReportDownloads, setShowReportDownloads] = useState(false);


  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const recognitionRef = useRef(null);
  const speechSynthesisRef = useRef(null);
  const ttsSegmentsRef = useRef([]);
  const ttsIndexRef = useRef(0);
  const ttsMessageIdRef = useRef(null);
  const ttsPausedRef = useRef(false);
  const chatAbortRef = useRef(null);
  const activeRequestIdRef = useRef(0);
  const wellnessDismissedRef = useRef(new Set());
  const wellnessAutoOpenAttemptedRef = useRef(null);

  const startResizingPanel = useCallback((e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = panelWidth;

    const onMouseMove = (moveEvent) => {
      const newWidth = startWidth - (moveEvent.clientX - startX);
      if (newWidth >= 360 && newWidth <= 800) setPanelWidth(newWidth);
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = 'default';
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.body.style.cursor = 'col-resize';
  }, [panelWidth]);

  const userData = JSON.parse(localStorage.getItem('user') || '{}');
  const userId = resolvePatientUserId(userData);
  const userDisplayName =
    [userData.name, userData.fullName, userData.displayName]
      .map((v) => (typeof v === 'string' ? v.trim() : ''))
      .find(Boolean) ||
    (userData.email ? String(userData.email).split('@')[0] : '') ||
    'You';
  const activeSession = sessions.find(s => s._id === (activeSessionId || routeSessionId));

  /** Server list is sorted by recency; merge in loaded messages from local state. */
  const mergeServerSessionSummaries = useCallback((prev, sessionList) => {
    const list = sessionList || [];
    const prevById = new Map(prev.map((s) => [s._id, s]));
    const merged = list.map((summary) => {
      const existing = prevById.get(summary._id);
      if (existing?.messagesLoaded) {
        return {
          ...summary,
          messages: existing.messages,
          messagesLoaded: true,
          title: existing.title || summary.title,
          diagnosis: existing.diagnosis || summary.diagnosis,
          reports: existing.reports || summary.reports,
        };
      }
      return summary;
    });
    const seen = new Set(list.map((s) => s._id));
    const orphan = prev.filter((s) => !seen.has(s._id));
    return orphan.length ? [...merged, ...orphan] : merged;
  }, []);

  const refreshSessionSidebarFromServer = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await chatApi.getSessions(userId);
      const sessionList = res.data.data || [];
      setSessions((prev) => mergeServerSessionSummaries(prev, sessionList));
      try {
        window.dispatchEvent(new CustomEvent('ayurcare-ai-sessions-changed'));
      } catch (_) { /* ignore */ }
    } catch (_err) { /* ignore */ }
  }, [userId, mergeServerSessionSummaries]);

  const stopReadingAloud = useCallback(() => {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    speechSynthesisRef.current = null;
    ttsSegmentsRef.current = [];
    ttsIndexRef.current = 0;
    ttsMessageIdRef.current = null;
    ttsPausedRef.current = false;
    setSpeakingMessageId(null);
    setTtsStatus('idle');
    setTtsLabel('');
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.onresult = null;
      recognitionRef.current.onerror = null;
      recognitionRef.current.onend = null;
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }
    setIsListening(false);
  }, []);

  const stripHtml = useCallback((html) => {
    if (typeof document === 'undefined') {
      return html || '';
    }
    const container = document.createElement('div');
    container.innerHTML = html || '';
    return (container.textContent || container.innerText || '').replace(/\s+/g, ' ').trim();
  }, []);

  const cleanSpeechValue = useCallback((value) => {
    if (Array.isArray(value)) {
      return value
        .map((item) => cleanSpeechValue(item))
        .filter(Boolean)
        .join('. ');
    }

    if (value && typeof value === 'object') {
      return Object.values(value)
        .map((item) => cleanSpeechValue(item))
        .filter(Boolean)
        .join('. ');
    }

    return stripHtml(sanitizeMarkdownText(String(value || ''))).replace(/\s+/g, ' ').trim();
  }, [stripHtml]);

  const splitSpeechIntoChunks = useCallback((text, maxLength = 220) => {
    const normalized = cleanSpeechValue(text);
    if (!normalized) return [];
    if (normalized.length <= maxLength) return [normalized];

    const sentences = normalized
      .split(/(?<=[.!?])\s+/)
      .map((part) => part.trim())
      .filter(Boolean);

    if (sentences.length <= 1) {
      const chunks = [];
      let buffer = '';
      normalized.split(' ').forEach((word) => {
        if ((buffer + ' ' + word).trim().length > maxLength) {
          if (buffer.trim()) chunks.push(buffer.trim());
          buffer = word;
        } else {
          buffer = buffer ? `${buffer} ${word}` : word;
        }
      });
      if (buffer.trim()) chunks.push(buffer.trim());
      return chunks;
    }

    const chunks = [];
    let buffer = '';
    sentences.forEach((sentence) => {
      if ((buffer + ' ' + sentence).trim().length > maxLength) {
        if (buffer.trim()) chunks.push(buffer.trim());
        buffer = sentence;
      } else {
        buffer = buffer ? `${buffer} ${sentence}` : sentence;
      }
    });
    if (buffer.trim()) chunks.push(buffer.trim());
    return chunks;
  }, [cleanSpeechValue]);

  const buildReportSpeechSegments = useCallback((reportData) => {
    if (!reportData || typeof reportData !== 'object') return '';

    const segments = [];
    const reportName = reportData?.diagnosis?.name || reportData?.name || reportData?.title || 'your report';
    const pushSection = (label, content) => {
      const body = cleanSpeechValue(content);
      if (!body) return;
      segments.push(`${label}. ${body}`);
    };

    const symptoms = reportData.symptomsReported || reportData.supportingFindings || reportData.pain_points || [];
    const analysis = reportData.clinicalImpression || reportData.diagnosis?.reasoning || reportData.integrated_synthesis || reportData.section1_content;
    const diagnosis = reportData.diagnosis?.name || reportData.diagnosis || reportData.title || reportName;
    const treatments = reportData.treatmentNarrative || reportData.treatments || reportData.treatment_plan || reportData.clinical_protocol || reportData.section2_content;
    const herbs = reportData.herbalPreparations || reportData.herbal_meds || reportData.medicinesAndSupports || reportData.herbal_medications || reportData.herbalMeds;
    const closing = reportData.recoveryExpectation || reportData.finalClarity || reportData.prognosis || reportData.shortTermOutlook;

    segments.push(`Here is the full review for ${reportName}.`);
    pushSection('Symptoms', symptoms);
    pushSection('Analysis', analysis);
    pushSection('Diagnosis', diagnosis);
    pushSection('Treatments', treatments);
    pushSection('Herbs', herbs);
    pushSection('Closing guidance', closing);

    return segments;
  }, [cleanSpeechValue]);

  const speakSpeechSegments = useCallback((segments, messageId, label = 'Vaidya AI') => {
    if (!window.speechSynthesis || !Array.isArray(segments) || segments.length === 0) return;

    ttsSegmentsRef.current = segments;
    ttsIndexRef.current = 0;
    ttsMessageIdRef.current = messageId;
    ttsPausedRef.current = false;
    setTtsLabel(label);
    setTtsStatus('playing');
    setSpeakingMessageId(messageId);

    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
    }

    const speakNext = () => {
      if (ttsPausedRef.current) return;
      if (ttsIndexRef.current >= segments.length) {
        stopReadingAloud();
        return;
      }

      const chunk = segments[ttsIndexRef.current];
      ttsIndexRef.current += 1;
      const utterance = new SpeechSynthesisUtterance(chunk);
      utterance.lang = 'en-US';
      utterance.rate = 1;
      utterance.pitch = 1;
      utterance.onstart = () => {
        setSpeakingMessageId(messageId);
        setTtsStatus('playing');
      };
      utterance.onend = speakNext;
      utterance.onerror = () => stopReadingAloud();
      speechSynthesisRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    };

    speakNext();
  }, [stopReadingAloud]);

  const pauseReadingAloud = useCallback(() => {
    if (!window.speechSynthesis) return;
    ttsPausedRef.current = true;
    if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
      window.speechSynthesis.pause();
    } else {
      window.speechSynthesis.cancel();
    }
    setTtsStatus('paused');
  }, []);

  const resumeReadingAloud = useCallback(() => {
    if (!window.speechSynthesis) return;
    ttsPausedRef.current = false;
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
      setTtsStatus('playing');
      return;
    }
    const segments = ttsSegmentsRef.current;
    const startAt = ttsIndexRef.current;
    if (segments.length && startAt < segments.length) {
      speakSpeechSegments(segments.slice(startAt), ttsMessageIdRef.current, ttsLabel || 'Vaidya AI');
    }
  }, [speakSpeechSegments, ttsLabel]);

  const readMessageAloud = useCallback((message) => {
    if (!message?.text) return;
    if (!window.speechSynthesis) {
      setSpeechError('Text-to-speech is not supported in this browser.');
      return;
    }

    const messageText = stripHtml(sanitizeMarkdownText(message.text));
    if (!messageText) return;

    const messageId = message._id || message.id || null;
    if (speakingMessageId && speakingMessageId === messageId) {
      stopReadingAloud();
      return;
    }

    speakSpeechSegments([messageText], messageId, 'Vaidya AI message');
  }, [speakingMessageId, stopReadingAloud, stripHtml, speakSpeechSegments]);

  const readReportAloud = useCallback((reportData, messageId) => {
    if (!window.speechSynthesis) {
      setSpeechError('Text-to-speech is not supported in this browser.');
      return;
    }

    const segments = buildReportSpeechSegments(reportData)
      .flatMap((segment) => splitSpeechIntoChunks(segment, 220));

    if (!segments.length) return;
    speakSpeechSegments(segments, messageId, 'Clinical report');
  }, [buildReportSpeechSegments, speakSpeechSegments, splitSpeechIntoChunks]);

  const startVoiceInput = useCallback(() => {
    if (!SpeechRecognition) {
      setSpeechError('Voice input is not supported in this browser.');
      return;
    }

    if (isListening) {
      stopListening();
      return;
    }

    setSpeechError('');
    stopReadingAloud();

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        transcript += event.results[i][0].transcript;
      }
      const trimmed = transcript.trim();
      if (trimmed) {
        setInput(trimmed);
      }
    };

    recognition.onerror = (event) => {
      const error = event?.error || 'Speech recognition error';
      setSpeechError(error === 'not-allowed'
        ? 'Microphone permission was denied.'
        : 'Could not understand the voice input. Please try again.');
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    setIsListening(true);

    try {
      recognition.start();
    } catch (_err) {
      setSpeechError('Unable to start microphone input right now.');
      setIsListening(false);
      recognitionRef.current = null;
    }
  }, [SpeechRecognition, isListening, stopListening, stopReadingAloud]);

  useEffect(() => () => {
    stopListening();
    stopReadingAloud();
  }, [stopListening, stopReadingAloud]);

  const normalizeReports = (payload) => validateAndNormalizeV2Payload(payload);

  const getSessionReports = (session) => resolveReportsFromSession(session);

  const resolveSessionDiagnosis = useCallback((session) => {
    if (!session) return '';
    const raw = session.diagnosis;
    if (raw && String(raw).trim()) return String(raw).trim();
    const reports = resolveReportsFromSession(session);
    const first = reports[0]?.reportData;
    if (!first) return '';
    const d = first.diagnosis;
    if (typeof d === 'object' && d) {
      return [d.name, d.ayurvedicName].filter(Boolean).join(' — ') || '';
    }
    if (typeof d === 'string' && d.trim()) return d.trim();
    return (first.clinicalImpression || '').trim();
  }, []);

  const closeSidePanel = useCallback(() => {
    const sid = activeSession?._id;
    if (activeSidePanel === 'recipes' && sid) {
      wellnessDismissedRef.current.add(sid);
    }
    setActiveSidePanel(null);
  }, [activeSession?._id, activeSidePanel]);

  const downloadSingleReport = (report) => {
    if (!report) return;
    const reportData = report.reportData && typeof report.reportData === 'object' ? report.reportData : report;
    downloadMedicalReportPDF(reportData, {
      reportType: report.reportType,
      reportTitle: report.title || report.reportType,
    });
  };

  const ReportDownloadList = ({ reports, className = '' }) => {
    if (!reports?.length) return null;
    return (
      <div className={`grid gap-2 ${className}`}>
        {reports.map((r, idx) => {
          const label = r.reportType || r.title || `Clinical report ${idx + 1}`;
          const reportData = r.reportData && typeof r.reportData === 'object' ? r.reportData : r;
          const diag = reportData?.diagnosis;
          const subtitle = typeof diag === 'object'
            ? [diag?.name, diag?.ayurvedicName].filter(Boolean).join(' · ')
            : (reportData?.clinicalImpression || '').slice(0, 72);
          return (
            <button
              key={`${label}-${idx}`}
              type="button"
              onClick={() => downloadSingleReport(r)}
              className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800/90 px-4 py-3 text-left hover:border-[#28328c]/40 dark:hover:border-indigo-400/40 hover:bg-slate-50 dark:hover:bg-slate-700/70 transition active:scale-[0.99]"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-slate-900 dark:text-slate-50 truncate">{label}</p>
                {subtitle ? (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">{subtitle}{subtitle.length >= 72 ? '…' : ''}</p>
                ) : null}
              </div>
              <span className="flex items-center gap-1.5 text-[11px] font-bold text-[#28328c] flex-shrink-0">
                <Download size={15} />
                PDF
              </span>
            </button>
          );
        })}
      </div>
    );
  };

  useEffect(() => {
    const reports = getSessionReports(activeSession);
    if (reports.length > 0) {
      setDiagnosisCompleted(true);
      const firstReport = reports[0]?.reportData || null;
      const diagnosis = firstReport?.diagnosis;
      const modern =
        (typeof diagnosis === 'object' ? diagnosis?.name : diagnosis) ||
        activeSession?.title ||
        'Wellness Plan';
      const ayurvedic =
        typeof diagnosis === 'object'
          ? diagnosis?.ayurvedicName || diagnosis?.ayurvedic_name || diagnosis?.sanskritName
          : '';
      setDiseaseName(formatClinicalTitle(modern, ayurvedic) || modern);
      setReportSchemaError('');
    } else {
      setDiagnosisCompleted(false);
      setDiseaseName("");
      if (activeSession?.diagnosis) {
        setReportSchemaError('Report format is invalid or outdated. Expected reports.v2 schema.');
      } else {
        setReportSchemaError('');
      }
    }
  }, [activeSession?.diagnosis, activeSession?.title, activeSession?.reports]);

  // Sync activeSessionId with route
  useEffect(() => {
    if (routeSessionId && routeSessionId !== activeSessionId) {
      setActiveSessionId(routeSessionId);
    }
  }, [routeSessionId]);

  // Load basic session list
  useEffect(() => {
    const uid = resolvePatientUserId();
    if (!uid) {
      setSessionsLoadError('Sign in again to load your chat history.');
      return;
    }
    persistPatientUser(userData);

    const loadSessions = async () => {
      try {
        const res = await chatApi.getSessions(uid);
        const sessionList = res.data?.data || [];
        setSessions((prev) => mergeServerSessionSummaries(prev, sessionList));
        setSessionsLoadError('');
        if (sessionList.length > 0) {
          setSidebarOpen(true);
        }

        if (!routeSessionId && sessionList.length > 0) {
          navigate(`/chat/${sessionList[0]._id}`, { replace: true });
        } else if (!routeSessionId && sessionList.length === 0) {
          handleNewSession();
        }

        // Eagerly pre-fetch recent sessions so switching is instant
        sessionList.slice(0, 12).forEach(async (s) => {
          try {
            const r = await chatApi.getSession(s._id);
            const sd = r.data.data;
            if (!sd) return;
            setSessions((prev) => {
              const idx = prev.findIndex((ss) => ss._id === s._id);
              if (idx === -1 || prev[idx]?.messagesLoaded) return prev;
              const reports = resolveReportsFromSession(sd);
              const derivedTitle = getSessionDisplayTitle({ ...sd, reports });
              const storedTitle = String(sd.title || '').trim();
              const title = storedTitle && storedTitle !== 'New Consultation' ? storedTitle : derivedTitle;
              const hydrated = {
                ...sd,
                title,
                reports: reports.length ? reports : sd.reports,
                messages: expandBotMessages(sd.messages || []),
                messagesLoaded: true,
              };
              const next = [...prev];
              next[idx] = hydrated;
              return next;
            });
          } catch (_) {}
        });
      } catch (err) {
        console.error('Failed to load chat sessions:', err);
        setSessionsLoadError('Could not load past chats. Ensure bot-brain is running on port 5002.');
      }
    };
    loadSessions();
  }, [mergeServerSessionSummaries, routeSessionId]);

  // Load detailed messages
  useEffect(() => {
    const sid = routeSessionId;
    if (!sid) return;

    const sess = sessions.find(s => s._id === sid);
    if (sess?.messagesLoaded) return;

    const loadFull = async () => {
      try {
        const res = await chatApi.getSession(sid);
        const sessionData = res.data.data;
        if (!sessionData) return;
        
        setSessions(prev => {
          const reports = resolveReportsFromSession(sessionData);
          const derivedTitle = getSessionDisplayTitle({ ...sessionData, reports });
          const storedTitle = String(sessionData.title || '').trim();
          const title =
            storedTitle && storedTitle !== 'New Consultation' ? storedTitle : derivedTitle;
          const hydrated = {
            ...sessionData,
            title,
            reports: reports.length ? reports : sessionData.reports,
            messages: expandBotMessages(sessionData.messages || []),
            messagesLoaded: true,
          };
          const index = prev.findIndex(s => s._id === sid);
          if (index !== -1) {
            const next = [...prev];
            next[index] = hydrated;
            return next;
          }
          return [hydrated, ...prev];
        });
      } catch (_err) { }
      finally { setIsMessagesLoading(false); }
    };
    loadFull();
  }, [routeSessionId, sessions.length]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeSession?.messages, isLoading, isMessagesLoading]);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 160)}px`;
    }
  }, [input]);

  const handleNewSession = async () => {
    if (!userId || isLoading) return null;
    setIsLoading(true);
    try {
      const res = await chatApi.createSession(userId);
      const newSess = res.data.data;
      if (newSess && newSess._id) {
        setSessions(prev => [newSess, ...prev]);
        navigate(`/chat/${newSess._id}`, { replace: true });
        try {
          window.dispatchEvent(new CustomEvent('ayurcare-ai-sessions-changed'));
        } catch (_) { /* ignore */ }
        return newSess;
      }
      return null;
    } catch (err) {
      console.error('Chat session creation failed:', err);
      return null;
    }
    finally { setIsLoading(false); }
  };

  useEffect(() => {
    if (location.state?.forceNew) {
      handleNewSession();
      // Clear the state so we don't recreate on re-renders
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, navigate]);

  useEffect(() => {
    const onNewSession = () => handleNewSession();
    window.addEventListener('new-session-requested', onNewSession);
    return () => window.removeEventListener('new-session-requested', onNewSession);
  }, [userId, isLoading]);

  const handleStopGeneration = useCallback(() => {
    activeRequestIdRef.current += 1;
    chatAbortRef.current?.abort();
    setIsLoading(false);
    const sessId = routeSessionId || activeSessionId;
    if (!sessId) return;
    setSessions((prev) =>
      prev.map((s) => {
        if (s._id !== sessId) return s;
        const msgs = [...(s.messages || [])];
        while (msgs.length && msgs[msgs.length - 1]?.isThinking) {
          msgs.pop();
        }
        return { ...s, messages: msgs };
      }),
    );
  }, [routeSessionId, activeSessionId]);

  const handleSend = async () => {
    const userText = input.trim();
    if (!userText || isLoading) return;

    let sessId = routeSessionId || activeSessionId;
    if (!sessId) {
      const created = await handleNewSession();
      if (!created) return;
      sessId = created._id;
    }
    setInput('');
    setIsLoading(true);
    const requestId = activeRequestIdRef.current + 1;
    activeRequestIdRef.current = requestId;
    chatAbortRef.current?.abort();
    const abortController = new AbortController();
    chatAbortRef.current = abortController;

    const touchNow = new Date().toISOString();
    setSessions(prev => prev.map(s => s._id === sessId ? {
      ...s,
      updatedAt: touchNow,
      messages: [...(s.messages || []), { role: 'user', text: userText }, { role: 'bot', text: '', isThinking: true }]
    } : s));

    try {
      const currentSess = sessions.find(s => s._id === sessId);
      const res = await chatApi.ask(sessId, userText, currentSess?.diagnosis || '', {
        signal: abortController.signal,
      });
      if (requestId !== activeRequestIdRef.current) return;
      const data = res.data;

      if (data.type === 'diagnosis') {
        const payload = parseReportPayload(data.content);
        const normalized = normalizeReports(payload);
        const reports = normalized.valid ? normalized.reports : [];
        if (!normalized.valid) {
          setReportSchemaError(normalized.reason || 'Invalid report schema');
        } else {
          setReportSchemaError('');
        }
        const clinicalTitle = data.title || getSessionDisplayTitle({ diagnosis: data.content, reports });
        setSessions(prev => prev.map(s => s._id === sessId ? {
          ...s,
          updatedAt: touchNow,
          title: clinicalTitle,
          diagnosis: data.content,
          reports,
          messages: s.messages.slice(0, -1).concat({ role: 'report', text: data.content })
        } : s));
        setTimeout(() => {
          setSessions(prev => prev.map(s => s._id === sessId ? {
            ...s,
            messages: [
              ...s.messages,
              {
                role: 'bot',
                text: normalized.valid
                  ? 'Diagnostic analysis complete. A personalized wellness plan with custom recipes will be generated according to your report. I have also compiled a list of recommended doctors based on the required treatments. You can access these by clicking the buttons next to your report.'
                  : 'Diagnostic output was received, but the report schema is invalid for this app version. Please regenerate the report.'
              }
            ]
          } : s));
          // Auto-show wellness popup after diagnosis
          if (normalized.valid) {
            setWellnessPopupDismissed(false);
            setShowWellnessBanner(true);
          }
        }, 1000);
      } else {
        const botText = data.content || data.question || '';
        const bubbles = botMessagesFromReply(botText);

        setSessions(prev => prev.map(s => s._id === sessId ? {
          ...s,
          updatedAt: touchNow,
          messages: s.messages.slice(0, -1).concat(bubbles)
        } : s));
      }
      await refreshSessionSidebarFromServer();
    } catch (err) {
      const canceled =
        err?.code === 'ERR_CANCELED' ||
        err?.name === 'CanceledError' ||
        err?.message?.includes('canceled');
      if (canceled || requestId !== activeRequestIdRef.current) return;
      setSessions(prev => prev.map(s => s._id === sessId ? {
        ...s,
        messages: s.messages.filter((m) => !m.isThinking).concat({
          role: 'bot',
          text: 'I could not reach the assistant right now. Please check your connection and try again.'
        })
      } : s));
      console.error('Chat send failed:', err);
    }
    finally {
      if (requestId === activeRequestIdRef.current) {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    const handleGlobalShowPlan = () => setActiveSidePanel('recipes');
    window.addEventListener('show-wellness-plan', handleGlobalShowPlan);
    return () => window.removeEventListener('show-wellness-plan', handleGlobalShowPlan);
  }, []);

  useEffect(() => {
    if (activeSession?.diagnosis || (activeSession?.reports && activeSession.reports.length > 0)) {
      const reports = getSessionReports(activeSession);
      const firstReport = reports[0]?.reportData || null;
      if (firstReport) {
        localStorage.setItem('active_report', JSON.stringify({ ...firstReport, hasPlan: !!activeSession.recipesText }));
        window.dispatchEvent(new CustomEvent('diagnosis-updated'));
      }
    } else {
      localStorage.removeItem('active_report');
      window.dispatchEvent(new CustomEvent('diagnosis-updated'));
    }
  }, [activeSession?.diagnosis, activeSession?.reports, activeSession?.recipesText]);

  const handleRecipes = useCallback(async () => {
    if (!activeSession?._id) return;
    wellnessDismissedRef.current.delete(activeSession._id);
    const diagnosisPayload = resolveSessionDiagnosis(activeSession);
    if (isLoading || !diagnosisPayload) {
      if (!diagnosisCompleted) {
        alert('Please complete your clinical report before opening the wellness plan.');
      }
      return;
    }
    const cached = activeSession.recipesText || '';
    const cachedRecipeCount = cached.split(/---RECIPE---/i).filter((b) => /title:|ingredients:/i.test(b)).length;
    if (cached && cachedRecipeCount >= 3) {
      setActiveSidePanel('recipes');
      return;
    }
    setIsLoading(true);
    setActiveSidePanel('recipes');
    try {
      const res = await chatApi.getRecipes(activeSession._id, diagnosisPayload, { force: cachedRecipeCount < 3 });
      const recipesText = res.data?.recipes || '';
      if (!recipesText.trim()) {
        throw new Error('Empty wellness plan response');
      }
      setSessions(prev => prev.map(s => s._id === activeSession._id ? { ...s, recipesText } : s));
    } catch (err) {
      console.error('Wellness plan error:', err);
      alert('Could not load your wellness plan. Ensure bot-brain is running on port 5002, then try again.');
      setActiveSidePanel(null);
    } finally { setIsLoading(false); }
  }, [activeSession, diagnosisCompleted, isLoading, resolveSessionDiagnosis]);

  const handleAyurvedicGuide = useCallback(() => {
    if (!activeSession?._id) return;
    const diagnosisPayload = resolveSessionDiagnosis(activeSession);
    if (!diagnosisPayload) {
      alert('Please complete your clinical report before opening the Ayurvedic guide.');
      return;
    }
    navigate(`/ayurvedic-guide?sessionId=${activeSession._id}`);
  }, [activeSession, navigate, resolveSessionDiagnosis]);

  useEffect(() => {
    wellnessAutoOpenAttemptedRef.current = null;
  }, [activeSession?._id]);

  useEffect(() => {
    const sid = activeSession?._id;
    if (!sid || !diagnosisCompleted || isNarrowViewport) return;
    if (wellnessDismissedRef.current.has(sid)) return;
    if (activeSidePanel === 'doctors') return;
    if (activeSidePanel) return;
    if (wellnessAutoOpenAttemptedRef.current === sid) return;
    const diagnosisPayload = resolveSessionDiagnosis(activeSession);
    if (!diagnosisPayload && !activeSession?.recipesText) return;

    wellnessAutoOpenAttemptedRef.current = sid;
    void handleRecipes();
  }, [
    diagnosisCompleted,
    sidebarOpen,
    isNarrowViewport,
    activeSession?._id,
    activeSession?.recipesText,
    activeSidePanel,
    handleRecipes,
    resolveSessionDiagnosis,
    activeSession,
  ]);

  const handleDeleteSession = async (sessId, e) => {
    e.stopPropagation();
    if (!window.confirm('Delete this consultation? This cannot be undone.')) return;
    try {
      await chatApi.deleteSession(sessId);
      setSessions(prev => prev.filter(s => s._id !== sessId));
      try {
        window.dispatchEvent(new CustomEvent('ayurcare-ai-sessions-changed'));
      } catch (_) { /* ignore */ }
      if ((routeSessionId || activeSessionId) === sessId) {
        const remaining = sessions.filter(s => s._id !== sessId);
        if (remaining.length > 0) navigate(`/chat/${remaining[0]._id}`, { replace: true });
        else handleNewSession();
      }
    } catch (_err) { }
  };

  const getSessionTitle = (sess) => getSessionDisplayTitle(sess);

  const chatHeaderTitle = useMemo(
    () => getChatHeaderTitle(activeSession, diseaseName),
    [activeSession, diseaseName],
  );

  const chatHeaderSubtitle = useMemo(() => {
    if (!activeSession?.diagnosis) return '';
    if (diagnosisCompleted) return 'Clinical report ready';
    return 'Consultation in progress';
  }, [activeSession?.diagnosis, diagnosisCompleted]);

  const formatSessionDate = (dateStr) => formatRelativeTime(dateStr);

  const groupedSessionHistory = useMemo(() => {
    const titleOf = (sess) => getSessionDisplayTitle(sess);
    const q = historySearch.trim().toLowerCase();
    const filtered = !q
      ? sessions
      : sessions.filter((sess) => {
          if (titleOf(sess).toLowerCase().includes(q)) return true;
          return (sess.messages || []).some(
            (m) => m.role === 'user' && String(m.text || '').toLowerCase().includes(q),
          );
        });

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);
    const weekAgo = new Date(startOfToday);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const buckets = { Today: [], Yesterday: [], 'Previous 7 days': [], Earlier: [] };
    for (const s of filtered) {
      const d = parseServerDate(s.updatedAt || s.createdAt) || new Date(0);
      if (Number.isNaN(d.getTime())) {
        buckets.Earlier.push(s);
        continue;
      }
      if (d >= startOfToday) buckets.Today.push(s);
      else if (d >= startOfYesterday) buckets.Yesterday.push(s);
      else if (d >= weekAgo) buckets['Previous 7 days'].push(s);
      else buckets.Earlier.push(s);
    }
    const order = ['Today', 'Yesterday', 'Previous 7 days', 'Earlier'];
    return order
      .filter((k) => buckets[k].length)
      .map((label) => ({ label, items: buckets[label] }));
  }, [sessions, historySearch]);

  const showHistoryPanel = sidebarOpen || isNarrowViewport;
  const historyColWidth = sidebarOpen ? 'min(300px, 88vw)' : '0px';

  return (
    <div className="chat-vaidya-root flex-1 min-h-0 h-full w-full relative font-sans text-[var(--practo-text)]">

      {isNarrowViewport && sidebarOpen && (
        <button
          type="button"
          aria-label="Close chat history"
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-[1px] lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      {/* ── Session history ── */}
      {showHistoryPanel && (!isNarrowViewport || sidebarOpen) ? (
      <aside
        className={`chat-vaidya-history h-full min-h-0 overflow-hidden bg-white dark:bg-[#161f2e] z-50 max-lg:fixed max-lg:left-0 max-lg:top-0 max-lg:shadow-2xl ${
          isNarrowViewport
            ? 'max-lg:border-r max-lg:border-slate-200/80 dark:max-lg:border-slate-700'
            : sidebarOpen
              ? 'border-r border-slate-200/80 dark:border-slate-700'
              : 'max-lg:hidden w-0 overflow-hidden border-0'
        }`}
        style={
          isNarrowViewport
            ? { width: historyColWidth, transition: 'width 280ms ease' }
            : sidebarOpen
              ? undefined
              : { width: 0, minWidth: 0, padding: 0, border: 'none' }
        }
        aria-hidden={!sidebarOpen}
      >
      <div className="w-[280px] sm:w-[300px] h-full flex flex-col min-h-0">
        <div className="p-3 flex-shrink-0 border-b border-slate-200/60 dark:border-slate-600/70">
          <button
            type="button"
            onClick={handleNewSession}
            disabled={isLoading}
            className="w-full flex items-center gap-2 rounded-lg border border-[#e0e7ed] dark:border-slate-600 bg-[#f0f4f7] dark:bg-slate-800/80 px-3 py-2.5 text-sm font-semibold text-[#28328c] dark:text-indigo-300 hover:bg-white dark:hover:bg-slate-700 transition disabled:opacity-50"
          >
            <Plus size={16} className="text-[#28328c] dark:text-indigo-300" />
            New chat
          </button>
        </div>
        <div className="px-3 pt-1 pb-0.5 flex-shrink-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Nidana Itihasa{sessions.length > 0 ? ` (${sessions.length})` : ''}
          </p>
        </div>
        <div className="px-2 pt-1 pb-1 flex-shrink-0">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" size={14} />
            <input
              type="search"
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
              placeholder="Search past chats…"
              className="w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/60 py-2 pl-8 pr-2 text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-[#28328c]/40 dark:focus:border-indigo-400/50 focus:outline-none focus:ring-2 focus:ring-[#28328c]/15 dark:focus:ring-indigo-500/25"
            />
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto py-1.5 px-2 space-y-3 custom-scrollbar">
          {sessionsLoadError && (
            <div className="px-3 py-2 text-center text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800/70 rounded-lg">
              {sessionsLoadError}
            </div>
          )}
          {groupedSessionHistory.length === 0 && !sessionsLoadError && (
            <div className="px-3 py-8 text-center text-xs text-slate-400 dark:text-slate-500">
              {historySearch.trim() ? 'No chats match your search.' : 'Start a new chat to begin your consultation.'}
            </div>
          )}
          {groupedSessionHistory.map((group) => (
            <div key={group.label}>
              <p className="px-2 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{group.label}</p>
              <div className="space-y-0.5">
                {group.items.map((sess) => {
                  const isActive = sess._id === (routeSessionId || activeSessionId);
                  return (
                    <div key={sess._id}
                      className={`group relative flex items-center gap-2 rounded-lg px-3 py-2.5 cursor-pointer transition-all ${isActive ? 'bg-[#28328c] text-white shadow-sm' : 'hover:bg-white/80 dark:hover:bg-slate-800/95 text-slate-700 dark:text-slate-200'}`}
                      onClick={() => {
                        navigate(`/chat/${sess._id}`);
                        if (isNarrowViewport) setSidebarOpen(false);
                      }}>
                      <MessageSquare size={14} className={`flex-shrink-0 ${isActive ? 'text-white/90' : 'text-slate-400'}`} />
                      <div className="flex-1 min-w-0">
                        <p className={`text-[13px] font-medium truncate ${isActive ? 'text-white' : 'text-slate-800 dark:text-slate-100'}`}>{getSessionTitle(sess)}</p>
                        <p className={`text-[10px] truncate mt-0.5 ${isActive ? 'text-white/70' : 'text-slate-400 dark:text-slate-500'}`}>
                          {formatSessionDate(sess.updatedAt || sess.createdAt)}
                          {sess.diagnosis ? ' · Report ready' : ''}
                        </p>
                      </div>
                      <button type="button" onClick={(e) => handleDeleteSession(sess._id, e)}
                        className={`opacity-0 group-hover:opacity-100 flex-shrink-0 p-1 rounded-md transition-all ${isActive ? 'hover:bg-white/20 text-white/70' : 'hover:bg-red-50 dark:hover:bg-red-950/60 text-slate-400 hover:text-red-500 dark:hover:text-red-400'}`} title="Delete">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

      </div>
      </aside>
      ) : null}

      {/* ── Chat + optional wellness / doctors panel ── */}
      <div
        className="flex flex-1 min-w-0 min-h-0 overflow-hidden"
        style={
          !isNarrowViewport && activeSidePanel
            ? { display: 'grid', gridTemplateColumns: `minmax(0, 1fr) ${panelWidth}px` }
            : undefined
        }
      >
      <section className="chat-vaidya-main bg-[var(--practo-bg)]">

        <div className="w-full min-h-[52px] bg-white dark:bg-[#161f2e] border-b border-slate-200 dark:border-slate-700 flex items-center gap-2 px-3 sm:px-4 py-2 flex-shrink-0 z-20 min-w-0">
          <button
            type="button"
            onClick={() => setSidebarOpen((o) => !o)}
            className="flex-shrink-0 w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 flex items-center justify-center hover:bg-slate-50 dark:hover:bg-slate-800 transition"
            title={sidebarOpen ? 'Hide history' : 'Show history'}
            aria-label={sidebarOpen ? 'Hide history' : 'Show history'}
          >
            {sidebarOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
          </button>
          <Link
            to="/"
            className="inline-flex flex-shrink-0 items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-600 px-2.5 py-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <ChevronLeft size={14} /> <span className="hidden sm:inline">Hub</span>
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="text-slate-900 dark:text-slate-50 font-semibold text-sm sm:text-base truncate leading-tight">
              <span className="text-[#28328c] dark:text-indigo-300">Vaidya</span>{' '}
              <span className="text-[#14bef0] dark:text-sky-400">AI</span>
              {chatHeaderTitle && chatHeaderTitle !== 'Vaidya AI' ? (
                <span className="text-slate-500 dark:text-slate-400 font-medium"> · {chatHeaderTitle}</span>
              ) : null}
            </h1>
            {chatHeaderSubtitle ? (
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">{chatHeaderSubtitle}</p>
            ) : null}
          </div>
          {!activeSidePanel && diagnosisCompleted && (
            <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-2 ml-auto">
              <button
                onClick={() => setShowReportDownloads(true)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3 sm:py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-slate-900 dark:text-slate-50 rounded-lg text-[11px] sm:text-xs font-bold shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 whitespace-nowrap"
                title="Choose a report to download"
              >
                <Download size={14} strokeWidth={2.5} />
                <span className="hidden sm:inline">Reports</span>
              </button>
              <button
                onClick={handleRecipes}
                className="flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3 sm:py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-slate-900 dark:text-slate-50 rounded-lg text-[11px] sm:text-xs font-bold shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 whitespace-nowrap"
                title="View Wellness Plan"
              >
                <Sparkles size={14} className="text-emerald-600 dark:text-emerald-400" />
                <span className="hidden sm:inline">Plan</span>
              </button>
              <button
                onClick={() => setActiveSidePanel('doctors')}
                className="flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3 sm:py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-slate-900 dark:text-slate-50 rounded-lg text-[11px] sm:text-xs font-bold shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 whitespace-nowrap"
                title="Recommended Doctors"
              >
                <Stethoscope size={14} className="text-blue-600 dark:text-blue-400" />
                <span className="hidden sm:inline">Doctors</span>
              </button>
            </div>
          )}
        </div>

        {reportSchemaError ? (
          <div className="px-4 sm:px-5 mt-3 flex-shrink-0">
            <div className="chat-thread w-full px-4 py-3 rounded-xl border border-red-200 dark:border-red-900/70 bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 text-sm font-semibold">
              {reportSchemaError}
            </div>
          </div>
        ) : null}

        {/* ── Wellness Plan Auto-Popup Banner ── */}
        {showWellnessBanner && !wellnessPopupDismissed && (
          <div className="px-4 sm:px-5 mt-3 flex-shrink-0">
          <div className="chat-thread w-full rounded-2xl border border-emerald-200 dark:border-emerald-800/80 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/50 dark:to-teal-950/40 px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-4 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/60 flex items-center justify-center flex-shrink-0">
              <Leaf size={20} className="text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-emerald-900 dark:text-emerald-100">Your Wellness Plan is Ready 🌿</p>
              <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-0.5">Based on your diagnosis, we've prepared 2–3 personalised Ayurvedic recipes and a daily routine for you.</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button onClick={async () => { setShowWellnessBanner(false); await handleRecipes(); }}
                className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition flex items-center gap-1.5">
                <UtensilsCrossed size={13} /> View Plan
              </button>
              <button onClick={() => { setShowWellnessBanner(false); setWellnessPopupDismissed(true); }}
                className="p-1.5 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/50 text-emerald-500 dark:text-emerald-400 transition"><X size={14} /></button>
            </div>
          </div>
          </div>
        )}

        {/* ── Report Generation Prompt ── */}
        {showReportPrompt && (
          <div className="px-4 sm:px-5 mt-3 flex-shrink-0">
          <div className="chat-thread w-full rounded-2xl border border-[#28328c]/25 dark:border-indigo-400/30 bg-[#28328c]/5 dark:bg-indigo-950/40 px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-4 shadow-sm">
            <div className="w-10 h-10 rounded-xl bg-[#28328c]/10 dark:bg-indigo-500/20 flex items-center justify-center flex-shrink-0">
              <FileText size={20} className="text-[#28328c] dark:text-indigo-300" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-[#28328c] dark:text-indigo-200">Generate Full Clinical Report?</p>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">Would you like a downloadable PDF report based on your consultation?</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button onClick={() => { setShowReportPrompt(false); setShowReportDownloads(true); }}
                className="px-4 py-2 rounded-xl bg-[#28328c] dark:bg-indigo-600 text-white text-xs font-bold hover:bg-[#1e2570] dark:hover:bg-indigo-700 transition flex items-center gap-1.5">
                <Download size={13} /> Choose report
              </button>
              <button onClick={() => setShowReportPrompt(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 dark:text-slate-500 transition"><X size={14} /></button>
            </div>
          </div>
          </div>
        )}

        <div className={`chat-vaidya-messages scroll-smooth custom-scrollbar bg-[var(--practo-bg)] ${activeSession?.diagnosis ? 'pt-2' : ''}`}>
          <div className="chat-thread px-4 sm:px-5 py-5 flex flex-col gap-5">

            {isMessagesLoading ? (
              <div className="flex flex-col gap-4 py-4 px-2 w-full">
                {[{ w: 'w-3/5', rev: false }, { w: 'w-2/5', rev: true }, { w: 'w-4/5', rev: false }, { w: 'w-1/2', rev: true }].map((s, i) => (
                  <div key={i} className={`flex gap-3 items-end ${s.rev ? 'flex-row-reverse' : ''}`}>
                    <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 animate-pulse flex-shrink-0" />
                    <div className={`${s.w} h-10 rounded-2xl bg-slate-200 dark:bg-slate-700 animate-pulse`} />
                  </div>
                ))}
              </div>
            ) : (!activeSession?.messages || activeSession.messages.length === 0) ? (
              <div className="py-10 sm:py-14 flex flex-col items-center text-center space-y-6 animate-fade-in w-full">
                <VaidyaAvatar size={64} />
                <div className="max-w-md">
                  <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-slate-50 tracking-tight leading-tight">
                    <span className="text-[#28328c] dark:text-indigo-300">Vaidya</span>{' '}
                    <span className="text-[#14bef0] dark:text-sky-400">AI</span>
                  </h2>
                  <p className="text-slate-500 dark:text-slate-400 text-sm sm:text-base leading-relaxed mt-3">
                    Describe how you feel in everyday words. Vaidya will guide Pariksha step by step and prepare your clinical report.
                  </p>
                </div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 w-full text-left max-w-md">
                  Quick starters
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-md">
                  {['Persistent digestion issues', 'Sleep & energy balance', 'Seasonal allergies', 'Stress & mood support'].map(tip => (
                    <button
                      key={tip}
                      type="button"
                      onClick={() => { setInput(tip); inputRef.current?.focus(); }}
                      className="px-4 py-3.5 bg-white dark:bg-slate-800/90 border border-slate-200 dark:border-slate-600 rounded-xl text-[13px] font-semibold text-slate-700 dark:text-slate-200 hover:border-[#14bef0] dark:hover:border-sky-500 hover:bg-sky-50/50 dark:hover:bg-sky-950/30 transition-all text-left shadow-sm"
                    >
                      {tip}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              activeSession?.messages?.map((msg, idx) => {
                const messageId = msg._id || msg.id || idx;

                return (
                <div
                  key={messageId}
                  className={`flex w-full animate-slide-up ${
                    msg.role === 'user' ? 'justify-end' : msg.role === 'report' ? 'justify-start' : 'justify-start'
                  }`}
                >
                  {msg.role === 'report' ? (
                    (() => {
                        const payload = parseReportPayload(msg.text);
                        const normalized = normalizeReports(payload);
                        const reports = normalized.valid ? normalized.reports : [];
                        const primaryReport = reports[0]?.reportData || null;
                        const mainReport = pickMainReport(reports);
                        const mainData = mainReport?.reportData;
                        const mainDiag = mainData?.diagnosis;
                        const diagLabels = extractDiagnosisLabels({ reports });
                        const mainTitle =
                          formatClinicalTitle(
                            typeof mainDiag === 'object' ? mainDiag?.name : diagLabels.modern,
                            typeof mainDiag === 'object'
                              ? mainDiag?.ayurvedicName || mainDiag?.ayurvedic_name
                              : diagLabels.ayurvedic,
                          )
                          || mainReport?.title
                          || 'Clinical report';
                        const mainSubtitle =
                          typeof mainDiag === 'object'
                            ? formatClinicalTitle(mainDiag?.name, mainDiag?.ayurvedicName)
                            : (mainData?.integrated_synthesis || mainData?.clinicalImpression || '').slice(0, 80);

                        return (
                          <div className="w-full py-1">
                            {primaryReport ? (
                              <ClinicalReportCard
                                reports={reports}
                                mainReport={mainReport}
                                mainTitle={mainTitle}
                                mainSubtitle={mainSubtitle}
                                onDownloadMain={() => downloadSingleReport(mainReport)}
                                onViewAll={() => setShowReportDownloads(true)}
                                onReadAloud={() => readReportAloud(primaryReport, `report-${messageId}`)}
                                onWellnessPlan={handleRecipes}
                                onAyurvedicGuide={handleAyurvedicGuide}
                                onFindDoctors={() => setActiveSidePanel('doctors')}
                              />
                            ) : (
                              <div className="bg-red-50 dark:bg-red-950/45 border border-red-100 dark:border-red-900/60 rounded-2xl p-8 text-center space-y-3 max-w-lg mx-auto">
                                <Activity size={24} className="text-red-500 dark:text-red-400 mx-auto" />
                                <h4 className="text-red-900 dark:text-red-200 font-bold text-sm">Analysis could not be completed</h4>
                                <p className="text-red-600/70 dark:text-red-300/85 text-sm">Please try again or start a new consultation.</p>
                              </div>
                            )}
                          </div>
                        );
                      })()
                    ) : (
                    <div className={`flex gap-3 w-full ${msg.role === 'user' ? 'flex-row-reverse ml-auto max-w-[80%]' : 'mr-auto max-w-full'}`}>
                      <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center border overflow-hidden ${msg.role === 'user' ? 'bg-slate-100 dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-900 dark:text-slate-100' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-emerald-600 dark:text-emerald-400'}`}>
                        {msg.role === 'user' ? (
                          userData.profileImage ? (
                            <img src={userData.profileImage} alt={userDisplayName} className="w-full h-full object-cover" />
                          ) : (
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="opacity-90">
                              <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path>
                              <circle cx="12" cy="7" r="4"></circle>
                            </svg>
                          )
                        ) : <VaidyaAvatar size={32} />}
                      </div>
                      <div className={`flex flex-col gap-1.5 min-w-0 ${msg.role === 'user' ? 'items-end' : ''}`}>
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-semibold uppercase tracking-wide ${msg.role === 'user' ? 'text-slate-400 dark:text-slate-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                            {msg.role === 'user' ? userDisplayName : 'Vaidya AI'}
                          </span>
                          {msg.role === 'bot' && !msg.isThinking && (
                            <button
                              onClick={() => readMessageAloud({ ...msg, _id: messageId })}
                              className={`inline-flex items-center justify-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold transition-all active:scale-95 ${speakingMessageId === messageId
                                ? 'border-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                                : 'border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-slate-100'
                                }`}
                              title={speakingMessageId === messageId ? 'Stop reading aloud' : 'Read aloud'}
                            >
                              {speakingMessageId === messageId ? <Square size={11} /> : <Volume2 size={11} />}
                              <span>{speakingMessageId === messageId ? 'Stop' : 'Read'}</span>
                            </button>
                          )}
                        </div>
                        <div className={`text-[14px] leading-relaxed max-w-full overflow-hidden px-4 py-3 ${msg.role === 'user'
                            ? 'chat-bubble-user'
                          : msg.isThinking
                            ? 'chat-bubble-bot'
                            : 'chat-bubble-bot'
                          }`}>
                          {msg.isThinking ? (
                            <div className="flex gap-1.5 items-center justify-center">
                              <span className="w-2 h-2 bg-slate-300 dark:bg-slate-500 rounded-full animate-bounce"></span>
                              <span className="w-2 h-2 bg-slate-400 dark:bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                              <span className="w-2 h-2 bg-slate-500 dark:bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                            </div>
                          ) : msg.role === 'user' ? (
                            <span className="break-words text-white leading-relaxed">{msg.text}</span>
                          ) : (
                            <div className="prose prose-slate dark:prose-invert max-w-none text-[var(--practo-text)] font-normal break-words [&_*]:text-[var(--practo-text)] [&_strong]:text-[var(--practo-text)] [&_p]:text-[var(--practo-text-light)]" dangerouslySetInnerHTML={{ __html: sanitizeMarkdownText(msg.text) }} />
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        <AudioPlayerBar status={ttsStatus} label={ttsLabel} onPlay={resumeReadingAloud} onPause={pauseReadingAloud} onStop={stopReadingAloud} />

        <div className="chat-vaidya-composer z-30 px-4 sm:px-5 pb-3 pt-2">
          <div className="chat-thread">
            <div className="relative bg-[var(--practo-white)] border border-[var(--practo-border)] rounded-2xl shadow-lg shadow-slate-200/40 dark:shadow-black/30 focus-within:border-[#28328c]/40 dark:focus-within:border-[#14bef0]/40 p-1.5 pr-2 flex items-end gap-1">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  placeholder="Describe your symptoms…"
                  className="flex-1 bg-transparent border-none outline-none py-2.5 pl-3 pr-2 text-[15px] text-[var(--practo-text)] placeholder:text-[var(--practo-text-light)] resize-none min-h-[44px] max-h-[140px] custom-scrollbar"
                  rows={1}
                  disabled={isMessagesLoading}
                />
                <button
                  onClick={startVoiceInput}
                  disabled={isMessagesLoading}
                  className={`mb-0.5 w-10 h-10 rounded-xl flex items-center justify-center transition border ${isListening
                    ? 'bg-emerald-600 border-emerald-600 text-white'
                    : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                  title={isListening ? 'Stop listening' : 'Use microphone'}
                >
                  {isListening ? <MicOff size={20} strokeWidth={2.5} /> : <Mic size={20} strokeWidth={2.5} />}
                </button>
                {isLoading ? (
                  <button
                    type="button"
                    onClick={handleStopGeneration}
                    className="mb-0.5 w-10 h-10 rounded-xl flex items-center justify-center border bg-slate-800 border-slate-800 text-white"
                    title="Stop generating"
                  >
                    <Square size={18} strokeWidth={2.5} fill="currentColor" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={!input.trim() || isMessagesLoading}
                    className={`mb-0.5 w-10 h-10 rounded-xl flex items-center justify-center transition border ${input.trim() ? 'bg-[#28328c] dark:bg-indigo-600 border-[#28328c] dark:border-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-300 dark:text-slate-600 border-slate-100 dark:border-slate-700 cursor-not-allowed'}`}
                  >
                    <Send size={20} strokeWidth={2.5} />
                  </button>
                )}
              </div>
              {(speechError || isListening) && (
                <div className={`mt-3 px-4 text-[11px] font-semibold ${speechError ? 'text-rose-500' : 'text-emerald-600'}`}>
                  {speechError || 'Listening... speak naturally, then tap the mic again or send the text.'}
                </div>
              )}
            </div>
          </div>
      </section>

      {activeSidePanel ? (
        <aside
          className="min-h-0 flex flex-col overflow-hidden bg-white dark:bg-[var(--practo-white)] border-l border-slate-200/80 dark:border-slate-700 shadow-xl max-lg:fixed max-lg:inset-0 max-lg:z-[60] max-lg:border-0"
          style={isNarrowViewport ? undefined : { width: panelWidth, minWidth: 320, maxWidth: 720 }}
        >
          <div
            className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-ayur-sage/30 active:bg-ayur-sage/60 z-50 transition-colors"
            onMouseDown={startResizingPanel}
          ></div>
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between bg-white dark:bg-slate-900 relative shrink-0">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-ayur-sage to-ayur-forest"></div>
            <div>
              <div className="flex items-center gap-1.5">
                {activeSidePanel === 'recipes' ? <Sparkles size={13} className="text-emerald-500 shrink-0" /> : <Stethoscope size={13} className="text-blue-500 shrink-0" />}
                <span className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wide">
                  {activeSidePanel === 'recipes' ? 'Pathya · Wellness' : 'Vaidya network'}
                </span>
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 tracking-tight leading-tight">
                {activeSidePanel === 'recipes' ? 'Wellness plan' : 'Recommended doctors'}
              </h3>
            </div>
            <button onClick={closeSidePanel} className="w-9 h-9 flex items-center justify-center text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 rounded-lg transition-colors shrink-0" aria-label="Close panel">
              <X size={20} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950 min-h-0">
            {activeSidePanel === 'recipes' ? (
              <div className="h-full">
                {isLoading && !activeSession?.recipesText ? (
                  <div className="px-4 py-8 text-center text-slate-500">
                    <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">Preparing your wellness plan…</p>
                    <p className="text-xs mt-1.5">Generating recipes from your report.</p>
                  </div>
                ) : (
                  <RecipesView embedded recipes={activeSession?.recipesText || ''} />
                )}
              </div>
            ) : (
              <div className="p-2 h-full">
                <FindDoctors embedded diagnosis={activeSession?.diagnosis} />
              </div>
            )}
          </div>
        </aside>
      ) : null}
      </div>

      {showReportDownloads && activeSession && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/50 dark:bg-black/70 p-4"
          onClick={() => setShowReportDownloads(false)}
        >
          <div
            className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-600 shadow-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 mb-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-50">Download a report</h3>
              <button type="button" onClick={() => setShowReportDownloads(false)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400">
                <X size={18} />
              </button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">Pick one PDF — Diagnosis, Root Cause, Lifestyle, Treatment, Risk, or Master synthesis.</p>
            <ReportDownloadList reports={getSessionReports(activeSession)} />
          </div>
        </div>
      )}
    </div>
  );
};

export default Chat;
