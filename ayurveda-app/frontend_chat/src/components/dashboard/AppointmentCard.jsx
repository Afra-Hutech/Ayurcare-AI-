import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Calendar, Clock, MapPin, User, ArrowRight, Video, Stethoscope, ChevronRight, Activity, X, ExternalLink, Navigation, Loader2, Trash2, Eye, MessageSquare, Printer, Pill, CreditCard } from 'lucide-react';
import { patientApi } from '../../services/api';
import { downloadPrescriptionPDF } from '../../utils/prescriptionPdf';
import { canPatientJoinMeeting, getSessionLabel } from '../../utils/appointmentSession';
import { isLiveKitAppointment, liveKitJoinPath } from '../../utils/videoConsultation';
import PaymentModal from '../PaymentModal';

const AppointmentCard = ({ appointment, onDelete, onMessage, isListView = false }) => {
   const navigate = useNavigate();
   const [loading, setLoading] = useState(false);
   const [showSessionInfo, setShowSessionInfo] = useState(false);
   const [showPrescription, setShowPrescription] = useState(false);
   const [prescriptionLoading, setPrescriptionLoading] = useState(false);
   const [prescriptionData, setPrescriptionData] = useState(null);
   const [showPaymentModal, setShowPaymentModal] = useState(false);
   const [localPaymentStatus, setLocalPaymentStatus] = useState(appointment.paymentStatus || 'unpaid');
   const consultationCompleted = !!appointment.consultationCompleted;

   const normalizeStatus = (status) => String(status || '').toLowerCase().trim();
   const getDerivedStatus = () => {
      const status = normalizeStatus(appointment.status);
      if (status === 'cancelled' || status === 'canceled') return 'cancelled';
      if (status === 'finished' || status === 'completed' || consultationCompleted || appointment.sessionEnded) return 'finished';
      if (status === 'pending' || status === 'scheduled') return 'pending';
      if (status === 'confirmed') return 'confirmed';
      return status || 'pending';
   };

   const derivedStatus = getDerivedStatus();
   const isConfirmed = derivedStatus === 'confirmed';
   const isPending = derivedStatus === 'pending';
   const isCancelled = derivedStatus === 'cancelled';
   const isFinished = derivedStatus === 'finished';

   const formatTime = (date) => {
      if (!date) return null;
      return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
   };

   const stripDrPrefix = (n) => (n || '').trim().replace(/^Dr\.?\s+/i, '');
   const rawName = appointment.doctorId?.basicInfo?.name || appointment.doctorId?.name;
   const doctorName = appointment.doctor || (rawName ? `Dr. ${stripDrPrefix(rawName)}` : 'Practitioner');
   const specialty = appointment.specialty || appointment.doctorId?.professionalInfo?.specialization || 'Clinical Expert';
   const apptDate = appointment.date || (appointment.startTime ? new Date(appointment.startTime).toLocaleDateString() : appointment.createdAt ? new Date(appointment.createdAt).toLocaleDateString() : 'TBD');
   const apptTime = formatTime(appointment.startTime) || appointment.time || 'TBD';

   // Robust type detection based on model
   const type = (appointment.type || appointment.appointmentType || 'online').toLowerCase();
   const isOnline = type === 'online';
   const meetingStatus = String(appointment.meetingStatus || 'scheduled').toLowerCase();
   const canJoinLive = isOnline && canPatientJoinMeeting(appointment);
   const sessionLabel = isOnline ? getSessionLabel(appointment) : '';
   const sessionEnded = isOnline && (appointment.sessionEnded || meetingStatus === 'ended') && !canJoinLive;
   const displayType = isOnline ? 'Virtual Session' : (type === 'clinic' ? 'Clinical Visit' : 'Follow-up');

   const clinicInfo = appointment.doctorId?.clinicInfo || {};
   const fullAddress = [clinicInfo.address, clinicInfo.city, clinicInfo.state, clinicInfo.pincode].filter(Boolean).join(', ');
   const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(clinicInfo.clinicName + ' ' + fullAddress)}`;
   const meetingLink = appointment.meetingLink || '#';
   const useLiveKit = isLiveKitAppointment(appointment);
   const videoJoinTo = liveKitJoinPath(appointment);
   const openVideoSession = () => {
      if (useLiveKit) navigate(videoJoinTo);
      else if (meetingLink && meetingLink !== '#') window.open(meetingLink, '_blank', 'noopener,noreferrer');
   };

   const user = JSON.parse(localStorage.getItem('user') || '{}');

   const openPrescription = async () => {
      if (!appointment?._id) return;
      setPrescriptionLoading(true);
      try {
         const res = await patientApi.getPrescription(appointment._id);
         setPrescriptionData(res.data);
         setShowPrescription(true);
      } catch (err) {
         alert(err?.response?.data?.message || 'Prescription is not available yet.');
      } finally {
         setPrescriptionLoading(false);
      }
   };

   const downloadPrescription = async () => {
      if (!appointment?._id) return;
      setPrescriptionLoading(true);
      try {
         const res = await patientApi.getPrescription(appointment._id);
         const rx = res.data?.prescription;
         if (!rx) throw new Error('No prescription');
         downloadPrescriptionPDF({
            patientName: user.name,
            doctorName,
            consultedAt: res.data.consultedAt,
            notes: rx.notes,
            medicines: rx.medicines,
         });
      } catch (err) {
         alert(err?.response?.data?.message || err.message || 'Prescription is not available yet.');
      } finally {
         setPrescriptionLoading(false);
      }
   };

   if (isListView) {
      return (
         <div className="bg-white border border-slate-200 rounded-2xl p-6 hover:shadow-lg hover:border-slate-300 hover:shadow-emerald-500/5 transition-all duration-300 flex items-center justify-between gap-6 group relative overflow-hidden">
            {/* Gradient accent on hover */}
            <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-500/5 rounded-bl-full opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
            
            {/* Left section: Doctor info */}
            <div className="flex items-center gap-5 flex-1 min-w-0 relative z-10">
               <div className={`w-14 h-14 rounded-2xl ring-2 ring-white border border-slate-200 flex items-center justify-center flex-shrink-0 transition-all duration-300 group-hover:scale-110 overflow-hidden ${isConfirmed ? 'bg-emerald-50 text-emerald-600' : isPending ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-600'}`}>
                  {appointment.doctorId?.basicInfo?.profileImage ? (
                     <img src={appointment.doctorId.basicInfo.profileImage} alt="" className="w-full h-full object-cover" />
                  ) : (
                     <Activity size={22} strokeWidth={2.5} />
                  )}
               </div>
               
               <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-slate-900 text-sm leading-none mb-1">{doctorName}</h3>
                  <p className="text-xs font-medium text-slate-500 truncate">{specialty}</p>
               </div>
            </div>

            {/* Middle section: Date & Time */}
            <div className="flex items-center gap-6 flex-shrink-0 relative z-10">
               <div className="flex items-center gap-2 text-slate-600">
                  <div className="p-1.5 bg-slate-100 rounded-lg">
                     <Calendar size={14} strokeWidth={2.5} className="text-slate-600" />
                  </div>
                  <span className="text-xs font-bold text-slate-900">{apptDate}</span>
               </div>
               <div className="w-px h-6 bg-slate-200"></div>
               <div className="flex items-center gap-2 text-slate-600">
                  <div className="p-1.5 bg-slate-100 rounded-lg">
                     <Clock size={14} strokeWidth={2.5} className="text-slate-600" />
                  </div>
                  <span className="text-xs font-bold text-slate-900">{apptTime}</span>
               </div>
            </div>

            {/* Status badge */}
            <div className="flex-shrink-0 relative z-10">
               <span className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wide flex items-center gap-2 ${isConfirmed ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : isPending ? 'bg-amber-50 text-amber-600 border border-amber-200' : isCancelled ? 'bg-rose-50 text-rose-600 border border-rose-200' : 'bg-slate-50 text-slate-500 border border-slate-200'}`}>
                  <div className={`w-2 h-2 rounded-full ${isConfirmed ? 'bg-emerald-500 animate-pulse' : isPending ? 'bg-amber-500' : isCancelled ? 'bg-rose-500' : 'bg-slate-400'}`}></div>
                  {derivedStatus}
               </span>
               {consultationCompleted && (
                 <div className="mt-2 text-[10px] font-black uppercase tracking-wide text-emerald-600 text-center">
                   Consultation Completed
                 </div>
               )}
               {localPaymentStatus === 'paid' && (
                 <div className="mt-1 text-[10px] font-black uppercase tracking-wide text-emerald-600 text-center">Paid ✓</div>
               )}
               {localPaymentStatus === 'refund_pending' && (
                 <div className="mt-1 text-[10px] font-black uppercase tracking-wide text-amber-600 text-center">Refund Pending</div>
               )}
               {localPaymentStatus === 'refunded' && (
                 <div className="mt-1 text-[10px] font-black uppercase tracking-wide text-blue-600 text-center">Refunded</div>
               )}
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 flex-shrink-0 relative z-10">
               {isConfirmed && localPaymentStatus !== 'paid' && localPaymentStatus !== 'refunded' && (
                 <button
                   onClick={() => setShowPaymentModal(true)}
                   className="flex items-center gap-1.5 px-3 py-2 bg-[#28328c] text-white rounded-xl text-xs font-bold hover:bg-[#1f2770] transition-all"
                   title="Pay for consultation"
                 >
                   <CreditCard size={14} />
                   <span>Pay</span>
                 </button>
               )}
               <button
                  onClick={() => onMessage?.(appointment)}
                  className="p-2.5 bg-white border border-slate-200 text-slate-500 rounded-xl hover:bg-slate-50 hover:text-emerald-600 transition-all duration-300"
                  title="Message doctor"
               >
                  <MessageSquare size={16} strokeWidth={2.5} />
               </button>
               <button
                  onClick={async (e) => {
                     e.stopPropagation();
                     if (window.confirm('Cancel and hide this appointment?')) {
                        setLoading(true);
                        try {
                           await onDelete(appointment._id);
                        } finally {
                           setLoading(false);
                        }
                     }
                  }}
                  disabled={loading}
                  className="p-2.5 bg-white border border-slate-200 text-slate-400 rounded-xl hover:bg-red-50 hover:text-red-500 transition-all duration-300 disabled:opacity-60"
                  title="Cancel appointment"
               >
                  {loading ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} strokeWidth={2.5} />}
               </button>
               <button 
                  onClick={() => setShowSessionInfo(true)}
                  className="p-2.5 bg-slate-900 text-white rounded-xl hover:bg-emerald-600 transition-all duration-300 group/access shadow-md shadow-slate-900/20"
                  title="Access appointment"
               >
                  <ChevronRight size={16} strokeWidth={2.5} />
               </button>
               {consultationCompleted && (
                 <button
                    onClick={openPrescription}
                    disabled={prescriptionLoading}
                    className="p-2.5 bg-white border border-emerald-200 text-emerald-700 rounded-xl hover:bg-emerald-50 transition-all duration-300 disabled:opacity-60"
                    title="View prescription"
                 >
                    {prescriptionLoading ? <Loader2 size={16} className="animate-spin" /> : <Eye size={16} strokeWidth={2.5} />}
                 </button>
               )}
            </div>

            {showSessionInfo && (
               <div className="fixed inset-0 z-[120] bg-black/35 backdrop-blur-[1px] flex items-center justify-center p-4">
                  <div className="relative w-full max-w-3xl max-h-[88vh] bg-white rounded-2xl border border-slate-200 flex flex-col shadow-2xl p-8 overflow-y-auto">
                  <button onClick={() => setShowSessionInfo(false)} className="absolute top-4 right-4 p-2 hover:bg-slate-100 rounded-lg transition-all">
                     <X size={20} className="text-slate-400" />
                  </button>
                  <div className="space-y-8">
                     {/* Header */}
                     <div>
                        <div className="flex items-center gap-3 mb-4">
                           <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${isOnline ? 'bg-blue-100 text-blue-600' : 'bg-emerald-100 text-emerald-600'}`}>
                              {isOnline ? <Video size={24} strokeWidth={2.5} /> : <MapPin size={24} strokeWidth={2.5} />}
                           </div>
                           <div>
                              <p className="text-xs font-bold uppercase text-slate-500 tracking-wide">Appointment Details</p>
                              <h2 className="text-2xl font-bold text-slate-900">{isOnline ? 'Virtual Session' : 'Clinic Visit'}</h2>
                           </div>
                        </div>
                     </div>

                     {/* Doctor Info */}
                     <div className="bg-slate-50 rounded-xl p-5 border border-slate-200 flex items-center gap-4">
                        <div className="w-16 h-16 rounded-2xl bg-white border border-slate-200 overflow-hidden flex items-center justify-center">
                           {appointment.doctorId?.basicInfo?.profileImage ? (
                              <img src={appointment.doctorId.basicInfo.profileImage} alt="" className="w-full h-full object-cover" />
                           ) : (
                              <User size={32} className="text-slate-300" />
                           )}
                        </div>
                        <div className="flex-1">
                           <p className="text-xs font-bold uppercase text-slate-500 tracking-wide mb-1">Medical Professional</p>
                           <div className="space-y-0.5">
                              <h3 className="text-lg font-bold text-slate-900">{doctorName}</h3>
                              <p className="text-sm text-slate-600 font-medium">{specialty}</p>
                           </div>
                        </div>
                     </div>

                     {/* Appointment Date & Time */}
                     <div className="grid grid-cols-2 gap-4">
                        <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                           <div className="flex items-center gap-2 mb-2">
                              <Calendar size={16} className="text-slate-600" />
                              <p className="text-xs font-bold uppercase text-slate-500 tracking-wide">Date</p>
                           </div>
                           <p className="text-base font-bold text-slate-900">{apptDate}</p>
                        </div>
                        <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                           <div className="flex items-center gap-2 mb-2">
                              <Clock size={16} className="text-slate-600" />
                              <p className="text-xs font-bold uppercase text-slate-500 tracking-wide">Time</p>
                           </div>
                           <p className="text-base font-bold text-slate-900">{apptTime}</p>
                        </div>
                     </div>

                     {/* Status Badge */}
                     <div className="flex items-center gap-3 px-5 py-4 bg-slate-50 rounded-xl border border-slate-200">
                        <div className={`w-3 h-3 rounded-full ${isConfirmed ? 'bg-emerald-500 animate-pulse' : isPending ? 'bg-amber-500' : isCancelled ? 'bg-rose-500' : 'bg-slate-400'}`}></div>
                        <span className={`font-bold uppercase tracking-wide text-sm ${isConfirmed ? 'text-emerald-600' : isPending ? 'text-amber-600' : isCancelled ? 'text-rose-600' : 'text-slate-600'}`}>
                           {isConfirmed ? 'Confirmed - Ready to proceed' : isPending ? 'Pending - Awaiting confirmation' : isCancelled ? 'Cancelled' : isFinished ? 'Finished' : 'Scheduled'}
                        </span>
                     </div>

                     {isOnline ? (
                        /* Virtual Session Info */
                        <div className="space-y-4">
                           {canJoinLive ? (
                              <>
                                 <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-xl p-5">
                                    <p className="text-xs font-bold uppercase text-blue-600 dark:text-blue-300 tracking-wide mb-3">
                                      {useLiveKit ? 'In-app video room' : 'Meeting Link'}
                                    </p>
                                    {useLiveKit ? (
                                      <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                                        Join securely inside AyurCare — camera and microphone in your browser.
                                      </p>
                                    ) : (
                                      <a href={meetingLink} target="_blank" rel="noopener noreferrer" className="text-sm font-bold text-blue-600 hover:text-blue-700 truncate break-all flex items-center gap-2">
                                         {meetingLink}
                                         <ExternalLink size={14} className="flex-shrink-0" />
                                      </a>
                                    )}
                                 </div>
                                 {useLiveKit ? (
                                   <Link to={videoJoinTo} className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20 active:scale-95">
                                      <Video size={18} strokeWidth={2.5} />
                                      <span>Join Video Session</span>
                                   </Link>
                                 ) : (
                                   <a href={meetingLink} target="_blank" rel="noopener noreferrer" className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20 active:scale-95">
                                      <Video size={18} strokeWidth={2.5} />
                                      <span>Join Video Session</span>
                                   </a>
                                 )}
                              </>
                           ) : sessionEnded ? (
                              <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 text-center">
                                 <p className="text-sm font-bold text-slate-600">{sessionLabel || 'Session ended'}</p>
                                 {consultationCompleted && (
                                   <p className="text-xs text-emerald-600 font-semibold mt-2">Your prescription is ready to view.</p>
                                 )}
                              </div>
                           ) : (
                              <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-center">
                                 <p className="text-sm font-bold text-amber-600">Waiting for doctor to start the consultation.</p>
                              </div>
                           )}
                        </div>
                     ) : (
                        /* Clinic Visit Info */
                        <div className="space-y-4">
                           <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5">
                              <p className="text-xs font-bold uppercase text-emerald-600 tracking-wide mb-3">Clinic Information</p>
                              <div className="space-y-3">
                                 <div>
                                    <p className="text-xs font-bold uppercase text-emerald-600/70 tracking-wide mb-1">Clinic Name</p>
                                    <p className="text-base font-bold text-slate-900">{clinicInfo.clinicName || 'The Wellness Center'}</p>
                                 </div>
                                 <div>
                                    <p className="text-xs font-bold uppercase text-emerald-600/70 tracking-wide mb-1">Address</p>
                                    <p className="text-sm font-medium text-slate-600">{clinicInfo.address || 'Address not available'}, {clinicInfo.city || ''}</p>
                                 </div>
                              </div>
                           </div>
                           <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="w-full py-4 bg-emerald-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20 active:scale-95">
                              <Navigation size={18} strokeWidth={2.5} />
                              <span>Open in Maps</span>
                           </a>
                        </div>
                     )}

                  <button
                     onClick={() => onMessage?.(appointment)}
                     className="w-full py-4 bg-slate-900 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-black transition-all shadow-lg shadow-slate-900/20 active:scale-95"
                  >
                     <MessageSquare size={18} strokeWidth={2.5} />
                     <span>Open Doctor Chat</span>
                  </button>

                  {isOnline && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 text-center px-2">
                      {canJoinLive
                        ? useLiveKit
                          ? 'When your doctor starts the call, we also send the join link to your registered email and mobile (if configured on the server).'
                          : 'Join link is available here when the doctor starts the session; a copy may be sent to your registered email or phone.'
                        : 'After your doctor confirms the visit, the join link is sent to your registered email and phone when available — and always appears here under Appointments → Join Video Session.'}
                    </p>
                  )}

                  {consultationCompleted && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                       onClick={openPrescription}
                       disabled={prescriptionLoading}
                       className="w-full py-4 bg-emerald-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20 active:scale-95 disabled:opacity-50"
                    >
                       <Eye size={18} strokeWidth={2.5} />
                       <span>View Prescription</span>
                    </button>
                    <button
                       onClick={downloadPrescription}
                       disabled={prescriptionLoading}
                       className="w-full py-4 bg-[#28328c] text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-[#1f2770] transition-all disabled:opacity-50"
                    >
                       <Printer size={18} strokeWidth={2.5} />
                       <span>Download PDF</span>
                    </button>
                    <Link to="/prescriptions" className="sm:col-span-2 text-center text-xs font-bold text-emerald-700 hover:underline">
                      All prescriptions →
                    </Link>
                    </div>
                  )}

                  {/* Footer Note */}
                  <p className="text-xs font-medium text-slate-500 text-center">Click the X button or outside to close</p>
                  </div>
                  </div>
               </div>
            )}

            {showPrescription && prescriptionData?.prescription && (
               <div className="fixed inset-0 z-[130] bg-black/35 backdrop-blur-[1px] flex items-center justify-center p-4">
                 <div className="relative w-full max-w-2xl max-h-[88vh] bg-white rounded-2xl border border-slate-200 p-6 overflow-y-auto">
                   <button onClick={() => setShowPrescription(false)} className="absolute top-4 right-4 p-2 hover:bg-slate-100 rounded-lg transition-all">
                      <X size={18} className="text-slate-400" />
                   </button>
                   <div className="space-y-4">
                      <div>
                         <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Prescription</p>
                         <h3 className="text-xl font-black text-slate-900 mt-1">Consultation Notes</h3>
                         <p className="text-xs text-slate-500 mt-1">
                            Consulted on: {prescriptionData.consultedAt ? new Date(prescriptionData.consultedAt).toLocaleString() : 'N/A'}
                         </p>
                      </div>
                      <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-700 whitespace-pre-wrap">
                         {prescriptionData.prescription.notes || 'No additional notes.'}
                      </div>
                      <div className="space-y-2">
                         <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Medicines</p>
                         {Array.isArray(prescriptionData.prescription.medicines) && prescriptionData.prescription.medicines.length > 0 ? (
                            prescriptionData.prescription.medicines.map((med, idx) => (
                               <div key={`${med.name}-${idx}`} className="p-3 rounded-xl border border-slate-200">
                                  <p className="text-sm font-bold text-slate-900">{med.name || 'Medicine'}</p>
                                  <p className="text-xs text-slate-600 mt-1">{med.details || 'No details provided.'}</p>
                               </div>
                            ))
                         ) : (
                            <div className="p-3 rounded-xl border border-slate-200 text-xs text-slate-500">No medicines listed.</div>
                         )}
                      </div>
                   </div>
                 </div>
               </div>
            )}
            {showPaymentModal && (
              <PaymentModal
                appointment={appointment}
                doctorName={doctorName}
                onClose={() => setShowPaymentModal(false)}
                onSuccess={() => {
                  setLocalPaymentStatus('paid');
                  setShowPaymentModal(false);
                }}
              />
            )}
         </div>
      );
   }

   // Grid view — compact card matching doctor portal style
   return (
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-slate-300 transition-all duration-300 relative overflow-hidden group"
         onMouseLeave={() => setShowSessionInfo(false)}
      >
         <button
            onClick={async (e) => {
               e.stopPropagation();
               if (window.confirm('Hide this appointment from your schedule?')) {
                  setLoading(true);
                  try {
                     await onDelete(appointment._id);
                  } finally {
                     setLoading(false);
                  }
               }
            }}
            disabled={loading}
            className="absolute top-3 right-3 w-7 h-7 bg-white border border-slate-200 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-500 hover:border-red-100 hover:bg-red-50 transition-all z-20 shadow-sm opacity-0 group-hover:opacity-100 disabled:opacity-50"
         >
            {loading ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
         </button>

         <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden flex-shrink-0 flex items-center justify-center">
               {appointment.doctorId?.basicInfo?.profileImage ? (
                  <img src={appointment.doctorId.basicInfo.profileImage} alt="" className="w-full h-full object-cover" />
               ) : (
                  <Activity size={22} className={`${isConfirmed ? 'text-emerald-600' : isPending ? 'text-amber-600' : 'text-slate-400'}`} strokeWidth={2} />
               )}
            </div>
            <div className="flex-1 min-w-0">
               <h3 className="font-bold text-slate-900 text-sm leading-tight truncate">{doctorName}</h3>
               <p className="text-xs text-slate-500 truncate mt-0.5">{specialty}</p>
            </div>
            <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide flex-shrink-0 ${isConfirmed ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : isPending ? 'bg-amber-50 text-amber-600 border border-amber-200' : isCancelled ? 'bg-rose-50 text-rose-600 border border-rose-200' : 'bg-slate-50 text-slate-500 border border-slate-200'}`}>
               {derivedStatus}
            </span>
         </div>

         <div className="flex items-center gap-4 mb-4 pb-4 border-b border-slate-100">
            <div className="flex items-center gap-1.5 text-xs text-slate-600">
               <Calendar size={13} strokeWidth={2.5} className="text-slate-400" />
               <span className="font-semibold">{apptDate}</span>
            </div>
            <div className="w-px h-4 bg-slate-200"></div>
            <div className="flex items-center gap-1.5 text-xs text-slate-600">
               <Clock size={13} strokeWidth={2.5} className="text-slate-400" />
               <span className="font-semibold">{apptTime}</span>
            </div>
            <div className="flex items-center gap-1 ml-auto">
               {isOnline ? <Video size={13} className="text-emerald-600" /> : <MapPin size={13} className="text-emerald-600" />}
               <span className="text-xs font-medium text-slate-500">{displayType}</span>
            </div>
         </div>

         <div className="grid grid-cols-2 gap-2">
            <button
               onClick={() => onMessage?.(appointment)}
               className="flex items-center justify-center gap-1.5 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50 active:scale-95 transition-all"
            >
               <MessageSquare size={14} strokeWidth={2.5} />
               <span>Chat</span>
            </button>
            <button
               onClick={() => setShowSessionInfo(true)}
               className="flex items-center justify-center gap-1.5 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-black active:scale-95 transition-all"
            >
               <Eye size={14} strokeWidth={2.5} />
               <span>Access</span>
            </button>
         </div>
         {consultationCompleted && (
           <div className="mt-2 text-[10px] font-black uppercase tracking-wide text-emerald-600 text-center">
             Consultation Completed
           </div>
         )}
         {isConfirmed && localPaymentStatus !== 'paid' && localPaymentStatus !== 'refunded' && (
           <button
             onClick={() => setShowPaymentModal(true)}
             className="w-full mt-2 flex items-center justify-center gap-1.5 py-2 bg-[#28328c] text-white rounded-xl text-xs font-bold hover:bg-[#1f2770] active:scale-95 transition-all"
           >
             <CreditCard size={14} />
             <span>Pay Now</span>
           </button>
         )}
         {localPaymentStatus === 'paid' && (
           <div className="mt-2 text-[10px] font-black uppercase tracking-wide text-emerald-600 text-center">Paid ✓</div>
         )}
         {localPaymentStatus === 'refund_pending' && (
           <div className="mt-2 text-[10px] font-black uppercase tracking-wide text-amber-600 text-center">Refund Pending</div>
         )}
         {localPaymentStatus === 'refunded' && (
           <div className="mt-2 text-[10px] font-black uppercase tracking-wide text-blue-600 text-center">Refunded</div>
         )}

         {/* Session Access Overlay */}
         {showSessionInfo && (
            <div className="fixed inset-0 z-[120] bg-black/35 backdrop-blur-[1px] p-4 flex items-center justify-center">
               <div className="relative w-full max-w-2xl max-h-[88vh] bg-white p-8 rounded-[40px] border border-slate-200 flex flex-col justify-center animate-in slide-in-from-bottom-full duration-500 shadow-2xl overflow-y-auto">
               <button onClick={() => setShowSessionInfo(false)} className="absolute top-4 right-4 p-2 hover:bg-slate-100 rounded-lg transition-all">
                  <X size={20} className="text-slate-400" />
               </button>
               
               <div className="space-y-6">
                  <div className="space-y-2">
                     <div className="flex items-center justify-center gap-2 text-slate-600 font-bold text-xs uppercase tracking-[2px]">
                        {isOnline ? <Video size={16} className="text-emerald-600" /> : <MapPin size={16} className="text-emerald-600" />}
                        <span>{isOnline ? 'Virtual Hub' : 'Clinic Info'}</span>
                     </div>
                     <h2 className="text-2xl font-bold text-slate-900 tracking-tight text-center">
                        {isOnline ? 'Join Session' : 'Clinic Details'}
                     </h2>
                  </div>

                  {isOnline ? (
                     <div className="space-y-4">
                        {canJoinLive ? (
                           useLiveKit ? (
                              <p className="w-full p-4 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 text-center">
                                 Secure in-app video (LiveKit)
                              </p>
                           ) : (
                              <a
                                 href={meetingLink}
                                 target="_blank"
                                 rel="noopener noreferrer"
                                 className="w-full flex items-center justify-between p-4 bg-slate-100 border border-slate-200 rounded-lg hover:border-emerald-400 transition-all"
                              >
                                 <span className="text-xs font-bold text-slate-600 truncate max-w-[180px]">{meetingLink}</span>
                                 <ExternalLink size={16} className="text-emerald-600 flex-shrink-0" />
                              </a>
                           )
                        ) : sessionEnded ? (
                           <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
                              <p className="text-xs font-bold uppercase tracking-wide text-slate-600 text-center">{sessionLabel || 'Session ended'}</p>
                           </div>
                        ) : (
                           <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                              <p className="text-xs font-bold uppercase tracking-wide text-amber-600 text-center">Doctor has not started this session yet</p>
                           </div>
                        )}
                        <button
                           disabled={!canJoinLive}
                           onClick={openVideoSession}
                           className={`w-full py-3 rounded-lg font-bold tracking-tight text-sm flex items-center justify-center gap-2 transition-all ${canJoinLive
                              ? 'bg-slate-900 text-white hover:bg-black shadow-lg shadow-slate-900/20'
                              : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                           }`}
                        >
                           <span>Join Now</span>
                           <ArrowRight size={18} />
                        </button>
                     </div>
                  ) : (
                     <div className="space-y-4">
                        <div className="p-4 bg-slate-100 border border-slate-200 rounded-lg">
                           <h4 className="font-bold text-slate-900 text-sm mb-2">{clinicInfo.clinicName || 'The Wellness Center'}</h4>
                           <p className="text-xs text-slate-600 font-medium">{clinicInfo.address}, {clinicInfo.city}</p>
                        </div>
                        <a
                           href={mapsUrl}
                           target="_blank"
                           rel="noopener noreferrer"
                           className="w-full py-3 bg-slate-900 text-white rounded-lg font-bold tracking-tight text-sm flex items-center justify-center gap-2 hover:bg-black active:scale-95 transition-all shadow-lg shadow-slate-900/20"
                        >
                           <span>Open Maps</span>
                           <MapPin size={18} />
                        </a>
                     </div>
                  )}

               <button
                  onClick={() => onMessage?.(appointment)}
                  className="w-full py-3 bg-slate-900 text-white rounded-lg font-bold tracking-tight text-sm flex items-center justify-center gap-2 hover:bg-black active:scale-95 transition-all shadow-lg shadow-slate-900/20"
               >
                  <MessageSquare size={16} strokeWidth={2.5} />
                  <span>Open Doctor Chat</span>
               </button>

               {consultationCompleted && (
                 <div className="grid grid-cols-2 gap-2">
                 <button
                    onClick={openPrescription}
                    disabled={prescriptionLoading}
                    className="w-full py-3 bg-emerald-600 text-white rounded-lg font-bold tracking-tight text-sm flex items-center justify-center gap-2 hover:bg-emerald-700 active:scale-95 transition-all shadow-lg shadow-emerald-600/20 disabled:opacity-50"
                 >
                    <Eye size={16} strokeWidth={2.5} />
                    <span>View</span>
                  </button>
                 <button
                    onClick={downloadPrescription}
                    disabled={prescriptionLoading}
                    className="w-full py-3 bg-[#28328c] text-white rounded-lg font-bold tracking-tight text-sm flex items-center justify-center gap-2 hover:bg-[#1f2770] active:scale-95 transition-all disabled:opacity-50"
                 >
                    <Printer size={16} strokeWidth={2.5} />
                    <span>PDF</span>
                  </button>
                 </div>
               )}
             </div>
             </div>
           </div>
         )}

         {showPrescription && prescriptionData?.prescription && (
            <div className="fixed inset-0 z-[130] bg-black/35 backdrop-blur-[1px] flex items-center justify-center p-4">
              <div className="relative w-full max-w-2xl max-h-[88vh] bg-white rounded-[40px] border border-slate-200 p-6 overflow-y-auto">
               <button onClick={() => setShowPrescription(false)} className="absolute top-4 right-4 p-2 hover:bg-slate-100 rounded-lg transition-all">
                  <X size={18} className="text-slate-400" />
               </button>
               <div className="space-y-4">
                  <div>
                     <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Prescription</p>
                     <h3 className="text-xl font-black text-slate-900 mt-1">Consultation Notes</h3>
                     <p className="text-xs text-slate-500 mt-1">
                        Consulted on: {prescriptionData.consultedAt ? new Date(prescriptionData.consultedAt).toLocaleString() : 'N/A'}
                     </p>
                  </div>
                  <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-700 whitespace-pre-wrap">
                     {prescriptionData.prescription.notes || 'No additional notes.'}
                  </div>
                  <div className="space-y-2">
                     <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Medicines</p>
                     {Array.isArray(prescriptionData.prescription.medicines) && prescriptionData.prescription.medicines.length > 0 ? (
                        prescriptionData.prescription.medicines.map((med, idx) => (
                           <div key={`${med.name}-${idx}`} className="p-3 rounded-xl border border-slate-200">
                              <p className="text-sm font-bold text-slate-900">{med.name || 'Medicine'}</p>
                              <p className="text-xs text-slate-600 mt-1">{med.details || 'No details provided.'}</p>
                           </div>
                        ))
                     ) : (
                        <div className="p-3 rounded-xl border border-slate-200 text-xs text-slate-500">No medicines listed.</div>
                     )}
                  </div>
               </div>
              </div>
            </div>
         )}
         {showPaymentModal && (
           <PaymentModal
             appointment={appointment}
             doctorName={doctorName}
             onClose={() => setShowPaymentModal(false)}
             onSuccess={() => {
               setLocalPaymentStatus('paid');
               setShowPaymentModal(false);
             }}
           />
         )}
      </div>
   );
};

export default AppointmentCard;
