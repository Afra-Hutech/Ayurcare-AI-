import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { authService, doctorService } from '../../services/api';
import Sidebar from '../../components/ui/Sidebar';
import Navbar from '../../components/ui/Navbar';
import FormInput from '../../components/ui/FormInput';
import {
  CheckCircle,
  Loader2,
  User as UserIcon,
  Stethoscope,
  Building2,
  Clock,
  Save,
  Activity,
  Heart,
  ChevronRight,
  ShieldCheck,
  Check,
  Video,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const treatmentOptions = [
  "General Consultation",
  "Cardiology (Heart)",
  "Dermatology (Skin)",
  "Pediatrics (Children)",
  "Orthopedics (Bones)",
  "Neurology (Brain/Nerves)",
  "Gastroenterology (Stomach)",
  "Ophthalmology (Eyes)",
  "ENT (Ear, Nose, Throat)",
  "Psychiatry (Mental Health)",
  "Dentistry",
  "Homeopathy",
  "Ayurveda Consultation",
  "Physical Therapy",
  "Oncology (Cancer)",
  "Urology",
  "Endocrinology (Hormones)",
  "Pulmonology (Lungs)",
  "Diet & Nutrition",
  "Yoga Therapy"
];

const Profile = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [user, setUser] = useState(authService.getCurrentUser());
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    basicInfo: {
      name: '',
      age: '',
      gender: 'Male',
      phone: '',
      email: '',
      profileImage: '',
    },
    professionalInfo: {
      qualification: '',
      specialization: '',
      experience: '',
      treatments: [],
    },
    clinicInfo: {
      clinicName: '',
      address: '',
      city: '',
      state: '',
      pincode: '',
    },
    availability: {
      days: [],
      startTime: '09:00',
      endTime: '17:00',
      fees: '',
      languages: '',
    },
    location: { type: 'Point', coordinates: [77.5946, 12.9716]},
  });

  const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  useEffect(() => {
    if (!user) {
      navigate('/login');
    } else {
      fetchProfile();
    }
  }, [user, navigate]);

  const fetchProfile = async () => {
    setLoading(true);
    const data = await doctorService.getProfile();
    if (data) {
      // Merge data with initial state to ensure structure
      setFormData({
        basicInfo: data.basicInfo || formData.basicInfo,
        professionalInfo: {
          ...formData.professionalInfo,
          ...data.professionalInfo,
          treatments: data.professionalInfo?.treatments || [],
        },
        clinicInfo: data.clinicInfo || formData.clinicInfo,
        availability: {
          ...formData.availability,
          ...data.availability,
          days: data.availability?.days || [],
        },
        location: data.location || formData.location,
      });
    } else {
      // Set email from user if no profile yet
      setFormData(prev => ({
        ...prev,
        basicInfo: { ...prev.basicInfo, email: user.email }
      }));
    }
    setLoading(false);
  };

  const handleInputChange = (section, field, value) => {
    setFormData(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value
      }
    }));
  };

  const toggleTreatment = (treatment) => {
    setFormData(prev => {
      const currentTreatments = prev.professionalInfo.treatments || [];
      const newTreatments = currentTreatments.includes(treatment)
        ? currentTreatments.filter(t => t !== treatment)
        : [...currentTreatments, treatment];

      return {
        ...prev,
        professionalInfo: {
          ...prev.professionalInfo,
          treatments: newTreatments
        }
      };
    });
  };

  const toggleDay = (day) => {
    setFormData(prev => {
      const currentDays = prev.availability.days || [];
      const newDays = currentDays.includes(day)
        ? currentDays.filter(d => d !== day)
        : [...currentDays, day];
      return {
        ...prev,
        availability: { ...prev.availability, days: newDays }
      };
    });
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    setSaving(true);

    const { success, error } = await doctorService.updateProfile(formData);
    if (success) {
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } else {
      alert("Error updating profile: " + error);
    }
    setSaving(false);
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-[#FDFDFE] flex">
      <Sidebar />

      <div className="flex-1 ml-64 min-w-0 flex flex-col min-h-screen">
        <Navbar />
      <main className="flex-1 p-6 md:p-10 overflow-y-auto">
        <div className="max-w-5xl mx-auto mb-12">
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-4 mb-2">
                <div className="h-14 w-14 bg-primary-600 rounded-2xl flex items-center justify-center shadow-lg shadow-primary-500/30">
                  <UserIcon className="h-7 w-7 text-white" />
                </div>
                <div>
                  <h1 className="text-4xl font-extrabold text-slate-900 tracking-tighter">My Practice Profile</h1>
                  <p className="text-slate-500 text-lg font-medium opacity-80">
                    Manage your clinical presence and service offerings.
                  </p>
                </div>
              </div>
            </div>
          </motion.div>

          {loading ? (
            <div className="flex flex-col items-center justify-center h-96 gap-6">
              <div className="relative">
                <div className="h-20 w-20 border-4 border-primary-100 border-t-primary-600 rounded-full animate-spin" />
                <Stethoscope className="h-8 w-8 text-primary-600 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse" />
              </div>
              <p className="text-slate-400 font-bold tracking-widest uppercase text-xs">Loading Medical Records...</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-12 pb-20">

              {/* SECTION 1: BASIC INFORMATION */}
              <section className="bg-white rounded-[2.5rem] p-10 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100">
                <div className="flex items-center gap-6 mb-10">
                  <div className="relative group">
                    <div className="h-24 w-24 bg-slate-100 rounded-[2rem] flex items-center justify-center overflow-hidden border-4 border-white shadow-xl">
                      {formData.basicInfo.profileImage ? (
                        <img src={formData.basicInfo.profileImage} alt="Profile" className="h-full w-full object-cover" />
                      ) : (
                        <UserIcon className="h-10 w-10 text-slate-300" />
                      )}
                    </div>
                    <label className="absolute -bottom-2 -right-2 h-10 w-10 bg-primary-600 rounded-2xl flex items-center justify-center text-white cursor-pointer shadow-lg hover:bg-primary-700 transition-colors border-4 border-white">
                      <Activity className="h-4 w-4" />
                      <input
                        type="file"
                        className="hidden"
                        accept="image/*"
                        onChange={async (e) => {
                          const file = e.target.files[0];
                          if (file) {
                            setSaving(true);
                            const result = await doctorService.uploadProfileImage(file);
                            if (result.success) {
                              handleInputChange('basicInfo', 'profileImage', result.imageUrl);
                            } else {
                              alert("Error uploading image: " + result.error);
                            }
                            setSaving(false);
                          }
                        }}
                      />
                    </label>
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-slate-900 tracking-tight">Identity Details</h2>
                    <p className="text-slate-400 text-sm font-semibold">Primary details for your clinical identity.</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-8">
                  <FormInput
                    label="Doctor Full Name"
                    value={formData.basicInfo.name}
                    onChange={(e) => handleInputChange('basicInfo', 'name', e.target.value)}
                    placeholder="e.g. Dr. Alexander Pierce"
                    icon={<UserIcon className="h-4 w-4" />}
                  />
                  <div className="grid grid-cols-2 gap-6">
                    <FormInput
                      label="Age"
                      type="number"
                      value={formData.basicInfo.age || ''}
                      onChange={(e) => handleInputChange('basicInfo', 'age', e.target.value)}
                    />
                    <div className="flex flex-col gap-2">
                      <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">Gender</label>
                      <select
                        className="input-field h-[60px] font-bold text-slate-700 bg-slate-50 border-none rounded-2xl px-6 focus:ring-2 focus:ring-primary-500/50 appearance-none"
                        value={formData.basicInfo.gender}
                        onChange={(e) => handleInputChange('basicInfo', 'gender', e.target.value)}
                      >
                        <option>Male</option>
                        <option>Female</option>
                        <option>Other</option>
                      </select>
                    </div>
                  </div>
                  <FormInput
                    label="Official Phone"
                    value={formData.basicInfo.phone}
                    onChange={(e) => handleInputChange('basicInfo', 'phone', e.target.value)}
                    placeholder="+1 (555) 000-0000"
                  />
                  <FormInput
                    label="Linked Portfolio Email"
                    value={formData.basicInfo.email}
                    readOnly
                    className="opacity-50 cursor-not-allowed bg-slate-100"
                  />
                </div>
              </section>

              {/* SECTION 2: PROFESSIONAL & TREATMENTS */}
              <section className="bg-white rounded-[2.5rem] p-10 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100">
                <div className="flex items-center gap-4 mb-10 border-b border-slate-50 pb-8">
                  <div className="h-10 w-10 bg-rose-50 rounded-xl flex items-center justify-center">
                    <Stethoscope className="h-5 w-5 text-rose-600" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-slate-900 tracking-tight">Clinical Expertise</h2>
                    <p className="text-slate-400 text-sm font-semibold">Specializations and treatments you provide.</p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-8 mb-12">
                  <FormInput
                    label="Primary Qualification"
                    value={formData.professionalInfo.qualification}
                    onChange={(e) => handleInputChange('professionalInfo', 'qualification', e.target.value)}
                    placeholder="e.g. MBBS, MD"
                  />
                  <FormInput
                    label="Lead Specialization"
                    value={formData.professionalInfo.specialization || ''}
                    onChange={(e) => handleInputChange('professionalInfo', 'specialization', e.target.value)}
                    placeholder="e.g. Cardiology"
                  />
                  <FormInput
                    label="Experience (Years)"
                    type="number"
                    value={formData.professionalInfo.experience || ''}
                    onChange={(e) => handleInputChange('professionalInfo', 'experience', e.target.value)}
                    placeholder="10"
                  />
                </div>

                <div className="mb-8 rounded-2xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/50 dark:bg-emerald-950/40 p-5">
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-xl bg-white dark:bg-slate-800 border border-emerald-100 dark:border-emerald-800 flex items-center justify-center shadow-sm flex-shrink-0">
                      <Video className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div>
                      <p className="text-[11px] font-black uppercase tracking-widest text-emerald-800 dark:text-emerald-300">
                        Online video consultations
                      </p>
                      <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed mt-1">
                        Online visits use in-app video (LiveKit). Patients join from AyurCare during the live window. Configure <code className="font-mono text-[11px]">LIVEKIT_*</code> in <code className="font-mono text-[11px]">server/.env</code> if video is unavailable.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-8">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 block pl-1">Treatments Provided (Select all that apply)</label>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
                    {treatmentOptions.map((treatment) => {
                      const isSelected = formData.professionalInfo.treatments?.includes(treatment);
                      return (
                        <button
                          key={treatment}
                          type="button"
                          onClick={() => toggleTreatment(treatment)}
                          className={`flex items-center justify-between gap-2 px-5 py-3.5 rounded-2xl border-2 transition-all duration-300 ${isSelected
                              ? 'bg-primary-50 border-primary-200 text-primary-700 shadow-md scale-[1.02]'
                              : 'bg-white border-slate-100 text-slate-500 hover:border-slate-300 hover:bg-slate-50'
                            }`}
                        >
                          <span className="text-sm font-bold truncate">{treatment}</span>
                          {isSelected ? (
                            <div className="min-w-5 h-5 bg-primary-600 rounded-full flex items-center justify-center">
                              <Check className="h-3 w-3 text-white stroke-[4]" />
                            </div>
                          ) : (
                            <div className="min-w-5 h-5 border-2 border-slate-100 rounded-full" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </section>

              {/* SECTION 3: CLINIC & LOCATION */}
              <section className="bg-white rounded-[2.5rem] p-10 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100">
                <div className="flex items-center gap-4 mb-10 border-b border-slate-50 pb-8">
                  <div className="h-10 w-10 bg-emerald-50 rounded-xl flex items-center justify-center">
                    <Building2 className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-slate-900 tracking-tight">Clinic Presence</h2>
                    <p className="text-slate-400 text-sm font-semibold">Location and infrastructure details.</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-8">
                  <div className="space-y-6">
                    <FormInput
                      label="Clinic Name"
                      value={formData.clinicInfo.clinicName}
                      onChange={(e) => handleInputChange('clinicInfo', 'clinicName', e.target.value)}
                      placeholder="e.g. LifeCare Medical Center"
                    />
                    <FormInput
                      label="Full Street Address"
                      value={formData.clinicInfo.address}
                      onChange={(e) => handleInputChange('clinicInfo', 'address', e.target.value)}
                      placeholder="123 Heart St, Medical District"
                    />
                    <div className="grid grid-cols-2 gap-6">
                      <FormInput label="City" value={formData.clinicInfo.city} onChange={(e) => handleInputChange('clinicInfo', 'city', e.target.value)} />
                      <FormInput label="State" value={formData.clinicInfo.state} onChange={(e) => handleInputChange('clinicInfo', 'state', e.target.value)} />
                    </div>
                    <FormInput label="Pincode/ZIP" value={formData.clinicInfo.pincode} onChange={(e) => handleInputChange('clinicInfo', 'pincode', e.target.value)} />
                  </div>

                  <div className="bg-slate-50 rounded-[2rem] p-8 flex flex-col items-center justify-center text-center border-2 border-dashed border-slate-200">
                    <div className="h-16 w-16 bg-white rounded-2xl flex items-center justify-center shadow-sm mb-4">
                      <ShieldCheck className="h-8 w-8 text-primary-600" />
                    </div>
                    <h4 className="text-xl font-black text-slate-900">Geographic Verification</h4>
                    <p className="text-slate-500 text-sm mt-2 max-w-[250px]">
                      Share your real-time clinic location to enable nearby patient discovery.
                    </p>

                    <button
                      type="button"
                      onClick={() => {
                        if (navigator.geolocation) {
                          navigator.geolocation.getCurrentPosition((pos) => {
                            setFormData(prev => ({
                              ...prev,
                              location: {
                                type: 'Point',
                                coordinates: [pos.coords.longitude, pos.coords.latitude]
                              }
                            }));
                            alert("Coordinates sync successful!");
                          });
                        }
                      }}
                      className="btn btn-secondary mt-6 px-8 py-4 rounded-2xl bg-white border-2 border-primary-100 text-primary-600 hover:bg-primary-600 hover:text-white transition-all duration-300 flex items-center gap-3 shadow-md"
                    >
                      <Activity className="h-5 w-5" />
                      <span className="font-bold">Sync GPS Location</span>
                    </button>

                    {formData.location?.coordinates?.[0] !== 0 && (
                      <div className="mt-4 px-4 py-2 bg-emerald-50 text-emerald-700 rounded-full text-xs font-black flex items-center gap-2 border border-emerald-100">
                        <div className="h-1.5 w-1.5 bg-emerald-500 rounded-full animate-pulse" />
                        GPS Verified: {typeof formData.location.coordinates[1] === 'number' ? formData.location.coordinates[1].toFixed(4) : 'N/A'}, {typeof formData.location.coordinates[0] === 'number' ? formData.location.coordinates[0].toFixed(4) : 'N/A'}
                      </div>
                    )}
                  </div>
                </div>
              </section>

              {/* SECTION 4: AVAILABILITY & FEES */}
              <section className="bg-white rounded-[2.5rem] p-10 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100">
                <div className="flex items-center gap-4 mb-10 border-b border-slate-50 pb-8">
                  <div className="h-10 w-10 bg-amber-50 rounded-xl flex items-center justify-center">
                    <Clock className="h-5 w-5 text-amber-600" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-slate-900 tracking-tight">Access & Billing</h2>
                    <p className="text-slate-400 text-sm font-semibold">Consultation timings and fee structure.</p>
                  </div>
                </div>

                <div className="space-y-10">
                  <div>
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 block pl-1">Working Days</label>
                    <div className="flex flex-wrap gap-3">
                      {weekDays.map((day) => {
                        const isSelected = formData.availability.days?.includes(day);
                        return (
                          <button
                            key={day}
                            type="button"
                            onClick={() => toggleDay(day)}
                            className={`h-14 w-14 rounded-2xl border-2 font-bold transition-all duration-300 ${isSelected
                                ? 'bg-primary-600 border-primary-600 text-white shadow-lg shadow-primary-500/30'
                                : 'bg-white border-slate-100 text-slate-400 hover:border-slate-300'
                              }`}
                          >
                            {day}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-8">
                    <div className="flex flex-col gap-2">
                      <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">Shift Start</label>
                      <input
                        type="time"
                        className="input-field h-[60px] font-bold text-slate-700 bg-slate-50 border-none rounded-2xl px-6 focus:ring-2 focus:ring-primary-500/50"
                        value={formData.availability.startTime}
                        onChange={(e) => handleInputChange('availability', 'startTime', e.target.value)}
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">Shift End</label>
                      <input
                        type="time"
                        className="input-field h-[60px] font-bold text-slate-700 bg-slate-50 border-none rounded-2xl px-6 focus:ring-2 focus:ring-primary-500/50"
                        value={formData.availability.endTime}
                        onChange={(e) => handleInputChange('availability', 'endTime', e.target.value)}
                      />
                    </div>
                    <FormInput
                      label="Base Fee (RPS)"
                      type="number"
                      value={formData.availability.fees || ''}
                      onChange={(e) => handleInputChange('availability', 'fees', e.target.value)}
                      placeholder="e.g. 50"
                      icon={<span className="text-slate-400 font-bold">$</span>}
                    />
                  </div>
                  
                  <FormInput
                    label="Proficient Languages"
                    value={formData.availability.languages}
                    onChange={(e) => handleInputChange('availability', 'languages', e.target.value)}
                    placeholder="e.g. English, Spanish"
                  />
                </div>
              </section>

              {/* FINAL ACTION AREA */}
              <div className="flex items-center justify-between p-2">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 bg-primary-100 rounded-full flex items-center justify-center text-primary-600">
                    <ShieldCheck className="h-6 w-6" />
                  </div>
                  <p className="text-slate-400 text-sm font-bold italic">
                    Your clinical profile is verified and securely stored in MongoDB Cloud.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={saving}
                  className="btn btn-primary flex items-center gap-4 px-12 py-5 rounded-3xl shadow-2xl shadow-primary-500/40 relative group"
                >
                  <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                  {saving ? <Loader2 className="h-6 w-6 animate-spin" /> : <Save className="h-6 w-6" />}
                  <span className="font-black text-xl tracking-tighter">{saving ? 'Processing...' : 'Confirm & Save Changes'}</span>
                  <ChevronRight className="h-6 w-6 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>

            </form>
          )}
        </div>

        <AnimatePresence>
          {success && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 30 }}
              className="fixed bottom-12 left-1/2 -translate-x-1/2 z-[100] bg-slate-900 text-white px-10 py-5 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] border-t border-slate-700 backdrop-blur-xl flex items-center gap-5"
            >
              <div className="h-10 w-10 bg-green-500 rounded-2xl flex items-center justify-center shadow-lg shadow-green-500/40">
                <Check className="h-6 w-6 text-white stroke-[3px]" />
              </div>
              <div>
                <p className="font-black text-lg tracking-tight">Records Synchronized!</p>
                <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Update successful at {new Date().toLocaleTimeString()}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
      </div>
    </div>
  );
};

export default Profile;
