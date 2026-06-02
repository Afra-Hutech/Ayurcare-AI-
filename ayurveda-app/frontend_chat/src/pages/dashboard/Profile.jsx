import React, { useState, useEffect } from 'react';
import { User, Phone, Mail, MapPin, Calendar, Edit2, CheckCircle2, Shield, Heart, Activity, ChevronRight, Lock, Loader2, Plus } from 'lucide-react';
import api, { patientApi } from '../../services/api';
import { persistPatientUser } from '../../utils/patientUser';

const Profile = () => {
  const [user, setUser] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    profileImage: '',
    age: '',
    gender: '',
    height: '',
    weight: '',
  });

  const applyUserData = (userData) => {
    setProfile({
      name:         userData.name         || '',
      email:        userData.email        || '',
      phone:        userData.phone        || '',
      address:      userData.address      || '',
      profileImage: userData.profileImage || '',
      age:          userData.age    != null ? String(userData.age)    : '',
      gender:       userData.gender       || '',
      height:       userData.height != null ? String(userData.height) : '',
      weight:       userData.weight != null ? String(userData.weight) : '',
    });
  };

  useEffect(() => {
    const fetchUser = async () => {
      setLoading(true);
      // Optimistic render: show localStorage data immediately while API loads
      const cached = localStorage.getItem('user');
      if (cached) {
        try { applyUserData(JSON.parse(cached)); } catch { /* ignore */ }
      }
      try {
        const token = localStorage.getItem('token');
        if (token) {
          const res = await api.get('/auth/me');
          applyUserData(res.data);
          persistPatientUser(res.data);
        }
      } catch (err) {
        console.error('Failed to load profile from backend:', err);
        // localStorage snapshot already applied above — user still sees their data
      } finally {
        setLoading(false);
      }
    };
    fetchUser();
  }, []);

  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    setSaveError('');
    try {
      const payload = {
        name:    profile.name    || '',
        phone:   profile.phone   || '',
        address: profile.address || '',
        profileImage: profile.profileImage || '',
        age:     profile.age    ? Number(profile.age)    : null,
        gender:  profile.gender || '',
        height:  profile.height || null,
        weight:  profile.weight || null,
      };
      const res = await patientApi.updateProfile(payload);
      persistPatientUser(res.data);
      applyUserData(res.data);
      window.dispatchEvent(new CustomEvent('profile:updated', { detail: res.data }));
      setIsEditing(false);
    } catch (err) {
      const msg = err?.response?.data?.message || err.message || 'Save failed';
      setSaveError(msg);
      console.error('[Profile save]', err);
    } finally {
      setSaving(false);
    }
  };

  const infoGroups = [
    { label: 'Full Name', value: profile.name, key: 'name', icon: <User size={16} /> },
    { label: 'Email Address', value: profile.email, key: 'email', icon: <Mail size={16} />, readOnly: true },
    { label: 'Phone Number', value: profile.phone, key: 'phone', icon: <Phone size={16} /> },
    { label: 'Age', value: profile.age, key: 'age', icon: <Calendar size={16} /> },
    { label: 'Gender', value: profile.gender, key: 'gender', icon: <Heart size={16} /> },
    { label: 'Height', value: profile.height, key: 'height', icon: <Activity size={16} />, placeholder: 'e.g. 170 cm' },
    { label: 'Weight', value: profile.weight, key: 'weight', icon: <Activity size={16} />, placeholder: 'e.g. 70 kg' },
  ];

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-ayur-sage" /></div>;

  return (
    <div className="h-full page-scroll">
      <div className="page-content max-w-[1240px] space-y-5 pb-8">
        <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-4 border-b border-[#f0f1f3] dark:border-[var(--practo-border)]">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2 text-ayur-sage font-black uppercase text-[10px] tracking-[4px]">
               <User size={14} />
               <span>Personal Record</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-ayur-forest dark:text-slate-50 tracking-tight">Health Profile</h1>
            <p className="text-[#6d7b74] dark:text-[var(--practo-text-light)] font-medium text-sm leading-snug">Everything your AI assistant needs to personalize your treatments.</p>
          </div>
          
          <div className="flex flex-col items-end gap-1">
            <button
              type="button"
              disabled={saving}
              onClick={() => isEditing ? handleSave() : setIsEditing(true)}
              className={`flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold uppercase tracking-widest text-[11px] transition-all shadow active:scale-95 group min-w-[140px] z-50 disabled:opacity-60 ${
                isEditing ? 'bg-emerald-500 text-white shadow-emerald-500/20' : 'bg-[#1A2E26] text-white shadow-[#1A2E26]/20'
              }`}
            >
              {saving ? <Loader2 size={18} className="animate-spin" /> : isEditing ? <CheckCircle2 size={18} /> : <Edit2 size={18} />}
              <span className="inline-block">{saving ? 'Saving…' : isEditing ? 'Save Changes' : 'Update Info'}</span>
            </button>
            {saveError && <p className="text-red-500 text-[11px] font-semibold">{saveError}</p>}
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
           {/* Left Side Summary */}
           <div className="lg:col-span-4 space-y-5">
              <div className="bg-white dark:bg-[var(--practo-white)] p-6 rounded-2xl border border-[#f0f1f3] dark:border-[var(--practo-border)] shadow-sm flex flex-col items-center group relative overflow-hidden text-center">
                 <div className="absolute top-0 right-0 w-24 h-24 bg-ayur-sage/5 rounded-bl-[100px] -z-0"></div>
                 <div className="relative group/avatar">
                   <div className="w-28 h-28 rounded-2xl bg-[#f4f7f6] dark:bg-slate-700 p-1 border border-gray-100 dark:border-slate-600 shadow-inner relative flex items-center justify-center text-gray-400 mb-4 group-hover/avatar:scale-[1.02] transition-transform duration-500 ring-2 ring-white dark:ring-slate-800 overflow-hidden">
                      {profile.profileImage ? (
                        <img src={profile.profileImage} alt="Profile" className="w-full h-full object-cover rounded-xl" />
                      ) : (
                        <User size={80} />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-tr from-ayur-sage/5 to-transparent"></div>
                   </div>
                   {isEditing && (
                     <label className="absolute bottom-4 right-2 w-10 h-10 bg-emerald-500 text-white rounded-xl flex items-center justify-center cursor-pointer shadow-lg hover:bg-emerald-600 transition-colors z-20">
                       <Activity size={20} />
                       <input 
                         type="file" 
                         className="hidden" 
                         accept="image/*"
                         onChange={async (e) => {
                           const file = e.target.files[0];
                           if (file) {
                             try {
                               const res = await patientApi.uploadProfileImage(file);
                               setProfile({...profile, profileImage: res.data.imageUrl});
                             } catch (err) {
                               alert("Upload failed: " + err.message);
                             }
                           }
                         }}
                       />
                     </label>
                   )}
                 </div>
                 <div className="space-y-2 relative z-10">
                    <h3 className="text-lg font-bold text-ayur-forest dark:text-slate-50 tracking-tight leading-none">{profile.name}</h3>
                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full border border-emerald-100 shadow-sm shadow-emerald-500/5">
                       <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
                       <span className="text-[10px] font-black uppercase tracking-widest">Active Member</span>
                    </div>
                 </div>
                 
                 <div className="w-full mt-5 p-4 bg-[#fcfdfd] dark:bg-[var(--practo-bg)] border border-gray-100 dark:border-[var(--practo-border)] rounded-xl">
                    <div className="space-y-1">
                       <span className="text-[9px] font-black uppercase tracking-widest text-[#aaaaaa]">Primary Email</span>
                       <span className="font-bold text-ayur-forest dark:text-slate-200 text-sm tracking-tight block truncate">{profile.email}</span>
                    </div>
                 </div>
              </div>
           </div>
           
           {/* Right Side - Editable Blocks */}
           <div className="lg:col-span-8 space-y-5 animate-fade-in">
              <section className="bg-white dark:bg-[var(--practo-white)] p-5 sm:p-6 rounded-2xl border border-[#f0f1f3] dark:border-[var(--practo-border)] shadow-sm space-y-5">
                 <div className="flex items-center gap-2.5">
                    <div className="w-1 h-5 bg-ayur-sage rounded-full"></div>
                    <h3 className="text-base font-bold text-ayur-forest dark:text-slate-100">Personal Information</h3>
                 </div>

                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {infoGroups.map(item => (
                      <div key={item.key} className="space-y-1.5 group/field">
                         <label className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[2px] text-[#aaaaaa] dark:text-slate-500 group-focus-within/field:text-ayur-sage transition-all">
                            {item.icon}
                            <span>{item.label}</span>
                         </label>
                         {isEditing && !item.readOnly ? (
                           item.key === 'gender' ? (
                             <select
                               value={profile.gender || ''}
                               onChange={(e) => setProfile({ ...profile, gender: e.target.value })}
                               className="w-full px-4 py-2.5 bg-[#f4f7f6] dark:bg-slate-700 border border-transparent rounded-lg outline-none focus:border-ayur-sage dark:focus:border-emerald-500 focus:bg-white dark:focus:bg-slate-800 transition-all text-ayur-forest dark:text-slate-200 font-semibold text-sm"
                             >
                               <option value="">Select gender</option>
                               <option value="Male">Male</option>
                               <option value="Female">Female</option>
                               <option value="Other">Other</option>
                             </select>
                           ) : (
                             <input
                               type={item.key === 'age' ? 'number' : 'text'}
                               min={item.key === 'age' ? 1 : undefined}
                               max={item.key === 'age' ? 120 : undefined}
                               placeholder={item.placeholder || ''}
                               value={profile[item.key] || ''}
                               onChange={(e) => setProfile({ ...profile, [item.key]: e.target.value })}
                               className="w-full px-4 py-2.5 bg-[#f4f7f6] dark:bg-slate-700 border border-transparent rounded-lg outline-none focus:border-ayur-sage dark:focus:border-emerald-500 focus:bg-white dark:focus:bg-slate-800 transition-all text-ayur-forest dark:text-slate-200 font-semibold text-sm"
                             />
                           )
                         ) : (
                           <div className="px-4 py-2.5 bg-[#fafbfc] dark:bg-[var(--practo-bg)] border border-transparent rounded-lg font-semibold text-ayur-forest dark:text-slate-300 text-sm group-hover/field:border-[#f0f1f3] dark:group-hover/field:border-[var(--practo-border)] transition-all">
                             {item.value || <span className="text-slate-400 dark:text-slate-600 font-normal">Not set</span>}
                           </div>
                         )}
                      </div>
                    ))}
                 </div>
              </section>
           </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;
