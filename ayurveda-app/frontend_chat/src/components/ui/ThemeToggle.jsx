import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

/** Light / dark mode switch */
export default function ThemeToggle({ className = '', showLabel = false, size = 'md' }) {
  const { isDark, toggleTheme } = useTheme();
  const iconSize = size === 'sm' ? 16 : 18;
  const btnClass =
    size === 'sm'
      ? 'h-9 w-9'
      : 'h-10 w-10';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--practo-border)] bg-[var(--practo-white)] text-[var(--practo-text)] shadow-sm hover:opacity-90 transition ${btnClass} ${className}`}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-pressed={isDark}
    >
      {isDark ? <Sun size={iconSize} className="text-amber-400" /> : <Moon size={iconSize} className="text-[#28328c]" />}
      {showLabel ? (
        <span className="text-xs font-semibold hidden sm:inline">{isDark ? 'Light' : 'Dark'}</span>
      ) : null}
    </button>
  );
}
