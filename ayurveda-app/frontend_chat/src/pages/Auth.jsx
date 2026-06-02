import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import axios from 'axios';
import { persistPatientUser } from '../utils/patientUser';
import { motion } from 'framer-motion';
import { Loader2, LogIn, UserPlus, Leaf, Mail, Lock, User } from 'lucide-react';
import ThemeToggle from '../components/ui/ThemeToggle';

const Auth = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const isLogin = location.pathname === '/login';
  const existingToken = localStorage.getItem('token');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    const authBase = ''; // use Vite proxy → doctor API (Postgres)
    const endpoint = isLogin ? '/api/patient/login' : '/api/patient/signup';
    try {
      const payload = isLogin ? { email, password } : { email, password, name };
      const response = await axios.post(`${authBase}${endpoint}`, payload);

      const { token, user } = response.data;
      localStorage.setItem('token', token);
      persistPatientUser(user);

      // Redirect based on whether it's a new patient
      if (user?.isNewPatient) {
        navigate('/dosha-assessment');
      } else {
        navigate('/');
      }
    } catch (err) {
      const backendError = err.response?.data?.detail;
      if (backendError === "Email already registered") {
        setError(
          <div className="flex flex-col gap-2">
            <span>This email is already registered.</span>
            <button 
              type="button"
              onClick={() => navigate('/login')}
              className="text-emerald-600 font-bold hover:underline text-left"
            >
              Click here to Login instead →
            </button>
          </div>
        );
      } else if (err.response?.status === 503) {
        setError(
          backendError || 'Service temporarily unavailable. Please ensure the server is running on port 5001.',
        );
      } else if (err.response?.status === 401) {
        setError(backendError || 'Invalid email or password.');
      } else {
        setError(backendError || err.response?.data?.message || 'Authentication failed. Please check your credentials.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <motion.div className="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-50 to-white dark:from-[#0b1018] dark:to-[#121a28] p-6">
      <motion.div className="absolute top-4 right-4 z-50">
        <ThemeToggle size="sm" />
      </motion.div>
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md space-y-8 rounded-3xl border border-white/50 dark:border-slate-700 bg-white/80 dark:bg-slate-900/90 p-10 shadow-2xl backdrop-blur-xl"
      >
        <div className="text-center">
          <motion.div 
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 shadow-inner"
          >
            <Leaf className="h-8 w-8" />
          </motion.div>
          <h2 className="mt-6 text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-50">
            {isLogin ? 'Welcome Back' : 'Join AyurCare'}
          </h2>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            {isLogin ? 'Sign in to continue your wellness journey' : 'Start your personalized Ayurvedic journey today'}
          </p>
        </div>

        {existingToken && isLogin ? (
          <div className="rounded-xl border border-[#14bef0]/30 bg-[#14bef0]/10 px-4 py-3 text-sm text-slate-700 dark:text-slate-200">
            <p className="font-semibold">You are already signed in.</p>
            <div className="mt-2 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => navigate('/')}
                className="font-bold text-[#28328c] dark:text-[#14bef0] hover:underline"
              >
                Go to dashboard
              </button>
              <button
                type="button"
                onClick={() => {
                  localStorage.clear();
                  sessionStorage.clear();
                  window.location.reload();
                }}
                className="font-bold text-rose-600 dark:text-rose-400 hover:underline"
              >
                Log out & sign in again
              </button>
            </div>
          </div>
        ) : null}

        {error && (
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-3 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-600"
          >
            <div className="h-1.5 w-1.5 rounded-full bg-red-600" />
            {error}
          </motion.div>
        )}

        <form className="mt-6 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4 rounded-md shadow-sm">
            {!isLogin && (
              <div className="relative">
                <User className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="block w-full rounded-xl border border-slate-200 bg-slate-50/50 py-3 pl-10 pr-3 text-slate-900 placeholder-slate-400 transition-all focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  placeholder="Full Name"
                />
              </div>
            )}
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="block w-full rounded-xl border border-slate-200 bg-slate-50/50 py-3 pl-10 pr-3 text-slate-900 placeholder-slate-400 transition-all focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                placeholder="Email address"
              />
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="block w-full rounded-xl border border-slate-200 bg-slate-50/50 py-3 pl-10 pr-3 text-slate-900 placeholder-slate-400 transition-all focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                placeholder="Password"
              />
            </div>
          </div>

          {isLogin ? (
            <div className="text-right">
              <Link
                to="/forgot-password"
                className="text-sm font-semibold text-[#28328c] dark:text-[#14bef0] hover:underline"
              >
                Forgot password?
              </Link>
            </div>
          ) : null}

          <button
            type="submit"
            disabled={isLoading}
            className="group relative flex w-full justify-center rounded-xl bg-emerald-600 py-4 text-sm font-bold text-white transition-all hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:opacity-50"
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <div className="flex items-center gap-2">
                {isLogin ? <LogIn className="h-5 w-5" /> : <UserPlus className="h-5 w-5" /> }
                <span>{isLogin ? 'Sign In' : 'Create Account'}</span>
              </div>
            )}
          </button>
        </form>

        <div className="text-center text-sm space-y-3">
          <p className="font-medium text-slate-500 dark:text-slate-400">
            {isLogin ? "Don't have an account? " : "Already have an account? "}
            <Link
              to={isLogin ? '/signup' : '/login'}
              className="font-bold text-emerald-600 dark:text-emerald-400 hover:underline transition-all"
            >
              {isLogin ? 'Sign Up' : 'Log In'}
            </Link>
          </p>
          <p>
            <a
              href={import.meta.env.VITE_PORTAL_HUB_URL || 'http://localhost:8080'}
              className="text-xs font-semibold text-slate-400 dark:text-slate-500 hover:text-[#14bef0] dark:hover:text-cyan-400"
            >
              ← AyurCare & DocConnect portal
            </a>
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default Auth;