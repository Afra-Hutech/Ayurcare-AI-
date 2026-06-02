import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Pill, Plus, X, Loader2, AlertTriangle, CheckCircle2, ShieldAlert,
  Shield, Clock, Info, Sparkles, ChevronDown, ChevronUp,
} from 'lucide-react';

const CHAT_BASE = import.meta.env.VITE_CHAT_API_URL || 'http://127.0.0.1:5002';

const RISK_META = {
  Low:      { icon: Shield,      bg: 'bg-emerald-50 dark:bg-emerald-950/30', border: 'border-emerald-200 dark:border-emerald-800', text: 'text-emerald-700 dark:text-emerald-400', badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300', label: 'Low Risk' },
  Moderate: { icon: ShieldAlert,  bg: 'bg-amber-50 dark:bg-amber-950/30',   border: 'border-amber-200 dark:border-amber-800',   text: 'text-amber-700 dark:text-amber-400',   badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300',   label: 'Moderate Risk' },
  High:     { icon: AlertTriangle, bg: 'bg-rose-50 dark:bg-rose-950/30',    border: 'border-rose-200 dark:border-rose-800',     text: 'text-rose-700 dark:text-rose-400',     badge: 'bg-rose-100 text-rose-700 dark:bg-rose-900/60 dark:text-rose-300',     label: 'High Risk' },
};

const SEV_COLOR = {
  Mild:     'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800',
  Moderate: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800',
  Severe:   'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800',
};

const TYPE_COLOR = {
  Potential:  'text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/60',
  Confirmed:  'text-rose-700 dark:text-rose-400 bg-rose-100 dark:bg-rose-900/60',
  Beneficial: 'text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/60',
};

function TagInput({ label, placeholder, items, onAdd, onRemove, color = 'indigo' }) {
  const [val, setVal] = useState('');
  const colorMap = {
    indigo: 'bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-700',
    emerald: 'bg-emerald-50 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700',
  };
  const add = () => {
    const t = val.trim();
    if (t) { onAdd(t); setVal(''); }
  };
  return (
    <div className="space-y-2">
      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</label>
      <div className="flex gap-2">
        <input
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())}
          placeholder={placeholder}
          className="flex-1 px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-medium text-slate-800 dark:text-slate-200 outline-none focus:border-indigo-500"
        />
        <button type="button" onClick={add} className="px-3 py-2.5 rounded-lg bg-[#28328c] dark:bg-indigo-600 text-white text-xs font-bold hover:bg-[#1f2770] transition">
          <Plus size={14} />
        </button>
      </div>
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {items.map((item, i) => (
            <span key={i} className={`inline-flex items-center gap-1 text-xs font-semibold border rounded-lg px-2.5 py-1 ${colorMap[color]}`}>
              {item}
              <button type="button" onClick={() => onRemove(i)} className="hover:opacity-70">
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function InteractionCard({ interaction }) {
  const [open, setOpen] = useState(false);
  const sevClass = SEV_COLOR[interaction.severity] || SEV_COLOR.Mild;
  const typeClass = TYPE_COLOR[interaction.type] || 'text-slate-600 bg-slate-100';
  return (
    <div className={`rounded-xl border ${sevClass} p-4 space-y-2`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-100">{interaction.medicine1}</span>
            <span className="text-slate-400 text-xs">↔</span>
            <span className="text-xs font-bold text-slate-800 dark:text-slate-100">{interaction.medicine2}</span>
          </div>
          <div className="flex gap-1.5 mt-1.5 flex-wrap">
            <span className={`text-[10px] font-bold rounded-md px-1.5 py-0.5 ${typeClass}`}>{interaction.type}</span>
            <span className={`text-[10px] font-bold rounded-md px-1.5 py-0.5 border ${sevClass}`}>{interaction.severity}</span>
          </div>
        </div>
        <button type="button" onClick={() => setOpen((o) => !o)} className="text-slate-400 hover:text-slate-600 p-1">
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>
      {open && (
        <div className="space-y-2 pt-1 border-t border-current/10">
          {interaction.description && <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">{interaction.description}</p>}
          {interaction.recommendation && (
            <div className="flex items-start gap-1.5">
              <Info size={12} className="text-slate-400 shrink-0 mt-0.5" />
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">{interaction.recommendation}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function MedicineChecker() {
  const [ayurvedic, setAyurvedic] = useState([]);
  const [allopathic, setAllopathic] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const addAy = (v) => setAyurvedic((a) => [...a, v]);
  const rmAy = (i) => setAyurvedic((a) => a.filter((_, idx) => idx !== i));
  const addAl = (v) => setAllopathic((a) => [...a, v]);
  const rmAl = (i) => setAllopathic((a) => a.filter((_, idx) => idx !== i));

  const check = async () => {
    if (!ayurvedic.length && !allopathic.length) { setError('Add at least one medicine to check.'); return; }
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${CHAT_BASE}/api/medicine-checker/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ ayurvedic_medicines: ayurvedic, allopathic_medicines: allopathic }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResult(data);
    } catch (err) {
      setError(err.message || 'Could not check interactions. Make sure bot-brain is running on port 5002.');
    } finally {
      setLoading(false);
    }
  };

  const risk = result?.overall_risk || 'Low';
  const riskMeta = RISK_META[risk] || RISK_META.Low;
  const RiskIcon = riskMeta.icon;

  return (
    <div className="flex-1 overflow-y-auto bg-[var(--practo-bg)]">
      <div className="max-w-3xl mx-auto px-4 py-6 sm:px-8 sm:py-8 space-y-5">

        <header className="pb-4 border-b border-[var(--practo-border)]">
          <p className="text-[10px] font-black uppercase tracking-widest text-indigo-600 mb-1">Safety Check</p>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-50 tracking-tight">Medicine Interaction Checker</h1>
          <p className="text-sm text-[var(--practo-text-light)] mt-1">Enter your Ayurvedic and allopathic medicines to detect potential interactions.</p>
        </header>

        {/* Input Panel */}
        <div className="rounded-2xl border border-[var(--practo-border)] bg-white dark:bg-[var(--practo-white)] p-5 space-y-5">
          <div className="flex items-center gap-2">
            <Pill size={16} className="text-indigo-600" />
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">Enter Medicines</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="space-y-3 rounded-xl border border-indigo-100 dark:border-indigo-900/60 bg-indigo-50/40 dark:bg-indigo-950/20 p-4">
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-indigo-700 dark:text-indigo-400 mb-0.5">Ayurvedic Medicines</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">e.g. Ashwagandha, Triphala, Brahmi</p>
              </div>
              <TagInput label="" placeholder="Type and press Enter…" items={ayurvedic} onAdd={addAy} onRemove={rmAy} color="indigo" />
            </div>
            <div className="space-y-3 rounded-xl border border-emerald-100 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-emerald-950/20 p-4">
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-400 mb-0.5">Allopathic Medicines</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">e.g. Metformin, Aspirin, Atorvastatin</p>
              </div>
              <TagInput label="" placeholder="Type and press Enter…" items={allopathic} onAdd={addAl} onRemove={rmAl} color="emerald" />
            </div>
          </div>

          <button onClick={check} disabled={loading || (!ayurvedic.length && !allopathic.length)}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#28328c] dark:bg-indigo-600 text-white text-sm font-bold hover:bg-[#1f2770] dark:hover:bg-indigo-700 transition disabled:opacity-50">
            {loading ? <><Loader2 size={16} className="animate-spin" /> Analysing…</> : <><Sparkles size={16} /> Check Interactions</>}
          </button>
        </div>

        {error && (
          <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-4 py-3 text-sm text-amber-900 dark:text-amber-200 flex items-start gap-2">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        {result && !result.error && (
          <div className="space-y-4">

            {/* Overall Risk */}
            <div className={`rounded-2xl border ${riskMeta.border} ${riskMeta.bg} p-5 flex items-start gap-4`}>
              <div className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800/60 flex items-center justify-center shrink-0 shadow-sm">
                <RiskIcon size={20} className={riskMeta.text} />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[10px] font-black uppercase tracking-widest ${riskMeta.text}`}>Overall Risk</span>
                  <span className={`text-xs font-bold rounded-lg px-2 py-0.5 ${riskMeta.badge}`}>{riskMeta.label}</span>
                </div>
                {result.summary && <p className="text-sm text-slate-700 dark:text-slate-300 mt-1 leading-relaxed">{result.summary}</p>}
              </div>
            </div>

            {/* Consult doctor banner */}
            {result.consult_doctor && (
              <div className="rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 px-4 py-3 flex items-center gap-2">
                <AlertTriangle size={16} className="text-rose-600 dark:text-rose-400 shrink-0" />
                <p className="text-sm font-semibold text-rose-700 dark:text-rose-300">Please consult your doctor before taking these medicines together.</p>
              </div>
            )}

            {/* Interactions */}
            {Array.isArray(result.interactions) && result.interactions.length > 0 && (
              <div className="space-y-2.5">
                <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Interactions Found</h3>
                {result.interactions.map((interaction, i) => (
                  <InteractionCard key={i} interaction={interaction} />
                ))}
              </div>
            )}

            {Array.isArray(result.interactions) && result.interactions.length === 0 && (
              <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-3 flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">No significant interactions found between these medicines.</p>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Warnings */}
              {Array.isArray(result.warnings) && result.warnings.length > 0 && (
                <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-400 mb-2">Warnings</p>
                  <ul className="space-y-1.5">
                    {result.warnings.map((w, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-xs text-slate-700 dark:text-slate-300">
                        <AlertTriangle size={11} className="text-amber-500 shrink-0 mt-0.5" />{w}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Safe combos */}
              {Array.isArray(result.safe_combinations) && result.safe_combinations.length > 0 && (
                <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-400 mb-2">Safe Combinations</p>
                  <ul className="space-y-1.5">
                    {result.safe_combinations.map((s, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-xs text-slate-700 dark:text-slate-300">
                        <CheckCircle2 size={11} className="text-emerald-500 shrink-0 mt-0.5" />{s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Timing advice */}
            {result.timing_advice && (
              <div className="rounded-xl border border-[var(--practo-border)] bg-white dark:bg-[var(--practo-white)] px-4 py-3 flex items-start gap-2">
                <Clock size={14} className="text-slate-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-0.5">Timing Advice</p>
                  <p className="text-sm text-slate-700 dark:text-slate-300">{result.timing_advice}</p>
                </div>
              </div>
            )}

            {/* Foods to avoid */}
            {Array.isArray(result.foods_to_avoid) && result.foods_to_avoid.length > 0 && (
              <div className="rounded-xl border border-[var(--practo-border)] bg-white dark:bg-[var(--practo-white)] px-4 py-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Foods to Avoid While on These Medicines</p>
                <div className="flex flex-wrap gap-1.5">
                  {result.foods_to_avoid.map((f, i) => (
                    <span key={i} className="text-[11px] font-medium bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 rounded-md px-2 py-0.5">{f}</span>
                  ))}
                </div>
              </div>
            )}

            {result.disclaimer && (
              <p className="text-[11px] text-slate-400 dark:text-slate-500 text-center italic">{result.disclaimer}</p>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-3 justify-center text-xs font-semibold pt-1">
          <Link to="/meal-planner" className="text-[#14bef0] hover:underline">AI Meal Planner →</Link>
          <Link to="/prescriptions" className="text-[var(--practo-text-light)] hover:underline">My prescriptions →</Link>
          <Link to="/find-doctors" className="text-[var(--practo-text-light)] hover:underline">Find specialist →</Link>
        </div>
      </div>
    </div>
  );
}
