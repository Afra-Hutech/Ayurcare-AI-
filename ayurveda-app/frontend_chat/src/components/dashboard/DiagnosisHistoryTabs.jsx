import React from 'react';
import { History } from 'lucide-react';

/**
 * Horizontal tabs to switch between past Vaidya consultations on the Ayurvedic guide.
 */
export default function DiagnosisHistoryTabs({
  options = [],
  selectedKey = '',
  onSelect,
  loading = false,
  formatOptionDate,
}) {
  if (!options.length) return null;

  return (
    <div className="mb-5 rounded-2xl border border-[var(--practo-border)] bg-[var(--practo-white)] p-3 sm:p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <History size={16} className="text-[#14bef0] shrink-0" />
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--practo-text-light)]">
          Switch consultation
        </p>
        {loading ? (
          <span className="text-[10px] text-[#14bef0] animate-pulse ml-auto">Updating plan…</span>
        ) : null}
      </div>

      <div
        className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-thin"
        role="tablist"
        aria-label="Past diagnoses"
      >
        {options.map((opt) => {
          const active = opt.key === selectedKey;
          return (
            <button
              key={opt.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onSelect?.(opt.key)}
              disabled={loading && active}
              className={`flex-shrink-0 min-w-[140px] max-w-[220px] text-left rounded-xl border px-3.5 py-2.5 transition ${
                active
                  ? 'border-[#28328c] dark:border-[#14bef0] bg-[#28328c]/10 dark:bg-[#14bef0]/15 shadow-sm ring-1 ring-[#14bef0]/30'
                  : 'border-[var(--practo-border)] bg-[var(--practo-bg)] hover:border-[#14bef0]/40'
              }`}
            >
              <p
                className={`text-xs font-bold leading-snug line-clamp-2 ${
                  active ? 'text-[#28328c] dark:text-[#14bef0]' : 'text-[var(--practo-text)]'
                }`}
              >
                {opt.title}
              </p>
              {formatOptionDate?.(opt.date) ? (
                <p className="text-[10px] text-[var(--practo-text-light)] mt-1">
                  {formatOptionDate(opt.date)}
                </p>
              ) : null}
            </button>
          );
        })}
      </div>

      <p className="text-[11px] text-[var(--practo-text-light)] mt-2.5 leading-relaxed">
        {options.length === 1
          ? 'Complete another Vaidya consultation to see more tabs here.'
          : `${options.length} consultations — tap a tab to view that diagnosis plan.`}
      </p>
    </div>
  );
}
