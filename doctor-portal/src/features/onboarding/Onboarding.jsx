import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { authService, doctorService } from '../../services/api';
import StepForm from '../../components/ui/StepForm';
import Navbar from '../../components/ui/Navbar';
import { CheckCircle, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const Onboarding = () => {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [user, setUser] = useState(authService.getCurrentUser());
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) {
      navigate('/login');
    }
  }, [user, navigate]);

  const handleSubmit = async (formData) => {
    if (!user) return;
    setLoading(true);
    const { success, error } = await doctorService.onboard(formData);
    if (success) {
      setSuccess(true);
      setTimeout(() => {
        navigate('/dashboard');
      }, 2000);
    } else {
      alert("Error saving to MongoDB: " + error);
    }
    setLoading(false);
  };

  if (!user) return null;

  return (
    <div className="min-h-screen w-full bg-slate-50 flex flex-col pt-16">
      <Navbar title="Complete profile" showLogout />
      
      <main className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-4xl mx-auto text-center mb-12">
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
            <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">Complete Your Profile</h1>
            <p className="text-slate-500 mt-4 text-lg font-medium max-w-xl mx-auto">
              Welcome to DocConnect. All data is now securely stored in MongoDB.
            </p>
          </motion.div>
        </div>

        <StepForm initialEmail={user.email} onSubmit={handleSubmit} loading={loading} />
      </main>

      <AnimatePresence>
        {success && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-primary-600/90 backdrop-blur-md"
          >
            <motion.div 
               initial={{ scale: 0.8 }}
               animate={{ scale: 1 }}
               className="bg-white p-12 rounded-3xl shadow-2xl flex flex-col items-center text-center max-w-sm"
            >
              <div className="h-24 w-24 bg-green-100 rounded-full flex items-center justify-center mb-6 shadow-inner">
                <CheckCircle className="h-12 w-12 text-green-600" />
              </div>
              <h2 className="text-3xl font-extrabold text-slate-900">Registered!</h2>
              <p className="text-slate-500 mt-4 text-lg font-medium italic">Redirecting to your dashboard...</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Onboarding;
