import React, { useCallback, useEffect, useRef, useState } from "react"
import { useLocation, Link } from "react-router-dom"
import { Bell, CalendarClock, X } from "lucide-react"
import { patientApi } from "../../services/api"
import ThemeToggle from "../ui/ThemeToggle"

const PAGE_TITLES = {
  "/consultations": "AI Doc Records",
  "/chat": "Vaidya AI",
  "/messages": "Chat with Doctor",
  "/appointments": "Appointments",
  "/ayurvedic-guide": "Smart Ayurvedic Guide",
  "/prescriptions": "Prescriptions",
  "/medical-vault": "Health Records",
  "/find-doctors": "Find Specialist",
  "/profile": "My Profile",
  "/dosha-assessment": "Body Constitution Map",
}

const DISMISS_KEY = "ayurcare_patient_clinic_cancel_dismissed"

function loadDismissedIds() {
  try {
    const raw = localStorage.getItem(DISMISS_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(parsed) ? parsed.map(String) : [])
  } catch {
    return new Set()
  }
}

function normalizeApptStatus(s) {
  return String(s || "").toLowerCase().trim()
}

const Navbar = () => {
  const location = useLocation()
  const base = location.pathname.replace(/\/[^/]+$/, "") || location.pathname
  const title =
    PAGE_TITLES[location.pathname] ||
    PAGE_TITLES[base] ||
    null

  /** Full-height threads render their own title row — hide duplicate navbar heading. */
  const hideDuplicatePageTitle =
    location.pathname === "/" ||
    location.pathname === "/chat" ||
    location.pathname.startsWith("/chat/") ||
    location.pathname.startsWith("/messages")

  const [panelOpen, setPanelOpen] = useState(false)
  const [clinicCancels, setClinicCancels] = useState([])
  const wrapRef = useRef(null)

  const refreshClinicCancels = useCallback(async () => {
    try {
      const res = await patientApi.getAppointments()
      const list = Array.isArray(res?.data) ? res.data : []
      const dismissed = loadDismissedIds()
      const rows = list
        .filter((a) => {
          if (!a?._id) return false
          if (normalizeApptStatus(a.status) !== "cancelled") return false
          if (a.cancelledByPatient === true) return false
          if (a.hiddenByPatient === true) return false
          if (dismissed.has(String(a._id))) return false
          return true
        })
        .sort(
          (a, b) =>
            new Date(b.updatedAt || b.cancelledAt || 0).getTime() -
            new Date(a.updatedAt || a.cancelledAt || 0).getTime()
        )
      setClinicCancels(rows.slice(0, 12))
    } catch {
      setClinicCancels([])
    }
  }, [])

  useEffect(() => {
    refreshClinicCancels()
    const id = setInterval(refreshClinicCancels, 45000)
    const onFocus = () => refreshClinicCancels()
    window.addEventListener("focus", onFocus)
    return () => {
      clearInterval(id)
      window.removeEventListener("focus", onFocus)
    }
  }, [refreshClinicCancels])

  useEffect(() => {
    if (!panelOpen) return
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setPanelOpen(false)
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [panelOpen])

  const dismissOne = (apptId) => {
    const next = loadDismissedIds()
    next.add(String(apptId))
    localStorage.setItem(DISMISS_KEY, JSON.stringify([...next]))
    refreshClinicCancels()
  }

  const unread = clinicCancels.length
  const doctorLabel = (a) => {
    const d = a.doctorId
    if (d && typeof d === "object") return d.basicInfo?.name || d.name || "Your doctor"
    return "Your doctor"
  }

  const showPageTitle = title && !hideDuplicatePageTitle

  return (
    <header className="h-[52px] shrink-0 bg-white dark:bg-[var(--practo-white)] border-b border-slate-200 dark:border-[var(--practo-border)] flex items-center px-4 sm:px-6 z-30 sticky top-0 shadow-[0_1px_0_rgba(15,23,42,0.04)] dark:shadow-[0_1px_0_rgba(0,0,0,0.35)]">
      {showPageTitle ? (
        <h1 className="text-[15px] font-bold text-slate-900 dark:text-slate-50 tracking-tight truncate min-w-0 flex-1 pr-4">
          {title}
        </h1>
      ) : (
        <span className="sr-only">AyurCare</span>
      )}

      <div
        className={`flex items-center gap-2 flex-shrink-0 ${showPageTitle ? 'ml-auto' : 'ml-auto w-full justify-end'}`}
      >
        <div className="relative" ref={wrapRef}>
        <button
          type="button"
          onClick={() => setPanelOpen((o) => !o)}
          className="relative text-slate-500 dark:text-slate-300 hover:text-[#28328c] dark:hover:text-indigo-300 transition-colors p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
          aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
          aria-expanded={panelOpen}
        >
          <Bell size={20} />
            {unread > 0 ? (
            <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-white dark:border-[var(--practo-white)]">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </button>

        {panelOpen ? (
          <div className="absolute right-0 mt-2 w-[min(100vw-2rem,20rem)] rounded-2xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-xl shadow-slate-900/10 z-50 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between gap-2">
              <p className="text-xs font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wide">Updates</p>
              <button
                type="button"
                onClick={() => setPanelOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-600 dark:hover:text-slate-200"
                aria-label="Close notifications"
              >
                <X size={16} />
              </button>
            </div>
            <div className="max-h-[min(70vh,320px)] overflow-y-auto">
              {clinicCancels.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                  No updates right now. Declined or clinic-cancelled visits appear here.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-700">
                  {clinicCancels.map((a) => (
                    <li key={a._id} className="px-4 py-3 hover:bg-slate-50/80 dark:hover:bg-slate-700/50">
                      <div className="flex gap-2">
                        <div className="mt-0.5 text-[#28328c] dark:text-indigo-400 flex-shrink-0">
                          <CalendarClock size={18} />
                        </div>
                        <div className="min-w-0 flex-1 space-y-2">
                          <p className="text-sm font-semibold text-slate-900 dark:text-slate-50 leading-snug">
                            Appointment not available
                          </p>
                          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                            {a.cancellationNote ||
                              `${doctorLabel(a)} could not confirm this visit. Please reschedule.`}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            <Link
                              to="/appointments"
                              onClick={() => setPanelOpen(false)}
                              className="inline-flex items-center rounded-lg bg-[#28328c] px-3 py-1.5 text-[11px] font-bold text-white hover:bg-[#1e2670]"
                            >
                              Book again
                            </Link>
                            <button
                              type="button"
                              onClick={() => dismissOne(a._id)}
                              className="inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-600 px-3 py-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
                            >
                              Dismiss
                            </button>
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : null}
        </div>
        <ThemeToggle size="sm" />
      </div>
    </header>
  )
}

export default Navbar
