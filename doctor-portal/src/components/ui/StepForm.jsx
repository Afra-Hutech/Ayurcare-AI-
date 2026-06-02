import React, { useState } from 'react';
import FormInput from './FormInput';
import { 
  ChevronRight, 
  ChevronLeft, 
  CheckCircle,
  User,
  Stethoscope, 
  Building2,
  Clock,
  Loader2,
  Activity
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { doctorService } from '../../services/api';

const StepForm = ({ initialEmail, initialData, onSubmit, loading }) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    basicInfo: {
      name: initialData?.basicInfo?.name || '',
      age: initialData?.basicInfo?.age || '',
      gender: initialData?.basicInfo?.gender || 'Male',
      phone: initialData?.basicInfo?.phone || '',
      email: initialData?.basicInfo?.email || initialEmail || '',
      profileImage: initialData?.basicInfo?.profileImage || '',
    },
    professionalInfo: {
      qualification: initialData?.professionalInfo?.qualification || '',
      specialization: initialData?.professionalInfo?.specialization || '',
      experience: initialData?.professionalInfo?.experience || '',
      treatments: initialData?.professionalInfo?.treatments || [],
    },
    clinicInfo: {
      clinicName: initialData?.clinicInfo?.clinicName || '',
      address: initialData?.clinicInfo?.address || '',
      city: initialData?.clinicInfo?.city || '',
      state: initialData?.clinicInfo?.state || '',
      pincode: initialData?.clinicInfo?.pincode || '',
    },
    availability: {
      timings: initialData?.availability?.timings || '',
      fees: initialData?.availability?.fees || '',
      currency: initialData?.availability?.currency || 'INR',
      languages: initialData?.availability?.languages || '',
    },
    // Default coordinates: prefer existing saved coords; otherwise empty so we don't accidentally send [0,0]
    location: Array.isArray(initialData?.location?.coordinates) ? initialData.location.coordinates : ['', ''], // [lng, lat]
  });

  const [errors, setErrors] = useState({});

  const handleChange = (step, field, value) => {
    setFormData((prev) => ({
      ...prev,
      [step]: {
        ...prev[step],
        [field]: value,
      },
    }));
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep((prev) => Math.min(prev + 1, 4));
    }
  };

  const handleBack = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  const validateStep = (step) => {
    const newErrors = {};
    if (step === 1) {
      if (!formData.basicInfo.name) newErrors.name = 'Name is required';
      if (!formData.basicInfo.age) newErrors.age = 'Age is required';
      if (!formData.basicInfo.phone) newErrors.phone = 'Phone is required';
    } else if (step === 2) {
      if (!formData.professionalInfo.qualification) newErrors.qualification = 'Qualification is required';
      if (!formData.professionalInfo.specialization) newErrors.specialization = 'Specialization is required';
      if (!formData.professionalInfo.experience) newErrors.experience = 'Experience is required';
    } else if (step === 3) {
      if (!formData.clinicInfo.clinicName) newErrors.clinicName = 'Clinic Name is required';
      if (!formData.clinicInfo.city) newErrors.city = 'City is required';
      if (!formData.clinicInfo.pincode) newErrors.pincode = 'Pincode is required';
    } else if (step === 4) {
      if (!formData.availability.timings) newErrors.timings = 'Timings are required';
      if (!formData.availability.fees) newErrors.fees = 'Consultation Fees are required';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const renderProgress = () => {
    const steps = [
      { id: 1, icon: User, label: "Basic Info" },
      { id: 2, icon: Stethoscope, label: "Professional" },
      { id: 3, icon: Building2, label: "Clinic" },
      { id: 4, icon: Clock, label: "Availability" },
    ];

    return (
      <div className="flex items-center justify-between mb-10 px-4 relative">
        <div className="absolute top-[20px] left-[60px] right-[60px] h-[3px] bg-slate-100 -z-0 rounded-full">
          <div 
            className="h-full bg-primary-600 transition-all duration-700 ease-in-out"
            style={{ width: `${((currentStep - 1) / (steps.length - 1)) * 100}%` }}
          />
        </div>
        
        {steps.map((s) => {
          const Icon = s.icon;
          const isActive = currentStep >= s.id;
          const isCurrent = currentStep === s.id;

          return (
            <div key={s.id} className="relative z-10 flex flex-col items-center gap-3">
              <div 
                className={`h-11 w-11 rounded-2xl flex items-center justify-center transition-all duration-300 ${
                  isCurrent 
                  ? 'bg-primary-600 text-white shadow-xl shadow-primary-500/30 scale-125 rotate-3' 
                  : isActive 
                    ? 'bg-primary-500 text-white' 
                    : 'bg-white border-2 border-slate-200 text-slate-400'
                }`}
              >
                {isActive && currentStep > s.id ? <CheckCircle className="h-6 w-6" /> : <Icon className="h-5 w-5" />}
              </div>
              <span className={`text-[10px] uppercase tracking-widest font-black ${isActive ? 'text-primary-600' : 'text-slate-400 opacity-60'}`}>
                {s.label}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

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

  const toggleTreatment = (treatment) => {
    const currentTreatments = formData.professionalInfo.treatments || [];
    const newTreatments = currentTreatments.includes(treatment)
      ? currentTreatments.filter(t => t !== treatment)
      : [...currentTreatments, treatment];
    
    handleChange('professionalInfo', 'treatments', newTreatments);
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
            <h2 className="text-2xl font-black text-slate-900 flex items-center gap-3 mb-6">
              <div className="h-10 w-2 bg-primary-600 rounded-full"></div>
              Basic Information
            </h2>

            <div className="flex justify-center mb-6">
              <div className="relative group">
                <div className="h-24 w-24 bg-slate-100 rounded-[2rem] flex items-center justify-center overflow-hidden border-4 border-white shadow-xl">
                  {formData.basicInfo.profileImage ? (
                    <img src={formData.basicInfo.profileImage} alt="Profile" className="h-full w-full object-cover" />
                  ) : (
                    <User className="h-10 w-10 text-slate-300" />
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
                        const result = await doctorService.uploadProfileImage(file);
                        if (result.success) {
                          handleChange('basicInfo', 'profileImage', result.imageUrl);
                        } else {
                          alert("Error uploading image: " + result.error);
                        }
                      }
                    }}
                  />
                </label>
              </div>
            </div>

            <FormInput 
              label="Full Name" 
              value={formData.basicInfo.name} 
              onChange={(e) => handleChange('basicInfo', 'name', e.target.value)}
              placeholder="Dr. John Doe"
              required
            />
            {errors.name && <p className="text-red-500 text-xs font-bold">{errors.name}</p>}
            
            <div className="grid grid-cols-2 gap-4">
              <FormInput 
                label="Age" 
                type="number"
                value={formData.basicInfo.age} 
                onChange={(e) => handleChange('basicInfo', 'age', e.target.value)}
                placeholder="35"
                required
              />
              {errors.age && <p className="text-red-500 text-[10px] font-bold mt-1 uppercase tracking-tighter">{errors.age}</p>}
              <div className="flex flex-col gap-2">
                <label className="text-sm font-bold text-slate-700 uppercase tracking-wider">Gender</label>
                <select 
                  className="input-field font-semibold" 
                  value={formData.basicInfo.gender} 
                  onChange={(e) => handleChange('basicInfo', 'gender', e.target.value)}
                >
                  <option>Male</option>
                  <option>Female</option>
                  <option>Other</option>
                </select>
              </div>
            </div>
            
            <FormInput 
              label="Phone Number" 
              value={formData.basicInfo.phone} 
              onChange={(e) => handleChange('basicInfo', 'phone', e.target.value)}
              placeholder="+1 234 567 8900"
              required
            />
            {errors.phone && <p className="text-red-500 text-[10px] font-bold mt-1 uppercase tracking-tighter">{errors.phone}</p>}
            <FormInput 
              label="Email (Auto-linked)" 
              value={formData.basicInfo.email} 
              readOnly={true}
              className="opacity-60 grayscale pointer-events-none"
            />
          </motion.div>
        );

      case 2:
        return (
          <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} className="space-y-6 overflow-y-auto max-h-[500px] pr-2 custom-scrollbar">
            <h2 className="text-2xl font-black text-slate-900 flex items-center gap-3 mb-6">
              <div className="h-10 w-2 bg-indigo-600 rounded-full"></div>
              Professional Details
            </h2>
            <FormInput 
              label="Qualification" 
              value={formData.professionalInfo.qualification} 
              onChange={(e) => handleChange('professionalInfo', 'qualification', e.target.value)}
              placeholder="MBBS, MD Cardiology"
              required
            />
            {errors.qualification && <p className="text-red-500 text-[10px] font-bold mt-1 uppercase tracking-tighter">{errors.qualification}</p>}
            <FormInput 
              label="Specialization" 
              value={formData.professionalInfo.specialization} 
              onChange={(e) => handleChange('professionalInfo', 'specialization', e.target.value)}
              placeholder="Cardiologist"
              required
            />
            {errors.specialization && <p className="text-red-500 text-[10px] font-bold mt-1 uppercase tracking-tighter">{errors.specialization}</p>}
            <FormInput 
              label="Years of Experience" 
              type="number"
              value={formData.professionalInfo.experience} 
              onChange={(e) => handleChange('professionalInfo', 'experience', e.target.value)}
              placeholder="10"
              required
            />
            {errors.experience && <p className="text-red-500 text-[10px] font-bold mt-1 uppercase tracking-tighter">{errors.experience}</p>}

            <div className="mt-8">
              <label className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-4 block">Treatments Provided</label>
              <div className="grid grid-cols-2 gap-2 mt-4">
                 {treatmentOptions.map((treatment) => {
                   const isSelected = formData.professionalInfo.treatments?.includes(treatment);
                   return (
                     <button
                       key={treatment}
                       type="button"
                       onClick={() => toggleTreatment(treatment)}
                       className={`flex items-center justify-between gap-2 px-4 py-2.5 rounded-xl border-2 transition-all duration-200 ${
                         isSelected 
                         ? 'bg-primary-50 border-primary-200 text-primary-700' 
                         : 'bg-white border-slate-100 text-slate-500 hover:border-slate-300'
                       }`}
                     >
                       <span className="text-xs font-bold truncate">{treatment}</span>
                       {isSelected && <CheckCircle className="h-4 w-4 text-primary-600" />}
                     </button>
                   );
                 })}
              </div>
            </div>
          </motion.div>
        );

      case 3:
        return (
          <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
            <h2 className="text-2xl font-black text-slate-900 flex items-center gap-3 mb-6">
              <div className="h-10 w-2 bg-emerald-600 rounded-full"></div>
              Clinic Information
            </h2>
            <FormInput 
              label="Name of Clinic/Hospital" 
              value={formData.clinicInfo.clinicName} 
              onChange={(e) => handleChange('clinicInfo', 'clinicName', e.target.value)}
              placeholder="Lifeline Medical Center"
              required
            />
            {errors.clinicName && <p className="text-red-500 text-[10px] font-bold mt-1 uppercase tracking-tighter">{errors.clinicName}</p>}
            <FormInput 
              label="Full Address" 
              value={formData.clinicInfo.address} 
              onChange={(e) => handleChange('clinicInfo', 'address', e.target.value)}
              placeholder="123 Medical St, Healthcare District"
            />
            <div className="grid grid-cols-2 gap-4">
              <FormInput 
                label="City" 
                value={formData.clinicInfo.city} 
                onChange={(e) => handleChange('clinicInfo', 'city', e.target.value)}
                placeholder="New York"
              />
              {errors.city && <p className="text-red-500 text-[10px] font-bold mt-1 uppercase tracking-tighter">{errors.city}</p>}
              <FormInput 
                label="State" 
                value={formData.clinicInfo.state} 
                onChange={(e) => handleChange('clinicInfo', 'state', e.target.value)}
                placeholder="NY"
              />
            </div>
            <FormInput 
              label="Pincode/ZIP Code" 
              value={formData.clinicInfo.pincode} 
              onChange={(e) => handleChange('clinicInfo', 'pincode', e.target.value)}
              placeholder="10001"
            />
            {errors.pincode && <p className="text-red-500 text-[10px] font-bold mt-1 uppercase tracking-tighter">{errors.pincode}</p>}

            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 mt-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-slate-900 uppercase tracking-widest">Clinic Location (GPS)</h4>
                  <p className="text-xs text-slate-500 mt-1">
                    Used to help local patients find you.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (navigator.geolocation) {
                      navigator.geolocation.getCurrentPosition((pos) => {
                        const lng = pos.coords.longitude;
                        const lat = pos.coords.latitude;
                        // GeoJSON order: [longitude, latitude]
                        setFormData((prev) => ({ ...prev, location: [lng, lat] }));
                        alert(`Location captured! [${lng.toFixed(4)}, ${lat.toFixed(4)}]`);
                      });
                    }
                  }}
                  className="btn btn-secondary text-xs px-4 py-2"
                >
                  Locate Me
                </button>
              </div>
              {typeof formData.location[0] === 'number' && typeof formData.location[1] === 'number' && (
                <div className="mt-2 text-[10px] font-mono text-slate-500">
                   Current: {formData.location[1].toFixed(6)}, {formData.location[0].toFixed(6)}
                </div>
              )}
            </div>
          </motion.div>
        );

      case 4:
        return (
          <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
            <h2 className="text-2xl font-black text-slate-900 flex items-center gap-3 mb-6">
              <div className="h-10 w-2 bg-rose-600 rounded-full"></div>
              Consultation & Fees
            </h2>
            <FormInput 
              label="Operational Hours" 
              value={formData.availability.timings} 
              onChange={(e) => handleChange('availability', 'timings', e.target.value)}
              placeholder="9:00 AM - 5:00 PM (Mon-Sat)"
              required
            />
            {errors.timings && <p className="text-red-500 text-[10px] font-bold mt-1 uppercase tracking-tighter">{errors.timings}</p>}
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-1 flex flex-col gap-2">
                <label className="text-sm font-bold text-slate-700 uppercase tracking-wider">Currency</label>
                <select 
                  className="input-field font-semibold" 
                  value={formData.availability.currency} 
                  onChange={(e) => handleChange('availability', 'currency', e.target.value)}
                >
                  <option value="INR">₹ INR</option>
                  <option value="USD">$ USD</option>
                </select>
              </div>
              <div className="col-span-2">
                <FormInput 
                  label={`Consultation Fee (${formData.availability.currency})`} 
                  type="number"
                  value={formData.availability.fees} 
                  onChange={(e) => handleChange('availability', 'fees', e.target.value)}
                  placeholder={formData.availability.currency === 'INR' ? "500" : "50"}
                  required
                />
              </div>
            </div>
            {errors.fees && <p className="text-red-500 text-[10px] font-bold mt-1 uppercase tracking-tighter">{errors.fees}</p>}
            <FormInput 
              label="Languages Spoken (Comma Separated)" 
              value={formData.availability.languages} 
              onChange={(e) => handleChange('availability', 'languages', e.target.value)}
              placeholder="English, Spanish, French"
            />
          </motion.div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto glass p-10 rounded-[2.5rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.1)] border border-white relative overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-primary-400 via-indigo-500 to-rose-500" />
      <div className="absolute -top-24 -right-24 w-48 h-48 bg-primary-100/30 rounded-full blur-3xl -z-10" />
      <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-rose-100/30 rounded-full blur-3xl -z-10" />

      {renderProgress()}
      
      <div className="min-h-[450px]">
        {renderStepContent()}
      </div>

      <div className="flex items-center justify-between mt-10 pt-8 border-t border-slate-100">
        <button
          onClick={handleBack}
          disabled={currentStep === 1 || loading}
          className="btn btn-outline flex items-center gap-2 group"
        >
          <ChevronLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
          Back
        </button>

        {currentStep === 4 ? (
          <button
            onClick={() => onSubmit(formData)}
            disabled={loading}
            className="btn btn-primary flex items-center gap-3 px-10 shadow-primary-500/40"
          >
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle className="h-5 w-5" />}
            <span className="font-black tracking-tight">{loading ? 'Processing...' : 'Ready to Start'}</span>
          </button>
        ) : (
          <button
            onClick={handleNext}
            disabled={loading}
            className="btn btn-primary flex items-center gap-2 px-10 group"
          >
            <span className="font-black tracking-tight tracking-wide">Continue</span>
            <ChevronRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
          </button>
        )}
      </div>
    </div>
  );
};

export default StepForm;
