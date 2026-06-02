import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { KeyRound, Loader2, Mail, Lock, ArrowLeft } from 'lucide-react';
import ThemeToggle from '../../components/ui/ThemeToggle';

const API = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? '/api' : 'http://localhost:5001/api');

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const presetToken = searchParams.get('token') || '';

  const [step, setStep] = useState(presetToken ? 'reset' : 'request');
  const [email, setEmail] = useState('');
  const [token, setToken] = useState(presetToken);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const requestCode = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);
    try {
      const res = await fetch(`${API}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Request failed');
      setMessage(data.message);
      if (data.resetToken) {
        setResetCode(data.resetToken);
        setToken(data.resetToken);
      }
      setStep('reset');
    } catch (err) {
      setError(err.message || 'Could not send reset code.');
    } finally {
      setLoading(false);
    }
  };

  const submitReset = async (e) => {
    e.preventDefault();
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Reset failed');
      setMessage(data.message || 'Password updated.');
      setTimeout(() => navigate('/login'), 1500);
    } catch (err) {
      setError(err.message || 'Reset failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-[var(--practo-bg)] p-6">
      <div className="absolute top-4 right-4">
        <ThemeToggle size="sm" />
      </div>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md rounded-2xl border border-[var(--practo-border)] bg-[var(--practo-white)] p-8 shadow-lg"
      >
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-teal-500/15 text-[#0d9488]">
            <KeyRound size={24} />
          </div>
          <h1 className="text-xl font-bold text-[var(--practo-text)]">
            {step === 'request' ? 'Forgot password' : 'Set new password'}
          </h1>
          <p className="mt-1 text-sm text-[var(--practo-text-light)]">DocConnect practitioner account</p>
        </div>

        {error ? (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-600 dark:text-red-300">
            {error}
          </p>
        ) : null}
        {message ? (
          <p className="mb-4 rounded-lg border border-teal-200 bg-teal-50 dark:bg-teal-950/40 px-3 py-2 text-sm text-teal-900 dark:text-teal-100">
            {message}
          </p>
        ) : null}

        {step === 'request' ? (
          <form onSubmit={requestCode} className="space-y-4">
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email address"
                className="input-field !h-12 !pl-10"
              />
            </div>
            <button type="submit" disabled={loading} className="w-full btn btn-primary py-3">
              {loading ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : 'Send reset code'}
            </button>
          </form>
        ) : (
          <form onSubmit={submitReset} className="space-y-4">
            {resetCode ? (
              <p className="text-center text-xs font-mono font-bold text-[#0d9488] tracking-widest">
                Your code: {resetCode}
              </p>
            ) : null}
            <input
              type="text"
              required
              value={token}
              onChange={(e) => setToken(e.target.value.toUpperCase())}
              placeholder="Reset code"
              className="input-field !h-12 text-center font-mono tracking-widest"
            />
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="New password"
                className="input-field !h-12 !pl-10"
              />
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                type="password"
                required
                minLength={6}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Confirm password"
                className="input-field !h-12 !pl-10"
              />
            </div>
            <button type="submit" disabled={loading} className="w-full btn btn-primary py-3">
              {loading ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : 'Update password'}
            </button>
          </form>
        )}

        <div className="mt-6 flex flex-col items-center gap-2 text-sm">
          <Link to="/login" className="inline-flex items-center gap-1 font-semibold text-[#0d9488] hover:underline">
            <ArrowLeft size={14} /> Back to login
          </Link>
          <a
            href={import.meta.env.VITE_PORTAL_HUB_URL || 'http://localhost:8080'}
            className="text-xs text-[var(--practo-text-light)] hover:underline"
          >
            Choose patient or doctor
          </a>
        </div>
      </motion.div>
    </div>
  );
}
