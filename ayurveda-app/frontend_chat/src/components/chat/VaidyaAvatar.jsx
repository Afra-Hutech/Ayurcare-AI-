import React from 'react';

/** Ayurvedic physician avatar for Vaidya AI assistant */
export default function VaidyaAvatar({ size = 36, className = '' }) {
  const s = size;
  return (
    <div
      className={`rounded-full flex-shrink-0 overflow-hidden ring-2 ring-[#14bef0]/30 shadow-sm ${className}`}
      style={{ width: s, height: s }}
      aria-hidden
    >
      <svg viewBox="0 0 64 64" width={s} height={s} className="block">
        <defs>
          <linearGradient id="vaidya-bg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#e0f7fa" />
            <stop offset="100%" stopColor="#c8e6d4" />
          </linearGradient>
        </defs>
        <rect width="64" height="64" fill="url(#vaidya-bg)" />
        <circle cx="32" cy="28" r="14" fill="#f5d0b5" />
        <path d="M18 52c2-8 8-12 14-12s12 4 14 12" fill="#28328c" />
        <circle cx="26" cy="27" r="1.5" fill="#28328c" />
        <circle cx="38" cy="27" r="1.5" fill="#28328c" />
        <path d="M28 33q4 3 8 0" stroke="#28328c" strokeWidth="1.2" fill="none" strokeLinecap="round" />
        <path d="M22 18c6-6 18-6 20 0" stroke="#1a1a2e" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        <circle cx="48" cy="14" r="3" fill="#14bef0" opacity="0.9" />
      </svg>
    </div>
  );
}
