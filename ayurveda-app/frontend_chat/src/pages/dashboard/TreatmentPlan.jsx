import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, Stethoscope, Sparkles, FileText, Pill, ChevronRight, Leaf } from 'lucide-react'
import { patientApi } from '../../services/api'
import { extractAiCareSections } from '../../utils/carePlanFromReport'
import { formatClinicalTitle, extractDiagnosisLabels } from '../../utils/ayurvedicTerms'

function topTwo(items) {
  return (items || []).map((x) => String(x).trim()).filter(Boolean).slice(0, 2)
}

function splitShort(text) {
  if (!text || typeof text !== 'string') return []
  const parts = text.split(/\n+|;\s+/).map((s) => s.trim()).filter((s) => s.length > 8)
  return parts.slice(0, 2)
}

export default function TreatmentPlan() {
  const [rxRows, setRxRows] = useState([])
  const [latestReport, setLatestReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const [presRes, repRes] = await Promise.all([
          patientApi.listPrescriptions(),
          patientApi.getReports(),
        ])
        if (!mounted) return
        setRxRows(Array.isArray(presRes.data) ? presRes.data : [])
        const reports = Array.isArray(repRes.data) ? repRes.data : []
        setLatestReport(reports[0] || null)
      } catch (err) {
        if (mounted) setError(err?.response?.data?.message || 'Could not load care summary')
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  const aiSections = useMemo(
    () => (latestReport ? extractAiCareSections(latestReport) : []),
    [latestReport],
  )

  const aiTitle = useMemo(() => {
    if (!latestReport) return ''
    const { modern, ayurvedic } = extractDiagnosisLabels(latestReport)
    return formatClinicalTitle(modern || latestReport.reportTitle, ayurvedic)
  }, [latestReport])

  const primary = rxRows[0] || null
  const doctorDiet = topTwo(splitShort(primary?.dietPathya))
  const doctorAvoid = topTwo(splitShort(primary?.dietApathya))
  const doctorLifestyle = topTwo(splitShort(primary?.lifestylePlan))

  return (
    <div className="h-full page-scroll">
      <div className="page-content max-w-xl space-y-5">
        <header>
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#14bef0]">Care summary</p>
          <h1 className="text-2xl font-black text-slate-900 dark:text-slate-100 mt-1">Your care at a glance</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
            Full clinical detail lives in{' '}
            <Link to="/consultations" className="font-bold text-emerald-600 hover:underline">
              AI doc records
            </Link>
            . Use{' '}
            <Link to="/ayurvedic-guide" className="font-bold text-violet-600 dark:text-violet-400 hover:underline">
              Ayurvedic guide
            </Link>{' '}
            for herbs, yoga, diet, and routines after your diagnosis.
          </p>
        </header>

        {loading && (
          <div className="flex justify-center py-12">
            <Loader2 className="animate-spin text-indigo-600" size={26} />
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-4 py-3 text-sm text-amber-950 dark:text-amber-100">
            {error}
          </div>
        )}

        {!loading && !error && (
          <>
            <Link
              to="/ayurvedic-guide"
              className="flex items-center gap-3 rounded-2xl border border-violet-200 dark:border-violet-800 bg-gradient-to-r from-violet-50 to-emerald-50/80 dark:from-violet-950/40 dark:to-emerald-950/30 p-4 hover:border-violet-300 transition"
            >
              <div className="rounded-xl bg-violet-100 dark:bg-violet-900/50 p-2.5">
                <Sparkles className="text-violet-700 dark:text-violet-300" size={22} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-900 dark:text-slate-100">Smart Ayurvedic guide</p>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                  Personalized herbs, yoga, pranayama & diet from your dosha
                </p>
              </div>
              <ChevronRight className="text-violet-600 shrink-0" size={18} />
            </Link>

            {latestReport && (
              <section className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <FileText size={16} className="text-emerald-600" />
                  <h2 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-200">
                    From your latest report
                  </h2>
                </div>
                {aiTitle ? (
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-3">{aiTitle}</p>
                ) : null}
                {aiSections.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Open{' '}
                    <Link to="/consultations" className="font-bold text-emerald-600 underline">
                      AI doc records
                    </Link>{' '}
                    for the full multi-section PDF.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {aiSections.slice(0, 4).map((sec) => (
                      <li key={sec.title}>
                        <p className="text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500">{sec.title}</p>
                        <ul className="mt-1 space-y-1">
                          {topTwo(sec.bullets).map((line, i) => (
                            <li key={i} className="text-xs text-slate-700 dark:text-slate-200 flex gap-2">
                              <span className="text-emerald-500">•</span>
                              <span>{line}</span>
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                )}
                <Link
                  to="/consultations"
                  className="inline-flex items-center gap-1 mt-3 text-xs font-bold text-emerald-600 hover:underline"
                >
                  View full reports <ChevronRight size={12} />
                </Link>
              </section>
            )}

            {primary ? (
              <section className="rounded-xl border border-emerald-200/70 dark:border-emerald-900/50 bg-white dark:bg-slate-900 p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <Stethoscope size={16} className="text-emerald-600" />
                  <h2 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-200">
                    Doctor visit · {primary.doctorName || 'Practitioner'}
                  </h2>
                </div>
                {doctorDiet.length > 0 && (
                  <div className="mb-2">
                    <p className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase">Favor</p>
                    <ul className="mt-1 space-y-1">
                      {doctorDiet.map((line, i) => (
                        <li key={i} className="text-xs text-slate-700 dark:text-slate-200">• {line}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {doctorAvoid.length > 0 && (
                  <div className="mb-2">
                    <p className="text-[10px] font-bold text-rose-700 dark:text-rose-400 uppercase">Reduce</p>
                    <ul className="mt-1 space-y-1">
                      {doctorAvoid.map((line, i) => (
                        <li key={i} className="text-xs text-slate-700 dark:text-slate-200">• {line}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {doctorLifestyle.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase">Routine</p>
                    <ul className="mt-1 space-y-1">
                      {doctorLifestyle.map((line, i) => (
                        <li key={i} className="text-xs text-slate-700 dark:text-slate-200">• {line}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <Link
                  to="/prescriptions"
                  className="inline-flex items-center gap-1 mt-3 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  <Pill size={12} /> All prescriptions <ChevronRight size={12} />
                </Link>
              </section>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400 text-center py-4">
                <Leaf size={14} className="inline mr-1" />
                After a doctor video visit, short diet & medicine notes appear here.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
