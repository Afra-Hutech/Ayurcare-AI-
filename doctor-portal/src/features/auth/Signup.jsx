import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { signupUser } from '../../services/api';
import FormInput from '../../components/ui/FormInput';
import { UserPlus, Loader2, ArrowRight, Leaf } from 'lucide-react';
import { motion } from 'framer-motion';
import ThemeToggle from '../../components/ui/ThemeToggle';

const Signup = () => {
  const [name, setName] = useState(''); // Added Name state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSignup = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Calling the service with the new 'name' parameter
    const { user, error: signupError } = await signupUser(email, password, name);
    
    if (user) {
      navigate('/onboarding');
    } else {
      setError(signupError);
    }
    setLoading(false);
  };

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center p-6 bg-gradient-to-br from-emerald-50 to-white dark:from-[#0b1018] dark:to-[#121a28]">
      <motion.div className="absolute top-4 right-4 z-50">
        <ThemeToggle size="sm" />
      </motion.div>
      <motion.div 
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md glass p-10 rounded-3xl shadow-2xl border border-white/50"
      >
        <div className="flex flex-col items-center gap-4 mb-10">
          <div className="h-16 w-16 bg-emerald-100 rounded-2xl flex items-center justify-center border-2 border-white/50 shadow-inner">
            <Leaf className="h-8 w-8 text-emerald-600" />
          </div>
          <div className="text-center">
            <h1 className="text-3xl font-extrabold text-slate-900 dark:text-slate-50 tracking-tight">Join DocConnect</h1>
            <p className="text-slate-500 dark:text-slate-300 mt-2 font-medium">Create your doctor profile</p>
          </div>
        </div>

        {error && (
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="p-4 bg-red-50 text-red-600 rounded-xl mb-6 text-sm border border-red-100 flex items-center gap-3"
          >
            <div className="h-2 w-2 rounded-full bg-red-600 animate-pulse" />
            {error}
          </motion.div>
        )}

        <form onSubmit={handleSignup} className="space-y-6">
          <FormInput 
            label="Full Name" 
            type="text" 
            value={name} 
            onChange={(e) => setName(e.target.value)} 
            placeholder="Johnny Appleseed"
            required
          />
          <FormInput 
            label="Email Address" 
            type="email" 
            value={email} 
            onChange={(e) => setEmail(e.target.value)} 
            placeholder="johnny@example.com"
            required
          />
          <FormInput 
            label="Secure Password" 
            type="password" 
            value={password} 
            onChange={(e) => setPassword(e.target.value)} 
            placeholder="••••••••••••"
            required
          />
          <button 
            type="submit" 
            disabled={loading}
            className="w-full btn bg-emerald-600 hover:bg-emerald-700 text-white py-4 flex items-center justify-center gap-2 group text-lg rounded-xl transition-all"
          >
            {loading ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : (
              <>
                <UserPlus className="h-5 w-5" />
                <span>Begin Wellness Journey</span>
                <ArrowRight className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity translate-x-1 group-hover:translate-x-2 duration-300" />
              </>
            )}
          </button>
        </form>

        <div className="text-center mt-8 space-y-3 text-sm font-medium text-slate-500 dark:text-slate-300">
          <p>
            Already a member?{' '}
            <Link to="/login" className="text-primary-600 dark:text-teal-400 font-bold hover:underline">
              Log in
            </Link>
          </p>
          <p>
            <a
              href={import.meta.env.VITE_PORTAL_HUB_URL || 'http://localhost:8080'}
              className="text-xs font-semibold text-slate-400 hover:text-teal-400"
            >
              ← Choose patient or doctor
            </a>
          </p>
        </div>
      </motion.div>
    </div>
  );
};

export default Signup;