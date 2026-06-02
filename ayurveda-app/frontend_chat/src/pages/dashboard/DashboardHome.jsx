import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Doughnut, Line, Bar, Radar } from "react-chartjs-2"
import {
  Calendar, Heart, Zap, Leaf, ArrowRight,
  Activity, TrendingUp, Droplets, ChevronRight,
  Flame, Moon, Wind, Sun, Clock, Sparkles, Plus, RefreshCw,
  AlertCircle, CheckCircle2, X, Thermometer, Brain, Star,
  UserRound, Pill, FileText, MapPin, Phone, Video,
} from "lucide-react"
import { Link } from "react-router-dom"
import api, { patientApi } from "../../services/api"
import { useTheme } from "../../context/ThemeContext"
import {
  calculateBmi,
  bmiCategory,
  parseHeightCm,
  parseWeightKg,
  normalizeHeightForStorage,
  normalizeWeightForStorage,
  formatHeightDisplay,
  formatWeightDisplay,
} from "../../utils/bmi"
import { persistPatientUser } from "../../utils/patientUser"
import { extractRemediesFromPatientReport } from "../../utils/wellnessData"
import { formatClinicalTitle, extractDiagnosisLabels } from "../../utils/ayurvedicTerms"
import { parseReportPayload } from "../../utils/reportPayload"
import {
  HYDRATION_GOAL,
  buildDayWindow,
  hasCheckInData,
  pickWellnessPatch,
  resolveSleepHours,
  wellnessScoreFromLog,
} from "../../utils/wellnessCharts"
import "chart.js/auto"

/* ─── helpers ─────────────────────────────────────────────────────────────── */
const pad = (n) => String(n).padStart(2, "0")
const greet = () => {
  const h = new Date().getHours()
  if (h >= 5 && h < 12) {
    return {
      text: "Good morning",
      sub: "Start the day with warm water and a calm breath.",
      icon: Sun,
      color: "text-amber-500",
    }
  }
  if (h >= 12 && h < 17) {
    return {
      text: "Good afternoon",
      sub: "Stay hydrated — your Agni peaks around midday.",
      icon: Zap,
      color: "text-orange-500",
    }
  }
  if (h >= 17 && h < 21) {
    return {
      text: "Good evening",
      sub: "Wind down gently; lighter meals support better sleep.",
      icon: Moon,
      color: "text-indigo-500",
    }
  }
  if (h >= 21 || h < 5) {
    return {
      text: h >= 21 ? "Good night" : "Hello, night owl",
      sub: h >= 21 ? "Aim for rest before 10 PM when you can — Ojas rebuilds in deep sleep." : "Rest when you can; irregular sleep affects Vata balance.",
      icon: Moon,
      color: "text-violet-500",
    }
  }
  return { text: "Welcome back", sub: "Your wellness snapshot is ready.", icon: Sun, color: "text-[#28328c]" }
}
const emptyWellnessToday = () => ({
  date: new Date().toISOString().slice(0, 10),
  hydrationGlasses: 0,
  steps: 0,
  restingHr: 0,
  sleepQuality: null,
  sleepHours: null,
  energy: null,
  stress: null,
  digestionQuality: null,
  bowelRegularity: null,
  notes: "",
})

const wellnessErrorMessage = (err) => {
  const status = err?.response?.status
  const msg = err?.response?.data?.message || ""
  if (msg.toLowerCase().includes("no valid wellness")) return null
  if (status === 404) {
    return "Wellness sync is unavailable (API not found). Restart the doctor portal backend on port 5001, then refresh this page."
  }
  if (status === 401 || status === 403) {
    return "Your session expired. Please log in again to save wellness data."
  }
  return msg || "Could not reach the wellness service. Ensure the backend on port 5001 is running."
}

const HYDRATION_MESSAGES = [
  "Time to hydrate! Warm water aids Agni (digestive fire).",
  "Sip some water — your body is 60% water. Keep it balanced.",
  "Ayurveda recommends warm water to flush Ama (toxins).",
  "Stay hydrated! It supports your Prakriti (constitution).",
  "Water break! Optimal hydration keeps Pitta in check.",
]

/* ─── animated ring ───────────────────────────────────────────────────────── */
const Ring = ({ pct, size = 80, stroke = 8, color = "#10b981", bg = "#e2e8f0", children }) => {
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const dash = (pct / 100) * circ
  return (
    <svg width={size} height={size} className="rotate-[-90deg]">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={bg} strokeWidth={stroke} />
      <motion.circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeLinecap="round" strokeDasharray={circ}
        initial={{ strokeDashoffset: circ }} animate={{ strokeDashoffset: circ - dash }}
        transition={{ duration: 1.4, ease: "easeOut" }} />
      <foreignObject x={0} y={0} width={size} height={size}>
        <div className="rotate-90 w-full h-full flex items-center justify-center">{children}</div>
      </foreignObject>
    </svg>
  )
}

/* ─── hydration toast ─────────────────────────────────────────────────────── */
const HydrationToast = ({ onDismiss, onDrink }) => (
  <motion.div initial={{ y: -80, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
    exit={{ y: -80, opacity: 0 }} transition={{ type: "spring", stiffness: 300, damping: 25 }}
    className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 sm:gap-4 bg-white dark:bg-slate-900 border border-blue-200 dark:border-slate-600 shadow-2xl shadow-blue-100 dark:shadow-black/40 rounded-3xl px-4 sm:px-6 py-4 w-[calc(100vw-2rem)] max-w-md">
    <div className="w-10 h-10 rounded-2xl bg-blue-50 dark:bg-blue-950/50 flex items-center justify-center flex-shrink-0">
      <Droplets size={20} className="text-blue-500" />
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-sm font-bold text-slate-800">Hydration Reminder 💧</p>
      <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
        {HYDRATION_MESSAGES[Math.floor(Math.random() * HYDRATION_MESSAGES.length)]}
      </p>
    </div>
    <div className="flex items-center gap-2 flex-shrink-0">
      <button onClick={onDrink} className="px-3 py-1.5 rounded-xl bg-blue-500 text-white text-xs font-bold hover:bg-blue-600 transition">Drank it!</button>
      <button onClick={onDismiss} className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition text-slate-400 dark:text-slate-300"><X size={14} /></button>
    </div>
  </motion.div>
)

/* ─── main component ──────────────────────────────────────────────────────── */
const DashboardHome = () => {
  // Reactive user — re-reads from localStorage whenever profile is saved
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem("user") || "{}"))
  useEffect(() => {
    const syncUser = () => setUser(JSON.parse(localStorage.getItem("user") || "{}"))
    window.addEventListener("profile:updated", syncUser)
    return () => window.removeEventListener("profile:updated", syncUser)
  }, [])
  const { isDark } = useTheme()
  const chartColors = useMemo(
    () => ({
      tick: isDark ? "#cbd5e1" : "#475569",
      grid: isDark ? "rgba(148,163,184,0.35)" : "rgba(148,163,184,0.2)",
      tooltip: isDark
        ? { backgroundColor: "#1e293b", titleColor: "#f8fafc", bodyColor: "#e2e8f0", borderColor: "#475569", borderWidth: 1 }
        : { backgroundColor: "#fff", titleColor: "#111827", bodyColor: "#111827", borderColor: "#e5e7eb", borderWidth: 1 },
    }),
    [isDark],
  )

  /* wellness logs — synced to server (Phase 1) */
  const [wellnessToday, setWellnessToday] = useState(null)
  const [wellnessHistory, setWellnessHistory] = useState([])
  const [wellnessLoading, setWellnessLoading] = useState(true)
  const [wellnessSaving, setWellnessSaving] = useState(false)
  const [wellnessError, setWellnessError] = useState(null)
  const [showHydration, setShowHydration] = useState(false)
  const [restingHrInput, setRestingHrInput] = useState("")
  const [sleepHoursInput, setSleepHoursInput] = useState("")
  const [journalNotes, setJournalNotes] = useState("")
  const [journalSaveMsg, setJournalSaveMsg] = useState("")
  const [journalSaveErr, setJournalSaveErr] = useState("")
  const [vitalsEdit, setVitalsEdit] = useState(false)
  const [vitalsForm, setVitalsForm] = useState({ age: "", gender: "", height: "", weight: "" })
  const [vitalsSaving, setVitalsSaving] = useState(false)
  /** Hydrated from GET /auth/me and PATCH profile responses for BMI/display fallbacks. */
  const [patientProfile, setPatientProfile] = useState(null)

  const glasses = wellnessToday?.hydrationGlasses ?? 0
  const steps = wellnessToday?.steps ?? 0
  const restingHr = wellnessToday?.restingHr ?? 0
  const sleepQuality = wellnessToday?.sleepQuality ?? 3
  const sleepHours = wellnessToday?.sleepHours ?? null
  const energy = wellnessToday?.energy ?? 3
  const stress = wellnessToday?.stress ?? 3
  const digestionQuality = wellnessToday?.digestionQuality ?? 3
  const bowelRegularity = wellnessToday?.bowelRegularity ?? 3

  const mergeTodayInHistory = useCallback((log) => {
    if (!log?.date) return
    setWellnessHistory((prev) => {
      const next = prev.filter((row) => row.date !== log.date)
      next.push(log)
      return next.sort((a, b) => a.date.localeCompare(b.date))
    })
  }, [])

  const persistWellness = useCallback(async (patch) => {
    const safePatch = pickWellnessPatch(patch)
    if (!Object.keys(safePatch).length) return

    setWellnessError(null)
    let snapshot = null
    setWellnessToday((prev) => {
      snapshot = prev
      return { ...(prev || emptyWellnessToday()), ...safePatch }
    })
    try {
      setWellnessSaving(true)
      const res = await patientApi.upsertWellnessToday(safePatch)
      setWellnessToday(res.data)
      mergeTodayInHistory(res.data)
      if (Object.prototype.hasOwnProperty.call(safePatch, 'notes')) {
        setJournalNotes(String(res.data?.notes ?? ''))
      }
    } catch (err) {
      setWellnessToday(snapshot)
      setWellnessError(wellnessErrorMessage(err))
      console.error("Wellness save failed:", err)
    } finally {
      setWellnessSaving(false)
    }
  }, [mergeTodayInHistory])

  useEffect(() => {
    let mounted = true
    const loadProfile = async () => {
      try {
        const res = await api.get("/auth/me")
        if (!mounted) return
        setPatientProfile(res.data)
        setVitalsForm({
          age: res.data?.age != null ? String(res.data.age) : "",
          gender: res.data?.gender || "",
          height: res.data?.height || "",
          weight: res.data?.weight || "",
        })
        persistPatientUser(res.data)
      } catch {
        // non-critical
      }
    }
    loadProfile()
    return () => { mounted = false }
  }, [])

  const bmiValue = useMemo(() => {
    const h = parseHeightCm(vitalsForm.height || patientProfile?.height)
    const w = parseWeightKg(vitalsForm.weight || patientProfile?.weight)
    return calculateBmi(h, w)
  }, [vitalsForm.height, vitalsForm.weight, patientProfile?.height, patientProfile?.weight])

  const bmiMeta = useMemo(() => bmiCategory(bmiValue), [bmiValue])

  const heightDisplay = formatHeightDisplay(vitalsForm.height || patientProfile?.height)
  const weightDisplay = formatWeightDisplay(vitalsForm.weight || patientProfile?.weight)
  const canShowBmi = bmiValue != null && bmiValue > 0
  const missingWeight = !String(vitalsForm.weight || patientProfile?.weight || "").trim()

  const saveVitals = async () => {
    setVitalsSaving(true)
    try {
      const payload = {
        age: vitalsForm.age ? Number(vitalsForm.age) : undefined,
        gender: vitalsForm.gender?.trim() || "",
        height: normalizeHeightForStorage(vitalsForm.height),
        weight: normalizeWeightForStorage(vitalsForm.weight),
      }
      const res = await patientApi.updateProfile(payload)
      setPatientProfile(res.data)
      persistPatientUser(res.data)
      window.dispatchEvent(new CustomEvent('profile:updated', { detail: res.data }))
      setVitalsForm({
        age: res.data?.age != null ? String(res.data.age) : "",
        gender: res.data?.gender || "",
        height: res.data?.height || "",
        weight: res.data?.weight || "",
      })
      persistPatientUser(res.data)
      setVitalsEdit(false)
    } catch (err) {
      setWellnessError(err?.response?.data?.message || "Could not save body metrics")
    } finally {
      setVitalsSaving(false)
    }
  }

  useEffect(() => {
    const t = setInterval(() => setShowHydration(true), 45 * 60 * 1000)
    const init = setTimeout(() => setShowHydration(true), 8000)
    return () => { clearInterval(t); clearTimeout(init) }
  }, [])

  useEffect(() => {
    setRestingHrInput(restingHr > 0 ? String(restingHr) : "")
  }, [restingHr])

  useEffect(() => {
    setSleepHoursInput(sleepHours != null && sleepHours > 0 ? String(sleepHours) : "")
  }, [sleepHours])

  useEffect(() => {
    setJournalNotes(wellnessToday?.notes ?? "")
  }, [wellnessToday?.date])

  useEffect(() => {
    let mounted = true
    const loadWellness = async () => {
      setWellnessLoading(true)
      try {
        const [todayRes, histRes] = await Promise.all([
          patientApi.getWellnessToday(),
          patientApi.getWellnessHistory(14),
        ])
        if (!mounted) return

        let today = todayRes.data
        const history = histRes.data?.logs || []

        const legacyGlasses = parseInt(localStorage.getItem("hydration_glasses") || "0", 10)
        const legacySteps = parseInt(localStorage.getItem("patient_portal_daily_steps") || "0", 10)
        const legacyHr = parseInt(localStorage.getItem("patient_portal_resting_hr") || "0", 10)
        const todayEmpty = !today?.hydrationGlasses && !today?.steps && !today?.restingHr
        if (todayEmpty && (legacyGlasses > 0 || legacySteps > 0 || legacyHr > 0)) {
          const migrated = await patientApi.upsertWellnessToday({
            hydrationGlasses: legacyGlasses,
            steps: legacySteps,
            restingHr: legacyHr,
          })
          today = migrated.data
          localStorage.removeItem("hydration_glasses")
          localStorage.removeItem("patient_portal_daily_steps")
          localStorage.removeItem("patient_portal_steps_day")
          localStorage.removeItem("patient_portal_resting_hr")
        }

        setWellnessToday(today)
        setWellnessHistory(history.some((r) => r.date === today?.date) ? history : [...history, today].sort((a, b) => a.date.localeCompare(b.date)))
        setWellnessError(null)
      } catch (err) {
        setWellnessError(wellnessErrorMessage(err))
        setWellnessToday((prev) => prev || emptyWellnessToday())
        console.error("Wellness load failed:", err)
      } finally {
        if (mounted) setWellnessLoading(false)
      }
    }
    loadWellness()
    return () => { mounted = false }
  }, [])

  const addGlass = () => {
    const next = Math.min(glasses + 1, HYDRATION_GOAL)
    persistWellness({ hydrationGlasses: next })
    setShowHydration(false)
  }

  const persistSteps = (n) => {
    const v = Math.max(0, Math.min(99999, n))
    persistWellness({ steps: v })
  }

  const saveRestingHr = () => {
    const n = parseInt(restingHrInput, 10)
    if (!Number.isFinite(n) || n < 35 || n > 220) return
    persistWellness({ restingHr: n })
  }

  const saveCheckIn = (field, value) => {
    persistWellness({ [field]: value })
  }

  const saveJournal = async () => {
    setJournalSaveMsg("")
    setJournalSaveErr("")
    const trimmed = journalNotes.trim().slice(0, 500)
    setJournalNotes(trimmed)
    try {
      const safePatch = pickWellnessPatch({ notes: trimmed })
      setWellnessError(null)
      setWellnessSaving(true)
      const res = await patientApi.upsertWellnessToday(safePatch)
      setWellnessToday(res.data)
      mergeTodayInHistory(res.data)
      setJournalNotes(String(res.data?.notes ?? ''))
      setJournalSaveMsg('Saved to your wellness log for today — your doctor can review it with your other check-in data.')
      setTimeout(() => setJournalSaveMsg(''), 11000)
    } catch (err) {
      setJournalSaveErr(wellnessErrorMessage(err) || err?.message || 'Could not save journal')
    } finally {
      setWellnessSaving(false)
    }
  }

  const saveSleepHours = () => {
    const n = parseFloat(String(sleepHoursInput).replace(",", "."))
    if (!Number.isFinite(n) || n <= 0) {
      persistWellness({ sleepHours: 0 })
      return
    }
    persistWellness({ sleepHours: Math.min(24, Math.round(n * 2) / 2) })
  }

  const applySleepHours = (h) => {
    const hours = Math.min(24, Math.max(0.5, Number(h)))
    if (!Number.isFinite(hours)) return
    setSleepHoursInput(String(hours))
    setWellnessToday((prev) => ({ ...(prev || emptyWellnessToday()), sleepHours: hours }))
    persistWellness({ sleepHours: hours })
  }

  /* optional coarse location — requires browser permission */
  const [geoLabel, setGeoLabel] = useState("")
  const [geoLoading, setGeoLoading] = useState(false)
  const refreshGeo = () => {
    if (!navigator.geolocation) return
    setGeoLoading(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`,
            {
              headers: {
                Accept: "application/json",
                "Accept-Language": "en",
                "User-Agent": "AyurCarePatientPortal/1.0",
              },
            }
          )
          const j = await res.json()
          const label =
            j.address?.city ||
            j.address?.town ||
            j.address?.village ||
            j.display_name?.split(",").slice(0, 2).join(", ") ||
            `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`
          setGeoLabel(label)
        } catch {
          setGeoLabel("Could not resolve place name")
        } finally {
          setGeoLoading(false)
        }
      },
      () => {
        setGeoLabel("")
        setGeoLoading(false)
      },
      { enableHighAccuracy: false, timeout: 12000 }
    )
  }

  /* wellness tip rotation */
  const tips = [
    { title: "Stay Hydrated", desc: "Sip warm water through the day to support Agni (digestive fire) and clear Ama (toxins).", dosha: "All", icon: Droplets },
    { title: "Morning Pranayama", desc: "Ten minutes of breath work steadies Vata and sharpens focus before your day.", dosha: "Vata", icon: Brain },
    { title: "Abhyanga (Self-massage)", desc: "Warm sesame or coconut oil massage grounds Vata and nourishes Kapha.", dosha: "Kapha", icon: Flame },
    { title: "Sleep by 10 PM", desc: "Kapha time (10 PM–2 AM) favours deep repair — log your hours on this board.", dosha: "Vata", icon: Moon },
    { title: "Eat Seasonal Foods", desc: "Local, in-season produce keeps Prakriti and gut microbiome in balance.", dosha: "All", icon: Leaf },
    { title: "Walk After Meals", desc: "A gentle 10-minute walk after eating supports Samana Vata and digestion.", dosha: "Kapha", icon: Wind },
    { title: "Midday Main Meal", desc: "Eat your largest meal when the sun is highest — Pitta and Agni are strongest then.", dosha: "Pitta", icon: Sun },
    { title: "Cool Pitta Foods", desc: "Coconut, cucumber, and sweet fruits calm heat when stress runs high.", dosha: "Pitta", icon: Droplets },
    { title: "Grounding Routine", desc: "Same wake and sleep times daily stabilise Vata more than any single herb.", dosha: "Vata", icon: Clock },
    { title: "Spice Your Lunch", desc: "Cumin, ginger, and black pepper kindle Agni without overheating Pitta.", dosha: "All", icon: Sparkles },
    { title: "Digital Sunset", desc: "Screens off 45 minutes before bed protect melatonin and sleep quality.", dosha: "Vata", icon: Moon },
    { title: "Complete Prakriti Map", desc: "Finish your Body Constitution Map so Vaidya AI personalises advice for you.", dosha: "All", icon: Leaf },
  ]
  const [tipIdx, setTipIdx] = useState(0)
  useEffect(() => { const t = setInterval(() => setTipIdx(i => (i + 1) % tips.length), 6000); return () => clearInterval(t) }, [])
  const tip = tips[tipIdx]
  const TipIcon = tip.icon

  /* api data */
  const [stats, setStats] = useState({ totalConsultations: 0, upcomingAppointments: 0, confirmedAppointments: 0 })
  const [recentReports, setRecentReports] = useState([])
  const [upcomingAppointments, setUpcomingAppointments] = useState([])
  const [loading, setLoading] = useState(true)
  const [prescribedRemedies, setPrescribedRemedies] = useState([])
  const [latestDiagnosisTitle, setLatestDiagnosisTitle] = useState("")

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const [rr, ar] = await Promise.all([
          patientApi.getReports(),
          patientApi.getAppointments(),
        ])
        const reports = rr.data || []
        const appts = ar.data || []
        setRecentReports(reports.slice(0, 3))
        const latest = reports[0]
        if (latest) {
          const { modern, ayurvedic } = extractDiagnosisLabels(latest)
          setLatestDiagnosisTitle(formatClinicalTitle(modern || latest.reportTitle, ayurvedic))
          setPrescribedRemedies(extractRemediesFromPatientReport(latest))
        } else {
          setLatestDiagnosisTitle("")
          setPrescribedRemedies([])
        }
        setUpcomingAppointments(appts.filter(a => a.status === "pending" || a.status === "confirmed").slice(0, 2))
        setStats({
          totalConsultations: reports.length,
          upcomingAppointments: appts.filter(a => a.status === "pending").length,
          confirmedAppointments: appts.filter(a => a.status === "confirmed").length,
        })
      } catch { /* silent */ } finally { setLoading(false) }
    }
    load()
  }, [])

  const greeting = greet()
  const GIcon = greeting.icon

  /* ── chart data ─────────────────────────────────────────────────────────── */
  const { doshaData, doshaFromLatestReport } = useMemo(() => {
    const fallback = [34, 33, 33]
    let triple = [...fallback]
    let fromReport = false
    const latest = recentReports?.[0]
    if (latest) {
      let payload = null
      const rd = latest.reportData
      if (rd && typeof rd === "object" && rd.fullDiagnosisText) {
        payload = parseReportPayload(rd.fullDiagnosisText)
      } else if (typeof latest.diagnosis === "string") {
        payload = parseReportPayload(latest.diagnosis)
      } else if (rd && typeof rd === "object") {
        payload = parseReportPayload(JSON.stringify(rd))
      }
      const reps = payload?.reports
      const dr = Array.isArray(reps) ? reps.find((r) => r.reportType === "Diagnosis Report") : null
      const dp = dr?.reportData?.doshaProfile
      if (dp && [dp.vata, dp.pitta, dp.kapha].every((x) => typeof x === "number")) {
        const sum = dp.vata + dp.pitta + dp.kapha
        if (sum > 0) {
          fromReport = true
          triple = [
            Math.round((dp.vata / sum) * 100),
            Math.round((dp.pitta / sum) * 100),
            Math.round((dp.kapha / sum) * 100),
          ]
        }
      }
    }
    return {
      doshaFromLatestReport: fromReport,
      doshaData: {
        labels: ["Vata", "Pitta", "Kapha"],
        datasets: [{
          data: triple,
          backgroundColor: ["#8B5CF6","#F59E0B","#10B981"],
          borderColor: ["#7C3AED","#D97706","#059669"],
          borderWidth: 2,
          hoverOffset: 8,
        }],
      },
    }
  }, [recentReports])
  const doshaOptions = useMemo(() => ({
    animation: { duration: 1200, easing: "easeOutBounce" },
    plugins: { legend: { position: "bottom", labels: { color: chartColors.tick, font: { size: 12, weight: "600" }, padding: 15 } } },
    maintainAspectRatio: false,
  }), [chartColors])

  const weekWindow = useMemo(() => buildDayWindow(wellnessHistory, 7), [wellnessHistory])
  const hasWeekCheckIns = useMemo(
    () => weekWindow.dates.some((d) => hasCheckInData(weekWindow.byDate[d])),
    [weekWindow],
  )

  const wellnessData = useMemo(() => {
    const scores = weekWindow.dates.map((d) => wellnessScoreFromLog(weekWindow.byDate[d]))
    const digestionScores = weekWindow.dates.map((d) => {
      const v = weekWindow.byDate[d]?.digestionQuality
      const n = Number(v)
      return Number.isFinite(n) ? n * 20 : null
    })
    const hasDigestionTrend = digestionScores.some((s) => s != null)
    const hasData = scores.some((s) => s != null)
    const datasets = [
      {
        label: "Wellness score",
        data: hasData ? scores.map((s) => s ?? null) : [],
        borderColor: "#10B981",
        backgroundColor: "rgba(16,185,129,0.12)",
        tension: 0.4,
        fill: true,
        borderWidth: 3,
        pointRadius: 4,
        pointBackgroundColor: "#10B981",
        spanGaps: true,
      },
    ]
    if (hasDigestionTrend) {
      datasets.push({
        label: "Digestion (score ×20)",
        data: digestionScores,
        borderColor: "#f59e0b",
        backgroundColor: "transparent",
        tension: 0.35,
        fill: false,
        borderWidth: 2,
        borderDash: [6, 4],
        pointRadius: 3,
        pointBackgroundColor: "#f59e0b",
        spanGaps: true,
      })
    }
    return {
      labels: weekWindow.labels,
      datasets,
      hasData,
      hasDigestionTrend,
    }
  }, [weekWindow])
  const wellnessOptions = useMemo(() => ({
    animation: { duration: 1400, easing: "easeOutQuad" }, responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: {
        display: wellnessData.hasDigestionTrend,
        labels: { color: chartColors.tick, font: { size: 11, weight: "600" } },
      },
      tooltip: chartColors.tooltip,
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: chartColors.tick } },
      y: {
        grid: { color: chartColors.grid },
        ticks: { color: chartColors.tick },
        min: 0,
        max: 100,
      },
    },
  }), [chartColors, wellnessData.hasDigestionTrend])

  const sleepData = useMemo(() => {
    const hours = weekWindow.dates.map((d) => resolveSleepHours(weekWindow.byDate[d]))
    const hasData = hours.some((h) => h > 0)
    return {
      labels: weekWindow.labels,
      datasets: [{
        label: "Sleep (from your check-in)",
        data: hasData ? hours : [],
        backgroundColor: "#6366f1",
        borderRadius: 6,
      }],
      hasData,
    }
  }, [weekWindow])
  const sleepOptions = useMemo(() => ({
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { position: "bottom", labels: { color: chartColors.tick, font: { size: 11, weight: "600" }, padding: 12 } } },
    scales: { x: { grid: { display: false }, ticks: { color: chartColors.tick } }, y: { grid: { color: chartColors.grid }, ticks: { color: chartColors.tick }, title: { display: true, text: "Hours", color: chartColors.tick } } },
  }), [chartColors])

  const radarData = useMemo(() => {
    const t = wellnessToday
    const hydrationPct = Math.round((glasses / HYDRATION_GOAL) * 100)
    const sleepPct = t?.sleepQuality ? t.sleepQuality * 20 : null
    const energyPct = t?.energy ? t.energy * 20 : null
    const stressPct = t?.stress ? (6 - t.stress) * 20 : null
    const hasAny = [sleepPct, energyPct, stressPct, hydrationPct].some((v) => v != null)
    return {
      labels: ["Sleep", "Energy", "Calm", "Hydration"],
      datasets: [{
        label: "Today",
        data: hasAny ? [sleepPct ?? 0, energyPct ?? 0, stressPct ?? 0, hydrationPct] : [],
        backgroundColor: "rgba(16,185,129,0.15)",
        borderColor: "#10B981",
        borderWidth: 2,
        pointBackgroundColor: "#10B981",
        pointRadius: 4,
      }],
      hasAny,
    }
  }, [glasses, wellnessToday])
  const radarOptions = useMemo(() => ({
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: { r: { min: 0, max: 100, ticks: { display: false }, grid: { color: chartColors.grid }, pointLabels: { color: chartColors.tick, font: { size: 11, weight: "600" } } } },
  }), [chartColors])

  const heartData = useMemo(() => {
    const labels = ["6am","9am","12pm","3pm","6pm","9pm"]
    const hr = restingHr > 0 ? restingHr : null
    return {
      labels,
      datasets: [{
        label: "Resting HR (entered)",
        data: hr ? labels.map(() => hr) : labels.map(() => 0),
        borderColor: "#f43f5e",
        backgroundColor: "rgba(244,63,94,0.08)",
        tension: 0.4,
        fill: true,
        borderWidth: 2.5,
        pointRadius: hr ? 3 : 0,
        spanGaps: true,
      }],
    }
  }, [restingHr])
  const heartOptions = useMemo(() => {
    const hr = restingHr > 0 ? restingHr : 70
    const pad = 12
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: chartColors.tick, font: { size: 10 } } },
        y: {
          grid: { color: chartColors.grid },
          ticks: { color: chartColors.tick },
          min: Math.max(35, hr - pad),
          max: Math.min(220, hr + pad),
        },
      },
    }
  }, [restingHr, chartColors])

  const stepsData = useMemo(() => {
    const data = weekWindow.dates.map((d) => weekWindow.byDate[d]?.steps ?? 0)
    const hasData = data.some((v) => v > 0)
    return {
      labels: weekWindow.labels,
      datasets: [{
        label: "Steps logged",
        data: hasData ? data : [],
        backgroundColor: "#28328c",
        borderRadius: 8,
      }],
      hasData,
    }
  }, [weekWindow])
  const stepsOptions = useMemo(() => ({
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: { x: { grid: { display: false }, ticks: { color: chartColors.tick } }, y: { grid: { color: chartColors.grid }, ticks: { color: chartColors.tick } } },
  }), [chartColors])

  const medicineChartData = useMemo(() => {
    const items = prescribedRemedies.length
      ? prescribedRemedies
      : ["Tulsi", "Triphala", "Ashwagandha", "Ginger"]
    return {
      labels: items.map((m) => (m.length > 18 ? `${m.slice(0, 16)}…` : m)),
      datasets: [{
        label: "Prescribed supports",
        data: items.map(() => 1),
        backgroundColor: ["#10B981", "#28328c", "#F59E0B", "#8B5CF6", "#06B6D4", "#F43F5E", "#84CC16", "#EC4899"].slice(0, items.length),
        borderRadius: 10,
        borderSkipped: false,
      }],
    }
  }, [prescribedRemedies])

  const medicineChartOptions = useMemo(() => ({
    indexAxis: "y",
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { display: false, max: 1.2 },
      y: { grid: { display: false }, ticks: { color: chartColors.tick, font: { size: 11, weight: "600" } } },
    },
  }), [chartColors])

  const cv = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.07, delayChildren: 0.05 } } }
  const iv = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4 } } }

  return (
    <div className="min-h-full bg-[#f0f4f7] dark:bg-slate-950 px-3 py-3 sm:px-4 sm:py-4 max-w-[1320px] mx-auto w-full">
      {/* Hydration Toast */}
      <AnimatePresence>
        {showHydration && (
          <HydrationToast onDismiss={() => setShowHydration(false)} onDrink={addGlass} />
        )}
      </AnimatePresence>

      <motion.div variants={cv} initial="hidden" animate="visible" className="max-w-7xl mx-auto space-y-3">

        {wellnessError && (
          <motion.div variants={iv} className="rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-4 py-3 sm:px-5 sm:py-4 text-sm text-amber-950 dark:text-amber-100 flex gap-3 items-start">
            <AlertCircle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <p>{wellnessError}</p>
          </motion.div>
        )}

        <motion.div variants={iv} className="rounded-xl border border-indigo-200/80 dark:border-indigo-800/50 bg-indigo-50/95 dark:bg-indigo-950/30 px-3 py-2 text-xs text-indigo-950 dark:text-indigo-100 leading-snug">
          <strong className="font-semibold">Wellness log</strong> syncs to your account · charts use last 7 days · Prakriti from your constitution map & AI reports.
          {wellnessSaving && <span className="ml-2 font-semibold text-[#28328c] dark:text-indigo-300">Saving…</span>}
        </motion.div>

        <motion.div variants={iv} className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <GIcon size={20} className={greeting.color} />
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{greeting.text}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-50 tracking-tight">
              {patientProfile?.name || user.name || "Patient"}
            </h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-0.5">{greeting.sub}</p>
          </div>
          <button
            type="button"
            onClick={refreshGeo}
            disabled={geoLoading}
            className="inline-flex items-center gap-2 self-start sm:self-auto rounded-full border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:border-emerald-300 hover:text-emerald-700 dark:hover:text-emerald-400 transition shadow-sm disabled:opacity-50"
          >
            <MapPin size={14} className="text-emerald-600 shrink-0" />
            {geoLoading ? "Locating…" : geoLabel || "Use approximate location"}
          </button>
        </motion.div>

        <motion.div variants={iv} className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700 p-4 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
            <div>
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100">Body profile</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">For BMI, AI & reports — height in cm, weight in kg (e.g. 158, 55)</p>
            </div>
            <div className="flex items-center gap-2">
              {canShowBmi ? (
                <span className={`text-xs font-bold px-2.5 py-1 rounded-lg ${
                  bmiMeta?.tone === "emerald" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                    : bmiMeta?.tone === "rose" ? "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
                      : "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                }`}>
                  BMI {bmiValue} · {bmiMeta?.label}
                </span>
              ) : (
                <span className="text-[11px] font-medium text-slate-400 max-w-[140px] text-right leading-snug">
                  {missingWeight ? "Add weight to see BMI" : "Complete profile for BMI"}
                </span>
              )}
              <button
                type="button"
                onClick={() => (vitalsEdit ? saveVitals() : setVitalsEdit(true))}
                disabled={vitalsSaving}
                className="rounded-full bg-[#28328c] text-white px-3.5 py-1.5 text-xs font-bold hover:bg-[#1f2770] disabled:opacity-50"
              >
                {vitalsSaving ? "Saving…" : vitalsEdit ? "Save" : "Edit"}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { key: "age", label: "Age", placeholder: "28" },
              { key: "gender", label: "Gender", placeholder: "Female" },
              { key: "height", label: "Height (cm)", placeholder: "158" },
              { key: "weight", label: "Weight (kg)", placeholder: "55" },
            ].map((f) => (
              <div key={f.key}>
                <label className="text-[10px] font-bold uppercase text-slate-400 tracking-wide">{f.label}</label>
                {vitalsEdit ? (
                  f.key === "gender" ? (
                    <select
                      value={vitalsForm[f.key]}
                      onChange={(e) => setVitalsForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                      className="mt-0.5 w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 px-2 py-1.5 text-sm font-semibold text-slate-800 dark:text-slate-100"
                    >
                      <option value="">Select</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  ) : (
                    <input
                      type={f.key === "age" ? "number" : "text"}
                      value={vitalsForm[f.key]}
                      onChange={(e) => setVitalsForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                      placeholder={f.placeholder}
                      className="mt-0.5 w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 px-2 py-1.5 text-sm font-semibold text-slate-800 dark:text-slate-100"
                    />
                  )
                ) : (
                  <p className="mt-0.5 text-sm font-bold text-slate-800 dark:text-slate-100 tabular-nums">
                    {f.key === "height" ? heightDisplay : f.key === "weight" ? weightDisplay : vitalsForm[f.key] || patientProfile?.[f.key] || "—"}
                  </p>
                )}
              </div>
            ))}
          </div>
        </motion.div>

        {/* ── Stats Row ── */}
        <motion.div variants={iv} className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Consultations", value: stats.totalConsultations, icon: FileText, color: "emerald", bg: "bg-emerald-50", text: "text-emerald-600" },
            { label: "Upcoming", value: stats.upcomingAppointments, icon: Calendar, color: "blue", bg: "bg-blue-50", text: "text-blue-600" },
            { label: "Confirmed", value: stats.confirmedAppointments, icon: CheckCircle2, color: "violet", bg: "bg-violet-50", text: "text-violet-600" },
            { label: "Resting HR", value: restingHr > 0 ? `${restingHr} bpm` : "—", icon: Heart, color: "rose", bg: "bg-rose-50", text: "text-rose-600" },
          ].map((s) => (
            <div key={s.label} className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-700 p-3 shadow-sm flex items-center gap-2.5">
              <div className={`rounded-xl ${s.bg} p-2.5`}>
                <s.icon size={20} className={s.text} />
              </div>
              <div>
                <p className="text-xs text-slate-500 font-medium">{s.label}</p>
                <p className="text-xl font-black text-slate-800">{loading ? "—" : s.value}</p>
              </div>
            </div>
          ))}
        </motion.div>

        {/* ── Logged vitals + hydration ── */}
        <motion.div variants={iv} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Steps — manual */}
          <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-700 p-3.5 shadow-sm flex flex-col sm:flex-row sm:items-center gap-3">
            <Ring pct={Math.round((steps / 10000) * 100)} color="#28328c">
              <span className="text-[10px] font-black text-[#28328c]">{Math.round((steps / 10000) * 100)}%</span>
            </Ring>
            <div className="flex-1">
              <p className="text-xs text-slate-500 font-medium">Steps today <span className="text-slate-400">(you log)</span></p>
              <p className="text-2xl font-black text-slate-800">{steps.toLocaleString()}</p>
              <p className="text-xs text-slate-400 mb-2">Goal: 10,000 · resets daily</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => persistSteps(steps + 500)} className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-200">+500</button>
                <button type="button" onClick={() => persistSteps(steps + 1000)} className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-200">+1000</button>
                <button type="button" onClick={() => persistSteps(0)} className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-500 hover:bg-slate-200">Reset</button>
              </div>
            </div>
          </div>

          {/* Hydration */}
          <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-700 p-3.5 shadow-sm flex items-center gap-3">
            <Ring pct={Math.round((glasses / HYDRATION_GOAL) * 100)} color="#3b82f6">
              <span className="text-[10px] font-black text-blue-600">{glasses}/{HYDRATION_GOAL}</span>
            </Ring>
            <div className="flex-1">
              <p className="text-xs text-slate-500 font-medium">Hydration <span className="text-slate-400 font-normal">(you log glasses)</span></p>
              <p className="text-2xl font-black text-slate-800">{glasses} glasses</p>
              <button
                onClick={addGlass}
                className="mt-1.5 flex items-center gap-1 rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-600 hover:bg-blue-100 transition"
              >
                <Plus size={12} /> Add glass
              </button>
            </div>
          </div>

          {/* Heart rate — manual */}
          <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-700 p-3.5 shadow-sm flex flex-col sm:flex-row sm:items-center gap-3">
            <Ring pct={restingHr > 0 ? Math.round(((restingHr - 50) / 50) * 100) : 0} color="#f43f5e">
              <span className="text-[10px] font-black text-rose-500">{restingHr > 0 ? restingHr : "—"}</span>
            </Ring>
            <div className="flex-1 space-y-2">
              <p className="text-xs text-slate-500 font-medium">Resting heart rate <span className="text-slate-400">(optional)</span></p>
              <p className="text-xs text-slate-400">Wearables not connected — enter a typical resting value if you know it.</p>
              <div className="flex gap-2 flex-wrap">
                <input
                  type="number"
                  min={35}
                  max={220}
                  placeholder="e.g. 72"
                  value={restingHrInput}
                  onChange={(e) => setRestingHrInput(e.target.value)}
                  className="w-24 rounded-lg border border-slate-200 px-2 py-1.5 text-sm font-bold"
                />
                <button type="button" onClick={saveRestingHr} className="rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100">Save</button>
              </div>
            </div>
          </div>
        </motion.div>

        {/* ── Daily check-in ── */}
        <motion.div variants={iv} className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-700 p-3.5 shadow-sm">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100">Daily check-in & progress journal</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Sleep, energy, stress, digestion & bowels — powers your wellness trend (Agni-friendly tracking)
              </p>
            </div>
            {hasCheckInData(wellnessToday) && (
              <span className="text-[10px] font-bold uppercase tracking-wide text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/50 px-2 py-1 rounded-lg border border-indigo-100 dark:border-indigo-800">Logged today</span>
            )}
          </div>

          <div className="mb-4 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/50 p-3 flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="flex-1">
              <label className="text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                <Moon size={14} className="text-indigo-600 dark:text-indigo-400" /> Sleep hours (last night)
              </label>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">How many hours you slept — e.g. 7 or 7.5</p>
              <div className="flex gap-2 mt-2 flex-wrap">
                <input
                  type="number"
                  min={0}
                  max={24}
                  step={0.5}
                  placeholder="7.5"
                  value={sleepHoursInput}
                  onChange={(e) => setSleepHoursInput(e.target.value)}
                  className="w-24 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm font-bold text-slate-900 dark:text-slate-100"
                />
                <button type="button" onClick={saveSleepHours} className="rounded-lg bg-[#28328c] text-white px-3 py-1.5 text-xs font-bold hover:bg-[#1f2770]">Save hours</button>
                {[6, 7, 8].map((h) => {
                  const active = Number(sleepHours) === h
                  return (
                    <button
                      key={h}
                      type="button"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); applySleepHours(h) }}
                      disabled={wellnessSaving}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition relative z-10 ${
                        active
                          ? "border-[#28328c] bg-[#28328c] text-white shadow-sm"
                          : "border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40"
                      } disabled:opacity-50`}
                    >
                      {h}h
                    </button>
                  )
                })}
              </div>
            </div>
            {sleepHours > 0 && (
              <p className="text-2xl font-black text-indigo-700 dark:text-indigo-300 tabular-nums shrink-0">{sleepHours}h</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {[
              { key: "sleepQuality", label: "Sleep quality", value: sleepQuality },
              { key: "energy", label: "Energy", value: energy },
              { key: "stress", label: "Stress level", value: stress },
              { key: "digestionQuality", label: "Digestion (Agni)", value: digestionQuality },
              { key: "bowelRegularity", label: "Bowel comfort", value: bowelRegularity },
            ].map((item) => (
              <label key={item.key} className="space-y-2">
                <div className="flex justify-between text-xs font-semibold text-slate-600 dark:text-slate-300">
                  <span>{item.label}</span>
                  <span className="text-slate-400">{item.value}/5</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={5}
                  step={1}
                  value={item.value}
                  disabled={wellnessLoading}
                  onChange={(e) => saveCheckIn(item.key, Number(e.target.value))}
                  className="w-full accent-indigo-600"
                />
              </label>
            ))}
          </div>

          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
            <label className="text-xs font-bold text-slate-600 dark:text-slate-300">Progress journal (optional)</label>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 mb-2 leading-relaxed">
              Stored in <strong>today&apos;s wellness entry</strong> on the server (same as sleep & digestion sliders). Doctors who have consulted you can view recent wellness logs in their dashboard.
              This page only shows today&apos;s note — past days stay in history for your clinician.
            </p>
            <textarea
              value={journalNotes}
              onChange={(e) => setJournalNotes(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="e.g. Less bloating after lunch; felt anxious in the evening…"
              className="w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-800 dark:text-slate-100"
            />
            <button
              type="button"
              onClick={saveJournal}
              disabled={wellnessSaving}
              className="mt-2 rounded-lg bg-slate-800 dark:bg-slate-700 text-white px-3 py-1.5 text-xs font-bold hover:opacity-90 disabled:opacity-50"
            >
              {wellnessSaving ? 'Saving…' : 'Save journal'}
            </button>
            {journalSaveMsg && (
              <p className="mt-2 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">{journalSaveMsg}</p>
            )}
            {journalSaveErr && (
              <p className="mt-2 text-[11px] font-semibold text-rose-600 dark:text-rose-400">{journalSaveErr}</p>
            )}
          </div>
        </motion.div>

        {/* ── Prescribed medicines (from latest report) ── */}
        <motion.div variants={iv}>
          <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-700 p-3.5 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-sm font-bold text-slate-800">Prescribed Medicines & Herbs</p>
                <p className="text-xs text-slate-400">
                  {latestDiagnosisTitle ? `From: ${latestDiagnosisTitle}` : "From your latest AI consultation"}
                </p>
              </div>
              <Pill size={18} className="text-emerald-600" />
            </div>
            <div className="h-36">
              <Bar data={medicineChartData} options={medicineChartOptions} />
            </div>
            {!loading && prescribedRemedies.length === 0 && (
              <p className="text-xs text-slate-400 mt-2 text-center">
                Complete an AI consultation to see personalized herbal supports here.
              </p>
            )}
            <Link
              to="/consultations"
              className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:text-emerald-700"
            >
              View full treatment plan <ChevronRight size={14} />
            </Link>
          </div>
        </motion.div>

        {/* ── Charts Row 1 ── */}
        <motion.div variants={iv} className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {/* Dosha */}
          <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-700 p-3.5 shadow-sm">
            <p className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-0.5">Dosha Balance</p>
            <p className="text-xs text-slate-400 mb-2">
              {doshaFromLatestReport
                ? "From your latest consultation report (AI diagnosis payload)"
                : "Balanced illustration until a report includes dosha scores"}
            </p>
            <div className="h-48">
              <Doughnut data={doshaData} options={doshaOptions} />
            </div>
          </div>

          {/* Wellness Trend */}
          <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-700 p-3.5 shadow-sm lg:col-span-2">
            <p className="text-sm font-bold text-slate-800 mb-1">Wellness Score</p>
            <p className="text-xs text-slate-400 mb-4">
              {wellnessData.hasData ? "From your daily check-in (sleep, energy, stress)" : "Log check-in above to see your trend"}
            </p>
            <div className="h-48">
              {wellnessData.hasData ? (
                <Line data={{ labels: wellnessData.labels, datasets: wellnessData.datasets }} options={wellnessOptions} />
              ) : (
                <div className="h-full flex items-center justify-center text-sm text-slate-500 border border-dashed border-slate-200 rounded-xl bg-slate-50/80 px-4 text-center">
                  Complete today&apos;s check-in to build your wellness curve.
                </div>
              )}
            </div>
          </div>
        </motion.div>

        {/* ── Charts Row 2 ── */}
        <motion.div variants={iv} className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {/* Sleep */}
          <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-700 p-3.5 shadow-sm lg:col-span-2">
            <p className="text-sm font-bold text-slate-800 mb-1">Sleep Analysis</p>
            <p className="text-xs text-slate-400 mb-4">
              {sleepData.hasData ? "Sleep quality you logged (approx. hours)" : "Log sleep in daily check-in"}
            </p>
            <div className="h-48">
              {sleepData.hasData ? (
                <Bar data={{ labels: sleepData.labels, datasets: sleepData.datasets }} options={sleepOptions} />
              ) : (
                <div className="h-full flex items-center justify-center text-sm text-slate-500 border border-dashed border-slate-200 rounded-xl bg-slate-50/80 px-4 text-center">
                  No sleep check-ins yet this week.
                </div>
              )}
            </div>
          </div>

          {/* Wellness Radar */}
          <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-700 p-3.5 shadow-sm">
            <p className="text-sm font-bold text-slate-800 mb-1">Health Radar</p>
            <p className="text-xs text-slate-400 mb-4">Today&apos;s check-in + hydration</p>
            <div className="h-48">
              {radarData.hasAny ? (
                <Radar data={{ labels: radarData.labels, datasets: radarData.datasets }} options={radarOptions} />
              ) : (
                <div className="h-full flex items-center justify-center text-sm text-slate-500 border border-dashed border-slate-200 rounded-xl bg-slate-50/80 px-4 text-center">
                  Log check-in or hydration to see your radar.
                </div>
              )}
            </div>
          </div>
        </motion.div>

        {/* ── Charts Row 3 ── */}
        <motion.div variants={iv} className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* Heart Rate Chart */}
          <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-700 p-3.5 shadow-sm">
            <p className="text-sm font-bold text-slate-800 mb-1">Resting heart rate</p>
            <p className="text-xs text-slate-400 mb-4">Flat line from your saved value — not hourly monitoring</p>
            <div className="h-44">
              {restingHr > 0 ? (
                <Line data={heartData} options={heartOptions} />
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center text-sm text-slate-500 px-4 border border-dashed border-slate-200 rounded-xl bg-slate-50/80">
                  Save a resting BPM in the card above to plot a reference line. Continuous heart rate needs a wearable or native app integration.
                </div>
              )}
            </div>
          </div>

          {/* Steps Chart */}
          <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-700 p-3.5 shadow-sm">
            <p className="text-sm font-bold text-slate-800 mb-1">Steps This Week</p>
            <p className="text-xs text-slate-400 mb-4">Steps you logged each day</p>
            <div className="h-44">
              {stepsData.hasData ? (
                <Bar data={{ labels: stepsData.labels, datasets: stepsData.datasets }} options={stepsOptions} />
              ) : (
                <div className="h-full flex items-center justify-center text-sm text-slate-500 border border-dashed border-slate-200 rounded-xl bg-slate-50/80 px-4 text-center">
                  Use +500 / +1000 on steps card to log activity.
                </div>
              )}
            </div>
          </div>
        </motion.div>

        {/* ── Wellness Tip ── */}
        <motion.div variants={iv}>
          <AnimatePresence mode="wait">
            <motion.div
              key={tipIdx}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.4 }}
              className="rounded-2xl bg-gradient-to-r from-[#28328c] via-[#4f46e5] to-[#14bef0] p-5 text-white shadow-lg shadow-indigo-900/25"
            >
              <div className="flex items-start gap-4">
                <div className="rounded-xl bg-white/20 p-2.5 flex-shrink-0">
                  <TipIcon size={20} className="text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Sparkles size={14} className="text-white/80" />
                    <span className="text-xs font-semibold text-white/80 uppercase tracking-wide">Wellness Tip · {tip.dosha} Dosha</span>
                  </div>
                  <p className="text-base font-bold">{tip.title}</p>
                  <p className="text-sm text-white/80 mt-1 leading-relaxed">{tip.desc}</p>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </motion.div>

        {/* ── Recent Reports + Upcoming Appointments ── */}
        <motion.div variants={iv} className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* Recent Reports */}
          <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-700 p-3.5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-bold text-slate-800">Recent Reports</p>
              <Link to="/consultations" className="flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:text-emerald-700">
                View all <ChevronRight size={14} />
              </Link>
            </div>
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-14 rounded-xl bg-slate-100 animate-pulse" />
                ))}
              </div>
            ) : recentReports.length === 0 ? (
              <div className="text-center py-8">
                <FileText size={32} className="mx-auto text-slate-300 mb-2" />
                <p className="text-sm text-slate-400">No reports yet</p>
                <Link to="/chat" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:underline">
                  Start a consultation <ArrowRight size={12} />
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {recentReports.map((r) => (
                  <div key={r._id} className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
                    <div className="rounded-lg bg-emerald-100 p-2 flex-shrink-0">
                      <FileText size={16} className="text-emerald-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{r.reportTitle || r.diagnosis?.slice(0, 40) || "Consultation Report"}</p>
                      <p className="text-xs text-slate-400">{r.date || new Date(r.createdAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Upcoming Appointments */}
          <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-700 p-3.5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-bold text-slate-800">Upcoming Appointments</p>
              <Link to="/appointments" className="flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:text-emerald-700">
                View all <ChevronRight size={14} />
              </Link>
            </div>
            {loading ? (
              <div className="space-y-3">
                {[1, 2].map(i => (
                  <div key={i} className="h-20 rounded-xl bg-slate-100 animate-pulse" />
                ))}
              </div>
            ) : upcomingAppointments.length === 0 ? (
              <div className="text-center py-8">
                <Calendar size={32} className="mx-auto text-slate-300 mb-2" />
                <p className="text-sm text-slate-400">No upcoming appointments</p>
                <Link to="/find-doctors" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:underline">
                  Find a doctor <ArrowRight size={12} />
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {upcomingAppointments.map((a) => (
                  <div key={a._id} className="rounded-xl bg-slate-50 p-3">
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg bg-blue-100 p-2 flex-shrink-0">
                        <UserRound size={16} className="text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">
                          Dr. {(a.doctorId?.basicInfo?.name || a.doctorId?.name || "Doctor").replace(/^Dr\.?\s+/i, '')}
                        </p>
                        <p className="text-xs text-slate-400">{a.date} · {a.time}</p>
                      </div>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        a.status === "confirmed" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                      }`}>
                        {a.status}
                      </span>
                    </div>
                    {a.mode && (
                      <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
                        {a.mode === "video" ? <Video size={12} /> : <MapPin size={12} />}
                        {a.mode === "video" ? "Video Consultation" : "In-person"}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>

      </motion.div>
    </div>
  )
}

export default DashboardHome
