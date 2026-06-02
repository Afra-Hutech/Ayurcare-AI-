import React, { useMemo, useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Leaf, ArrowLeft, ArrowRight, RotateCcw, Sparkles, Home, Brain, CheckCircle2, Loader2 } from 'lucide-react'
import { patientApi } from '../../services/api'
import {
  PRAKRITI_STORAGE_KEY,
  PRAKRITI_CATEGORIES,
  PRAKRITI_QUESTIONS,
  computePrakritiScores,
  dominantPrakritiLabel,
  buildPrakritiProfilePayload,
  prakritiInsights,
} from '../../utils/prakritiAssessment'

const DoshaAssessment = () => {
  const [phase, setPhase] = useState('intro')
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState({})
  const [saving, setSaving] = useState(false)
  const [synced, setSynced] = useState(false)
  const [syncError, setSyncError] = useState(null)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PRAKRITI_STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (parsed?.answers && typeof parsed.answers === 'object') {
        setAnswers(parsed.answers)
        if (parsed.scores) setPhase('results')
      }
    } catch {
      /* ignore */
    }
  }, [])

  const progressPct = useMemo(() => {
    if (phase !== 'quiz') return 0
    return Math.round(((step + 1) / PRAKRITI_QUESTIONS.length) * 100)
  }, [phase, step])

  const currentQuestion = PRAKRITI_QUESTIONS[step]
  const categoryMeta = currentQuestion ? PRAKRITI_CATEGORIES[currentQuestion.category] : null
  const scores = useMemo(() => computePrakritiScores(answers), [answers])
  const allAnswered = useMemo(
    () => PRAKRITI_QUESTIONS.every((q) => answers[q.id] != null),
    [answers],
  )
  const answeredCount = useMemo(
    () => PRAKRITI_QUESTIONS.filter((q) => answers[q.id] != null).length,
    [answers],
  )

  const syncToAccount = useCallback(async (payload) => {
    setSaving(true)
    setSyncError(null)
    try {
      await patientApi.updateProfile(payload)
      setSynced(true)
    } catch (err) {
      setSyncError(err?.response?.data?.message || 'Saved locally; sign in again to sync with Vaidya AI.')
      setSynced(false)
    } finally {
      setSaving(false)
    }
  }, [])

  const persistAndShowResults = async () => {
    const s = computePrakritiScores(answers)
    const payload = buildPrakritiProfilePayload(answers)
    try {
      localStorage.setItem(
        PRAKRITI_STORAGE_KEY,
        JSON.stringify({
          answers,
          scores: s,
          completedAt: new Date().toISOString(),
        }),
      )
    } catch {
      /* ignore */
    }
    setPhase('results')
    await syncToAccount(payload)
  }

  const restart = () => {
    setAnswers({})
    setStep(0)
    setPhase('intro')
    setSynced(false)
    setSyncError(null)
    try {
      localStorage.removeItem(PRAKRITI_STORAGE_KEY)
    } catch {
      /* ignore */
    }
  }

  const pickOption = (questionId, optionIndex) => {
    const merged = { ...answers, [questionId]: optionIndex }
    setAnswers(merged)
    if (phase !== 'quiz' || PRAKRITI_QUESTIONS[step]?.id !== questionId) return
    const isLast = step + 1 >= PRAKRITI_QUESTIONS.length
    setTimeout(() => {
      if (isLast) {
        const s = computePrakritiScores(merged)
        try {
          localStorage.setItem(
            PRAKRITI_STORAGE_KEY,
            JSON.stringify({ answers: merged, scores: s, completedAt: new Date().toISOString() }),
          )
        } catch {
          /* ignore */
        }
        setPhase('results')
        syncToAccount(buildPrakritiProfilePayload(merged))
      } else {
        setStep((s) => s + 1)
      }
    }, 280)
  }

  const goNext = () => {
    if (answers[currentQuestion.id] == null) return
    if (step + 1 >= PRAKRITI_QUESTIONS.length) persistAndShowResults()
    else setStep((s) => s + 1)
  }

  const goBack = () => {
    if (step <= 0) {
      setPhase('intro')
      return
    }
    setStep((s) => s - 1)
  }

  return (
    <div className="min-h-full px-4 py-8 sm:px-8 sm:py-10">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex items-center gap-2 rounded-full bg-indigo-50 dark:bg-indigo-950/50 px-3 py-1.5 text-xs font-bold text-[#28328c] dark:text-indigo-300 uppercase tracking-wider border border-indigo-100 dark:border-indigo-800">
            <Leaf size={14} />
            Prakriti profile
          </div>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <Home size={14} />
            Home
          </Link>
        </div>

        {phase === 'intro' && (
          <div className="rounded-2xl border border-indigo-200/70 dark:border-indigo-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-sm">
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-50 sm:text-2xl">
              Body Constitution Map
            </h1>
            <p className="mt-4 text-slate-600 dark:text-slate-300 leading-relaxed">
              Twelve guided questions map your Prakriti (Vata, Pitta, Kapha). Results sync to your account so
              <strong className="text-[#28328c] dark:text-indigo-300"> Vaidya AI</strong> can personalize consultations without re-asking.
            </p>
            <ul className="mt-6 space-y-2 text-sm text-slate-600 dark:text-slate-400">
              <li className="flex gap-2">
                <Sparkles className="text-[#14bef0] flex-shrink-0 mt-0.5" size={16} />
                Auto-advances when you pick an answer — about 3 minutes.
              </li>
              <li className="flex gap-2">
                <Brain className="text-[#28328c] dark:text-indigo-400 flex-shrink-0 mt-0.5" size={16} />
                Not a clinical diagnosis — share with your doctor for wellness planning.
              </li>
            </ul>
            {answeredCount > 0 && (
              <p className="mt-4 text-xs font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/40 rounded-lg px-3 py-2">
                {answeredCount} of {PRAKRITI_QUESTIONS.length} answered — resume or start fresh.
              </p>
            )}
            <div className="mt-8 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => {
                  setPhase('quiz')
                  setStep(answeredCount > 0 ? Math.min(answeredCount, PRAKRITI_QUESTIONS.length - 1) : 0)
                }}
                className="inline-flex items-center rounded-full bg-[#28328c] px-6 py-3 text-sm font-bold text-white hover:bg-[#1f2770]"
              >
                {answeredCount > 0 ? 'Continue questionnaire' : 'Begin questionnaire'}
                <ArrowRight size={16} className="ml-2" />
              </button>
              {answeredCount > 0 && (
                <button
                  type="button"
                  onClick={() => setPhase('results')}
                  className="inline-flex items-center rounded-full border border-indigo-200 dark:border-indigo-700 px-5 py-3 text-sm font-bold text-indigo-800 dark:text-indigo-200"
                >
                  View last results
                </button>
              )}
            </div>
          </div>
        )}

        {phase === 'quiz' && currentQuestion && (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-sm">
            <div className="mb-6">
              <div className="flex justify-between text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">
                <span>
                  {categoryMeta?.emoji} {categoryMeta?.label || 'Question'} · {step + 1} / {PRAKRITI_QUESTIONS.length}
                </span>
                <span>{progressPct}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#28328c] to-[#14bef0] transition-all duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>

            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-50 sm:text-2xl leading-snug">{currentQuestion.text}</h2>

            <div className="mt-6 space-y-3">
              {currentQuestion.options.map((opt, idx) => {
                const selected = answers[currentQuestion.id] === idx
                return (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => pickOption(currentQuestion.id, idx)}
                    className={`w-full text-left rounded-2xl border px-4 py-4 text-sm font-semibold transition ${
                      selected
                        ? 'border-[#28328c] bg-indigo-50 dark:bg-indigo-950/50 text-indigo-950 dark:text-indigo-100 ring-2 ring-indigo-200 dark:ring-indigo-800'
                        : 'border-slate-200 dark:border-slate-600 bg-slate-50/80 dark:bg-slate-800/50 text-slate-700 dark:text-slate-200 hover:border-indigo-300 dark:hover:border-indigo-700'
                    }`}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={goBack}
                className="inline-flex items-center rounded-xl border border-slate-200 dark:border-slate-600 px-4 py-2.5 text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <ArrowLeft size={16} className="mr-2" />
                Back
              </button>
              <button
                type="button"
                disabled={answers[currentQuestion.id] == null}
                onClick={goNext}
                className="inline-flex items-center rounded-xl bg-[#28328c] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#1e2670] disabled:opacity-40 disabled:pointer-events-none"
              >
                {step + 1 >= PRAKRITI_QUESTIONS.length ? 'See results' : 'Next'}
                <ArrowRight size={16} className="ml-2" />
              </button>
            </div>
          </div>
        )}

        {phase === 'results' && (
          <div className="rounded-2xl border border-indigo-200/80 dark:border-indigo-800 bg-gradient-to-br from-white to-indigo-50/40 dark:from-slate-900 dark:to-indigo-950/30 p-5 sm:p-6 shadow-sm space-y-5">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-[#28328c] dark:text-[#14bef0]">Your Prakriti snapshot</p>
              <h2 className="mt-1.5 text-lg font-bold text-slate-900 dark:text-slate-50">Dominant tendency: {dominantPrakritiLabel(scores)}</h2>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{prakritiInsights(dominantPrakritiLabel(scores))}</p>
              {saving && (
                <p className="mt-2 text-xs font-semibold text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                  <Loader2 size={14} className="animate-spin" /> Syncing to Vaidya AI…
                </p>
              )}
              {synced && !saving && (
                <p className="mt-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 size={14} /> Saved to your account — Vaidya AI will use this in chat.
                </p>
              )}
              {syncError && (
                <p className="mt-2 text-xs text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">{syncError}</p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {[
                { label: 'Vata', value: scores.vata, color: 'bg-violet-500' },
                { label: 'Pitta', value: scores.pitta, color: 'bg-amber-500' },
                { label: 'Kapha', value: scores.kapha, color: 'bg-indigo-500' },
              ].map((row) => (
                <div key={row.label} className="rounded-2xl border border-white/80 dark:border-slate-600 bg-white dark:bg-slate-800 p-4 shadow-sm">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{row.label}</p>
                  <p className="mt-1 text-3xl font-black text-slate-900 dark:text-slate-50">{row.value}%</p>
                  <div className="mt-3 h-2 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                    <div className={`h-full rounded-full ${row.color}`} style={{ width: `${row.value}%` }} />
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-3 pt-2">
              <button type="button" onClick={restart} className="inline-flex items-center rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50">
                <RotateCcw size={16} className="mr-2" />
                Start over
              </button>
              <button
                type="button"
                onClick={() => { setPhase('quiz'); setStep(0) }}
                className="inline-flex items-center rounded-xl border border-indigo-200 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-950/40 px-4 py-2.5 text-sm font-bold text-indigo-800 dark:text-indigo-200"
              >
                Revise answers
              </button>
              <Link to="/chat" className="inline-flex items-center rounded-xl bg-[#28328c] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#1f2770]">
                Open Vaidya AI
                <ArrowRight size={16} className="ml-2" />
              </Link>
              <Link to="/" className="inline-flex items-center rounded-xl border border-slate-200 dark:border-slate-600 px-4 py-2.5 text-sm font-bold text-slate-600 dark:text-slate-300">
                Back to home
              </Link>
            </div>

            {!allAnswered ? (
              <p className="text-xs text-amber-700 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/40 border border-amber-100 dark:border-amber-800 rounded-xl px-3 py-2">
                Some answers were missing — complete all questions for the most accurate snapshot.
              </p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}

export default DoshaAssessment
