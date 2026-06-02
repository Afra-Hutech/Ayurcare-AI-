import React from 'react';

/** Animated SVG avatars — patient (wellness) & doctor (clinical) */
export function PatientAvatar() {
  return (
    <div className="avatar-stage avatar-stage--patient" aria-hidden>
      <span className="avatar-stage__ring avatar-stage__ring--1" />
      <span className="avatar-stage__ring avatar-stage__ring--2" />
      <span className="avatar-stage__ring avatar-stage__ring--3" />
      <span className="avatar-stage__orb avatar-stage__orb--a" />
      <span className="avatar-stage__orb avatar-stage__orb--b" />
      <svg className="avatar-stage__svg" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="patientSkin" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fcd9b6" />
            <stop offset="100%" stopColor="#e8b88a" />
          </linearGradient>
          <linearGradient id="patientRobe" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#5eead4" />
            <stop offset="100%" stopColor="#14b8a6" />
          </linearGradient>
          <linearGradient id="patientAura" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#818cf8" stopOpacity="0.2" />
          </linearGradient>
        </defs>
        <ellipse cx="100" cy="168" rx="52" ry="10" fill="#0f172a" opacity="0.25" className="avatar-shadow" />
        <circle cx="100" cy="100" r="72" fill="url(#patientAura)" className="avatar-aura" />
        <g className="avatar-float">
          <path
            d="M62 118c8-28 28-42 38-42s30 14 38 42c-6 4-14 8-38 8s-32-4-38-8z"
            fill="url(#patientRobe)"
          />
          <circle cx="100" cy="72" r="26" fill="url(#patientSkin)" />
          <path d="M74 68c6-10 16-14 26-14s20 4 26 14" stroke="#0f766e" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          <ellipse cx="88" cy="74" rx="4" ry="5" fill="#1e293b" />
          <ellipse cx="112" cy="74" rx="4" ry="5" fill="#1e293b" />
          <path d="M92 86c8 6 16 6 24 0" stroke="#0f766e" strokeWidth="2" fill="none" strokeLinecap="round" />
          <path
            className="avatar-leaf avatar-leaf--1"
            d="M48 95c-12-8-8-22 4-18 8 4 6 18-4 18z"
            fill="#34d399"
          />
          <path
            className="avatar-leaf avatar-leaf--2"
            d="M152 95c12-8 8-22-4-18-8 4-6 18 4 18z"
            fill="#34d399"
          />
          <path
            className="avatar-leaf avatar-leaf--3"
            d="M100 38c0-14 10-20 0-28-10 8 0 14 0 28z"
            fill="#a7f3d0"
          />
        </g>
      </svg>
    </div>
  );
}

export function DoctorAvatar() {
  return (
    <div className="avatar-stage avatar-stage--doctor" aria-hidden>
      <span className="avatar-stage__ring avatar-stage__ring--1" />
      <span className="avatar-stage__ring avatar-stage__ring--2" />
      <span className="avatar-stage__ring avatar-stage__ring--3" />
      <span className="avatar-stage__orb avatar-stage__orb--a" />
      <span className="avatar-stage__orb avatar-stage__orb--b" />
      <svg className="avatar-stage__svg" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="doctorCoat" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#f8fafc" />
            <stop offset="100%" stopColor="#e2e8f0" />
          </linearGradient>
          <linearGradient id="doctorScrubs" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0d9488" />
            <stop offset="100%" stopColor="#0f766e" />
          </linearGradient>
          <linearGradient id="doctorAura" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#2dd4bf" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.15" />
          </linearGradient>
        </defs>
        <ellipse cx="100" cy="168" rx="52" ry="10" fill="#0f172a" opacity="0.25" className="avatar-shadow" />
        <circle cx="100" cy="100" r="72" fill="url(#doctorAura)" className="avatar-aura" />
        <g className="avatar-float">
          <path d="M58 120h84l-8 36H66l-8-36z" fill="url(#doctorCoat)" />
          <path d="M70 120h60v-8c0-18-12-28-30-28s-30 10-30 28v8z" fill="url(#doctorScrubs)" />
          <circle cx="100" cy="68" r="24" fill="#fcd9b6" />
          <rect x="82" y="58" width="36" height="14" rx="4" fill="#f8fafc" opacity="0.9" />
          <ellipse cx="90" cy="70" rx="3.5" ry="4" fill="#1e293b" />
          <ellipse cx="110" cy="70" rx="3.5" ry="4" fill="#1e293b" />
          <path d="M94 80c6 4 12 4 18 0" stroke="#0f766e" strokeWidth="2" fill="none" strokeLinecap="round" />
          <g className="avatar-stethoscope">
            <path
              d="M128 88c12 0 18 8 18 18 0 14-10 22-22 22h-4"
              stroke="#14b8a6"
              strokeWidth="3"
              fill="none"
              strokeLinecap="round"
            />
            <circle cx="124" cy="128" r="10" stroke="#14b8a6" strokeWidth="3" fill="#ecfdf5" />
            <circle cx="124" cy="128" r="4" fill="#14b8a6" className="avatar-pulse-dot" />
          </g>
          <g className="avatar-ecg">
            <polyline
              points="36,150 52,150 58,138 68,162 78,142 88,158 98,150 108,150"
              stroke="#2dd4bf"
              strokeWidth="2.5"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        </g>
      </svg>
    </div>
  );
}
