import React, { useState, useEffect, useCallback } from 'react';
import {
  Search, Star, ShieldCheck, Clock, Filter, Activity, User,
  Loader2, MessageSquare, BadgeCheck, X, ChevronLeft, ChevronRight,
  Calendar, CheckCircle2, Video, Building2, AlertCircle, Lock, MapPin,
  RefreshCw, IndianRupee,
} from 'lucide-react';
import { publicApi, doctorChatApi } from '../../services/api';
import { formatDoctorFee, getDoctorConsultationFee } from '../../utils/doctorFees';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

const toDateStr = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const fmt12 = (time24) => {
  const [h, m] = time24.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
};

// Build a 6-week calendar grid for a given month/year
const buildCalendarGrid = (year, month) => {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
};

// ─── Booking Modal ────────────────────────────────────────────────────────────

const BookingModal = ({ doctor, onClose, onBooked }) => {
  const today = new Date();
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState(null);
  const [slots, setSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [fullyBlocked, setFullyBlocked] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [apptType, setApptType] = useState('online');
  const [booking, setBooking] = useState(false);
  const [booked, setBooked] = useState(false);
  const [error, setError] = useState('');

  const consultationFee = getDoctorConsultationFee(doctor);
  const consultationFeeLabel = formatDoctorFee(doctor);

  const calGrid = buildCalendarGrid(calYear, calMonth);

  const prevMonth = () => {
    if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11); }
    else setCalMonth(m => m - 1);
    setSelectedDate(null); setSlots([]); setSelectedSlot(null);
  };
  const nextMonth = () => {
    if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0); }
    else setCalMonth(m => m + 1);
    setSelectedDate(null); setSlots([]); setSelectedSlot(null);
  };

  const isPast = (date) => {
    if (!date) return true;
    const d = new Date(date); d.setHours(0,0,0,0);
    const t = new Date(); t.setHours(0,0,0,0);
    return d < t;
  };

  const fetchSlots = useCallback(async (date) => {
    setSlotsLoading(true); setSlots([]); setSelectedSlot(null); setFullyBlocked(false); setError('');
    try {
      const res = await publicApi.getDoctorSlots(doctor._id, toDateStr(date));
      setFullyBlocked(res.data.fullyBlocked);
      setSlots(res.data.slots || []);
    } catch {
      setError('Could not load slots. Please try again.');
    } finally {
      setSlotsLoading(false);
    }
  }, [doctor._id]);

  const handleDateClick = (date) => {
    if (!date || isPast(date)) return;
    setSelectedDate(date);
    fetchSlots(date);
  };

  const handleConfirm = async () => {
    if (!selectedDate || !selectedSlot) return;
    if (consultationFee == null) {
      setError('This doctor has not set a consultation fee yet. Please message them or choose another doctor.');
      return;
    }
    const userData = JSON.parse(localStorage.getItem('user') || '{}');
    const patientId = userData.id || userData._id;
    if (!patientId) { setError('Please log in to book.'); return; }

    const [h, m] = selectedSlot.time.split(':').map(Number);
    const startTime = new Date(
      selectedDate.getFullYear(),
      selectedDate.getMonth(),
      selectedDate.getDate(),
      h,
      m,
      0,
      0,
    );

    setBooking(true); setError('');
    try {
      await publicApi.bookAppointment({
        doctorId: doctor._id,
        patientId,
        type: apptType,
        startTime: startTime.toISOString(),
        duration: 30,
      });
      setBooked(true);
      setTimeout(() => { onBooked?.(); onClose(); }, 2000);
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message;
      setError(msg || 'Booking failed. Please try again.');
    } finally {
      setBooking(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl overflow-hidden border border-slate-100 bg-slate-50 flex items-center justify-center">
              {doctor.basicInfo?.profileImage
                ? <img src={doctor.basicInfo.profileImage} className="w-full h-full object-cover" alt="" />
                : <User size={22} className="text-slate-300" />}
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900 tracking-tight">Book with Dr. {(doctor.basicInfo?.name || '').replace(/^Dr\.?\s+/i, '')}</h2>
              <p className="text-[11px] font-bold text-sky-600 uppercase tracking-wider">
                {doctor.professionalInfo?.specialization || 'Ayurvedic Consultant'}
              </p>
              {consultationFeeLabel ? (
                <p className="text-sm font-black text-emerald-700 mt-1 flex items-center gap-1">
                  <IndianRupee size={14} />
                  Consultation fee: {consultationFeeLabel}
                </p>
              ) : (
                <p className="text-xs font-bold text-amber-700 mt-1">Fee not set on profile — booking unavailable</p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-all">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {consultationFeeLabel ? (
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/80 px-4 py-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Consultation fee</p>
                <p className="text-lg font-black text-slate-900">{consultationFeeLabel}</p>
              </div>
              <p className="text-[10px] font-bold text-emerald-800/80 text-right max-w-[140px]">
                Set by the doctor · cannot be changed
              </p>
            </div>
          ) : null}

          {/* Consultation type */}
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Consultation Type</p>
            <div className="flex gap-3">
              {[
                { value: 'online', label: 'Online', icon: Video },
                { value: 'clinic', label: 'In-Clinic', icon: Building2 },
              ].map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  onClick={() => setApptType(value)}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl border-2 font-bold text-sm transition-all ${
                    apptType === value
                      ? 'border-sky-500 bg-sky-50 text-sky-700'
                      : 'border-slate-200 text-slate-500 hover:border-slate-300'
                  }`}
                >
                  <Icon size={16} />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Calendar */}
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Select Date</p>
            <div className="border border-slate-200 rounded-2xl overflow-hidden">
              {/* Month nav */}
              <div className="flex items-center justify-between px-5 py-3 bg-slate-50 border-b border-slate-200">
                <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-slate-200 transition-all">
                  <ChevronLeft size={16} className="text-slate-600" />
                </button>
                <span className="text-sm font-black text-slate-800">
                  {MONTH_NAMES[calMonth]} {calYear}
                </span>
                <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-slate-200 transition-all">
                  <ChevronRight size={16} className="text-slate-600" />
                </button>
              </div>

              {/* Day headers */}
              <div className="grid grid-cols-7 border-b border-slate-100">
                {DAY_NAMES.map(d => (
                  <div key={d} className="py-2 text-center text-[10px] font-black uppercase tracking-widest text-slate-400">
                    {d}
                  </div>
                ))}
              </div>

              {/* Date cells */}
              <div className="grid grid-cols-7">
                {calGrid.map((date, i) => {
                  if (!date) return <div key={i} className="h-10" />;
                  const past = isPast(date);
                  const isSelected = selectedDate && toDateStr(date) === toDateStr(selectedDate);
                  const isToday = toDateStr(date) === toDateStr(today);
                  return (
                    <button
                      key={i}
                      onClick={() => handleDateClick(date)}
                      disabled={past}
                      className={`h-10 flex items-center justify-center text-sm font-bold transition-all rounded-xl mx-0.5 my-0.5
                        ${past ? 'text-slate-300 cursor-not-allowed' : 'hover:bg-sky-50 hover:text-sky-600 cursor-pointer'}
                        ${isSelected ? 'bg-sky-600 text-white hover:bg-sky-600 hover:text-white shadow-md shadow-sky-500/30' : ''}
                        ${isToday && !isSelected ? 'ring-2 ring-sky-400 text-sky-600' : ''}
                      `}
                    >
                      {date.getDate()}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Time slots */}
          {selectedDate && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
                Select time
              </p>
              <p className="text-xs text-slate-500 mb-3">
                {selectedDate.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
                {' · '}
                <span className="text-slate-400">Grey = unavailable</span>
              </p>

              {slotsLoading ? (
                <div className="flex items-center justify-center py-8 gap-3 text-slate-400">
                  <Loader2 size={20} className="animate-spin" />
                  <span className="text-sm font-bold">Loading slots...</span>
                </div>
              ) : fullyBlocked ? (
                <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-200">
                  <AlertCircle size={18} className="text-slate-400 shrink-0" />
                  <p className="text-sm font-bold text-slate-500">Doctor is not available on this day.</p>
                </div>
              ) : slots.length === 0 ? (
                <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-200">
                  <AlertCircle size={18} className="text-slate-400 shrink-0" />
                  <p className="text-sm font-bold text-slate-500">No slots configured for this day.</p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                    {slots.map((slot) => {
                      const isSelected = selectedSlot?.time === slot.time;
                      const unavailable = !slot.available;
                      const reasonLabel =
                        slot.reason === 'booked'
                          ? 'Booked'
                          : slot.reason === 'blocked'
                            ? 'Blocked'
                            : slot.reason === 'past'
                              ? 'Past'
                              : null;
                      return (
                        <button
                          key={slot.time}
                          type="button"
                          disabled={unavailable}
                          onClick={() => setSelectedSlot(slot)}
                          title={unavailable ? reasonLabel || 'Unavailable' : 'Select this time'}
                          className={`flex flex-col items-center justify-center gap-0.5 py-2.5 px-1 rounded-xl text-[10px] font-bold transition-all border-2 min-h-[48px]
                            ${unavailable
                              ? 'bg-slate-200/80 border-slate-300 text-slate-500 cursor-not-allowed'
                              : isSelected
                                ? 'bg-sky-600 border-sky-600 text-white shadow-md shadow-sky-500/30'
                                : 'bg-white border-emerald-200 text-slate-800 hover:border-sky-400 hover:bg-sky-50'
                            }`}
                        >
                          <span className={unavailable ? 'line-through opacity-80' : ''}>{fmt12(slot.time)}</span>
                          {unavailable && reasonLabel && (
                            <span className="text-[8px] font-black uppercase tracking-wide">{reasonLabel}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  {/* Legend */}
                  <div className="flex items-center gap-4 mt-3">
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded bg-white border-2 border-slate-200" />
                      <span className="text-[10px] font-bold text-slate-400">Available</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded bg-slate-100 border-2 border-slate-200" />
                      <span className="text-[10px] font-bold text-slate-500">Grey — unavailable</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded bg-sky-600" />
                      <span className="text-[10px] font-bold text-slate-400">Selected</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
              <AlertCircle size={16} className="text-red-500 shrink-0" />
              <p className="text-sm font-bold text-red-600">{error}</p>
            </div>
          )}

          {/* Summary + Confirm */}
          {selectedDate && selectedSlot && !booked && (
            <div className="p-4 bg-sky-50 border border-sky-200 rounded-2xl flex items-center justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-sky-500 mb-1">Your Appointment</p>
                <p className="text-sm font-black text-slate-900">
                  {selectedDate.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                  {' · '}{fmt12(selectedSlot.time)}
                  {' · '}{apptType === 'online' ? 'Online' : 'In-Clinic'}
                </p>
                <p className="text-[11px] font-bold text-slate-500 mt-0.5">
                  Fee: {consultationFeeLabel || 'Not set'}
                </p>
              </div>
              <button
                onClick={handleConfirm}
                disabled={booking || consultationFee == null}
                className="flex items-center gap-2 px-6 py-3 bg-sky-600 text-white rounded-xl font-black text-sm shadow-lg shadow-sky-500/30 hover:bg-sky-700 active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed shrink-0"
              >
                {booking ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                {booking ? 'Booking...' : 'Confirm'}
              </button>
            </div>
          )}

          {/* Success */}
          {booked && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center gap-3 py-6"
            >
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center">
                <CheckCircle2 size={32} className="text-emerald-600" />
              </div>
              <p className="text-lg font-black text-slate-900">Appointment Requested!</p>
              <p className="text-sm font-medium text-slate-500 text-center">
                Your booking is pending confirmation from the doctor.
              </p>
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

const FindDoctors = ({ embedded = false }) => {
  const navigate = useNavigate();
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [bookingDoctor, setBookingDoctor] = useState(null);
  const [loadError, setLoadError] = useState('');

  const loadDoctors = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await publicApi.getAllDoctors();
      setDoctors(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      const offline = err.code === 'ERR_NETWORK' || String(err.message || '').includes('Network');
      setLoadError(
        offline
          ? 'Cannot reach the doctor directory. Start the doctor-portal server on port 5001, then tap Retry.'
          : msg || `Could not load doctors${err.response?.status ? ` (${err.response.status})` : ''}.`
      );
      setDoctors([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDoctors();
  }, [loadDoctors]);

  const filtered = doctors.filter((d) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const name = d.basicInfo?.name?.toLowerCase() || '';
    const spec = d.professionalInfo?.specialization?.toLowerCase() || '';
    const city = d.clinicInfo?.city?.toLowerCase() || '';
    return name.includes(q) || spec.includes(q) || city.includes(q);
  });

  const openChat = async (doctor) => {
    const userData = JSON.parse(localStorage.getItem('user') || '{}');
    const userId = userData.id || userData._id;
    if (!userId) return;
    try {
      const res = await doctorChatApi.initiateChat({ doctorId: doctor._id, userId });
      const chatId = res?.data?._id;
      if (chatId) navigate(`/messages/${chatId}`);
    } catch (err) {
      console.error('Chat initiate failed', err);
    }
  };

  const cardClass = embedded
    ? 'rounded-2xl border border-slate-200 bg-white p-4 shadow-sm'
    : 'rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm hover:shadow-md transition-shadow';

  return (
    <div className={embedded ? 'h-full' : 'min-h-full px-4 sm:px-8 py-8'}>
      {!embedded && (
        <header className="max-w-6xl mx-auto mb-8">
          <p className="text-[11px] text-slate-500 font-medium mb-1">
            <span className="text-slate-400">Patient</span>
            <span className="mx-1.5 text-slate-300">/</span>
            <span className="text-slate-800 font-semibold">Find a specialist</span>
          </p>
          <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600 mb-2">Book a specialist</p>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-50 tracking-tight">Find Doctors</h1>
          <p className="text-slate-500 text-sm mt-2 max-w-xl">
            Browse verified practitioners, filter by specialty, and book an online or clinic slot. Grey times are unavailable.
          </p>
        </header>
      )}

      <div className={embedded ? 'space-y-4' : 'max-w-6xl mx-auto space-y-6'}>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, specialty, or city…"
            className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 bg-white text-sm font-medium focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 outline-none"
          />
        </div>

        {loadError && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-sm font-semibold text-amber-900">{loadError}</p>
            <button
              type="button"
              onClick={() => loadDoctors()}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-white border border-amber-300 px-4 py-2 text-sm font-bold text-amber-900 hover:bg-amber-100 transition shrink-0"
            >
              <RefreshCw size={16} />
              Retry
            </button>
          </div>
        )}

        {loading ? (
          <motion.div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
            <Loader2 className="animate-spin" size={28} />
            <span className="text-sm font-bold">Loading doctors…</span>
          </motion.div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-sm font-medium">No doctors match your search.</div>
        ) : (
          <div className={embedded ? 'space-y-3 max-h-[60vh] overflow-y-auto pr-1' : 'grid grid-cols-1 md:grid-cols-2 gap-4'}>
            {filtered.map((doctor) => (
              <div key={doctor._id} className={cardClass}>
                <div className="flex gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-slate-100 border border-slate-200 overflow-hidden flex-shrink-0 flex items-center justify-center">
                    {doctor.basicInfo?.profileImage ? (
                      <img src={doctor.basicInfo.profileImage} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <User className="text-slate-300" size={24} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-black text-slate-900 truncate">Dr. {(doctor.basicInfo?.name || '').replace(/^Dr\.?\s+/i, '')}</h3>
                    <p className="text-xs font-bold text-emerald-600 uppercase tracking-wide mt-0.5">
                      {doctor.professionalInfo?.specialization || 'Ayurveda'}
                    </p>
                    {doctor.clinicInfo?.city && (
                      <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                        <MapPin size={12} /> {doctor.clinicInfo.city}
                      </p>
                    )}
                    {doctor.availability?.timings && (
                      <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                        <Clock size={12} /> {doctor.availability.timings}
                      </p>
                    )}
                    {formatDoctorFee(doctor) ? (
                      <p className="text-xs font-bold text-slate-800 mt-1.5 flex items-center gap-1">
                        <IndianRupee size={12} className="text-emerald-600" />
                        {formatDoctorFee(doctor)} consultation
                      </p>
                    ) : (
                      <p className="text-xs font-bold text-amber-700 mt-1.5">Fee not listed</p>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 mt-4">
                  <button
                    type="button"
                    onClick={() => setBookingDoctor(doctor)}
                    className="flex-1 min-w-[120px] flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-black hover:bg-emerald-700 transition"
                  >
                    <Calendar size={14} />
                    Book consultation
                  </button>
                  <button
                    type="button"
                    onClick={() => openChat(doctor)}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-50 transition"
                  >
                    <MessageSquare size={14} />
                    Message
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {bookingDoctor && (
          <BookingModal
            doctor={bookingDoctor}
            onClose={() => setBookingDoctor(null)}
            onBooked={loadDoctors}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default FindDoctors;
