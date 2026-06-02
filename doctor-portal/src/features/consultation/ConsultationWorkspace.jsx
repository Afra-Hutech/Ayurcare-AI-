import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Loader2, Plus, Save, Video, XCircle, Copy, Mail, Phone, ClipboardList } from 'lucide-react';
import Sidebar from '../../components/ui/Sidebar';
import LiveKitConsultationRoom from '../../components/video/LiveKitConsultationRoom';
import { doctorService } from '../../services/api';
import { notifyAppointmentsChanged } from '../../utils/dashboardStats';

const newRowId = () => `med-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const createMedicineRow = () => ({ id: newRowId(), name: '', details: '' });

const normalizeMedicineRows = (rows) => {
  if (!Array.isArray(rows) || !rows.length) return [createMedicineRow()];
  return rows.map((row) => ({
    id: row?.id || newRowId(),
    name: String(row?.name ?? ''),
    details: String(row?.details ?? ''),
  }));
};

const formatDateInput = (value) => {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
};

const normalizeVideoMessage = (message, { livekitConfigured } = {}) => {
  const text = String(message || '').trim();
  if (!text) return '';
  if (/google\s*calendar|google\s*meet|manual\s*meet|meet\s*link\s*is\s*not\s*shared/i.test(text)) {
    return 'Video uses LiveKit inside DocConnect — not Google Meet. Click Start call.';
  }
  if (/livekit is not configured/i.test(text)) {
    if (livekitConfigured) {
      return 'Restart the API server on port 5001 so it reloads LIVEKIT_* from .env, then click Start call again.';
    }
    return 'Add LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET to doctor-portal/server/.env, then restart the API on port 5001.';
  }
  if (/video room is preparing/i.test(text)) {
    return 'Click Start call to open the secure video room for this visit.';
  }
  return text;
};

const ConsultationWorkspace = () => {
  const { appointmentId } = useParams();
  const navigate = useNavigate();

  const [appointment, setAppointment] = useState(null);
  const [meetingLink, setMeetingLink] = useState('');
  const [meetingStatus, setMeetingStatus] = useState('scheduled');
  const [notes, setNotes] = useState('');
  const [medicines, setMedicines] = useState([createMedicineRow()]);
  const [dietPathya, setDietPathya] = useState('');
  const [dietApathya, setDietApathya] = useState('');
  const [lifestylePlan, setLifestylePlan] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [followUpNotes, setFollowUpNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [startingCall, setStartingCall] = useState(false);
  const [videoError, setVideoError] = useState('');
  const [apiHealth, setApiHealth] = useState(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [endingCall, setEndingCall] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [toast, setToast] = useState('');
  const [patientWellness, setPatientWellness] = useState([]);
  const [wellnessLoading, setWellnessLoading] = useState(false);

  const patientEmail = appointment?.patientId?.email || '';
  const patientPhone = appointment?.patientId?.phone || appointment?.patientId?.mobile || '';
  const fetchLiveKitToken = useCallback(
    (id) => doctorService.getLiveKitToken(id),
    [],
  );

  const copyPatientJoinLink = async () => {
    if (!meetingLink) return;
    try {
      await navigator.clipboard.writeText(meetingLink);
      setToast('Patient join link copied.');
    } catch {
      setToast('Could not copy — select and copy manually.');
    }
  };

  const emailJoinLinkToPatient = () => {
    if (!patientEmail || !meetingLink) return;
    const subject = encodeURIComponent('Your video consultation — AyurCare');
    const body = encodeURIComponent(`Hello,\n\nJoin your scheduled video consultation here:\n${meetingLink}\n\n— DocConnect`);
    window.open(`mailto:${patientEmail}?subject=${subject}&body=${body}`, '_blank');
  };

  const smsJoinLinkToPatient = () => {
    if (!patientPhone || !meetingLink) return;
    const text = encodeURIComponent(`Video consultation: ${meetingLink}`);
    window.open(`sms:${patientPhone.replace(/\s/g, '')}?body=${text}`, '_blank');
  };

  const patientName = useMemo(() => {
    const p = appointment?.patientId;
    if (!p) return 'Patient';
    if (typeof p === 'string') {
      const id = p.replace(/\s/g, '');
      return id.length > 6 ? `Patient · …${id.slice(-6)}` : 'Patient';
    }
    const email = String(p.email || '').trim();
    const rawName = String(p.name || '').trim();
    const looksGeneric =
      !rawName ||
      /^patient$/i.test(rawName) ||
      /^user$/i.test(rawName) ||
      /^anonymous$/i.test(rawName);
    if (looksGeneric && email) {
      const local = email.split('@')[0].replace(/[._]+/g, ' ').trim();
      if (local) return local.charAt(0).toUpperCase() + local.slice(1);
    }
    if (rawName) return rawName;
    if (p._id) return `Patient · …${String(p._id).slice(-6)}`;
    return 'Patient';
  }, [appointment]);

  const patientUserId = useMemo(() => {
    const p = appointment?.patientId;
    if (!p) return null;
    if (typeof p === 'string') return p;
    return p._id?.toString?.() || p._id || null;
  }, [appointment]);

  useEffect(() => {
    if (!patientUserId) {
      setPatientWellness([]);
      return;
    }
    let mounted = true;
    const loadWellness = async () => {
      setWellnessLoading(true);
      try {
        const data = await doctorService.getPatientWellnessHistory(patientUserId, 7);
        if (mounted) setPatientWellness(data?.logs || []);
      } catch {
        if (mounted) setPatientWellness([]);
      } finally {
        if (mounted) setWellnessLoading(false);
      }
    };
    loadWellness();
    return () => { mounted = false; };
  }, [patientUserId]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/health')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled) setApiHealth(data);
      })
      .catch(() => {
        if (!cancelled) setApiHealth({ livekitConfigured: false, dbConnected: false });
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let isMounted = true;
    const init = async () => {
      setLoading(true);
      setVideoError('');
      try {
        const hydrated = await doctorService.getAppointmentById(appointmentId);
        if (!isMounted) return;
        setAppointment(hydrated || null);
        setMeetingLink(hydrated?.meetingLink || '');
        setMeetingStatus(hydrated?.meetingStatus || 'scheduled');

        try {
          const prescription = await doctorService.getPrescriptionByAppointment(appointmentId);
          if (!isMounted) return;
          setNotes(String(prescription?.notes || ''));
          setMedicines(normalizeMedicineRows(prescription?.medicines));
          setDietPathya(String(prescription?.dietPathya || ''));
          setDietApathya(String(prescription?.dietApathya || ''));
          setLifestylePlan(String(prescription?.lifestylePlan || ''));
          setFollowUpDate(formatDateInput(prescription?.followUpDate));
          setFollowUpNotes(String(prescription?.followUpNotes || ''));
        } catch {
          /* prescription optional on first open */
        }
      } catch (err) {
        if (isMounted) {
          setToast(err.message || 'Failed to load consultation.');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    init();
    return () => {
      isMounted = false;
    };
  }, [appointmentId]);

  const startCall = async () => {
    setStartingCall(true);
    setVideoError('');
    try {
      const startPayload = await doctorService.startConsultation(appointmentId);
      const appt = startPayload?.appointment;
      setAppointment(appt || appointment);
      setMeetingLink(startPayload?.meetingLink || appt?.meetingLink || '');
      setMeetingStatus(startPayload?.meetingStatus || appt?.meetingStatus || 'live');
      setToast('Video room is live. The patient can join from AyurCare → Appointments.');
      notifyAppointmentsChanged();
    } catch (err) {
      const msg = normalizeVideoMessage(err?.message || 'Could not start the video call.', {
        livekitConfigured: apiHealth?.livekitConfigured,
      });
      setVideoError(msg);
      setToast(msg);
    } finally {
      setStartingCall(false);
    }
  };

  const setRow = (index, key, value) => {
    setMedicines((prev) => prev.map((row, idx) => (idx === index ? { ...row, [key]: value } : row)));
  };

  const addMedicineRow = () => setMedicines((prev) => [...prev, createMedicineRow()]);

  const removeMedicineRow = (index) => {
    setMedicines((prev) => {
      if (prev.length === 1) return [createMedicineRow()];
      return prev.filter((_, idx) => idx !== index);
    });
  };

  const persistDraft = async () => {
    setSavingDraft(true);
    try {
      await doctorService.savePrescriptionDraft({
        appointmentId,
        notes,
        medicines: medicines.map(({ name, details }) => ({ name, details })),
        dietPathya,
        dietApathya,
        lifestylePlan,
        followUpDate: followUpDate || null,
        followUpNotes,
      });
      setToast('Draft saved.');
    } catch (err) {
      setToast(err.message || 'Failed to save draft.');
    } finally {
      setSavingDraft(false);
    }
  };

  const endCall = async () => {
    setEndingCall(true);
    try {
      const result = await doctorService.endConsultation(appointmentId);
      setMeetingStatus(result?.appointment?.meetingStatus || 'ended');
      setMeetingLink('');
      setToast('Session ended. Finalize the prescription when ready — the patient can no longer join.');
      notifyAppointmentsChanged();
    } catch (err) {
      setToast(err.message || 'Failed to end call.');
    } finally {
      setEndingCall(false);
    }
  };

  const finalize = async () => {
    setFinalizing(true);
    try {
      const result = await doctorService.finalizePrescription({
        appointmentId,
        notes,
        medicines: medicines.map(({ name, details }) => ({ name, details })),
        dietPathya,
        dietApathya,
        lifestylePlan,
        followUpDate: followUpDate || null,
        followUpNotes,
      });
      setMeetingStatus(result?.appointment?.meetingStatus || 'ended');
      setMeetingLink('');
      setToast('Consultation completed and prescription finalized.');
      notifyAppointmentsChanged();
      setTimeout(() => navigate('/dashboard'), 900);
    } catch (err) {
      setToast(err.message || 'Failed to finalize prescription.');
    } finally {
      setFinalizing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen w-full bg-[#f4f6fb] dark:bg-[var(--portal-bg)] flex">
        <Sidebar />
        <main className="flex-1 ml-64 flex items-center justify-center">
          <Loader2 className="h-10 w-10 animate-spin text-slate-400" />
        </main>
      </div>
    );
  }

  if (!appointment) {
    return (
      <div className="min-h-screen w-full bg-[#f8fafc] flex">
        <Sidebar />
        <main className="flex-1 ml-64 flex flex-col items-center justify-center gap-4 p-8 text-center">
          <p className="text-slate-700 font-semibold">Could not load this consultation.</p>
          <p className="text-sm text-slate-500 max-w-md">
            {toast || 'Check that you are signed in and the doctor API is running on port 5001.'}
          </p>
          <button
            type="button"
            onClick={() => navigate('/schedule')}
            className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold"
          >
            Back to schedule
          </button>
        </main>
      </div>
    );
  }

  const isImmersiveVideo = meetingStatus === 'live';

  if (isImmersiveVideo) {
    return (
      <div className="min-h-screen w-full bg-slate-950 flex flex-col">
        <header className="flex-shrink-0 flex items-center justify-between gap-4 px-4 py-3 bg-slate-900 border-b border-slate-800 text-white">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="p-2 rounded-lg border border-slate-700 hover:bg-slate-800"
              aria-label="Back"
            >
              <ArrowLeft size={16} />
            </button>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Live consultation</p>
              <h1 className="text-lg font-bold truncate">{patientName}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-emerald-500/20 text-emerald-300">
              live
            </span>
            <button
              type="button"
              onClick={endCall}
              disabled={endingCall}
              className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold uppercase disabled:opacity-50"
            >
              {endingCall ? 'Ending…' : 'End call'}
            </button>
          </div>
        </header>
        <div className="relative flex-1 min-h-0 w-full">
          <LiveKitConsultationRoom
            appointmentId={appointmentId}
            fetchToken={fetchLiveKitToken}
            className="absolute inset-0 h-full w-full lk-room-immersive rounded-none border-0"
          />
          {meetingLink ? (
            <div className="absolute top-4 left-4 right-4 z-20 max-w-md rounded-xl border border-white/10 bg-slate-900/90 backdrop-blur-md px-3 py-2.5 shadow-lg pointer-events-auto">
              <p className="text-[10px] text-slate-300 mb-2">
                Patient: <strong className="text-white">AyurCare → Appointments</strong>
              </p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={copyPatientJoinLink} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/10 text-xs font-semibold text-white hover:bg-white/20">
                  <Copy size={13} /> Copy link
                </button>
                {patientEmail ? (
                  <button type="button" onClick={emailJoinLinkToPatient} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/10 text-xs font-semibold text-white hover:bg-white/20">
                    <Mail size={13} /> Email
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
        {toast ? (
          <p className="absolute bottom-20 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded-lg bg-slate-800/95 text-xs text-slate-200 shadow-lg">
            {toast}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-[#f8fafc] flex">
      <Sidebar />
      <main className="flex-1 ml-64 h-screen p-4">
        <div className="h-full bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/dashboard')}
                className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50"
              >
                <ArrowLeft size={16} />
              </button>
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Consultation Workspace</div>
                <h1 className="text-xl font-black text-slate-900">{patientName}</h1>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                meetingStatus === 'live' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-600'
              }`}>
                {meetingStatus}
              </span>
              {toast && <span className="text-xs font-semibold text-slate-500">{toast}</span>}
            </div>
          </div>

          <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-[minmax(0,1.75fr)_minmax(380px,0.85fr)]">
            <section className="border-r border-slate-100 min-h-0 flex flex-col bg-slate-950/5 min-h-[420px]">
              <div className="px-5 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-white">
                <div className="flex items-center gap-2 text-slate-700 font-bold text-sm">
                  <Video size={16} className="text-emerald-600" />
                  <span>Video consultation</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest ${
                    meetingStatus === 'live' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {meetingStatus}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {meetingStatus !== 'live' && meetingStatus !== 'ended' ? (
                    <button
                      type="button"
                      onClick={startCall}
                      disabled={startingCall || (apiHealth && !apiHealth.livekitConfigured)}
                      className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold uppercase tracking-wide disabled:opacity-50 inline-flex items-center gap-2 hover:bg-emerald-700"
                    >
                      {startingCall ? <Loader2 size={14} className="animate-spin" /> : <Video size={14} />}
                      {startingCall ? 'Starting…' : 'Start call'}
                    </button>
                  ) : null}
                  {meetingStatus === 'live' ? (
                    <button
                      type="button"
                      onClick={endCall}
                      disabled={endingCall}
                      className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold uppercase tracking-wide disabled:opacity-50 hover:bg-slate-800"
                    >
                      {endingCall ? 'Ending…' : 'End call'}
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                {meetingStatus === 'ended' ? (
                  <div className="flex-1 flex items-center justify-center p-8 text-center">
                    <p className="text-sm font-medium text-slate-600 max-w-sm">
                      Session ended. Finalize the prescription to complete the visit and record earnings on Revenue.
                    </p>
                  </div>
                ) : (
                  <div className="flex-1 flex items-center justify-center p-8 text-center min-h-[380px] bg-slate-100/80 rounded-2xl m-4 border border-dashed border-slate-200">
                    <p className="text-sm text-slate-600 max-w-md leading-relaxed">
                      {apiHealth && !apiHealth.livekitConfigured
                        ? 'Add LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET to doctor-portal/server/.env, then restart the API on port 5001.'
                        : videoError
                          ? normalizeVideoMessage(videoError, { livekitConfigured: apiHealth?.livekitConfigured })
                          : 'Use Start call in the toolbar above to open the secure room. The patient joins from AyurCare → Appointments.'}
                    </p>
                  </div>
                )}
              </div>
            </section>

            <section className="min-h-0 flex flex-col bg-[#fcfcfd]">
              <div className="px-5 py-4 border-b border-slate-200 bg-white">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-sm font-black text-slate-900 uppercase tracking-wide">Prescription Pad</h2>
                    <p className="text-xs text-slate-500 mt-1">Capture clinical notes while the consultation is in progress.</p>
                  </div>
                  <div className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-emerald-50 text-emerald-700 border border-emerald-100">
                    {meetingStatus}
                  </div>
                </div>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-5 space-y-4">
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-[11px] font-black uppercase tracking-widest text-emerald-800">Patient wellness (7 days)</h3>
                    {wellnessLoading && <Loader2 size={14} className="animate-spin text-emerald-600" />}
                  </div>
                  {patientWellness.length === 0 && !wellnessLoading ? (
                    <p className="text-xs text-slate-600">No wellness logs yet — patient can log on their dashboard.</p>
                  ) : (
                    <div className="space-y-2 max-h-36 overflow-y-auto">
                      {patientWellness.map((row) => (
                        <div key={row.date || row._id} className="rounded-xl bg-white border border-slate-100 px-3 py-2 text-xs">
                          <div className="font-bold text-slate-800">{row.date}</div>
                          <div className="text-slate-600 mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                            <span>{row.hydrationGlasses ?? 0} glasses</span>
                            <span>{(row.steps ?? 0).toLocaleString()} steps</span>
                            {row.restingHr > 0 && <span>{row.restingHr} bpm</span>}
                            {(row.sleepQuality || row.energy || row.stress) && (
                              <span>
                                Sleep {row.sleepQuality ?? '—'}/5 · Energy {row.energy ?? '—'}/5 · Stress {row.stress ?? '—'}/5
                              </span>
                            )}
                            {(row.digestionQuality || row.bowelRegularity) && (
                              <span>
                                · Digestion {row.digestionQuality ?? '—'}/5 · Bowels {row.bowelRegularity ?? '—'}/5
                              </span>
                            )}
                            {row.notes?.trim() && (
                              <div className="w-full mt-2 text-[10px] text-slate-500 border-t border-slate-50 pt-1.5 line-clamp-2">
                                <span className="font-semibold text-slate-600">Journal:</span> {row.notes.trim()}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 md:p-5 space-y-3">
                  <div className="flex items-center gap-2 text-amber-900">
                    <ClipboardList size={16} />
                    <label className="text-[11px] font-black uppercase tracking-widest">Patient care plan (visible on portal)</label>
                  </div>
                  <p className="text-[11px] text-amber-800/90">
                    Pathya / apathya, lifestyle, and follow-up appear on the patient&apos;s <strong>Care plan</strong> page after you finalize.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-600 uppercase">Pathya (encouraged)</label>
                      <textarea
                        value={dietPathya}
                        onChange={(e) => setDietPathya(e.target.value)}
                        rows={4}
                        placeholder="Warm foods, timings, herbs in diet…"
                        className="keep-light-input w-full rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-900"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-600 uppercase">Apathya (avoid)</label>
                      <textarea
                        value={dietApathya}
                        onChange={(e) => setDietApathya(e.target.value)}
                        rows={4}
                        placeholder="Cold drinks, fasting errors, incompatible mixes…"
                        className="keep-light-input w-full rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-900"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-600 uppercase">Lifestyle & dinacharya</label>
                    <textarea
                      value={lifestylePlan}
                      onChange={(e) => setLifestylePlan(e.target.value)}
                      rows={3}
                      placeholder="Sleep timing, walks, yoga, abhyanga, work breaks…"
                      className="keep-light-input w-full rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-900"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-600 uppercase">Follow-up date</label>
                      <input
                        type="date"
                        value={followUpDate}
                        onChange={(e) => setFollowUpDate(e.target.value)}
                        className="keep-light-input w-full rounded-xl border border-slate-300 bg-white p-2.5 text-sm text-slate-900"
                      />
                    </div>
                    <div className="space-y-1.5 sm:col-span-1">
                      <label className="text-[10px] font-bold text-slate-600 uppercase">Follow-up notes</label>
                      <input
                        type="text"
                        value={followUpNotes}
                        onChange={(e) => setFollowUpNotes(e.target.value)}
                        placeholder="e.g. Review sleep & digestion"
                        className="keep-light-input w-full rounded-xl border border-slate-300 bg-white p-2.5 text-sm text-slate-900"
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4 md:p-5 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-black uppercase tracking-widest text-slate-400">Clinical Notes</label>
                    <span className="text-[10px] font-bold text-slate-400">{notes.length} chars</span>
                  </div>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={10}
                    className="keep-light-input w-full rounded-2xl border border-slate-300 p-3.5 text-sm leading-6 text-slate-900 outline-none focus:border-[#28328c] focus:ring-2 focus:ring-indigo-200 transition-all bg-white"
                    placeholder="Write findings, assessment, and treatment advice..."
                  />
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4 md:p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-black uppercase tracking-widest text-slate-400">Medicines</label>
                    <button
                      onClick={addMedicineRow}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 flex items-center gap-1.5 hover:bg-slate-50"
                    >
                      <Plus size={12} />
                      Add
                    </button>
                  </div>
                  <div className="space-y-3">
                    {medicines.map((row, idx) => (
                      <div key={row.id} className="rounded-2xl border border-slate-200 p-3.5 space-y-2.5 bg-slate-50/40">
                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Medicine #{idx + 1}</div>
                        <input
                          type="text"
                          value={row.name}
                          onChange={(e) => setRow(idx, 'name', e.target.value)}
                          placeholder="Medicine name"
                          autoComplete="off"
                          className="keep-light-input w-full rounded-xl border border-slate-300 bg-white p-2.5 text-sm text-slate-900 outline-none focus:border-[#28328c] focus:ring-2 focus:ring-indigo-200"
                        />
                        <textarea
                          value={row.details}
                          onChange={(e) => setRow(idx, 'details', e.target.value)}
                          rows={2}
                          placeholder="Dosage / timing / duration"
                          className="keep-light-input w-full rounded-xl border border-slate-300 bg-white p-2.5 text-sm text-slate-900 outline-none focus:border-[#28328c] focus:ring-2 focus:ring-indigo-200"
                        />
                        <button
                          type="button"
                          onClick={() => removeMedicineRow(idx)}
                          className="text-xs font-bold text-rose-500 hover:text-rose-600"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="p-3 md:p-4 border-t border-slate-200 bg-white sticky bottom-0">
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2">
                  <button
                    onClick={persistDraft}
                    disabled={savingDraft}
                    className="px-3 py-3 rounded-xl border border-slate-300 text-slate-700 text-xs font-black uppercase tracking-wide flex items-center justify-center gap-2 hover:bg-slate-50 disabled:opacity-70"
                  >
                    {savingDraft ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    Save Draft
                  </button>
                  <button
                    onClick={finalize}
                    disabled={finalizing}
                    className="px-3 py-3 rounded-xl bg-emerald-600 text-white text-xs font-black uppercase tracking-wide flex items-center justify-center gap-2 hover:bg-emerald-700 disabled:bg-emerald-300"
                  >
                    {finalizing ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                    Finalize
                  </button>
                  <button
                    onClick={() => navigate('/dashboard')}
                    className="px-3 py-3 rounded-xl bg-slate-100 text-slate-700 text-xs font-black uppercase tracking-wide flex items-center justify-center gap-2 hover:bg-slate-200"
                  >
                    <XCircle size={14} />
                    Exit
                  </button>
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
};

export default ConsultationWorkspace;
