import React from 'react';
import { Download, Sparkles, Stethoscope, ShieldCheck, Volume2, FileText, Leaf } from 'lucide-react';

export default function ClinicalReportCard({
  reports,
  mainReport,
  mainTitle,
  mainSubtitle,
  onDownloadMain,
  onViewAll,
  onReadAloud,
  onWellnessPlan,
  onAyurvedicGuide,
  onFindDoctors,
}) {
  const sectionCount = reports?.length || 0;

  return (
    <div className="w-full max-w-lg">
      <div className="overflow-hidden rounded-2xl border border-[var(--practo-border)] bg-[var(--practo-white)] shadow-[0_8px_30px_rgba(40,50,140,0.08)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.45)]">
        <div className="bg-gradient-to-r from-[#28328c] to-[#14bef0] px-5 py-4 text-white">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center flex-shrink-0">
              <ShieldCheck size={22} strokeWidth={2} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/90">Pariksha complete</p>
              <h4 className="text-lg font-bold leading-tight mt-0.5 text-white">Your clinical report is ready</h4>
              <p className="text-xs text-white/90 mt-1">Ayurvedic assessment · PDF download</p>
            </div>
            {onReadAloud ? (
              <button
                type="button"
                onClick={onReadAloud}
                className="flex-shrink-0 rounded-lg bg-white/15 hover:bg-white/25 px-2.5 py-2 transition text-white"
                title="Read report aloud"
              >
                <Volume2 size={14} />
              </button>
            ) : null}
          </div>
        </div>
        <div className="p-4 space-y-3 bg-[var(--practo-white)]">
          {mainReport ? (
            <button
              type="button"
              onClick={onDownloadMain}
              className="w-full flex items-center gap-3 rounded-xl border border-[var(--practo-border)] bg-[var(--practo-bg)] p-4 text-left transition hover:border-[#28328c]/35 dark:hover:border-[#14bef0]/45 hover:bg-[var(--practo-white)]"
            >
              <div className="w-10 h-10 rounded-lg bg-[#28328c]/10 dark:bg-[#14bef0]/15 flex items-center justify-center text-[#28328c] dark:text-[#14bef0] flex-shrink-0">
                <FileText size={20} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-[var(--practo-text)] truncate">{mainTitle}</p>
                {mainSubtitle ? (
                  <p className="text-xs text-[var(--practo-text-light)] mt-0.5 line-clamp-2">{mainSubtitle}</p>
                ) : null}
                <p className="text-[10px] text-[#14bef0] font-semibold mt-1.5">
                  {sectionCount} specialist sections · Master PDF
                </p>
              </div>
              <span className="flex items-center gap-1 rounded-lg bg-[#28328c] dark:bg-primary-600 text-white text-xs font-bold px-3 py-2 flex-shrink-0">
                <Download size={14} /> PDF
              </span>
            </button>
          ) : null}
          {sectionCount > 1 && onViewAll ? (
            <button
              type="button"
              onClick={onViewAll}
              className="w-full text-center text-xs font-bold text-[#28328c] dark:text-[#14bef0] hover:underline py-1"
            >
              View all {sectionCount} specialist reports
            </button>
          ) : null}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              onClick={onWellnessPlan}
              className="flex items-center justify-center gap-2 rounded-xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/90 dark:bg-emerald-950/45 py-3 text-xs font-bold text-emerald-800 dark:text-emerald-200 hover:bg-emerald-50 dark:hover:bg-emerald-950/60 transition"
            >
              <Sparkles size={14} /> Recipes
            </button>
            {onAyurvedicGuide ? (
              <button
                type="button"
                onClick={onAyurvedicGuide}
                className="flex items-center justify-center gap-2 rounded-xl border border-violet-200 dark:border-violet-800/60 bg-violet-50/90 dark:bg-violet-950/45 py-3 text-xs font-bold text-violet-800 dark:text-violet-200 hover:bg-violet-50 dark:hover:bg-violet-950/60 transition"
              >
                <Leaf size={14} /> Ayurvedic guide
              </button>
            ) : (
              <button
                type="button"
                onClick={onFindDoctors}
                className="flex items-center justify-center gap-2 rounded-xl border border-[var(--practo-border)] bg-[var(--practo-bg)] py-3 text-xs font-bold text-[var(--practo-text)] hover:border-[#14bef0]/40 transition"
              >
                <Stethoscope size={14} className="text-[#14bef0]" /> Find doctors
              </button>
            )}
          </div>
          {onAyurvedicGuide && onFindDoctors ? (
            <button
              type="button"
              onClick={onFindDoctors}
              className="w-full flex items-center justify-center gap-2 rounded-xl border border-[var(--practo-border)] bg-[var(--practo-bg)] py-2.5 text-xs font-bold text-[var(--practo-text)] hover:border-[#14bef0]/40 transition"
            >
              <Stethoscope size={14} className="text-[#14bef0]" /> Find doctors
            </button>
          ) : null}
        </div>
        <p className="text-[10px] text-center text-[var(--practo-text-light)] px-4 pb-3 bg-[var(--practo-white)]">
          For education only · Consult a licensed practitioner before treatment
        </p>
      </div>
    </div>
  );
}
