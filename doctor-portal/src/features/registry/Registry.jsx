import React, { useEffect, useState } from 'react';
import { doctorService } from '../../services/api';
import Sidebar from '../../components/ui/Sidebar';
import {
  History,
  Search,
  User,
  Calendar,
  ChevronRight,
  Download,
  Info,
  X,
  Video,
  Building2,
  SlidersHorizontal,
  CheckCircle2,
  Trash2,
  Clock
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { downloadMedicalReportPDF } from '../../utils/pdfExport';
import AvailabilityScheduler from './components/AvailabilityScheduler';
import Navbar from '../../components/ui/Navbar';
import { PatientDetailsCard, getPatientDisplayName } from './components/PatientDetailsCard';
import { resolvePatientProfile } from '../../utils/patientProfile';
import {
  getAppointmentStatusBucket,
  resolveAppointmentStart,
} from '../../utils/appointments';
import { notifyAppointmentsChanged } from '../../utils/dashboardStats';

const parseDiagnosis = (content) => {
  if (!content) return [];
  try {
    const parts = content.split('---REPORT_DATA---');
    let jsonStr = (parts.length > 1 ? parts[1] : content);
    jsonStr = jsonStr.replace(/```json/gi, '').replace(/```/gi, '').trim();
    const start = jsonStr.indexOf('{');
    const end = jsonStr.lastIndexOf('}');
    const payload = JSON.parse(start !== -1 && end !== -1 ? jsonStr.substring(start, end + 1) : jsonStr);
    if (payload && Array.isArray(payload.reports)) {
      return payload.reports
        .filter(r => r && typeof r === 'object')
        .map(r => ({
          reportType: r.reportType || 'Diagnosis Report',
          title: r.title || r.reportType || 'Clinical Report',
          reportData: r.reportData || {}
        }));
    }
    return [{
      reportType: 'Diagnosis Report',
      title: 'Clinical Diagnosis',
      reportData: payload
    }];
  } catch (e) {
    return [];
  }
};

const getDefaultScheduleForm = (apt) => {
  const nextSlot = new Date();
  nextSlot.setMinutes(nextSlot.getMinutes() + 30);
  nextSlot.setSeconds(0, 0);

  const pad = (value) => String(value).padStart(2, '0');
  const defaultDate = `${nextSlot.getFullYear()}-${pad(nextSlot.getMonth() + 1)}-${pad(nextSlot.getDate())}`;
  const defaultTime = `${pad(nextSlot.getHours())}:${pad(nextSlot.getMinutes())}`;

  return {
    date: defaultDate,
    time: defaultTime,
    duration: String(apt?.duration || 30),
    type: apt?.type || 'clinic',
    fee: apt?.fee != null ? String(apt.fee) : '',
    notes: apt?.notes || '',
  };
};

const Registry = () => {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('confirmed');
  const [dateRangeFilter, setDateRangeFilter] = useState('all');
  const [modeFilter, setModeFilter] = useState('all');
  const [apptTypeFilter, setApptTypeFilter] = useState('all');
  const [selectedAudit, setSelectedAudit] = useState(null);
  const [doctorData, setDoctorData] = useState(null);
  const [schedulingAppointment, setSchedulingAppointment] = useState(null);
  const [scheduleForm, setScheduleForm] = useState(getDefaultScheduleForm(null));
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [completionMode, setCompletionMode] = useState(null);
  const [completionFiles, setCompletionFiles] = useState([]);
  const [completionSaving, setCompletionSaving] = useState(false);
  const now = new Date();

   const fetchData = async () => {
     try {
       const [profile, apts] = await Promise.all([
         doctorService.getProfile(),
         doctorService.getAppointments(),
       ]);
       setDoctorData(profile);
       setAppointments(apts);
     } catch (err) {
       console.error('Failed to fetch appointments', err);
     } finally {
       setLoading(false);
     }
   };

  useEffect(() => {
    fetchData();
  }, []);

  const getPatientName = (apt) => getPatientDisplayName(apt);

  const normalizeStatus = (status) => String(status || '').toLowerCase().trim();

  const getStatusBucket = (apt) => getAppointmentStatusBucket(apt, now);

  const handleDownload = (apt) => {
    const diagnosisData = apt.sessionData?.diagnosis;
    if (!diagnosisData) {
      alert("No diagnostic data found for this entry.");
      return;
    }
    const reports = parseDiagnosis(diagnosisData);
    if (reports.length === 0) {
      alert("Structured clinical report not found.");
      return;
    }
    reports.forEach(r => {
      downloadMedicalReportPDF(r.reportData, { reportType: r.reportType, reportTitle: r.title });
    });
  };

  const openScheduleModal = (apt) => {
    setSchedulingAppointment(apt);
    setScheduleForm(getDefaultScheduleForm(apt));
  };

  const handleDeleteRequest = async (apt) => {
    if (!apt?._id) return;
    if (!window.confirm('Delete this pending request? This will mark it as cancelled.')) return;

    try {
      const success = await doctorService.updateAppointmentStatus(apt._id, 'cancelled');
      if (success) {
        if (selectedAudit?._id === apt._id) setSelectedAudit(null);
        await fetchData();
      } else {
        alert('Unable to delete this request right now.');
      }
    } catch (err) {
      console.error('Failed to delete request', err);
      alert('Unable to delete this request right now.');
    }
  };

  const handleUpdateAppointmentStatus = async (apt, status, confirmMessage) => {
    if (!apt?._id) return;
    if (confirmMessage && !window.confirm(confirmMessage)) return;

    try {
      const success = await doctorService.updateAppointmentStatus(apt._id, status);
      if (success) {
        if (selectedAudit?._id === apt._id) setSelectedAudit(null);
        await fetchData();
        notifyAppointmentsChanged();
      } else {
        alert('Unable to update this appointment right now.');
      }
    } catch (err) {
      console.error('Failed to update appointment status', err);
      alert('Unable to update this appointment right now.');
    }
  };

  const openCompletionPanel = () => {
    setCompletionMode('completed');
    setCompletionFiles([]);
  };

  const closeCompletionPanel = () => {
    setCompletionMode(null);
    setCompletionFiles([]);
  };

  const handleSaveCompletionFiles = async () => {
    if (!selectedAudit?._id) return;

    try {
      setCompletionSaving(true);
      const result = await doctorService.uploadAppointmentAttachments(
        selectedAudit._id,
        completionFiles,
        'completed'
      );

      if (result?.appointment) {
        setSelectedAudit(result.appointment);
        setAppointments((prev) => prev.map((item) => (
          item._id === result.appointment._id ? result.appointment : item
        )));
        setCompletionMode(null);
        setCompletionFiles([]);
      } else {
        alert(result?.error || 'Unable to save the consultation files right now.');
      }
    } catch (err) {
      console.error('Failed to save completion files', err);
      alert('Unable to save the consultation files right now.');
    } finally {
      setCompletionSaving(false);
    }
  };

  const handleCancelSelectedAudit = async () => {
    if (!selectedAudit?._id) return;
    await handleUpdateAppointmentStatus(selectedAudit, 'cancelled', 'Mark this consultation as cancelled?');
    closeCompletionPanel();
  };

  const handleConfirmSchedule = async (e) => {
    e.preventDefault();
    if (!schedulingAppointment?._id) return;

    try {
      setSavingSchedule(true);
      const start = new Date(`${scheduleForm.date}T${scheduleForm.time}`);
      if (Number.isNaN(start.getTime())) {
        alert('Please choose a valid date and time.');
        return;
      }

      const duration = Number(scheduleForm.duration) || 30;
      const end = new Date(start.getTime() + duration * 60000);

      const updateData = {
        status: 'confirmed',
        type: scheduleForm.type,
        startTime: start,
        endTime: end,
        duration,
        notes: scheduleForm.notes,
        fee: scheduleForm.fee === '' ? null : Number(scheduleForm.fee),
        meetingType: scheduleForm.type === 'online' ? 'livekit' : 'custom',
        roomId: null,
        meetingLink: null,
        meetingStatus: 'scheduled',
      };

      const success = await doctorService.updateAppointment(schedulingAppointment._id, updateData);
      if (success) {
        setSchedulingAppointment(null);
        await fetchData();
        notifyAppointmentsChanged();
      } else {
        alert('Failed to confirm the request.');
      }
    } catch (err) {
      console.error('Failed to confirm request', err);
      alert('Failed to confirm the request.');
    } finally {
      setSavingSchedule(false);
    }
  };

  const filteredAppointments = appointments.filter(apt => {
    const profile = resolvePatientProfile(apt);
    const searchBlob = [getPatientName(apt), profile.email, profile.phone, profile.gender, profile.age, profile.height, profile.weight]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    const nameMatch = !searchTerm.trim() || searchBlob.includes(searchTerm.toLowerCase());
    const statusMatch = getStatusBucket(apt) === statusFilter;
    
    let dateMatch = true;
    if (dateRangeFilter !== 'all') {
      const aptStart = resolveAppointmentStart(apt) || (apt.createdAt ? new Date(apt.createdAt) : null);
      if (!aptStart) {
        dateMatch = false;
      } else {
        const ref = new Date();
        const diffDays = (ref - aptStart) / (1000 * 60 * 60 * 24);
        if (dateRangeFilter === '7days') dateMatch = diffDays >= 0 && diffDays <= 7;
        else if (dateRangeFilter === '30days') dateMatch = diffDays >= 0 && diffDays <= 30;
        else if (dateRangeFilter === 'ytd') dateMatch = aptStart.getFullYear() === ref.getFullYear();
      }
    }

    let modeMatch = true;
    if (modeFilter !== 'all') {
      const aptType = String(apt.type || '').toLowerCase();
      const chatMode = String(apt.sessionData?.mode || '').toLowerCase();
      if (modeFilter === 'video') modeMatch = aptType === 'online' || chatMode === 'video';
      else if (modeFilter === 'audio') modeMatch = chatMode === 'audio';
      else if (modeFilter === 'text') modeMatch = chatMode === 'chat';
      else if (modeFilter === 'clinic') modeMatch = aptType === 'clinic' || aptType === 'follow-up';
    }

    // Appointment Type Filter
    let typeMatch = true;
    if (apptTypeFilter !== 'all') {
      if (apptTypeFilter === 'initial') typeMatch = apt.type !== 'follow-up';
      else if (apptTypeFilter === 'follow-up') typeMatch = apt.type === 'follow-up';
    }

    return nameMatch && statusMatch && dateMatch && modeMatch && typeMatch;
  }).sort((a, b) => {
    const aStart = a.startTime ? new Date(a.startTime) : new Date(a.createdAt || 0);
    const bStart = b.startTime ? new Date(b.startTime) : new Date(b.createdAt || 0);
    if (statusFilter !== 'confirmed') return bStart - aStart;
    const aUpcoming = aStart >= now ? 1 : 0;
    const bUpcoming = bStart >= now ? 1 : 0;
    if (aUpcoming !== bUpcoming) return bUpcoming - aUpcoming;
    return aStart - bStart;
  });

  const statusCounts = {
    confirmed: appointments.filter(a => getStatusBucket(a) === 'confirmed').length,
    pending: appointments.filter(a => getStatusBucket(a) === 'pending').length,
    cancelled: appointments.filter(a => getStatusBucket(a) === 'cancelled').length,
    finished: appointments.filter(a => getStatusBucket(a) === 'finished').length,
  };

  return (
    <motion.div className="flex min-h-screen w-full bg-[var(--practo-bg)] overflow-x-hidden">
      <Sidebar />

      <div className="flex-1 ml-64 min-w-0 flex flex-col min-h-screen">
        <Navbar />
        <main className="flex-1 min-h-screen w-full overflow-x-hidden">
        <div className="mx-auto w-full max-w-[1600px] px-6 md:px-10 lg:px-12 py-10">

        {/* ENHANCED COMMAND CENTER */}
        <div className="bg-[var(--practo-white)] p-4 md:p-5 rounded-[2.5rem] border border-[var(--practo-border)] shadow-xl shadow-slate-200/30 dark:shadow-black/40 mb-12 space-y-4">
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(320px,420px)_1fr] gap-4 xl:gap-6 items-center">
            {/* Integrated Search */}
            <div className="relative group w-full min-w-0">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--practo-text-light)] group-focus-within:text-primary-500 transition-colors" />
              <input
                type="text"
                placeholder="Search patients..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-[var(--practo-bg)] border border-transparent rounded-[1.5rem] py-4 pl-13 pr-6 text-sm font-bold text-[var(--practo-text)] placeholder:text-[var(--practo-text-light)] focus:bg-[var(--practo-white)] focus:border-primary-500/20 outline-none transition-all h-14"
              />
            </div>

            {/* Secondary Filters - Compact */}
            <div className="flex flex-wrap items-center justify-end gap-3 min-w-0">
              <div className="hidden lg:inline-flex items-center gap-2 rounded-2xl bg-[var(--practo-bg)] px-3 py-2 border border-[var(--practo-border)] text-[8px] font-black uppercase tracking-[0.2em] text-[var(--practo-text-light)]">
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Quick filters
              </div>

              <div className="relative group/filter h-14 flex items-center shrink-0">
                <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-primary-600/50" />
                <select
                  value={dateRangeFilter}
                  onChange={(e) => setDateRangeFilter(e.target.value)}
                  className="bg-[var(--practo-bg)] border border-transparent text-[var(--practo-text)] text-[9px] font-black uppercase tracking-[0.22em] rounded-2xl pl-11 pr-8 h-11 outline-none focus:bg-[var(--practo-white)] focus:border-primary-500/20 appearance-none cursor-pointer hover:opacity-90 dark:hover:bg-white/5 transition-all min-w-[150px]"
                >
                  <option value="all">Any Date</option>
                  <option value="7days">7 Days</option>
                  <option value="30days">30 Days</option>
                  <option value="ytd">Yearly</option>
                </select>
              </div>

              <div className="relative group/filter h-14 flex items-center shrink-0">
                <Video className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-indigo-500/50" />
                <select
                  value={modeFilter}
                  onChange={(e) => setModeFilter(e.target.value)}
                  className="bg-[var(--practo-bg)] border border-transparent text-[var(--practo-text)] text-[9px] font-black uppercase tracking-[0.22em] rounded-2xl pl-11 pr-8 h-11 outline-none focus:bg-[var(--practo-white)] focus:border-primary-500/20 appearance-none cursor-pointer hover:opacity-90 dark:hover:bg-white/5 transition-all min-w-[150px]"
                >
                  <option value="all">Any Mode</option>
                  <option value="video">Online video</option>
                  <option value="clinic">In-clinic</option>
                  <option value="audio">Audio (chat)</option>
                  <option value="text">Chat</option>
                </select>
              </div>

              <div className="relative group/filter h-14 flex items-center shrink-0">
                <History className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500/70" />
                <select
                  value={apptTypeFilter}
                  onChange={(e) => setApptTypeFilter(e.target.value)}
                  className="bg-[var(--practo-bg)] border border-transparent text-[var(--practo-text)] text-[9px] font-black uppercase tracking-[0.22em] rounded-2xl pl-11 pr-8 h-11 outline-none focus:bg-[var(--practo-white)] focus:border-primary-500/20 appearance-none cursor-pointer hover:opacity-90 dark:hover:bg-white/5 transition-all min-w-[150px]"
                >
                  <option value="all">Any visit</option>
                  <option value="initial">Initial</option>
                  <option value="follow-up">Follow-up</option>
                </select>
              </div>

              {(searchTerm || dateRangeFilter !== 'all' || modeFilter !== 'all' || apptTypeFilter !== 'all') && (
                <button
                  onClick={() => {
                    setSearchTerm('');
                    setDateRangeFilter('all');
                    setModeFilter('all');
                    setApptTypeFilter('all');
                  }}
                  className="h-11 w-11 flex items-center justify-center bg-rose-50 text-rose-500 rounded-2xl hover:bg-rose-500 hover:text-white transition-all group/clear border border-rose-100 shadow-sm"
                  title="Clear All Filters"
                >
                  <X className="h-4 w-4 transition-transform group-hover:rotate-90" />
                </button>
              )}
            </div>
          </div>

          {/* Analytics Tabs */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex bg-[var(--practo-bg)]/80 p-1.5 rounded-[1.8rem] items-center gap-1 overflow-x-auto">
              {['confirmed', 'pending', 'cancelled', 'finished'].map(f => (
                <button
                  key={f}
                  onClick={() => setStatusFilter(f)}
                  className={`px-4 py-2 rounded-[1.2rem] flex items-center gap-3 transition-all whitespace-nowrap h-10 shrink-0 ${
                    statusFilter === f 
                      ? 'bg-[var(--practo-white)] text-primary-600 shadow-sm border border-[var(--practo-border)]' 
                      : 'text-[var(--practo-text-light)] hover:text-[var(--practo-text-light)]'
                  }`}
                >
                  <span className="text-[9px] font-black uppercase tracking-[0.18em]">{f}</span>
                  <span className={`text-[8px] font-black px-2 py-0.5 rounded-lg ${
                    statusFilter === f ? 'bg-primary-50 text-primary-600 dark:bg-primary-950/50 dark:text-primary-300' : 'bg-[var(--practo-bg)] text-[var(--practo-text-light)] dark:bg-black/25'
                  }`}>
                    {statusCounts[f]}
                  </span>
                </button>
              ))}
            </div>

            <div className="text-[9px] font-black uppercase tracking-[0.22em] text-[var(--practo-text-light)] px-2">
              Showing {statusCounts[statusFilter]} {statusFilter}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="py-40 flex flex-col items-center justify-center space-y-4">
            <div className="h-10 w-10 border-4 border-[var(--practo-border)] border-t-primary-600 rounded-full animate-spin"></div>
            <span className="text-[10px] font-black uppercase tracking-widest text-[var(--practo-text-light)]">Syncing Data...</span>
          </div>
        ) : (
          <div className="space-y-4 pb-20">
            {filteredAppointments.length > 0 ? filteredAppointments.map((apt, idx) => (
              <motion.div
                key={apt._id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.03 }}
                onClick={() => setSelectedAudit(apt)}
                className="bg-[var(--practo-white)] p-6 rounded-[2.5rem] border border-[var(--practo-border)] shadow-sm hover:shadow-2xl hover:shadow-primary-600/5 hover:border-primary-200 transition-all flex flex-col md:flex-row md:items-center gap-8 group relative cursor-pointer"
              >
                {/* Visual Accent */}
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-12 bg-primary-600 rounded-r-full opacity-0 group-hover:opacity-100 transition-all" />

                <div className="flex items-center gap-6 md:w-80">
                  <div className="h-16 w-16 rounded-3xl bg-[var(--practo-bg)] flex items-center justify-center border border-[var(--practo-border)] group-hover:bg-primary-50 group-hover:border-primary-100 transition-all">
                    <User className="h-8 w-8 text-[var(--practo-text-light)] group-hover:text-primary-600 transition-all" />
                  </div>
                  <div>
                    <h4 className="text-sm md:text-[0.95rem] font-black text-[var(--practo-text)] group-hover:text-primary-700 transition-colors">{getPatientName(apt)}</h4>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-[9px] font-black text-[var(--practo-text-light)] uppercase tracking-widest">#{apt._id?.slice(-6)}</span>
                      {apt.type && <span className="text-[9px] font-black text-primary-500 uppercase tracking-widest bg-primary-50/50 px-2 py-0.5 rounded-md border border-primary-100/50">{apt.type}</span>}
                    </div>
                    <PatientDetailsCard appointment={apt} compact className="mt-3" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-12 flex-1">
                  <div className="flex flex-col">
                    <label className="text-[9px] font-black uppercase tracking-[2px] text-[var(--practo-text-light)] mb-3">Registration Date</label>
                    <div className="flex items-center gap-3">
                      <Calendar className="h-4 w-4 text-primary-600/40" />
                      <span className="text-xs md:text-sm font-bold text-[var(--practo-text)]">{new Date(apt.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}</span>
                    </div>
                  </div>
                  <div className="flex flex-col">
                    <label className="text-[9px] font-black uppercase tracking-[2px] text-[var(--practo-text-light)] mb-3">Status Flag</label>
                    <div className={`flex items-center gap-2.5 px-3.5 py-1.5 rounded-2xl w-fit border ${
                      getStatusBucket(apt) === 'confirmed' ? 'bg-emerald-50 border-emerald-100 text-emerald-600' :
                      getStatusBucket(apt) === 'cancelled' ? 'bg-rose-50 border-rose-100 text-rose-600' :
                      getStatusBucket(apt) === 'finished' ? 'bg-[var(--practo-bg)] border-[var(--practo-border)] text-[var(--practo-text-light)]' :
                      'bg-primary-50 border-primary-100 text-primary-600'
                    } text-[9px] font-black uppercase tracking-[0.18em]`}>
                      <div className={`h-1.5 w-1.5 rounded-full ${
                        getStatusBucket(apt) === 'confirmed' ? 'bg-emerald-500' : 
                        getStatusBucket(apt) === 'cancelled' ? 'bg-rose-500' : 
                        getStatusBucket(apt) === 'finished' ? 'bg-slate-400' : 
                        'bg-primary-500'
                      }`} />
                      {getStatusBucket(apt)}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 ml-auto">
                  {getStatusBucket(apt) === 'pending' ? (
                    <>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          openScheduleModal(apt);
                        }}
                        className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-2xl bg-emerald-600 text-white text-[9px] font-black uppercase tracking-[0.16em] shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 transition-all"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Confirm
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleDeleteRequest(apt);
                        }}
                        className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-2xl bg-rose-50 text-rose-600 text-[9px] font-black uppercase tracking-[0.16em] border border-rose-100 hover:bg-rose-100 transition-all"
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </button>
                    </>
                  ) : (
                    <div className="opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center h-10 w-10 bg-primary-50 text-primary-600 rounded-2xl border border-primary-100">
                      <ChevronRight className="h-5 w-5" />
                    </div>
                  )}
                </div>
              </motion.div>
            )) : (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-32 text-center bg-[var(--practo-white)] rounded-[3rem] border border-[var(--practo-border)] shadow-sm">
                <div className="h-20 w-20 bg-[var(--practo-bg)] rounded-[2rem] flex items-center justify-center mx-auto mb-6">
                  <Search className="h-8 w-8 text-[var(--practo-text-light)]" />
                </div>
                <h3 className="text-lg font-black text-[var(--practo-text)] mb-2">No Matching Records</h3>
                <p className="text-[9px] font-black text-[var(--practo-text-light)] uppercase tracking-[0.18em]">Adjust your filters or search terms to try again</p>
              </motion.div>
            )}
          </div>
        )}

        <AnimatePresence>
          {selectedAudit && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 md:p-12">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSelectedAudit(null)} className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="relative w-full max-w-5xl bg-[var(--practo-white)] rounded-[2.5rem] shadow-2xl flex flex-col border border-[var(--practo-border)] overflow-hidden max-h-[90vh]"
              >
                <div className="px-6 md:px-8 py-6 border-b border-[var(--practo-border)] flex items-center justify-between bg-[var(--practo-bg)]/50">
                  <div className="flex items-center gap-5">
                    <div className="h-12 w-12 bg-primary-600 rounded-[1.3rem] flex items-center justify-center shadow-lg shadow-primary-600/20 text-white">
                      <History className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="text-xl md:text-2xl font-black text-[var(--practo-text)] tracking-tight leading-none mb-1.5">Clinical Session Audit</h3>
                      <p className="text-[8px] md:text-[9px] font-black text-[var(--practo-text-light)] uppercase tracking-[0.26em]">Session ID: #{selectedAudit._id}</p>
                    </div>
                  </div>
                  <button onClick={() => setSelectedAudit(null)} className="h-11 w-11 flex items-center justify-center rounded-2xl bg-[var(--practo-white)] hover:bg-rose-50 hover:text-rose-500 transition-all text-[var(--practo-text-light)] border border-[var(--practo-border)]"><X size={18} /></button>
                </div>

                <div className="p-5 md:p-7 overflow-y-auto custom-scrollbar flex-1 space-y-7">
                  {/* Patient Header Card */}
                  <div className="bg-[var(--practo-white)] border border-[var(--practo-border)] p-6 rounded-[2.2rem] shadow-sm flex items-center gap-6">
                    <div className="h-16 w-16 rounded-[1.5rem] bg-[var(--practo-bg)] flex items-center justify-center border border-[var(--practo-border)]">
                      <User className="h-8 w-8 text-[var(--practo-text-light)]" />
                    </div>
                    <div className="flex-1">
                      <div className="mb-4">
                        <h4 className="text-xl md:text-2xl font-black text-[var(--practo-text)]">{getPatientName(selectedAudit)}</h4>
                        {resolvePatientProfile(selectedAudit).email && (
                          <p className="text-sm font-semibold text-[var(--practo-text-light)] mt-1">{resolvePatientProfile(selectedAudit).email}</p>
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-6">
                        <div>
                          <label className="text-[8px] font-black uppercase tracking-[0.18em] text-[var(--practo-text-light)] block mb-1">Date</label>
                          <span className="text-xs font-bold text-[var(--practo-text-light)]">{new Date(selectedAudit.createdAt).toLocaleDateString(undefined, { dateStyle: 'full' })}</span>
                        </div>
                        <div>
                          <label className="text-[8px] font-black uppercase tracking-[0.18em] text-[var(--practo-text-light)] block mb-1">Mode</label>
                          <div className="flex items-center gap-2 text-xs font-bold text-[var(--practo-text-light)]">
                            {selectedAudit.type === 'online' ? <Video size={14} className="text-indigo-500" /> : <Building2 size={14} className="text-emerald-500" />}
                            <span className="uppercase">{selectedAudit.type || 'In-Person'}</span>
                          </div>
                        </div>
                        <div>
                          <label className="text-[8px] font-black uppercase tracking-[0.18em] text-[var(--practo-text-light)] block mb-1">Duration</label>
                          <span className="text-xs font-bold text-[var(--practo-text-light)]">{selectedAudit.duration || '30'} Minutes</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {selectedAudit.attachments?.length > 0 && (
                    <div className="bg-[var(--practo-bg)] border border-[var(--practo-border)] p-5 rounded-[2rem] space-y-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-[9px] font-black uppercase tracking-[0.2em] text-[var(--practo-text-light)]">Saved Files</div>
                          <div className="text-sm font-semibold text-[var(--practo-text-light)] mt-1">Open or download the files attached to this consultation.</div>
                        </div>
                        <span className="text-[9px] font-black uppercase tracking-[0.18em] text-[var(--practo-text-light)]">
                          {selectedAudit.attachments.length} File{selectedAudit.attachments.length > 1 ? 's' : ''}
                        </span>
                      </div>
                      <div className="grid gap-2">
                        {selectedAudit.attachments.map((attachment, index) => (
                          <a
                            key={`${attachment.fileName || attachment.originalName || 'attachment'}-${index}`}
                            href={attachment.url}
                            target="_blank"
                            rel="noreferrer"
                            download={attachment.originalName || true}
                            className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--practo-border)] bg-[var(--practo-white)] px-4 py-3 text-left hover:border-primary-200 hover:shadow-sm transition-all"
                          >
                            <div className="min-w-0">
                              <div className="truncate text-sm font-bold text-[var(--practo-text)]">{attachment.originalName || attachment.fileName || 'Consultation File'}</div>
                              <div className="text-[9px] font-black uppercase tracking-[0.18em] text-[var(--practo-text-light)] mt-1">
                                {attachment.mimeType || 'attachment'}
                              </div>
                            </div>
                            <div className="text-[9px] font-black uppercase tracking-[0.18em] text-primary-600 shrink-0">Open</div>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {normalizeStatus(selectedAudit.status) === 'confirmed' && (
                    selectedAudit.type === 'clinic' ||
                    selectedAudit.type === 'follow-up' ||
                    getStatusBucket(selectedAudit) === 'finished'
                  ) && (
                    <div className="bg-[var(--practo-white)] border border-[var(--practo-border)] rounded-[2rem] p-5 space-y-4 shadow-sm">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div>
                          <div className="text-[9px] font-black uppercase tracking-[0.2em] text-[var(--practo-text-light)]">Consultation Outcome</div>
                          <div className="text-sm font-semibold text-[var(--practo-text-light)] mt-1">Mark the visit as completed with optional supporting files, or cancel it.</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={openCompletionPanel}
                            className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2.5 text-[9px] font-black uppercase tracking-[0.16em] text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 transition-all"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            Completed
                          </button>
                          <button
                            type="button"
                            onClick={handleCancelSelectedAudit}
                            className="inline-flex items-center gap-2 rounded-2xl bg-rose-50 px-4 py-2.5 text-[9px] font-black uppercase tracking-[0.16em] text-rose-600 border border-rose-100 hover:bg-rose-100 transition-all"
                          >
                            <Trash2 className="h-4 w-4" />
                            Cancelled
                          </button>
                        </div>
                      </div>

                      {completionMode === 'completed' && (
                        <div className="space-y-3 rounded-[1.5rem] border border-emerald-100 bg-emerald-50/50 p-4">
                          <div className="text-[9px] font-black uppercase tracking-[0.2em] text-emerald-700">Add files for this completed consultation</div>
                          <input
                            type="file"
                            multiple
                            accept=".pdf,.txt,.png,.jpg,.jpeg,.webp,.gif,image/*,text/plain,application/pdf"
                            onChange={(event) => setCompletionFiles(Array.from(event.target.files || []))}
                            className="block w-full text-sm text-[var(--practo-text-light)] file:mr-4 file:rounded-2xl file:border-0 file:bg-[var(--practo-white)] file:px-4 file:py-2.5 file:text-[9px] file:font-black file:uppercase file:tracking-[0.16em] file:text-[var(--practo-text)] hover:file:bg-[var(--practo-bg)]"
                          />
                          {completionFiles.length > 0 && (
                            <div className="space-y-2">
                              {completionFiles.map((file, index) => (
                                <div key={`${file.name}-${index}`} className="rounded-2xl bg-[var(--practo-white)] px-4 py-2.5 border border-[var(--practo-border)] text-sm font-semibold text-[var(--practo-text)] flex items-center justify-between gap-3">
                                  <span className="truncate">{file.name}</span>
                                  <span className="text-[9px] font-black uppercase tracking-[0.16em] text-[var(--practo-text-light)] shrink-0">
                                    {file.type || 'file'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={closeCompletionPanel}
                              className="flex-1 rounded-2xl border border-[var(--practo-border)] bg-[var(--practo-white)] px-4 py-3 text-[9px] font-black uppercase tracking-[0.18em] text-[var(--practo-text-light)] hover:bg-[var(--practo-bg)] transition-all"
                              disabled={completionSaving}
                            >
                              Back
                            </button>
                            <button
                              type="button"
                              onClick={handleSaveCompletionFiles}
                              disabled={completionSaving}
                              className="flex-1 rounded-2xl bg-emerald-600 px-4 py-3 text-[9px] font-black uppercase tracking-[0.18em] text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                              {completionSaving ? 'Saving...' : 'Save Completed'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Diagnosis Section */}
                  <div className="space-y-6">
                    <div className="flex items-center gap-4">
                      <div className="h-[1px] flex-1 bg-[var(--practo-border)]" />
                      <span className="text-[9px] font-black uppercase tracking-[0.32em] text-[var(--practo-text-light)]">Clinical Findings</span>
                      <div className="h-[1px] flex-1 bg-[var(--practo-border)]" />
                    </div>

                    <div className="rounded-[2rem] border border-[var(--practo-border)] bg-[var(--practo-white)] p-5 shadow-sm space-y-4">
                      <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[var(--practo-text-light)]">
                        Patient details (review before consult)
                      </p>
                      <PatientDetailsCard appointment={selectedAudit} showAllFields />
                    </div>

                    <div className="space-y-4">
                      {parseDiagnosis(selectedAudit.sessionData?.diagnosis).length > 0 ? (
                        parseDiagnosis(selectedAudit.sessionData?.diagnosis).map((report, i) => (
                          <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }} className="group/report p-6 rounded-[2.25rem] bg-[var(--practo-bg)] border border-[var(--practo-border)] hover:bg-[var(--practo-white)] hover:shadow-xl hover:shadow-primary-600/5 hover:border-primary-100 transition-all">
                            <div className="flex items-center justify-between mb-5">
                              <div className="flex items-center gap-3">
                                <div className="h-9 w-9 bg-[var(--practo-white)] rounded-xl flex items-center justify-center text-primary-600 shadow-sm border border-[var(--practo-border)]">
                                  <Info size={18} />
                                </div>
                                <span className="text-[13px] font-black text-[var(--practo-text)] uppercase tracking-[0.16em]">{report.title}</span>
                              </div>
                              <button 
                                onClick={() => downloadMedicalReportPDF(report.reportData, { reportType: report.reportType, reportTitle: report.title })}
                                className="flex items-center gap-2 px-4 py-2.5 bg-[var(--practo-white)] hover:bg-primary-600 hover:text-white text-primary-600 rounded-xl border border-[var(--practo-border)] transition-all text-[9px] font-black uppercase tracking-[0.16em] shadow-sm"
                              >
                                <Download size={13} />
                                Download Report
                              </button>
                            </div>
                            <div className="bg-[var(--practo-white)] p-5 rounded-2xl border border-[var(--practo-border)] text-sm text-[var(--practo-text-light)] leading-relaxed font-medium">
                              {report.reportData?.diagnosis?.reasoning || report.reportData?.lifestyleChanges || "Detailed clinical analysis summary is available in the attached PDF document."}
                            </div>
                          </motion.div>
                        ))
                      ) : (
                          <div className="py-16 text-center bg-[var(--practo-bg)] rounded-[3rem] border border-dashed border-[var(--practo-border)]">
                            <div className="h-14 w-14 bg-[var(--practo-white)] rounded-[1.4rem] flex items-center justify-center mx-auto mb-4 border border-[var(--practo-border)]">
                              <Info className="h-7 w-7 text-[var(--practo-text-light)]" />
                            </div>
                          <p className="text-[9px] font-black text-[var(--practo-text-light)] uppercase tracking-[0.18em]">No clinical reports found for this session</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="p-5 md:p-6 bg-[var(--practo-bg)]/50 border-t border-[var(--practo-border)] flex items-center gap-4">
                  <button 
                    onClick={() => setSelectedAudit(null)}
                    className="flex-1 py-3.5 bg-slate-900 text-white rounded-2xl text-[9px] font-black uppercase tracking-[0.18em] shadow-xl shadow-slate-900/10 hover:bg-slate-800 transition-all"
                  >
                    Archive & Close Registry Audit
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {schedulingAppointment && (
            <div className="fixed inset-0 z-[110] flex items-center justify-center p-2 md:p-4 lg:p-6">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
                onClick={() => !savingSchedule && setSchedulingAppointment(null)}
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="relative w-full max-w-[860px] max-h-[88vh] bg-[var(--practo-white)] rounded-[1.75rem] shadow-2xl border border-[var(--practo-border)] overflow-hidden flex flex-col"
              >
                <div className="px-4 md:px-5 py-3.5 border-b border-[var(--practo-border)] bg-[var(--practo-bg)]/70 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[8px] font-black uppercase tracking-[0.22em] text-[var(--practo-text-light)]">Pending Request</p>
                    <h3 className="text-lg md:text-xl font-black text-[var(--practo-text)] tracking-tight mt-1">Confirm and schedule visit</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => !savingSchedule && setSchedulingAppointment(null)}
                    className="h-9 w-9 rounded-2xl border border-[var(--practo-border)] text-[var(--practo-text-light)] hover:bg-rose-50 hover:text-rose-500 transition-all flex items-center justify-center"
                    disabled={savingSchedule}
                  >
                    <X size={15} />
                  </button>
                </div>

                <form onSubmit={handleConfirmSchedule} className="p-4 md:p-5 space-y-4 overflow-y-auto flex-1">
                  <AvailabilityScheduler
                    availabilityTimings={doctorData?.availability?.timings}
                    appointments={appointments}
                    selectedDate={scheduleForm.date}
                    selectedTime={scheduleForm.time}
                    duration={scheduleForm.duration}
                    onDateChange={(date) => setScheduleForm((prev) => ({ ...prev, date }))}
                    onTimeChange={(time) => setScheduleForm((prev) => ({ ...prev, time }))}
                    onDurationChange={(duration) => setScheduleForm((prev) => ({ ...prev, duration }))}
                    showDurationControl
                  />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <label className="space-y-2">
                      <span className="text-[9px] font-black uppercase tracking-[0.2em] text-[var(--practo-text-light)]">Visit Type</span>
                      <select
                        value={scheduleForm.type}
                        onChange={(event) => setScheduleForm((prev) => ({ ...prev, type: event.target.value }))}
                        className="w-full rounded-2xl border border-[var(--practo-border)] bg-[var(--practo-bg)] px-4 py-2.5 text-sm font-semibold text-[var(--practo-text)] outline-none focus:border-primary-300 focus:bg-[var(--practo-white)]"
                      >
                        <option value="clinic">Clinic</option>
                        <option value="online">Online</option>
                        <option value="follow-up">Follow-up</option>
                      </select>
                    </label>

                    <label className="space-y-2 md:col-span-2">
                      <span className="text-[9px] font-black uppercase tracking-[0.2em] text-[var(--practo-text-light)]">Fee</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={scheduleForm.fee}
                        onChange={(event) => setScheduleForm((prev) => ({ ...prev, fee: event.target.value }))}
                        className="w-full rounded-2xl border border-[var(--practo-border)] bg-[var(--practo-bg)] px-4 py-2.5 text-sm font-semibold text-[var(--practo-text)] outline-none focus:border-primary-300 focus:bg-[var(--practo-white)]"
                        placeholder="Optional"
                      />
                    </label>

                    <label className="space-y-2 md:col-span-2">
                      <span className="text-[9px] font-black uppercase tracking-[0.2em] text-[var(--practo-text-light)]">Notes</span>
                      <textarea
                        rows="4"
                        value={scheduleForm.notes}
                        onChange={(event) => setScheduleForm((prev) => ({ ...prev, notes: event.target.value }))}
                        className="w-full rounded-2xl border border-[var(--practo-border)] bg-[var(--practo-bg)] px-4 py-2.5 text-sm font-semibold text-[var(--practo-text)] outline-none focus:border-primary-300 focus:bg-[var(--practo-white)] resize-none"
                        placeholder="Add visit notes or special instructions"
                      />
                    </label>
                  </div>

                  <div className="flex items-center gap-3 pt-1 sticky bottom-0 bg-[var(--practo-white)] pb-1">
                    <button
                      type="button"
                      onClick={() => !savingSchedule && setSchedulingAppointment(null)}
                      className="flex-1 rounded-2xl border border-[var(--practo-border)] bg-[var(--practo-white)] px-5 py-3 text-[9px] font-black uppercase tracking-[0.2em] text-[var(--practo-text-light)] hover:bg-[var(--practo-bg)] transition-all"
                      disabled={savingSchedule}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="flex-1 rounded-2xl bg-emerald-600 px-5 py-3 text-[9px] font-black uppercase tracking-[0.2em] text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                      disabled={savingSchedule}
                    >
                      {savingSchedule ? 'Saving...' : 'Confirm Request'}
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
        </div>
      </main>
      </div>
    </motion.div>
  );
};

export default Registry;
