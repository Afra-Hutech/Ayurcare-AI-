import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Salad, Loader2, ChefHat, Clock, AlertTriangle, Sparkles,
  Leaf, Apple, Coffee, Sun, Sunset, Moon, RefreshCw, Info,
} from 'lucide-react';

const CHAT_BASE = import.meta.env.VITE_CHAT_API_URL || 'http://127.0.0.1:5002';

const DOSHAS = ['Vata', 'Pitta', 'Kapha', 'Vata-Pitta', 'Pitta-Kapha', 'Vata-Kapha', 'Tri-Dosha'];
const GOALS = ['Weight loss', 'Weight gain', 'Improve digestion', 'Boost energy', 'Reduce stress', 'Manage diabetes', 'General wellness'];

const MEAL_META = {
  breakfast: { label: 'Breakfast', icon: Coffee, color: 'amber' },
  midmorning_snack: { label: 'Mid-morning Snack', icon: Apple, color: 'orange' },
  lunch: { label: 'Lunch', icon: Sun, color: 'emerald' },
  evening_snack: { label: 'Evening Snack', icon: Sunset, color: 'violet' },
  dinner: { label: 'Dinner', icon: Moon, color: 'indigo' },
};

const COLOR_CLASSES = {
  amber: { bg: 'bg-amber-50 dark:bg-amber-950/30', border: 'border-amber-200 dark:border-amber-800', icon: 'bg-amber-100 dark:bg-amber-900/60', text: 'text-amber-700 dark:text-amber-400', badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300' },
  orange: { bg: 'bg-orange-50 dark:bg-orange-950/30', border: 'border-orange-200 dark:border-orange-800', icon: 'bg-orange-100 dark:bg-orange-900/60', text: 'text-orange-700 dark:text-orange-400', badge: 'bg-orange-100 text-orange-700 dark:bg-orange-900/60 dark:text-orange-300' },
  emerald: { bg: 'bg-emerald-50 dark:bg-emerald-950/30', border: 'border-emerald-200 dark:border-emerald-800', icon: 'bg-emerald-100 dark:bg-emerald-900/60', text: 'text-emerald-700 dark:text-emerald-400', badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300' },
  violet: { bg: 'bg-violet-50 dark:bg-violet-950/30', border: 'border-violet-200 dark:border-violet-800', icon: 'bg-violet-100 dark:bg-violet-900/60', text: 'text-violet-700 dark:text-violet-400', badge: 'bg-violet-100 text-violet-700 dark:bg-violet-900/60 dark:text-violet-300' },
  indigo: { bg: 'bg-indigo-50 dark:bg-indigo-950/30', border: 'border-indigo-200 dark:border-indigo-800', icon: 'bg-indigo-100 dark:bg-indigo-900/60', text: 'text-indigo-700 dark:text-indigo-400', badge: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300' },
};

function MealCard({ slot, meal }) {
  const meta = MEAL_META[slot];
  if (!meta || !meal) return null;
  const Icon = meta.icon;
  const c = COLOR_CLASSES[meta.color];
  return (
    <div className={`rounded-2xl border ${c.border} ${c.bg} p-4 space-y-3`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className={`w-8 h-8 rounded-xl ${c.icon} flex items-center justify-center shrink-0`}>
            <Icon size={15} className={c.text} />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">{meta.label}</p>
            <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{meal.name}</p>
          </div>
        </div>
        {meal.prep_time && (
          <span className={`text-[10px] font-bold rounded-lg px-2 py-1 ${c.badge} flex items-center gap-1 shrink-0`}>
            <Clock size={10} /> {meal.prep_time}
          </span>
        )}
      </div>
      {meal.description && <p className="text-xs text-slate-600 dark:text-slate-400">{meal.description}</p>}
      {Array.isArray(meal.ingredients) && meal.ingredients.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {meal.ingredients.map((ing, i) => (
            <span key={i} className="text-[11px] font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-0.5 text-slate-700 dark:text-slate-300">
              {ing}
            </span>
          ))}
        </div>
      )}
      {meal.benefits && (
        <p className={`text-[11px] font-medium ${c.text}`}>
          <Leaf size={10} className="inline mr-1" />{meal.benefits}
        </p>
      )}
      {meal.avoid_if && (
        <p className="text-[11px] text-slate-400 dark:text-slate-500 italic">Avoid if: {meal.avoid_if}</p>
      )}
    </div>
  );
}

function BMIBadge({ bmi, category }) {
  if (!bmi) return null;
  const color = category === 'Normal' ? 'emerald' : category === 'Underweight' ? 'blue' : category === 'Overweight' ? 'amber' : 'rose';
  const c = COLOR_CLASSES[color] || COLOR_CLASSES.emerald;
  return (
    <div className={`inline-flex items-center gap-2 rounded-xl border ${c.border} ${c.bg} px-3 py-2`}>
      <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">BMI</span>
      <span className={`text-base font-black ${c.text}`}>{bmi}</span>
      <span className={`text-[10px] font-bold rounded-md px-1.5 py-0.5 ${c.badge}`}>{category}</span>
    </div>
  );
}

export default function MealPlanner() {
  const user = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } })();
  const prakriti = user.prakritiProfile || {};

  const [form, setForm] = useState({
    dosha: prakriti.constitution || prakriti.dominant || '',
    height: user.height || '',
    weight: user.weight || '',
    allergies: '',
    goals: '',
    preferences: '',
  });
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${CHAT_BASE}/api/meal-planner/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setPlan(data);
    } catch (err) {
      setError(err.message || 'Could not generate meal plan. Make sure bot-brain is running on port 5002.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[var(--practo-bg)]">
      <div className="max-w-4xl mx-auto px-4 py-6 sm:px-8 sm:py-8 space-y-5">

        <header className="pb-4 border-b border-[var(--practo-border)]">
          <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600 mb-1">AI-Powered</p>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-50 tracking-tight">Ayurvedic Meal Planner</h1>
          <p className="text-sm text-[var(--practo-text-light)] mt-1">Generate a personalised daily meal plan based on your dosha, BMI, and health goals.</p>
        </header>

        {/* Form */}
        <div className="rounded-2xl border border-[var(--practo-border)] bg-white dark:bg-[var(--practo-white)] p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <ChefHat size={16} className="text-emerald-600" />
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">Your Profile</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Dosha (Prakriti)</label>
              <select value={form.dosha} onChange={(e) => set('dosha', e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-medium text-slate-800 dark:text-slate-200 outline-none focus:border-emerald-500">
                <option value="">Select dosha…</option>
                {DOSHAS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Health Goal</label>
              <select value={form.goals} onChange={(e) => set('goals', e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-medium text-slate-800 dark:text-slate-200 outline-none focus:border-emerald-500">
                <option value="">Select goal…</option>
                {GOALS.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Height (e.g. 170 cm)</label>
              <input value={form.height} onChange={(e) => set('height', e.target.value)} placeholder="e.g. 170 cm"
                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-medium text-slate-800 dark:text-slate-200 outline-none focus:border-emerald-500" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Weight (e.g. 70 kg)</label>
              <input value={form.weight} onChange={(e) => set('weight', e.target.value)} placeholder="e.g. 70 kg"
                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-medium text-slate-800 dark:text-slate-200 outline-none focus:border-emerald-500" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Allergies / Restrictions</label>
              <input value={form.allergies} onChange={(e) => set('allergies', e.target.value)} placeholder="e.g. dairy-free, nut allergy"
                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-medium text-slate-800 dark:text-slate-200 outline-none focus:border-emerald-500" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Preferences</label>
              <input value={form.preferences} onChange={(e) => set('preferences', e.target.value)} placeholder="e.g. vegetarian, no spicy"
                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-medium text-slate-800 dark:text-slate-200 outline-none focus:border-emerald-500" />
            </div>
          </div>

          <button onClick={generate} disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#28328c] dark:bg-indigo-600 text-white text-sm font-bold hover:bg-[#1f2770] dark:hover:bg-indigo-700 transition disabled:opacity-60">
            {loading ? <><Loader2 size={16} className="animate-spin" /> Generating…</> : <><Sparkles size={16} /> Generate My Meal Plan</>}
          </button>
        </div>

        {error && (
          <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-4 py-3 text-sm text-amber-900 dark:text-amber-200 flex items-start gap-2">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        {plan && !plan.error && (
          <div className="space-y-4">
            {/* BMI + Dosha note */}
            <div className="flex flex-wrap items-start gap-4">
              {plan.bmi && <BMIBadge bmi={plan.bmi} category={plan.bmi_category} />}
              {plan.dosha_note && (
                <div className="flex-1 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-2.5 flex items-start gap-2">
                  <Info size={14} className="text-emerald-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-emerald-800 dark:text-emerald-300">{plan.dosha_note}</p>
                </div>
              )}
            </div>

            {/* Meal cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {Object.entries(MEAL_META).map(([slot]) => (
                plan.meals?.[slot] ? <MealCard key={slot} slot={slot} meal={plan.meals[slot]} /> : null
              ))}
            </div>

            {/* Favor / Avoid + Hydration */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {Array.isArray(plan.foods_to_favor) && plan.foods_to_favor.length > 0 && (
                <div className="rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-400 mb-2">Foods to Favour</p>
                  <div className="flex flex-wrap gap-1.5">
                    {plan.foods_to_favor.map((f, i) => (
                      <span key={i} className="text-[11px] font-medium bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 rounded-md px-2 py-0.5">{f}</span>
                    ))}
                  </div>
                </div>
              )}
              {Array.isArray(plan.foods_to_avoid) && plan.foods_to_avoid.length > 0 && (
                <div className="rounded-2xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-rose-600 dark:text-rose-400 mb-2">Foods to Avoid</p>
                  <div className="flex flex-wrap gap-1.5">
                    {plan.foods_to_avoid.map((f, i) => (
                      <span key={i} className="text-[11px] font-medium bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-200 rounded-md px-2 py-0.5">{f}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {plan.hydration && (
              <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 px-4 py-3 flex items-start gap-2">
                <Salad size={14} className="text-blue-500 shrink-0 mt-0.5" />
                <p className="text-xs text-blue-800 dark:text-blue-300">{plan.hydration}</p>
              </div>
            )}

            {plan.disclaimer && (
              <p className="text-[11px] text-slate-400 dark:text-slate-500 text-center italic">{plan.disclaimer}</p>
            )}

            <div className="flex justify-center">
              <button onClick={generate} disabled={loading} className="inline-flex items-center gap-1.5 text-xs font-bold text-[#28328c] dark:text-indigo-400 hover:underline">
                <RefreshCw size={12} /> Regenerate plan
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-3 justify-center text-xs font-semibold pt-1">
          <Link to="/dosha-assessment" className="text-[var(--practo-text-light)] hover:underline">Take dosha quiz →</Link>
          <Link to="/medicine-checker" className="text-[var(--practo-text-light)] hover:underline">Medicine checker →</Link>
        </div>
      </div>
    </div>
  );
}
