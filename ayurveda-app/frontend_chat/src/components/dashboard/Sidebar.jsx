import React, { useEffect, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { motion } from "framer-motion"
import {
  Home,
  MessageSquare,
  Calendar,
  FileText,
  Heart,
  LogOut,
  Menu,
  X,
  Stethoscope,
  MessageCircleMore,
  Leaf,
  Pill,
  Sparkles,
  Salad,
  ShieldCheck,
  ChevronLeft,
} from "lucide-react"

const Sidebar = ({ compact = false }) => {
  const location = useLocation()
  const navigate = useNavigate()
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024)
  const [isOpen, setIsOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [user, setUser] = useState(null)
  const [unreadDoctorMessages, setUnreadDoctorMessages] = useState(0)

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024)
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  useEffect(() => {
    const userData = localStorage.getItem("user")
    if (userData) setUser(JSON.parse(userData))
  }, [location.pathname])

  // Re-sync whenever any component saves the profile
  useEffect(() => {
    const syncUser = () => {
      const userData = localStorage.getItem("user")
      if (userData) setUser(JSON.parse(userData))
    }
    window.addEventListener("profile:updated", syncUser)
    return () => window.removeEventListener("profile:updated", syncUser)
  }, [])

  useEffect(() => {
    const fetchUnread = async () => {
      try {
        const { doctorChatApi } = await import("../../services/api")
        const res = await doctorChatApi.listChats()
        const chats = res.data || []
        const total = chats.reduce((sum, c) => sum + (c.unreadCount || 0), 0)
        setUnreadDoctorMessages(total)
      } catch {
        // non-critical
      }
    }
    fetchUnread()
    const interval = setInterval(fetchUnread, 30000)
    return () => clearInterval(interval)
  }, [])

  const menuItems = [
    { label: "Home",                  icon: Home,             to: "/" },
    { label: "Vaidya AI",             icon: MessageSquare,    to: "/chat" },
    { label: "AI Doc Records",        icon: FileText,         to: "/consultations" },
    { label: "Ayurvedic guide",       icon: Sparkles,         to: "/ayurvedic-guide" },
    { label: "Body Constitution Map", icon: Leaf,             to: "/dosha-assessment" },
    { label: "Chat with Doctor",      icon: MessageCircleMore,to: "/messages" },
    { label: "Book Appointment",      icon: Calendar,         to: "/appointments" },
    { label: "Prescriptions",         icon: Pill,             to: "/prescriptions" },
    { label: "Health Records",        icon: Heart,            to: "/medical-vault" },
    { label: "Find Specialist",       icon: Stethoscope,      to: "/find-doctors" },
    { label: "Meal Planner",          icon: Salad,            to: "/meal-planner" },
    { label: "Medicine Checker",      icon: ShieldCheck,      to: "/medicine-checker" },
  ]

  const handleLogout = () => {
    localStorage.clear()
    sessionStorage.clear()
    window.location.href = "/login"
  }

  const isActive = (path) =>
    location.pathname === path || location.pathname.startsWith(path + "/")

  const isChatRoute   = location.pathname.startsWith("/chat")
  const isCollapsed   = !isMobile && collapsed
  const showNavLabels = !compact && !isCollapsed
  const sidebarWidth  = isMobile ? "w-64" : (isCollapsed ? "w-[72px]" : "w-64")
  const mobileMenuTop = isChatRoute ? "top-[60px]" : "top-4"

  return (
    <>
      {/* Mobile hamburger */}
      <motion.div className={`lg:hidden fixed left-4 z-[55] ${mobileMenuTop}`}>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="rounded-lg bg-white dark:bg-[var(--practo-white)] p-2 text-slate-600 dark:text-slate-200 shadow-md border border-slate-200 dark:border-[var(--practo-border)]"
          aria-label={isOpen ? "Close menu" : "Open menu"}
        >
          {isOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </motion.div>

      <motion.aside
        initial={false}
        animate={{ x: isMobile ? (isOpen ? 0 : "-100%") : 0 }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        className={`fixed lg:static left-0 top-0 h-screen flex flex-col bg-white dark:bg-[#161f2e] border-r border-[#e0e7ed] dark:border-slate-700 z-40 lg:z-auto lg:translate-x-0 transition-[width] duration-300 ease-in-out overflow-hidden ${sidebarWidth}`}
      >
        {/* Header */}
        <div className={`border-b border-[#f0f4f7] dark:border-slate-700 ${compact || isChatRoute ? "p-3" : "p-6"}`}>
          <div className={`flex items-center ${isCollapsed ? "flex-col gap-2" : "gap-2"}`}>
            {/* Logo / home button */}
            <button
              type="button"
              onClick={() => navigate("/")}
              className={`flex items-center gap-3 flex-1 min-w-0 ${isCollapsed ? "justify-center" : ""}`}
            >
              <div className="w-9 h-9 rounded-lg bg-[#28328c] flex items-center justify-center shadow-md flex-shrink-0">
                <Stethoscope size={20} className="text-white" />
              </div>
              {showNavLabels && (
                <div className="text-left min-w-0">
                  <h1 className="text-xl font-bold text-[#28328c] dark:text-indigo-300 tracking-tight">AyurCare</h1>
                  <p className="text-[10px] text-slate-400 dark:text-slate-400 font-bold uppercase tracking-wider">Patient hub</p>
                </div>
              )}
            </button>

            {/* Collapse / expand toggle — desktop only */}
            {!isMobile && (
              <button
                type="button"
                onClick={() => setCollapsed(!collapsed)}
                className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
                title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                <ChevronLeft
                  size={15}
                  className={`transition-transform duration-300 ${collapsed ? "rotate-180" : ""}`}
                />
              </button>
            )}
          </div>
        </div>

        {/* Nav items */}
        <nav className="flex-1 min-h-0 overflow-y-auto px-2 py-3 space-y-1">
          {showNavLabels && (
            <p className="px-3 pb-2 text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500 hidden lg:block">
              Navigate
            </p>
          )}
          {menuItems.map((item) => {
            const Icon  = item.icon
            const active = isActive(item.to)
            const badge  = item.to === "/messages" && unreadDoctorMessages > 0 ? unreadDoctorMessages : null
            return (
              <button
                key={item.to}
                title={!showNavLabels ? item.label : undefined}
                onClick={() => { navigate(item.to); setIsOpen(false) }}
                className={`w-full flex items-center gap-3 rounded-xl py-3 text-sm font-semibold transition-all ${
                  !showNavLabels ? "justify-center px-2" : "px-4"
                } ${
                  active
                    ? "bg-[#28328c] text-white shadow-md"
                    : "text-slate-600 dark:text-slate-300 hover:bg-[#f0f4f7] dark:hover:bg-slate-800/90 hover:text-[#28328c] dark:hover:text-indigo-300"
                }`}
              >
                <Icon size={18} className={active ? "text-white" : "text-slate-400 dark:text-slate-500"} />
                {showNavLabels && (
                  <>
                    <span className="flex-1 text-left">{item.label}</span>
                    {badge && (
                      <span className="min-w-5 h-5 px-1.5 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
                        {badge > 99 ? "99+" : badge}
                      </span>
                    )}
                  </>
                )}
              </button>
            )
          })}
        </nav>

        {/* Footer */}
        <div className="p-3 border-t border-[#f0f4f7] dark:border-slate-700 space-y-1">
          {user && showNavLabels && (
            <button
              type="button"
              onClick={() => { navigate("/profile"); setIsOpen(false) }}
              className={`w-full flex items-center gap-3 rounded-xl p-2.5 transition-all hover:bg-[#f0f4f7] dark:hover:bg-slate-800/80 ${
                isActive("/profile") ? "bg-[#28328c]/10 dark:bg-indigo-500/15 ring-1 ring-[#28328c]/20 dark:ring-indigo-400/30" : ""
              }`}
            >
              <div className="w-9 h-9 rounded-full bg-[#28328c] flex items-center justify-center text-white font-bold text-sm flex-shrink-0 overflow-hidden">
                {user.profileImage ? (
                  <img src={user.profileImage} alt="" className="w-full h-full object-cover" />
                ) : (
                  user.name?.[0]?.toUpperCase() || "U"
                )}
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{user.name}</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">Profile & preferences</p>
              </div>
            </button>
          )}
          {isCollapsed && user && (
            <button
              type="button"
              onClick={() => { navigate("/profile"); setIsOpen(false) }}
              className="w-full flex justify-center py-1"
              title="Profile"
            >
              <div className={`w-9 h-9 rounded-full bg-[#28328c] flex items-center justify-center text-white font-bold text-sm overflow-hidden ${isActive("/profile") ? "ring-2 ring-indigo-400" : ""}`}>
                {user.profileImage ? (
                  <img src={user.profileImage} alt="" className="w-full h-full object-cover" />
                ) : (
                  user.name?.[0]?.toUpperCase() || "U"
                )}
              </div>
            </button>
          )}
          <button
            type="button"
            onClick={handleLogout}
            title="Logout"
            className={`w-full flex items-center gap-3 rounded-lg py-2.5 text-sm font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition ${
              !showNavLabels ? "justify-center px-2" : "px-4"
            }`}
          >
            <LogOut size={18} />
            {showNavLabels && <span>Logout</span>}
          </button>
        </div>
      </motion.aside>

      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setIsOpen(false)}
          className="lg:hidden fixed inset-0 bg-slate-900/40 backdrop-blur-[2px] z-30"
        />
      )}
    </>
  )
}

export default Sidebar
