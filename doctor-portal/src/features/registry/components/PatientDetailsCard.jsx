import React from 'react';
import { User, Mail, Phone, Ruler, Scale, Calendar, Heart } from 'lucide-react';
import {
  resolvePatientProfile,
  formatProfileValue,
  formatAge,
} from '../../../utils/patientProfile';

function DetailItem({ icon: Icon, label, value, compact }) {
  return (
    <div
      className={`rounded-2xl border border-slate-100 bg-slate-50/80 dark:bg-slate-800/50 dark:border-slate-700 ${
        compact ? 'px-3 py-2' : 'px-4 py-3'
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`${compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} text-primary-600 dark:text-primary-400`} />
        <span className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-400">{label}</span>
      </div>
      <p
        className={`font-bold ${compact ? 'text-xs' : 'text-sm'} ${
          value === MISSING ? 'text-slate-400 dark:text-slate-500' : 'text-slate-800 dark:text-slate-100'
        }`}
      >
        {value}
      </p>
    </div>
  );
}

const MISSING = 'Not provided';

export function PatientDetailsCard({ appointment, compact = false, showAllFields = false }) {
  const profile = resolvePatientProfile(appointment);
  const age = formatAge(profile.age);

  const row = (icon, label, raw) => ({
    icon,
    label,
    value: raw || (showAllFields ? MISSING : null),
  });

  const rows = [
    row(User, 'Name', profile.name),
    row(Calendar, 'Age', age || formatProfileValue(profile.age, null)),
    row(User, 'Gender', formatProfileValue(profile.gender, null)),
    row(Ruler, 'Height', formatProfileValue(profile.height, null)),
    row(Scale, 'Weight', formatProfileValue(profile.weight, null)),
    row(Phone, 'Phone', formatProfileValue(profile.phone, null)),
    row(Mail, 'Email', formatProfileValue(profile.email, null)),
    row(Heart, 'Constitution', formatProfileValue(profile.constitution, null)),
  ].filter((r) => showAllFields || (r.value && r.value !== MISSING));

  if (!rows.length) {
    return (
      <p className="text-xs text-slate-500 dark:text-slate-400">
        No demographic details on file yet. Ask the patient during Vaidya AI intake or update their profile.
      </p>
    );
  }

  if (compact) {
    const chips = rows.filter((r) => r.label !== 'Name' && r.label !== 'Email').slice(0, 8);
    return (
      <div className="flex flex-wrap gap-2 mt-2">
        {chips.map((row) => (
          <span
            key={row.label}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-[10px] font-bold text-slate-600 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700"
          >
            <row.icon className="h-3 w-3 text-primary-600 dark:text-primary-400 shrink-0" />
            <span className="text-slate-400 font-black uppercase tracking-wider text-[8px]">{row.label}</span>
            {row.value}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {rows.map((row) => (
        <DetailItem key={row.label} icon={row.icon} label={row.label} value={row.value} />
      ))}
    </div>
  );
}

export function getPatientDisplayName(appointment) {
  return resolvePatientProfile(appointment).name;
}
