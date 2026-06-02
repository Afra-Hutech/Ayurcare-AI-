import React from 'react';
import { LogOut } from 'lucide-react';
import NotificationBell from './NotificationBell';
import ThemeToggle from './ThemeToggle';

/** Top bar: page title + working notifications (logout stays in sidebar). */
const Navbar = ({ title = null, showLogout = false }) => {
  const handleLogout = () => {
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = '/login';
  };

  return (
    <header className="sticky top-0 z-[60] h-[52px] shrink-0 overflow-visible bg-white dark:bg-[var(--practo-white)] border-b border-slate-200 dark:border-[var(--practo-border)] flex items-center px-6 shadow-[0_1px_0_rgba(15,23,42,0.04)] dark:shadow-[0_1px_0_rgba(0,0,0,0.35)]">
      {title ? (
        <h1 className="text-[17px] font-bold text-slate-900 dark:text-[var(--practo-text)] tracking-tight truncate min-w-0 flex-1 pr-4">
          {title}
        </h1>
      ) : (
        <span className="sr-only">DocConnect</span>
      )}

      <div
        className={`relative flex items-center gap-2 flex-shrink-0 z-[70] ${title ? 'ml-auto' : 'ml-auto w-full justify-end'}`}
      >
        <NotificationBell variant="navbar" />
        <ThemeToggle size="sm" />
        {showLogout && (
          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-2 text-sm font-semibold text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 px-3 py-2 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        )}
      </div>
    </header>
  );
};

export default Navbar;
