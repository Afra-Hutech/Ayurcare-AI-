import React, { useEffect, useState, useMemo, useRef } from 'react';
import { doctorService, doctorChatService } from '../../services/api';
import Sidebar from '../../components/ui/Sidebar';
import Navbar from '../../components/ui/Navbar';
import {
   ChevronLeft,
   ChevronRight,
   Calendar as CalIcon,
   Plus,
   Video,
   Building2,
   RefreshCcw,
   MessageSquare,
   Download,
   Clock,
   Search,
   Filter,
   X,
   MoreVertical,
   CheckCircle2,
   XCircle,
   AlertCircle,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { downloadMedicalReportPDF } from '../../utils/pdfExport';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import {
   normalizeAppointmentsList,
   getAppointmentStatusBucket,
   resolveAppointmentStart,
   isSameLocalDay,
} from '../../utils/appointments';

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

const MySchedule = () => {
   const navigate = useNavigate();
   const location = useLocation();
   const [searchParams, setSearchParams] = useSearchParams();
   const scrollRef = useRef(null);
   const aptRefs = useRef({});
   const [currentDate, setCurrentDate] = useState(new Date());
   const [highlightedAptId, setHighlightedAptId] = useState('');
   const [appointments, setAppointments] = useState([]);
   const [loading, setLoading] = useState(true);
   const [typeFilter, setTypeFilter] = useState('all');
   const [statusFilter, setStatusFilter] = useState('confirmed');
   const [doctorProfile, setDoctorProfile] = useState(null);
   const [now, setNow] = useState(new Date());
   const [reviewAppointment, setReviewAppointment] = useState(null);
   const [reviewActionLoading, setReviewActionLoading] = useState(false);

   useEffect(() => {
      const timer = setInterval(() => setNow(new Date()), 60000);
      return () => clearInterval(timer);
   }, []);

   const openPatientChat = async (userId) => {
      if (!userId) return;
      try {
         const chat = await doctorChatService.initiateChat({ userId });
         if (!chat?._id) throw new Error('Missing chat id');
         navigate(`/messages/${chat._id}`);
      } catch (err) {
         console.error('Failed to open patient chat:', err);
      }
   };

   const openConsultationWorkspace = (appointmentId) => {
      if (!appointmentId) return;
      navigate(`/consultation/${appointmentId}`);
   };

   const parseTimingsString = (str) => {
      if (!str) return { startHour: 8, endHour: 18 };
      try {
         const match = str.match(/(\d+)(?::(\d+))?\s*(AM|PM)\s*[-–]\s*(\d+)(?::(\d+))?\s*(AM|PM)/i);
         if (!match) return { startHour: 8, endHour: 18 };
         let sh = parseInt(match[1]), sap = match[3].toUpperCase();
         let eh = parseInt(match[4]), eap = match[6].toUpperCase();
         if (sap === 'PM' && sh !== 12) sh += 12; if (sap === 'AM' && sh === 12) sh = 0;
         if (eap === 'PM' && eh !== 12) eh += 12; if (eap === 'AM' && eh === 12) eh = 0;
         return { startHour: sh, endHour: eh };
      } catch { return { startHour: 8, endHour: 18 }; }
   };

   const CALENDAR_START = 7;
   const CALENDAR_END = 21;
   const SLOT_HEIGHT = 52;
   const COL_MIN_WIDTH = 148;

   const { startHour: WORK_START, endHour: WORK_END } = useMemo(() => 
      parseTimingsString(doctorProfile?.availability?.timings), 
      [doctorProfile]
   );

   useEffect(() => {
      fetchAppointments();
      doctorService.getProfile().then(p => setDoctorProfile(p)).catch(() => {});
   }, [currentDate]);

   const fetchAppointments = async () => {
      setLoading(true);
      try {
         const apts = await doctorService.getAppointments();
         setAppointments(normalizeAppointmentsList(apts));
         return apts;
      } catch (err) {
         console.error('Failed to load appointments', err);
         return [];
      } finally {
         setLoading(false);
      }
   };

   const openReviewForId = (appointmentId, list = appointments) => {
      if (!appointmentId) return;
      const apt = (list || []).find((a) => String(a._id) === String(appointmentId));
      if (!apt) return;
      setStatusFilter('pending');
      setReviewAppointment(apt);
      if (apt.startTime) setCurrentDate(new Date(apt.startTime));
   };

   const handleReviewDecision = async (nextStatus) => {
      if (!reviewAppointment?._id || reviewActionLoading) return;
      setReviewActionLoading(true);
      try {
         const meta =
           nextStatus === 'cancelled'
             ? {
                 cancellationNote:
                   'Your appointment request was declined. Please reschedule from your patient portal.',
               }
             : {};
         const ok = await doctorService.updateAppointmentStatus(reviewAppointment._id, nextStatus, meta);
         if (!ok) throw new Error('Update failed');
         const refreshed = await fetchAppointments();
         window.dispatchEvent(new CustomEvent('doctor-appointments-changed'));
         setReviewAppointment(null);
         setSearchParams({}, { replace: true });
         if (nextStatus === 'confirmed' && refreshed?.length) {
            const updated = refreshed.find((a) => String(a._id) === String(reviewAppointment._id));
            if (updated?.startTime) setCurrentDate(new Date(updated.startTime));
         }
      } catch (err) {
         console.error('Failed to update appointment:', err);
         window.alert('Could not update this appointment. Please try again.');
      } finally {
         setReviewActionLoading(false);
      }
   };

   useEffect(() => {
      const reviewId =
        searchParams.get('review') ||
        location.state?.reviewAppointmentId;
      if (!reviewId || loading) return;
      openReviewForId(reviewId, appointments);
   }, [searchParams, location.state, appointments, loading]);

   const getWeekDates = () => {
      const curr = new Date(currentDate);
      const day = curr.getDay() || 7;
      curr.setDate(curr.getDate() - day + 1);
      return Array.from({ length: 7 }).map((_, i) => {
         const d = new Date(curr);
         d.setDate(d.getDate() + i);
         return d;
      });
   };

   const weekDays = useMemo(() => getWeekDates(), [currentDate]);
   const hours = Array.from({ length: CALENDAR_END - CALENDAR_START + 1 }).map((_, i) => i + CALENDAR_START);

   const getPatientName = (apt) => {
      if (!apt) return "Patient";
      if (apt.patientId && typeof apt.patientId === 'object') {
         const user = apt.patientId;
         if (user.name && user.name !== "Patient") return user.name;
         if (user.email) return user.email.split('@')[0];
      }
      if (typeof apt.patientId === 'string' && apt.patientId.includes('@')) {
         return apt.patientId.split('@')[0];
      }
      const idStr = apt.patientId?._id || apt.patientId || '';
      return idStr.toString().length > 4 ? `Patient #${idStr.toString().slice(-4)}` : "Lead";
   };

   const normalizeStatus = (status) => String(status || '').toLowerCase().trim();

   const getStatusBucket = (apt) => getAppointmentStatusBucket(apt, now);

   const appointmentsForStatus = (tabKey) => appointments
      .map((a) => ({ a, start: resolveAppointmentStart(a), bucket: getStatusBucket(a) }))
      .filter(({ start, bucket }) => start && bucket === tabKey)
      .sort((x, y) => x.start.getTime() - y.start.getTime());

   const visibleWeekAppointmentCount = (tabKey) => {
      const weekKeys = new Set(weekDays.map((d) => d.toDateString()));
      return appointmentsForStatus(tabKey).filter(({ start }) => weekKeys.has(start.toDateString())).length;
   };

   const handleStatusTabClick = (tabKey) => {
      setStatusFilter(tabKey);
      const matching = appointmentsForStatus(tabKey);
      if (!matching.length) return;

      const today = new Date(now);
      const todayPick = matching.find(({ start }) => isSameLocalDay(start, today));
      const target = todayPick || matching[0];
      setCurrentDate(new Date(target.start));
      setHighlightedAptId(String(target.a._id));
   };

   const handleAppointmentCardClick = (apt, statusBucket) => {
      if (statusBucket === 'pending') {
         setReviewAppointment(apt);
         return;
      }
      if (statusBucket === 'confirmed' && apt.type === 'online' && apt._id) {
         openConsultationWorkspace(apt._id);
         return;
      }
      setHighlightedAptId(String(apt._id));
   };

   useEffect(() => {
      if (!highlightedAptId || loading) return undefined;
      const timer = setTimeout(() => {
         const node = aptRefs.current[highlightedAptId];
         if (!node) return;
         node.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
         const col = node.closest('[data-day-col]');
         if (col && scrollRef.current) {
            col.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
         }
      }, 200);
      return () => clearTimeout(timer);
   }, [highlightedAptId, currentDate, loading, statusFilter]);

   const handleDownloadPDF = (apt) => {
      const reports = parseDiagnosis(apt?.sessionData?.diagnosis);
      if (!reports.length) return alert("No clinical data available.");
      reports.forEach(r => downloadMedicalReportPDF(r.reportData, { reportType: r.reportType, reportTitle: r.title }));
   };

   const isDateToday = (date) => {
      const d = new Date();
      return date.getDate() === d.getDate() && date.getMonth() === d.getMonth() && date.getFullYear() === d.getFullYear();
   };

   const gridHeight = (CALENDAR_END - CALENDAR_START + 1) * SLOT_HEIGHT;

   const nowLineTop = useMemo(() => {
      const h = now.getHours();
      const m = now.getMinutes();
      if (h < CALENDAR_START || h > CALENDAR_END) return null;
      return ((h - CALENDAR_START) * 60 + m) / 60 * SLOT_HEIGHT;
   }, [now]);

   const shiftWeek = (delta) => {
      setCurrentDate((d) => {
         const n = new Date(d);
         n.setDate(n.getDate() + delta * 7);
         return n;
      });
   };

   const weekRangeLabel = useMemo(() => {
      const start = weekDays[0];
      const end = weekDays[6];
      if (!start || !end) return '';
      const sameMonth = start.getMonth() === end.getMonth();
      if (sameMonth) {
         return `${start.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} – ${end.getDate()}, ${end.getFullYear()}`;
      }
      return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
   }, [weekDays]);

   const statusCounts = useMemo(() => {
      return {
         confirmed: appointments.filter(a => getStatusBucket(a) === 'confirmed').length,
         pending: appointments.filter(a => getStatusBucket(a) === 'pending').length,
         cancelled: appointments.filter(a => getStatusBucket(a) === 'cancelled').length,
         finished: appointments.filter(a => getStatusBucket(a) === 'finished').length,
      };
   }, [appointments, now]);

   const hasScrolled = useRef(false);

   useEffect(() => {
      const onChanged = () => fetchAppointments();
      window.addEventListener('doctor-appointments-changed', onChanged);
      const interval = setInterval(fetchAppointments, 45000);
      return () => {
         window.removeEventListener('doctor-appointments-changed', onChanged);
         clearInterval(interval);
      };
   }, []);

   const nextBookingHint = useMemo(() => {
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);
      const next = appointments
         .map((a) => ({ a, start: resolveAppointmentStart(a) }))
         .filter(({ a, start }) => {
            if (!start) return false;
            const bucket = getAppointmentStatusBucket(a, now);
            return (bucket === 'confirmed' || bucket === 'pending') && start >= todayStart;
         })
         .sort((x, y) => x.start.getTime() - y.start.getTime())[0];
      if (!next?.start) return null;
      return next.start.toLocaleString(undefined, {
         weekday: 'short',
         month: 'short',
         day: 'numeric',
         hour: '2-digit',
         minute: '2-digit',
      });
   }, [appointments, now]);

   useEffect(() => {
      if (!loading && scrollRef.current && !hasScrolled.current && nowLineTop != null) {
         const container = scrollRef.current;
         setTimeout(() => {
            container.scrollTo({
               top: Math.max(0, nowLineTop - container.clientHeight / 3),
               behavior: 'smooth',
            });
            hasScrolled.current = true;
         }, 400);
      }
   }, [loading, nowLineTop]);

   const formatHourLabel = (hour) => {
      const h = hour % 12 === 0 ? 12 : hour % 12;
      return `${h} ${hour >= 12 ? 'PM' : 'AM'}`;
   };

   return (
      <div className="flex min-h-screen w-full bg-[#faf9f8] font-sans">
         <Sidebar />
         <div className="ml-64 flex min-h-screen min-w-0 flex-1 flex-col">
            <Navbar />
            <main className="flex flex-1 flex-col overflow-hidden bg-[var(--practo-bg)]">
               <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-3 bg-[var(--practo-white)] px-4 py-3 shadow-sm">
                  <div className="flex items-center gap-2">
                     <button type="button" onClick={() => shiftWeek(-1)} className="rounded-md border border-[#edebe9] p-2 hover:bg-[#f3f2f1]" aria-label="Previous week">
                        <ChevronLeft size={18} />
                     </button>
                     <button type="button" onClick={() => setCurrentDate(new Date())} className="rounded-md border border-[#edebe9] px-3 py-1.5 text-sm font-semibold text-[#323130] hover:bg-[#f3f2f1]">
                        Today
                     </button>
                     <button type="button" onClick={() => shiftWeek(1)} className="rounded-md border border-[#edebe9] p-2 hover:bg-[#f3f2f1]" aria-label="Next week">
                        <ChevronRight size={18} />
                     </button>
                     <span className="ml-2 text-sm font-semibold text-[#323130]">{weekRangeLabel}</span>
                     {nextBookingHint && (
                        <span className="ml-2 hidden text-xs font-medium text-[#82a18d] sm:inline">
                           Next: {nextBookingHint}
                        </span>
                     )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                     {[
                        { key: 'pending', label: 'Pending', count: statusCounts.pending },
                        { key: 'confirmed', label: 'Confirmed', count: statusCounts.confirmed },
                        { key: 'finished', label: 'Finished', count: statusCounts.finished },
                        { key: 'cancelled', label: 'Cancelled', count: statusCounts.cancelled },
                     ].map((tab) => (
                        <button
                           key={tab.key}
                           type="button"
                           onClick={() => handleStatusTabClick(tab.key)}
                           className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                              statusFilter === tab.key
                                 ? 'bg-[#82a18d] text-white'
                                 : 'bg-[#f3f2f1] text-[#605e5c] hover:bg-[#edebe9]'
                           }`}
                           title={tab.count > 0 ? `Jump to ${tab.label.toLowerCase()} on calendar` : `No ${tab.label.toLowerCase()} appointments`}
                        >
                           {tab.label} ({tab.count})
                        </button>
                     ))}
                  </div>
               </div>

               {statusCounts[statusFilter] > 0 && visibleWeekAppointmentCount(statusFilter) === 0 && (
                  <div className="border-b border-amber-100 bg-amber-50 px-4 py-2 text-xs font-medium text-amber-900">
                     {statusCounts[statusFilter]} {statusFilter} appointment{statusCounts[statusFilter] === 1 ? '' : 's'} not in this week —{' '}
                     <button
                        type="button"
                        className="font-bold underline"
                        onClick={() => handleStatusTabClick(statusFilter)}
                     >
                        jump to the nearest one
                     </button>
                  </div>
               )}

               <div className="flex flex-1 overflow-hidden bg-[#faf9f8]">
                  <div ref={scrollRef} className="flex flex-1 overflow-auto custom-scrollbar">
                     <div className="flex min-w-max">
                        <div className="sticky left-0 z-20 w-14 shrink-0 bg-[var(--practo-bg)]">
                           <div className="sticky top-0 z-30 h-12 bg-[var(--practo-white)]" />
                           {hours.map((hour) => (
                              <div key={hour} className="relative pr-1 text-right" style={{ height: SLOT_HEIGHT }}>
                                 <span className="absolute -top-2 right-1 text-[10px] font-medium text-[#605e5c]">
                                    {formatHourLabel(hour)}
                                 </span>
                              </div>
                           ))}
                        </div>

                        {weekDays.map((date, colIdx) => {
                           const isToday = isDateToday(date);
                           const dayApts = appointments
                              .filter((a) => {
                                 const start = resolveAppointmentStart(a);
                                 if (!start) return false;
                                 if (typeFilter !== 'all' && a.type !== typeFilter) return false;
                                 if (getStatusBucket(a) !== statusFilter) return false;
                                 return start.toDateString() === date.toDateString();
                              })
                              .sort((a, b) => {
                                 const sa = resolveAppointmentStart(a)?.getTime() ?? 0;
                                 const sb = resolveAppointmentStart(b)?.getTime() ?? 0;
                                 return sa - sb;
                              });

                           return (
                              <div
                                 key={colIdx}
                                 data-day-col
                                 className={`relative shrink-0 ${isToday ? 'bg-teal-500/[0.04]' : 'bg-[var(--practo-white)]'}`}
                                 style={{ width: COL_MIN_WIDTH, minHeight: gridHeight + 48 }}
                              >
                                 <div className={`sticky top-0 z-30 flex h-12 flex-col items-center justify-center border-b border-[#edebe9] ${isToday ? 'bg-[#82a18d]/10' : 'bg-[#f3f2f1]'}`}>
                                    <span className={`text-[10px] font-bold uppercase ${isToday ? 'text-[#82a18d]' : 'text-[#605e5c]'}`}>
                                       {date.toLocaleDateString('en-US', { weekday: 'short' })}
                                    </span>
                                    <span className={`text-lg font-bold leading-none ${isToday ? 'text-[#82a18d]' : 'text-[#323130]'}`}>
                                       {date.getDate()}
                                    </span>
                                 </div>

                                 <div className="relative" style={{ height: gridHeight }}>
                                    {hours.map((hour) => (
                                       <div key={hour} className="border-b border-slate-100/80 dark:border-slate-800/60" style={{ height: SLOT_HEIGHT }} />
                                    ))}

                                    {isToday && nowLineTop != null && (
                                       <div className="pointer-events-none absolute left-0 right-0 z-20 flex items-center" style={{ top: nowLineTop }}>
                                          <div className="h-2 w-2 rounded-full bg-[#c50f1f] -ml-1" />
                                          <div className="h-[2px] flex-1 bg-[#c50f1f]" />
                                       </div>
                                    )}

                                    {dayApts.map((apt) => {
                                       const start = resolveAppointmentStart(apt) || new Date(apt.startTime);
                                       const duration = apt.duration || 30;
                                       const top = ((start.getHours() - CALENDAR_START) * 60 + start.getMinutes()) / 60 * SLOT_HEIGHT;
                                       const height = Math.max(28, (duration / 60) * SLOT_HEIGHT - 4);
                                       const statusBucket = getStatusBucket(apt);
                                       const isCancelled = statusBucket === 'cancelled';
                                       const isOnline = apt.type === 'online';
                                       const isFinished = statusBucket === 'finished';

                                       const isHighlighted = highlightedAptId === String(apt._id);

                                       return (
                                          <div
                                             key={apt._id}
                                             ref={(el) => {
                                                if (el) aptRefs.current[String(apt._id)] = el;
                                                else delete aptRefs.current[String(apt._id)];
                                             }}
                                             className={`absolute left-1 right-1 z-10 cursor-pointer overflow-hidden rounded-md border-l-[3px] px-2 py-1.5 text-left shadow-sm transition hover:shadow-md ${
                                                isHighlighted ? 'ring-2 ring-[#82a18d] ring-offset-1 z-30' : ''
                                             } ${
                                                isCancelled
                                                   ? 'border-rose-500 bg-rose-50 text-rose-800'
                                                   : isFinished
                                                     ? 'border-slate-400 bg-slate-100 text-slate-700'
                                                     : isOnline
                                                       ? 'border-[#82a18d] bg-[#82a18d]/10 text-emerald-900'
                                                       : 'border-teal-600 bg-teal-50 text-teal-900'
                                             }`}
                                             style={{ top: top + 2, height }}
                                             onClick={() => handleAppointmentCardClick(apt, statusBucket)}
                                          >
                                             <p className="truncate text-[11px] font-bold leading-tight">{getPatientName(apt)}</p>
                                             <p className="truncate text-[10px] opacity-80">
                                                {start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                {isOnline ? ' · Video' : ' · Clinic'}
                                             </p>
                                          </div>
                                       );
                                    })}
                                 </div>
                              </div>
                           );
                        })}
                     </div>
                  </div>

                  {loading && (
                     <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/50 backdrop-blur-[1px]">
                        <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#82a18d] border-t-transparent" />
                     </div>
                  )}
               </div>
            </main>

            <AnimatePresence>
               {reviewAppointment && (
                  <motion.div
                     initial={{ opacity: 0 }}
                     animate={{ opacity: 1 }}
                     exit={{ opacity: 0 }}
                     className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/50 p-4"
                     onClick={() => !reviewActionLoading && setReviewAppointment(null)}
                  >
                     <motion.div
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.95, opacity: 0 }}
                        className="w-full max-w-md rounded-3xl bg-white border border-slate-200 shadow-2xl p-6"
                        onClick={(e) => e.stopPropagation()}
                     >
                        <div className="flex items-start gap-3 mb-4">
                           <div className="h-11 w-11 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center flex-shrink-0">
                              <AlertCircle size={22} />
                           </div>
                           <div>
                              <h2 className="text-lg font-black text-slate-900">Appointment request</h2>
                              <p className="text-sm text-slate-500 mt-1">
                                 {getPatientName(reviewAppointment)} wants to book a consultation.
                              </p>
                           </div>
                        </div>
                        <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4 text-sm text-slate-700 space-y-1 mb-6">
                           <p><span className="font-bold">When:</span>{' '}
                              {reviewAppointment.startTime
                                 ? new Date(reviewAppointment.startTime).toLocaleString()
                                 : `${reviewAppointment.date || ''} ${reviewAppointment.time || ''}`}
                           </p>
                           <p><span className="font-bold">Type:</span> {reviewAppointment.type === 'online' ? 'Video' : 'In-person'}</p>
                           {reviewAppointment.reason && (
                              <p><span className="font-bold">Note:</span> {reviewAppointment.reason}</p>
                           )}
                        </div>
                        <div className="flex gap-3">
                           <button
                              type="button"
                              disabled={reviewActionLoading}
                              onClick={() => handleReviewDecision('cancelled')}
                              className="flex-1 flex items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 py-3 text-sm font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                           >
                              <XCircle size={18} />
                              Decline
                           </button>
                           <button
                              type="button"
                              disabled={reviewActionLoading}
                              onClick={() => handleReviewDecision('confirmed')}
                              className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                           >
                              <CheckCircle2 size={18} />
                              {reviewActionLoading ? 'Saving…' : 'Approve'}
                           </button>
                        </div>
                        <button
                           type="button"
                           onClick={() => setReviewAppointment(null)}
                           className="mt-4 w-full text-center text-xs font-semibold text-slate-400 hover:text-slate-600"
                        >
                           Cancel
                        </button>
                     </motion.div>
                  </motion.div>
               )}
            </AnimatePresence>
         </div>
      </div>
   );
};

export default MySchedule;

