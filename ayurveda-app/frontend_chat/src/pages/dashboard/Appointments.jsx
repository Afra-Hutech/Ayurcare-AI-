import React, { useState, useEffect } from 'react';
import AppointmentCard from '../../components/dashboard/AppointmentCard';
import { Calendar as CalendarIcon, LayoutGrid, List, Activity, Video, MapPin, X, ExternalLink, Navigation, ArrowRight, ChevronRight, Trash2, PlusCircle, Loader2 } from 'lucide-react';
import { patientApi, doctorChatApi } from '../../services/api';
import { Link, useNavigate } from 'react-router-dom';
import { canPatientJoinMeeting, getSessionLabel } from '../../utils/appointmentSession';

const Appointments = () => {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('list');
  const [statusFilter, setStatusFilter] = useState('confirmed');
  const [selectedAppt, setSelectedAppt] = useState(null);
  const navigate = useNavigate();

  const formatTime = (date) => {
    if (!date) return null;
    return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const normalizeStatus = (status) => String(status || '').toLowerCase().trim();

  const getStatusBucket = (appt) => {
    const status = normalizeStatus(appt?.status);
    if (status === 'cancelled' || status === 'canceled') return 'cancelled';
    if (status === 'finished' || status === 'completed' || appt?.consultationCompleted || appt?.sessionEnded) return 'finished';
    if (status === 'pending' || status === 'scheduled') return 'pending';
    if (status === 'confirmed') return 'confirmed';
    return status || 'pending';
  };

  const filteredAppointments = appointments
    .filter((appt) => getStatusBucket(appt) === statusFilter)
    .sort((a, b) => {
      const aStart = a.startTime ? new Date(a.startTime) : new Date(a.createdAt || 0);
      const bStart = b.startTime ? new Date(b.startTime) : new Date(b.createdAt || 0);

      if (statusFilter !== 'confirmed') return bStart - aStart;
      const aUpcoming = aStart >= new Date() ? 1 : 0;
      const bUpcoming = bStart >= new Date() ? 1 : 0;
      if (aUpcoming !== bUpcoming) return bUpcoming - aUpcoming;
      return aStart - bStart;
    });

  useEffect(() => {
    fetchAppointments();
  }, []);

  const fetchAppointments = async () => {
    setLoading(true);
    try {
      const res = await patientApi.getAppointments();
      setAppointments(res.data);
    } catch (err) {
      console.error('Failed to fetch appointments:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAppointment = async (id) => {
    console.log('🗑 Attempting to hide appointment:', id);
    try {
      const res = await patientApi.hideAppointment(id);
      console.log('✅ Backend hide successful:', res.data);
      setAppointments(prev => {
        const filtered = prev.filter(appt => {
          const apptId = appt._id?.toString() || appt.id?.toString();
          return apptId !== id.toString();
        });
        console.log(`📊 Filtered list from ${prev.length} to ${filtered.length} items`);
        return filtered;
      });
    } catch (err) {
      console.error('❌ Failed to hide appointment:', err);
    }
  };

  const handleMessageDoctor = async (appointment) => {
    const doctorId = appointment?.doctorId?._id || appointment?.doctorId;
    if (!doctorId) {
      console.error('No doctor linked to this appointment');
      return;
    }
    const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
    const userId = storedUser.id || storedUser._id;
    try {
      const res = await doctorChatApi.initiateChat({ doctorId, userId });
      const chatId = res?.data?._id;
      if (!chatId) throw new Error('Missing chat id');
      navigate(`/messages/${chatId}`);
    } catch (err) {
      const msg = err?.response?.data?.message || err.message || 'Could not open chat';
      console.error('Failed to open doctor chat:', err);
      alert(msg);
    }
  };

  return (
    <div className="h-full page-scroll">
      <div className="page-content max-w-[1400px] space-y-5 pb-8">
        <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-4 border-b border-slate-200">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2 text-emerald-600 font-bold uppercase text-[10px] tracking-[2px]">
              <CalendarIcon size={14} strokeWidth={2.5} />
              <span>Your Medical Timeline</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-50 tracking-tight">Appointments</h1>
            <p className="text-slate-500 dark:text-slate-400 font-medium text-sm leading-snug max-w-2xl">Manage and access all your scheduled health sessions in one place.</p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto justify-end">
            <div className="overflow-x-auto -mx-1 px-1 pb-1 sm:pb-0">
            <div className="flex bg-slate-100 p-1.5 rounded-xl border border-slate-200 min-w-max">
              {['confirmed', 'pending', 'cancelled', 'finished'].map((f) => (
                <button
                  key={f}
                  onClick={() => setStatusFilter(f)}
                  className={`px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${
                    statusFilter === f
                      ? 'bg-white text-emerald-700 shadow-sm border border-slate-200'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  {f}
                  <span className={`ml-2 px-2 py-0.5 rounded-md text-[10px] ${statusFilter === f ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>
                    {appointments.filter((a) => getStatusBucket(a) === f).length}
                  </span>
                </button>
              ))}
            </div>
            </div>
            <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 border border-slate-200 self-center sm:self-auto">
              <button 
                onClick={() => setView('grid')}
                className={`p-2 rounded-md transition-all duration-300 ${view === 'grid' ? 'bg-white text-slate-900 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-900'}`}
                title="Grid view"
              >
                <LayoutGrid size={18} strokeWidth={2.5} />
              </button>
              <button 
                onClick={() => setView('list')}
                className={`p-2 rounded-md transition-all duration-300 ${view === 'list' ? 'bg-white text-slate-900 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-900'}`}
                title="List view"
              >
                <List size={18} strokeWidth={2.5} />
              </button>
            </div>
            <Link to="/find-doctors" className="flex items-center justify-center gap-2 px-5 py-2 bg-emerald-600 text-white rounded-xl font-bold shadow-sm hover:bg-emerald-700 active:scale-95 transition-all text-xs tracking-tight">
              <PlusCircle size={16} strokeWidth={2.5} />
              <span>Book Now</span>
            </Link>
          </div>
        </header>

        {loading ? (
          <div className="flex flex-col items-center justify-center min-h-[300px] space-y-6">
             <div className="relative">
                <div className="w-16 h-16 border-4 border-emerald-500/10 border-t-emerald-500 rounded-full animate-spin"></div>
                <Activity size={24} className="absolute inset-0 m-auto text-emerald-500 animate-pulse" />
             </div>
             <p className="text-xs font-bold tracking-tight text-slate-400">Loading appointments...</p>
          </div>
        ) : appointments.length === 0 ? (
          <div className="py-16 sm:py-20 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl flex flex-col items-center justify-center text-center space-y-4 bg-slate-50 dark:bg-slate-900/50">
             <div className="w-14 h-14 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-full flex items-center justify-center text-slate-300 dark:text-slate-500 shadow-sm">
                <CalendarIcon size={28} strokeWidth={2.5} />
             </div>
             <div className="space-y-1">
               <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 tracking-tight">No Appointments Scheduled</h3>
               <p className="text-slate-500 dark:text-slate-400 font-medium text-sm">Begin by booking your first health session.</p>
             </div>
             <Link to="/find-doctors" className="px-6 py-2 bg-slate-900 dark:bg-white dark:text-slate-900 text-white rounded-xl font-bold text-sm hover:bg-black active:scale-95 transition-all">Find a Doctor</Link>
          </div>
        ) : filteredAppointments.length === 0 ? (
          <div className="py-12 sm:py-16 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl flex flex-col items-center justify-center text-center space-y-3 bg-slate-50 dark:bg-slate-900/50">
            <div className="w-12 h-12 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-full flex items-center justify-center text-slate-300 dark:text-slate-500 shadow-sm">
              <CalendarIcon size={22} strokeWidth={2.5} />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 tracking-tight">No {statusFilter} appointments</h3>
            <p className="text-slate-500 dark:text-slate-400 font-medium text-sm">Try another filter or book a new consultation.</p>
          </div>
        ) : view === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
             {filteredAppointments.map(appt => (
               <AppointmentCard 
                 key={appt._id} 
                 appointment={appt} 
                 onDelete={handleDeleteAppointment}
                 onMessage={handleMessageDoctor}
                 isListView={false}
               />
             ))}
          </div>
        ) : (
          <div className="space-y-4">
             {filteredAppointments.map(appt => (
               <AppointmentCard 
                 key={appt._id} 
                 appointment={appt} 
                 onDelete={handleDeleteAppointment}
                 onMessage={handleMessageDoctor}
                 isListView={true}
               />
             ))}
          </div>
        )}

        {/* Shared Session Access Modal */}
      {selectedAppt && (() => {
        const type = (selectedAppt.type || selectedAppt.appointmentType || 'online').toLowerCase();
        const isOnline = type === 'online';
        const clinicInfo = selectedAppt.doctorId?.clinicInfo || {};
        const fullAddress = [clinicInfo.address, clinicInfo.city, clinicInfo.state, clinicInfo.pincode].filter(Boolean).join(', ');
        const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(clinicInfo.clinicName + ' ' + fullAddress)}`;
        const meetingLink = selectedAppt.meetingLink || '#';
        const canJoin = canPatientJoinMeeting(selectedAppt);
        const sessionLabel = getSessionLabel(selectedAppt);

        return (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px] animate-in fade-in duration-300">
            <div
              className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl p-5 relative shadow-2xl animate-in zoom-in-95 slide-in-from-bottom-10 duration-300 border border-slate-200 dark:border-slate-700"
              onMouseLeave={() => setSelectedAppt(null)}
            >
               <div className="space-y-4">
                  <div className="space-y-1">
                     <div className="flex items-center gap-2 text-slate-500 font-bold text-xs tracking-tight">
                        {isOnline ? <Video size={14} className="text-emerald-500" /> : <MapPin size={14} className="text-emerald-500" />}
                        <span>{isOnline ? 'Virtual Hub' : 'Physical Clinic'}</span>
                     </div>
                     <h2 className="text-xl font-bold text-slate-900 dark:text-slate-50 tracking-tight leading-tight">
                        {isOnline ? 'Access' : 'Visit'} <span className="text-emerald-600">{isOnline ? 'Session' : 'Hospital'}</span>
                     </h2>
                  </div>

                  {isOnline ? (
                     <div className="space-y-3">
                        <div className="p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl space-y-3">
                           <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl flex items-center justify-center text-emerald-500 shadow-sm">
                                 <Video size={18} strokeWidth={2.5} />
                              </div>
                              <div>
                                 <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm tracking-tight">Video consultation</h4>
                                 <p className="text-xs font-medium text-slate-400">Secured Clinical Line</p>
                              </div>
                           </div>

                           {canJoin ? (
                             <a
                               href={meetingLink}
                               target="_blank"
                               rel="noopener noreferrer"
                               className="w-full flex items-center justify-between p-3 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl hover:border-emerald-400 transition-all group/link"
                             >
                                <span className="text-[11px] font-bold text-slate-400 truncate max-w-[200px]">{meetingLink}</span>
                                <ExternalLink size={14} className="text-emerald-500 group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5 transition-transform flex-shrink-0" />
                             </a>
                           ) : (
                             <div className="p-3 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl">
                                <p className="text-xs font-bold tracking-tight text-slate-600 dark:text-slate-300 text-center">{sessionLabel || 'Session not available'}</p>
                             </div>
                           )}
                        </div>

                        <button
                          disabled={!canJoin}
                          onClick={() => window.open(meetingLink, '_blank')}
                          className={`w-full py-2.5 rounded-xl font-bold tracking-tight text-sm flex items-center justify-center gap-2 transition-all ${
                            canJoin
                              ? 'bg-slate-900 text-white hover:bg-slate-800 active:scale-95'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                          }`}
                        >
                           <span>{canJoin ? 'Join Consultation' : 'Session closed'}</span>
                           {canJoin && <ArrowRight size={16} strokeWidth={2.5} />}
                        </button>
                     </div>
                  ) : (
                     <div className="space-y-3">
                        <div className="p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl space-y-3">
                           <div className="space-y-3">
                              <div className="flex items-center gap-3">
                                 <div className="w-10 h-10 bg-emerald-500 text-white rounded-xl flex items-center justify-center shadow-sm">
                                    <Navigation size={18} strokeWidth={2.5} />
                                 </div>
                                 <div>
                                    <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm tracking-tight">{clinicInfo.clinicName || 'The Wellness Center'}</h4>
                                    <p className="text-xs font-bold tracking-tight text-emerald-600">Physical Assessment Hub</p>
                                 </div>
                              </div>

                              <div className="p-3 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl space-y-1">
                                 <p className="text-sm font-bold text-slate-900 dark:text-slate-100 leading-tight">{clinicInfo.address}</p>
                                 <p className="text-xs font-medium text-slate-400">{clinicInfo.city}, {clinicInfo.state} {clinicInfo.pincode}</p>
                              </div>
                           </div>
                        </div>

                        <a
                          href={mapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full py-2.5 bg-slate-900 text-white rounded-xl font-bold tracking-tight text-sm flex items-center justify-center gap-2 hover:bg-slate-800 active:scale-95 transition-all"
                        >
                           <span>View on Google Maps</span>
                           <MapPin size={16} strokeWidth={2.5} />
                        </a>
                     </div>
                  )}

                  <p className="text-center text-[11px] font-medium text-slate-400">
                     Move cursor away to close
                  </p>
               </div>
            </div>
          </div>
        );
      })()}
      </div>
    </div>
  );
};

export default Appointments;
