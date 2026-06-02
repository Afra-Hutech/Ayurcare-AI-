import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Droplets, Flame, Wind, Leaf, Brain, AlertTriangle,
  ChevronRight, RefreshCw, Loader2, Play, Pause, RotateCcw,
  Sun, Moon, Salad, Timer, Sparkles, TrendingUp,
} from 'lucide-react';
import { patientApi } from '../../services/api';
import { chatApi } from '../../services/api';

const CHAT_BASE = import.meta.env.VITE_CHAT_API_URL || 'http://127.0.0.1:5002';

async function fetchWellnessInsights(payload) {
  const token = localStorage.getItem('token');
  const res = await fetch(`${CHAT_BASE}/api/wellness-feed/insights`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`AI service error ${res.status}`);
  return res.json();
}

function BreathingTimer({ exercise }) {
  const [phase, setPhase] = useState('idle'); // idle | running | paused
  const [stepIdx, setStepIdx] = useState(0);
  const [countdown, setCountdown] = useState(4);
  const intervalRef = useRef(null);

  const steps = exercise?.steps || [];
  const STEP_SECS = 4;

  const stop = useCallback(() => {
    clearInterval(intervalRef.current);
    setPhase('idle');
    setStepIdx(0);
    setCountdown(STEP_SECS);
  }, []);

  const start = useCallback(() => {
    setPhase('running');
    setStepIdx(0);
    setCountdown(STEP_SECS);
    intervalRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          setStepIdx((s) => {
            if (s + 1 >= steps.length) {
              clearInterval(intervalRef.current);
              setPhase('idle');
              return 0;
            }
            return s + 1;
          });
          return STEP_SECS;
        }
        return c - 1;
      });
    }, 1000);
  }, [steps.length]);

  const toggle = () => {
    if (phase === 'idle') start();
    else if (phase === 'running') { clearInterval(intervalRef.current); setPhase('paused'); }
    else { start(); }
  };

  useEffect(() => () => clearInterval(intervalRef.current), []);

  const progress = phase !== 'idle' ? ((STEP_SECS - countdown) / STEP_SECS) * 100 : 0;

  return (
    <div className="space-y-4">
      <div className="relative flex items-center justify-center">
        <svg className="w-28 h-28 -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="44" fill="none" stroke="currentColor" strokeWidth="6" className="text-indigo-100 dark:text-indigo-900/50" />
          <circle
            cx="50" cy="50" r="44" fill="none" stroke="currentColor" strokeWidth="6"
            strokeDasharray={`${2 * Math.PI * 44}`}
            strokeDashoffset={`${2 * Math.PI * 44 * (1 - progress / 100)}`}
            strokeLinecap="round"
            className="text-indigo-500 transition-all duration-1000"
          />
        </svg>
        <div className="absolute text-center">
          <div className="text-2xl font-black text-indigo-700 dark:text-indigo-300">{phase !== 'idle' ? countdown : '–'}</div>
          <div className="text-[9px] font-bold uppercase tracking-widest text-indigo-400">secs</div>
        </div>
      </div>
      {phase !== 'idle' && steps[stepIdx] && (
        <p className="text-center text-sm font-semibold text-slate-700 dark:text-slate-200 bg-indigo-50 dark:bg-indigo-950/40 rounded-xl px-4 py-2">
          {steps[stepIdx]}
        </p>
      )}
      <div className="flex gap-2 justify-center">
        <button onClick={toggle} className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white transition ${phase === 'running' ? 'bg-amber-500 hover:bg-amber-600' : 'bg-indigo-600 hover:bg-indigo-700'}`}>
          {phase === 'running' ? <><Pause size={14} /> Pause</> : phase === 'paused' ? <><Play size={14} /> Resume</> : <><Play size={14} /> Start</>}
        </button>
        {phase !== 'idle' && (
          <button onClick={stop} className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800">
            <RotateCcw size={14} className="text-slate-500" />
          </button>
        )}
      </div>
    </div>
  );
}

function MeditationTimer({ meditation }) {
  const totalSecs = parseInt(meditation?.duration || '5') * 60;
  const [remaining, setRemaining] = useState(totalSecs);
  const [running, setRunning] = useState(false);
  const ref = useRef(null);

  const toggle = () => {
    if (running) { clearInterval(ref.current); setRunning(false); }
    else {
      if (remaining <= 0) setRemaining(totalSecs);
      setRunning(true);
      ref.current = setInterval(() => {
        setRemaining((r) => {
          if (r <= 1) { clearInterval(ref.current); setRunning(false); return 0; }
          return r - 1;
        });
      }, 1000);
    }
  };

  const reset = () => { clearInterval(ref.current); setRunning(false); setRemaining(totalSecs); };
  useEffect(() => () => clearInterval(ref.current), []);

  const pct = ((totalSecs - remaining) / totalSecs) * 100;
  const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
  const ss = String(remaining % 60).padStart(2, '0');

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-2xl font-black text-emerald-700 dark:text-emerald-300 tabular-nums">{mm}:{ss}</div>
        <div className="flex gap-2">
          <button onClick={toggle} className={`p-2 rounded-xl text-white text-sm font-bold transition ${running ? 'bg-amber-500 hover:bg-amber-600' : 'bg-emerald-600 hover:bg-emerald-700'}`}>
            {running ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <button onClick={reset} className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800">
            <RotateCcw size={14} className="text-slate-500" />
          </button>
        </div>
      </div>
      <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
        <div className="h-full bg-emerald-500 rounded-full transition-all duration-1000" style={{ width: `${pct}%` }} />
      </div>
      {meditation?.mantra && (
        <p className="text-center text-xs font-semibold text-emerald-700 dark:text-emerald-400 italic">"{meditation.mantra}"</p>
      )}
    </div>
  );
}

const RISK_COLOR = { Low: 'emerald', Moderate: 'amber', High: 'rose' };
const DOSHA_COLOR = { Balanced: 'emerald', 'Slightly Imbalanced': 'amber', Imbalanced: 'rose' };

export default function WellnessFeed() {
  const [insights, setInsights] = useState(null);
  const [wellness, setWellness] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hydration, setHydration] = useState(0);
  const [saving, setSaving] = useState(false);

  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [wellnessRes] = await Promise.all([patientApi.getWellnessToday()]);
      const w = wellnessRes.data || {};
      setWellness(w);
      setHydration(w.hydrationGlasses || 0);

      const userRaw = localStorage.getItem('user');
      const user = userRaw ? JSON.parse(userRaw) : {};
      const prakriti = user.prakritiProfile || {};
      const dosha = prakriti.constitution || prakriti.dominant || null;

      const data = await fetchWellnessInsights({
        dosha,
        wellness: w,
        profile: { age: user.age, gender: user.gender },
      });
      setInsights(data);
    } catch (err) {
      setError(err.message || 'Could not load wellness feed. Make sure bot-brain is running on port 5002.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const addGlass = async () => {
    const next = Math.min(hydration + 1, 20);
    setHydration(next);
    setSaving(true);
    try { await patientApi.upsertWellnessToday({ hydrationGlasses: next }); } catch { /* non-critical */ }
    finally { setSaving(false); }
  };

  const removeGlass = async () => {
    const next = Math.max(hydration - 1, 0);
    setHydration(next);
    try { await patientApi.upsertWellnessToday({ hydrationGlasses: next }); } catch { /* non-critical */ }
  };

  if (loading) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center space-y-3">
        <Loader2 size={32} className="animate-spin text-emerald-500 mx-auto" />
        <p className="text-sm text-slate-500 dark:text-slate-400">Generating your personalized wellness feed…</p>
      </div>
    </div>
  );

  const stressColor = RISK_COLOR[insights?.stress_alert?.level] || 'slate';
  const doshaColor = DOSHA_COLOR[insights?.dosha_status?.balance] || 'emerald';
  const hydGoal = insights?.hydration?.goal || 8;
  const hydPct = Math.min((hydration / hydGoal) * 100, 100);

  return (
    <div className="flex-1 overflow-y-auto bg-[var(--practo-bg)]">
      <div className="max-w-4xl mx-auto px-4 py-6 sm:px-8 sm:py-8 space-y-5">

        {/* Header */}
        <header className="pb-4 border-b border-[var(--practo-border)]">
          <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600 mb-1">Daily Feed</p>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-50 tracking-tight">Wellness Feed</h1>
              <p className="text-sm text-[var(--practo-text-light)] mt-0.5">{today}</p>
            </div>
            <button onClick={load} className="p-2 rounded-xl border border-[var(--practo-border)] hover:bg-white dark:hover:bg-slate-800 transition">
              <RefreshCw size={15} className="text-slate-400" />
            </button>
          </div>
          {insights?.greeting && (
            <p className="mt-2 text-sm font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl px-4 py-2">{insights.greeting}</p>
          )}
        </header>

        {error && (
          <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-4 py-3 text-sm text-amber-900 dark:text-amber-200 flex items-start gap-2">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <div>{error}</div>
          </div>
        )}

        {/* Stress alert */}
        {insights?.stress_alert?.show && (
          <div className={`rounded-xl border border-${stressColor}-200 dark:border-${stressColor}-800 bg-${stressColor}-50 dark:bg-${stressColor}-950/40 px-4 py-3 flex items-start gap-3`}>
            <AlertTriangle size={18} className={`text-${stressColor}-600 dark:text-${stressColor}-400 shrink-0 mt-0.5`} />
            <div>
              <p className={`text-xs font-bold uppercase tracking-widest text-${stressColor}-700 dark:text-${stressColor}-400 mb-0.5`}>
                Stress — {insights.stress_alert.level}
              </p>
              <p className="text-sm text-slate-700 dark:text-slate-300">{insights.stress_alert.message}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* Dosha Status */}
          <div className={`rounded-2xl border border-${doshaColor}-200 dark:border-${doshaColor}-800 bg-${doshaColor}-50 dark:bg-${doshaColor}-950/30 p-5`}>
            <div className="flex items-center gap-2 mb-3">
              <div className={`w-8 h-8 rounded-xl bg-${doshaColor}-100 dark:bg-${doshaColor}-900/60 flex items-center justify-center`}>
                <Leaf size={16} className={`text-${doshaColor}-600 dark:text-${doshaColor}-400`} />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Dosha Today</p>
                <p className={`text-xs font-bold text-${doshaColor}-700 dark:text-${doshaColor}-400`}>
                  {insights?.dosha_status?.balance || 'Balanced'}
                </p>
              </div>
            </div>
            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
              {insights?.dosha_status?.message || 'Your constitution is in harmony today.'}
            </p>
            <Link to="/dosha-assessment" className={`inline-flex items-center gap-1 mt-3 text-[11px] font-bold text-${doshaColor}-700 dark:text-${doshaColor}-400 hover:underline`}>
              View constitution map <ChevronRight size={12} />
            </Link>
          </div>

          {/* Hydration Tracker */}
          <div className="rounded-2xl border border-[var(--practo-border)] bg-white dark:bg-[var(--practo-white)] p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-900/40 flex items-center justify-center">
                <Droplets size={16} className="text-blue-500" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Hydration</p>
                <p className="text-xs font-bold text-blue-600 dark:text-blue-400">{hydration} / {hydGoal} glasses</p>
              </div>
            </div>
            <div className="h-2.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden mb-3">
              <div className="h-full bg-blue-400 rounded-full transition-all duration-500" style={{ width: `${hydPct}%` }} />
            </div>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {Array.from({ length: Math.max(hydGoal, hydration) }).map((_, i) => (
                <div key={i} className={`w-5 h-5 rounded-md transition-all ${i < hydration ? 'bg-blue-400 dark:bg-blue-500' : 'bg-slate-100 dark:bg-slate-700'}`} />
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={addGlass} disabled={saving} className="flex-1 py-2 rounded-xl bg-blue-500 text-white text-xs font-bold hover:bg-blue-600 transition disabled:opacity-50">
                + Glass
              </button>
              <button onClick={removeGlass} disabled={hydration === 0} className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-30">
                −
              </button>
            </div>
            {insights?.hydration?.reminder && (
              <p className="text-[11px] text-blue-600 dark:text-blue-400 mt-2">{insights.hydration.reminder}</p>
            )}
          </div>

          {/* Breathing Exercise */}
          <div className="rounded-2xl border border-[var(--practo-border)] bg-white dark:bg-[var(--practo-white)] p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-900/40 flex items-center justify-center">
                <Wind size={16} className="text-indigo-500" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Breathing</p>
                <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
                  {insights?.breathing_exercise?.name || 'Pranayama'}
                  <span className="ml-1.5 text-[10px] font-bold text-indigo-500 bg-indigo-50 dark:bg-indigo-900/40 rounded-md px-1.5 py-0.5">
                    {insights?.breathing_exercise?.duration}
                  </span>
                </p>
              </div>
            </div>
            {insights?.breathing_exercise ? (
              <BreathingTimer exercise={insights.breathing_exercise} />
            ) : (
              <p className="text-sm text-slate-500">Loading exercise…</p>
            )}
            {insights?.breathing_exercise?.benefit && (
              <p className="text-[11px] text-indigo-600 dark:text-indigo-400 mt-3">{insights.breathing_exercise.benefit}</p>
            )}
          </div>

          {/* Meditation */}
          <div className="rounded-2xl border border-[var(--practo-border)] bg-white dark:bg-[var(--practo-white)] p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-900/40 flex items-center justify-center">
                <Brain size={16} className="text-emerald-600" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Meditation</p>
                <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
                  {insights?.meditation?.type || 'Mindfulness'}
                  <span className="ml-1.5 text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-900/40 rounded-md px-1.5 py-0.5">
                    {insights?.meditation?.duration}
                  </span>
                </p>
              </div>
            </div>
            {insights?.meditation ? (
              <MeditationTimer meditation={insights.meditation} />
            ) : (
              <p className="text-sm text-slate-500">Loading…</p>
            )}
            {insights?.meditation?.focus && (
              <p className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-3">Focus: {insights.meditation.focus}</p>
            )}
          </div>
        </div>

        {/* Food Suggestions */}
        {insights?.food_suggestions && (
          <div className="rounded-2xl border border-[var(--practo-border)] bg-white dark:bg-[var(--practo-white)] p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-900/40 flex items-center justify-center">
                <Salad size={16} className="text-amber-600" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Food Today</p>
                <p className="text-sm font-bold text-slate-800 dark:text-slate-100">Dosha-aligned suggestions</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-xl bg-amber-50/60 dark:bg-amber-950/30 p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <Sun size={12} className="text-amber-500" />
                  <span className="text-[10px] font-black uppercase tracking-wider text-amber-700 dark:text-amber-400">Morning</span>
                </div>
                <ul className="space-y-1">
                  {(insights.food_suggestions.morning || []).map((f, i) => (
                    <li key={i} className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1">
                      <span className="w-1 h-1 bg-amber-400 rounded-full shrink-0" />{f}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-xl bg-emerald-50/60 dark:bg-emerald-950/30 p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <TrendingUp size={12} className="text-emerald-500" />
                  <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Afternoon</span>
                </div>
                <ul className="space-y-1">
                  {(insights.food_suggestions.afternoon || []).map((f, i) => (
                    <li key={i} className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1">
                      <span className="w-1 h-1 bg-emerald-400 rounded-full shrink-0" />{f}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-xl bg-rose-50/60 dark:bg-rose-950/30 p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <Flame size={12} className="text-rose-500" />
                  <span className="text-[10px] font-black uppercase tracking-wider text-rose-600 dark:text-rose-400">Avoid Today</span>
                </div>
                <ul className="space-y-1">
                  {(insights.food_suggestions.avoid_today || []).map((f, i) => (
                    <li key={i} className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1">
                      <span className="w-1 h-1 bg-rose-400 rounded-full shrink-0" />{f}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            {insights.food_suggestions.note && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-3 italic">{insights.food_suggestions.note}</p>
            )}
          </div>
        )}

        {/* Daily Tip */}
        {insights?.daily_tip && (
          <div className="rounded-2xl border border-[var(--practo-border)] bg-gradient-to-r from-[#28328c]/5 to-emerald-500/5 dark:from-indigo-950/40 dark:to-emerald-950/40 p-5 flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-[#28328c]/10 dark:bg-indigo-900/60 flex items-center justify-center shrink-0">
              <Sparkles size={16} className="text-[#28328c] dark:text-indigo-300" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-[#28328c] dark:text-indigo-400 mb-1">Today's Tip</p>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{insights.daily_tip}</p>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-3 justify-center text-xs font-semibold pt-2">
          <Link to="/meal-planner" className="text-[#14bef0] hover:underline">AI Meal Planner →</Link>
          <Link to="/dosha-assessment" className="text-[var(--practo-text-light)] hover:underline">Constitution map →</Link>
          <Link to="/ayurvedic-guide" className="text-[var(--practo-text-light)] hover:underline">Ayurvedic guide →</Link>
        </div>
      </div>
    </div>
  );
}
