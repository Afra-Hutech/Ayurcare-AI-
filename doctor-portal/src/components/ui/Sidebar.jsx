import React, { useState, useEffect } from 'react';
import {
  Home,
  User,
  LogOut,
  Stethoscope,
  Calendar,
  Coffee,
  MessageSquare,
  History,
  IndianRupee,
  ChevronLeft,
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { doctorService } from '../../services/api';

// Inject once: transition the main-content margin when the sidebar collapses/expands.
// Targets the existing `ml-64` class that every page uses for its main content offset.
if (!document.getElementById('sidebar-collapse-style')) {
  const s = document.createElement('style');
  s.id = 'sidebar-collapse-style';
  s.textContent =
    '.ml-64 { transition: margin-left 300ms ease-in-out; }' +
    'body.sidebar-collapsed .ml-64 { margin-left: 72px; }';
  document.head.appendChild(s);
}

const Sidebar = () => {
  const navigate  = useNavigate();
  const location  = useLocation();
  const [profile,   setProfile]   = useState(null);
  const [onLeave,   setOnLeave]   = useState(false);
  const [toggling,  setToggling]  = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const user = JSON.parse(localStorage.getItem('user') || 'null');

  // Keep body class in sync so the injected CSS rule can target ml-64 on the pages.
  useEffect(() => {
    document.body.classList.toggle('sidebar-collapsed', collapsed);
  }, [collapsed]);

  useEffect(() => {
    doctorService
      .getProfile()
      .then((p) => {
        if (p) {
          setProfile(p);
          setOnLeave(!!p.onLeave);
        }
      })
      .catch(() => {});
  }, []);

  const toggleLeave = async () => {
    if (toggling) return;
    setToggling(true);
    try {
      const result = await doctorService.toggleLeave();
      if (result.success) setOnLeave(result.onLeave);
    } catch (err) {
      console.error('Toggle error:', err);
    }
    setToggling(false);
  };

  const menuItems = [
    { id: 'home',     label: 'Dashboard',       icon: Home,          path: '/dashboard' },
    { id: 'revenue',  label: 'Revenue',          icon: IndianRupee,   path: '/revenue' },
    { id: 'schedule', label: 'My Schedule',      icon: Calendar,      path: '/schedule' },
    { id: 'messages', label: 'Messages',         icon: MessageSquare, path: '/messages' },
    { id: 'registry', label: 'Patient Registry', icon: History,       path: '/registry' },
    { id: 'profile',  label: 'My Profile',       icon: User,          path: '/profile' },
  ];

  const handleLogout = () => {
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = '/login';
  };

  const displayName = profile?.basicInfo?.name || user?.name || 'Doctor';
  const avatarSrc   = profile?.basicInfo?.profileImage || user?.profileImage;

  const isActive = (path) =>
    path === '/dashboard'
      ? location.pathname === '/dashboard'
      : location.pathname === path || location.pathname.startsWith(`${path}/`);

  return (
    <aside
      className={`fixed left-0 top-0 z-30 flex h-screen flex-col border-r border-[#e0e7ed] dark:border-slate-700 bg-white dark:bg-[#161f2e] transition-[width] duration-300 ease-in-out overflow-hidden ${
        collapsed ? 'w-[72px]' : 'w-64'
      }`}
    >
      {/* Header */}
      <div className="border-b border-[#f0f4f7] dark:border-slate-700 px-3 py-2.5">
        <div className={`flex items-center ${collapsed ? 'flex-col gap-2' : 'gap-2'}`}>
          {/* Logo / home link */}
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className={`flex items-center gap-2 flex-1 min-w-0 ${collapsed ? 'justify-center' : ''}`}
          >
            <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-[#0d9488] shadow-sm">
              <Stethoscope size={14} className="text-white" />
            </div>
            {!collapsed && (
              <div className="min-w-0 text-left">
                <h1 className="text-xs font-bold tracking-tight text-[#0f766e] dark:text-teal-300">
                  DocConnect
                </h1>
                <p className="text-[8px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Practitioner hub
                </p>
              </div>
            )}
          </button>

          {/* Collapse / expand toggle */}
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <ChevronLeft
              size={15}
              className={`transition-transform duration-300 ${collapsed ? 'rotate-180' : ''}`}
            />
          </button>
        </div>
      </div>

      {/* Nav items */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-3">
        {!collapsed && (
          <p className="hidden px-3 pb-2 text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500 lg:block">
            Navigate
          </p>
        )}
        {menuItems.map((item) => {
          const Icon   = item.icon;
          const active = isActive(item.path);
          return (
            <button
              key={item.id}
              type="button"
              title={collapsed ? item.label : undefined}
              onClick={() => navigate(item.path)}
              className={`flex w-full items-center gap-3 rounded-xl py-3 text-sm font-semibold transition-all ${
                collapsed ? 'justify-center px-2' : 'px-4'
              } ${
                active
                  ? 'bg-[#0d9488] text-white shadow-md'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-[#f0f4f7] dark:hover:bg-slate-800/90 hover:text-[#0f766e] dark:hover:text-teal-300'
              }`}
            >
              <Icon size={18} className={active ? 'text-white' : 'text-slate-400 dark:text-slate-500'} />
              {!collapsed && <span className="flex-1 text-left">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="space-y-1 border-t border-[#f0f4f7] dark:border-slate-700 p-3">
        {/* Profile row — full when expanded, avatar-only when collapsed */}
        {!collapsed ? (
          <button
            type="button"
            onClick={() => navigate('/profile')}
            className={`flex w-full items-center gap-3 rounded-xl p-2.5 transition-all hover:bg-[#f0f4f7] dark:hover:bg-slate-800/80 ${
              isActive('/profile')
                ? 'bg-[#0d9488]/10 dark:bg-teal-500/15 ring-1 ring-[#0d9488]/20 dark:ring-teal-400/30'
                : ''
            }`}
          >
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#0d9488] text-sm font-bold text-white">
              {avatarSrc ? (
                <img src={avatarSrc} alt="" className="h-full w-full object-cover" />
              ) : (
                displayName[0]?.toUpperCase() || 'D'
              )}
            </div>
            <div className="min-w-0 flex-1 text-left">
              <p className="truncate text-sm font-bold text-slate-800 dark:text-slate-100">{displayName}</p>
              <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">Profile & preferences</p>
            </div>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => navigate('/profile')}
            title="My Profile"
            className="flex w-full justify-center py-1"
          >
            <div
              className={`flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#0d9488] text-sm font-bold text-white ${
                isActive('/profile') ? 'ring-2 ring-teal-400' : ''
              }`}
            >
              {avatarSrc ? (
                <img src={avatarSrc} alt="" className="h-full w-full object-cover" />
              ) : (
                displayName[0]?.toUpperCase() || 'D'
              )}
            </div>
          </button>
        )}

        {/* Leave toggle — full row when expanded, icon-only when collapsed */}
        <button
          type="button"
          onClick={toggleLeave}
          disabled={toggling}
          title={collapsed ? (onLeave ? 'On break' : 'Available') : undefined}
          className={`flex w-full items-center rounded-lg border px-3 py-2.5 transition ${
            collapsed ? 'justify-center' : 'justify-between'
          } ${
            onLeave
              ? 'border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200'
              : 'border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/50 text-slate-700 dark:text-slate-300 hover:border-teal-300/40'
          }`}
        >
          <div className="flex items-center gap-2">
            <Coffee size={16} />
            {!collapsed && (
              <span className="text-xs font-semibold">{onLeave ? 'On break' : 'Available'}</span>
            )}
          </div>
          {!collapsed && (
            <div
              className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                onLeave ? 'bg-amber-400' : 'bg-[#0d9488]'
              }`}
            >
              <div
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
                  onLeave ? 'left-[18px]' : 'left-0.5'
                }`}
              />
            </div>
          )}
        </button>

        {/* Logout */}
        <button
          type="button"
          onClick={handleLogout}
          title={collapsed ? 'Logout' : undefined}
          className={`flex w-full items-center gap-3 rounded-lg py-2.5 text-sm font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition ${
            collapsed ? 'justify-center px-2' : 'px-4'
          }`}
        >
          <LogOut size={18} />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
