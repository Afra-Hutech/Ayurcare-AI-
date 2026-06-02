import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Leaf,
  Flower2,
  Wind,
  UtensilsCrossed,
  Sun,
  Sunrise,
  Sunset,
  Moon,
  Sparkles,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Stethoscope,
} from 'lucide-react';
import { parseTitleWithAyurvedic } from '../../utils/ayurvedicTerms';
import {
  compactClinicalSummary,
  dedupeRoutineLines,
  parseDietTip,
  parseRoutineStep,
} from '../../utils/recommendationDisplay';

const DOSHA_COLORS = {
  vata: 'from-violet-500/20 to-indigo-500/10 border-violet-300/50 dark:border-violet-700/50',
  pitta: 'from-amber-500/20 to-orange-500/10 border-amber-300/50 dark:border-amber-700/50',
  kapha: 'from-emerald-500/20 to-teal-500/10 border-emerald-300/50 dark:border-emerald-700/50',
  tridoshic: 'from-[#28328c]/15 to-[#14bef0]/10 border-[#28328c]/25 dark:border-[#14bef0]/30',
};

const sectionVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

function ItemList({ items, renderItem }) {
  if (!items?.length) {
    return (
      <p className="text-sm text-[var(--practo-text-light)] italic py-2">
        No items in this section yet.
      </p>
    );
  }
  return (
    <ul className="space-y-3">
      {items.map((item, idx) => (
        <li
          key={`${renderItem.key(item)}-${idx}`}
          className="rounded-xl border border-[var(--practo-border)] bg-[var(--practo-bg)] p-3.5"
        >
          {renderItem.body(item)}
        </li>
      ))}
    </ul>
  );
}

function DietTipCard({ line, variant }) {
  const { label, detail } = parseDietTip(line);
  const accent =
    variant === 'apathya'
      ? 'border-rose-200/80 dark:border-rose-800/50 bg-rose-50/50 dark:bg-rose-950/25'
      : 'border-emerald-200/80 dark:border-emerald-800/50 bg-emerald-50/50 dark:bg-emerald-950/25';
  return (
    <li className={`rounded-lg border px-3 py-2.5 ${accent}`}>
      {label ? (
        <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--practo-text-light)] mb-0.5">
          {label}
        </p>
      ) : null}
      <p className="text-sm text-[var(--practo-text)] leading-snug">{detail}</p>
    </li>
  );
}

function RoutinePhase({ icon: Icon, label, items }) {
  const lines = dedupeRoutineLines(items);
  if (!lines.length) return null;

  return (
    <div className="rounded-xl border border-[var(--practo-border)] bg-[var(--practo-bg)]/60 p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon size={16} className="text-[#14bef0] shrink-0" />
        <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--practo-text-light)]">
          {label}
        </p>
      </div>
      {lines.length === 1 ? (
        <p className="text-sm text-[var(--practo-text)] leading-relaxed">{lines[0]}</p>
      ) : (
        <ul className="space-y-2">
          {lines.map((step, i) => {
            const { action, why } = parseRoutineStep(step);
            return (
              <li key={i} className="text-sm leading-snug">
                <span className="font-semibold text-[var(--practo-text)]">{action}</span>
                {why ? (
                  <span className="block text-xs text-[var(--practo-text-light)] mt-0.5">{why}</span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function DiagnosisTitle({ label }) {
  const parsed = parseTitleWithAyurvedic(label);
  if (!parsed) {
    return (
      <h2 className="text-xl font-bold text-[var(--practo-text)] leading-snug break-words">
        {label}
      </h2>
    );
  }
  return (
    <div>
      <h2 className="text-xl font-bold text-[var(--practo-text)] leading-snug break-words">
        {parsed.modern}
      </h2>
      <p className="text-sm font-semibold text-[#14bef0] dark:text-indigo-300 mt-0.5">
        {parsed.ayurvedic}
      </p>
    </div>
  );
}

export default function AyurvedicRecommendationEngine({
  plan,
  loading,
  error,
  onRefresh,
}) {
  const [symptomsExpanded, setSymptomsExpanded] = useState(false);

  if (loading && !plan) {
    return (
      <div className="rounded-2xl border border-[var(--practo-border)] bg-[var(--practo-white)] p-8 text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-[#14bef0] border-t-transparent" />
        <p className="mt-3 text-sm text-[var(--practo-text-light)]">
          Building your Smart Ayurvedic plan…
        </p>
      </div>
    );
  }

  if (error && !plan) {
    return (
      <div className="rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/40 p-5 flex gap-3">
        <AlertCircle className="text-amber-600 flex-shrink-0" size={22} />
        <div>
          <p className="text-sm font-bold text-amber-900 dark:text-amber-100">Could not load plan</p>
          <p className="text-sm text-amber-800/90 dark:text-amber-200/90 mt-1">{error}</p>
          {onRefresh ? (
            <button
              type="button"
              onClick={onRefresh}
              className="mt-3 text-xs font-bold text-amber-700 dark:text-amber-300 hover:underline"
            >
              Try again
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  if (!plan) return null;

  const dosha = plan.dominantDosha || 'tridoshic';
  const gradient = DOSHA_COLORS[dosha] || DOSHA_COLORS.tridoshic;
  const symptoms = plan.symptoms || [];
  const visibleSymptoms = symptomsExpanded ? symptoms : symptoms.slice(0, 6);
  const focusShort = compactClinicalSummary(plan.treatmentFocus, 200);
  const hasRoutines =
    ['morning', 'afternoon', 'evening', 'night'].some((k) => plan.routines?.[k]?.length > 0);

  return (
    <motion.div initial="hidden" animate="show" className="space-y-5">
      <motion.div
        variants={sectionVariants}
        className={`rounded-2xl border bg-gradient-to-br p-5 ${gradient}`}
      >
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="rounded-xl bg-[#28328c]/10 dark:bg-[#14bef0]/15 p-2.5 shrink-0">
              <Stethoscope className="text-[#28328c] dark:text-[#14bef0]" size={22} />
            </div>
            <div className="flex-1 min-w-0 space-y-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--practo-text-light)] mb-1">
                  Active diagnosis
                </p>
                <DiagnosisTitle label={plan.diagnosisLabel} />
              </div>

              {focusShort ? (
                <p className="text-sm text-amber-950/90 dark:text-amber-50/95 leading-relaxed rounded-lg bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200/50 dark:border-amber-800/40 px-3 py-2">
                  <span className="font-bold text-amber-900 dark:text-amber-200">Care focus · </span>
                  {focusShort}
                </p>
              ) : null}

              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-[#28328c] dark:bg-primary-600 text-white text-[10px] font-bold px-2.5 py-0.5 uppercase tracking-wide">
                  {dosha}
                </span>
                {loading ? (
                  <span className="text-[10px] text-[var(--practo-text-light)] animate-pulse">Updating…</span>
                ) : null}
              </div>

              {symptoms.length > 0 ? (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--practo-text-light)] mb-1.5">
                    Key symptoms
                  </p>
                  <ul className="flex flex-wrap gap-1.5">
                    {visibleSymptoms.map((s) => (
                      <li
                        key={s}
                        className="rounded-full border border-[var(--practo-border)] bg-[var(--practo-white)] text-[11px] font-medium px-2.5 py-0.5 text-[var(--practo-text)]"
                      >
                        {s}
                      </li>
                    ))}
                  </ul>
                  {symptoms.length > 6 ? (
                    <button
                      type="button"
                      onClick={() => setSymptomsExpanded((v) => !v)}
                      className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-[#14bef0] hover:underline"
                    >
                      {symptomsExpanded ? (
                        <>Fewer <ChevronUp size={12} /></>
                      ) : (
                        <>+{symptoms.length - 6} more <ChevronDown size={12} /></>
                      )}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
          {onRefresh ? (
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="self-start sm:self-center text-xs font-bold text-[#14bef0] hover:underline shrink-0 disabled:opacity-50 px-2 py-1 rounded-lg border border-[var(--practo-border)] bg-[var(--practo-white)]/80"
            >
              Refresh plan
            </button>
          ) : null}
        </div>
      </motion.div>

      {plan.herbs?.length > 0 ? (
        <motion.section variants={sectionVariants} className="rounded-2xl border border-[var(--practo-border)] bg-[var(--practo-white)] p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Leaf className="text-emerald-600" size={18} />
            <h3 className="text-sm font-bold text-[var(--practo-text)]">Herbs & supports</h3>
          </div>
          <ItemList
            items={plan.herbs}
            renderItem={{
              key: (h) => h.name,
              body: (h) => (
                <>
                  <p className="text-sm font-bold text-[var(--practo-text)] break-words leading-snug">{h.name}</p>
                  {h.purpose ? (
                    <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-1.5">{h.purpose}</p>
                  ) : null}
                  {h.how ? (
                    <p className="text-xs text-[var(--practo-text-light)] mt-1 leading-relaxed break-words">{h.how}</p>
                  ) : null}
                </>
              ),
            }}
          />
        </motion.section>
      ) : null}

      {(plan.yoga?.length > 0 || plan.pranayama?.length > 0) ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {plan.yoga?.length > 0 ? (
            <motion.section variants={sectionVariants} className="rounded-2xl border border-[var(--practo-border)] bg-[var(--practo-white)] p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <Flower2 className="text-violet-600" size={18} />
                <h3 className="text-sm font-bold text-[var(--practo-text)]">Yoga</h3>
              </div>
              <ItemList
                items={plan.yoga}
                renderItem={{
                  key: (y) => y.name,
                  body: (y) => (
                    <>
                      <p className="text-sm font-bold break-words">{y.name}</p>
                      {y.benefit ? <p className="text-xs text-[var(--practo-text-light)] mt-1 leading-relaxed">{y.benefit}</p> : null}
                      {y.duration ? (
                        <p className="text-[10px] font-semibold text-violet-600 dark:text-violet-300 mt-1">
                          {y.duration}
                        </p>
                      ) : null}
                    </>
                  ),
                }}
              />
            </motion.section>
          ) : null}

          {plan.pranayama?.length > 0 ? (
            <motion.section variants={sectionVariants} className="rounded-2xl border border-[var(--practo-border)] bg-[var(--practo-white)] p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <Wind className="text-sky-600" size={18} />
                <h3 className="text-sm font-bold text-[var(--practo-text)]">Pranayama</h3>
              </div>
              <ItemList
                items={plan.pranayama}
                renderItem={{
                  key: (p) => p.name,
                  body: (p) => (
                    <>
                      <p className="text-sm font-bold break-words">{p.name}</p>
                      {p.benefit ? <p className="text-xs text-[var(--practo-text-light)] mt-1 leading-relaxed">{p.benefit}</p> : null}
                      {p.duration ? (
                        <p className="text-[10px] font-semibold text-sky-600 dark:text-sky-300 mt-1">
                          {p.duration}
                        </p>
                      ) : null}
                    </>
                  ),
                }}
              />
            </motion.section>
          ) : null}
        </div>
      ) : null}

      {(plan.diet?.pathya?.length > 0 || plan.diet?.apathya?.length > 0) ? (
        <motion.section variants={sectionVariants} className="rounded-xl border border-[var(--practo-border)] bg-[var(--practo-white)] p-3.5 shadow-sm">
          <div className="flex items-center gap-2 mb-2.5">
            <UtensilsCrossed className="text-amber-600" size={17} />
            <h3 className="text-sm font-bold text-[var(--practo-text)]">Ahara — diet</h3>
          </div>
          <div className="space-y-3">
            {plan.diet?.pathya?.length > 0 ? (
              <div>
                <p className="text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-300 mb-1.5">
                  Favor (pathya)
                </p>
                <ul className="space-y-2">
                  {plan.diet.pathya.map((d, i) => (
                    <DietTipCard key={`p-${i}-${d.name}`} line={d.name} variant="pathya" />
                  ))}
                </ul>
              </div>
            ) : null}
            {plan.diet?.apathya?.length > 0 ? (
              <div>
                <p className="text-[10px] font-bold uppercase text-rose-700 dark:text-rose-300 mb-1.5">
                  Reduce (apathya)
                </p>
                <ul className="space-y-2">
                  {plan.diet.apathya.map((d, i) => (
                    <DietTipCard key={`a-${i}-${d.name}`} line={d.name} variant="apathya" />
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </motion.section>
      ) : null}

      {hasRoutines ? (
        <motion.section variants={sectionVariants} className="rounded-2xl border border-[var(--practo-border)] bg-[var(--practo-white)] p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Sun className="text-[#14bef0]" size={18} />
            <h3 className="text-base font-bold text-[var(--practo-text)]">Dinacharya — daily rhythm</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <RoutinePhase icon={Sunrise} label="Morning" items={plan.routines?.morning} />
            <RoutinePhase icon={Sun} label="Afternoon" items={plan.routines?.afternoon} />
            <RoutinePhase icon={Sunset} label="Evening" items={plan.routines?.evening} />
            <RoutinePhase icon={Moon} label="Night" items={plan.routines?.night} />
          </div>
        </motion.section>
      ) : null}

      {plan.disclaimer ? (
        <p className="text-[10px] text-center text-[var(--practo-text-light)] px-2 pb-4 leading-relaxed">
          {plan.disclaimer}
        </p>
      ) : null}
    </motion.div>
  );
}
