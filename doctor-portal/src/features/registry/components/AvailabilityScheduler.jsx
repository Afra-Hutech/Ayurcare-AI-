import React, { useMemo } from 'react';
import { Clock3, Lock } from 'lucide-react';
import {
  buildAvailabilityTimeSlots,
  resolveAvailabilityHours,
} from '../../../utils/availability';

const normalizeStatus = (status) => {
  if (!status) return 'pending';
  const next = String(status).toLowerCase();
  if (next === 'confirmed' || next === 'scheduled') return 'confirmed';
  if (next === 'cancelled' || next === 'canceled') return 'cancelled';
  return next;
};

const AvailabilityScheduler = ({
  availability,
  availabilityTimings,
  appointments = [],
  selectedDate,
  selectedTime,
  duration = 30,
  onDateChange,
  onTimeChange,
  onDurationChange,
  showDurationControl = false,
  compact = false,
}) => {
  const availabilitySource = availability || (availabilityTimings ? { timings: availabilityTimings } : null);
  const hours = useMemo(
    () => resolveAvailabilityHours(availabilitySource),
    [availabilitySource],
  );

  const availableDays = useMemo(() => {
    const days = [];
    const horizon = compact ? 10 : 14;
    for (let i = 0; i < horizon; i++) {
      const day = new Date();
      day.setDate(day.getDate() + i);
      days.push(day);
    }
    return days;
  }, [compact]);

  const timeSlots = useMemo(
    () => buildAvailabilityTimeSlots({
      availability: availabilitySource,
      selectedDate,
      duration,
      appointments,
      normalizeStatus,
    }),
    [availabilitySource, selectedDate, duration, appointments],
  );

  const dateBtnClass = compact ? 'w-10 h-11' : 'w-14 h-16';
  const shellClass = compact
    ? 'space-y-2.5 rounded-xl border border-slate-100 bg-slate-50/80 p-3'
    : 'space-y-4 rounded-2xl border border-slate-100 bg-slate-50/80 p-4';

  return (
    <div className={shellClass}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-400">
          {compact ? 'Schedule' : 'Working hours'}
        </div>
        <span className={`inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-100 font-bold text-amber-800 whitespace-nowrap shrink-0 ${
          compact ? 'px-2 py-0.5 text-[9px]' : 'px-3 py-1 text-[10px]'
        }`}>
          <Clock3 size={compact ? 10 : 12} className="shrink-0" />
          {hours.displayLabel}
        </span>
      </div>
      {!compact && (
        <p className="text-xs text-slate-600 leading-relaxed -mt-1">
          Choose a date and time from your schedule. Booked slots are locked.
        </p>
      )}

      {showDurationControl && (
        <div className="space-y-1.5">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.18em] px-0.5">Duration</label>
          <select
            value={duration}
            onChange={(event) => onDurationChange?.(Number(event.target.value))}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none focus:border-primary-400"
          >
            {[15, 30, 45, 60].map((value) => (
              <option key={value} value={value}>{value} mins</option>
            ))}
          </select>
        </div>
      )}

      <div className={compact ? 'space-y-1' : 'space-y-2'}>
        <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.16em] px-0.5">Select date</label>
        <div className={`flex overflow-x-auto pb-0.5 scrollbar-none snap-x ${compact ? 'gap-1.5' : 'gap-2'}`}>
          {availableDays.map((date, index) => {
            const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
            const isSelected = selectedDate === dateKey;
            return (
              <button
                key={index}
                type="button"
                onClick={() => onDateChange?.(dateKey)}
                className={`flex-shrink-0 ${dateBtnClass} ${compact ? 'rounded-lg' : 'rounded-xl'} border transition-all flex flex-col items-center justify-center gap-0 snap-start ${
                  isSelected
                    ? 'bg-primary-600 border-primary-600 text-white shadow-md'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-primary-300'
                }`}
              >
                <span className={`font-bold uppercase opacity-90 ${compact ? 'text-[7px]' : 'text-[9px]'}`}>
                  {date.toLocaleDateString('en-US', { weekday: 'short' })}
                </span>
                <span className={`font-black leading-none ${compact ? 'text-xs' : 'text-base'}`}>{date.getDate()}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className={compact ? 'space-y-1' : 'space-y-2'}>
        <div className="flex items-center justify-between gap-2">
          <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.16em] px-0.5">Select time</label>
          {!compact && (
            <div className="flex items-center gap-1.5 text-[8px] font-bold uppercase tracking-wide text-slate-500">
              <span className="inline-flex items-center gap-0.5 rounded-full bg-white px-1.5 py-px border border-slate-200">
                <span className="h-1 w-1 rounded-full bg-emerald-500" /> Best
              </span>
              <span className="inline-flex items-center gap-0.5 rounded-full bg-white px-1.5 py-px border border-slate-200">
                <span className="h-1 w-1 rounded-full bg-slate-300" /> Booked
              </span>
            </div>
          )}
        </div>

        {timeSlots.length === 0 ? (
          <p className={`text-slate-500 rounded-lg border border-dashed border-slate-200 bg-white text-center ${
            compact ? 'text-[10px] px-2 py-2' : 'text-xs px-3 py-4 rounded-xl'
          }`}>
            No slots for this day.
          </p>
        ) : (
          <div className={`grid overflow-y-auto pr-0.5 custom-scrollbar ${
            compact ? 'grid-cols-4 gap-1 max-h-[120px]' : 'grid-cols-3 sm:grid-cols-4 gap-2 max-h-[220px]'
          }`}>
            {timeSlots.map((slot, index) => {
              const disabled = slot.isBooked || slot.isPast;
              const isSelected = selectedTime === slot.time;
              return (
                <button
                  key={`${slot.time}-${index}`}
                  type="button"
                  disabled={disabled}
                  title={disabled ? (slot.isBooked ? 'Already booked' : 'Past slot') : `Select ${slot.label}`}
                  onClick={() => onTimeChange?.(slot.time)}
                  className={`relative border font-semibold transition-all flex flex-col items-center justify-center px-0.5 ${
                    compact ? 'min-h-[32px] rounded-lg text-[10px]' : 'min-h-[44px] rounded-xl text-[11px] gap-0.5'
                  } ${
                    disabled
                      ? 'bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed'
                      : isSelected
                        ? 'bg-primary-600 text-white border-primary-600 shadow-md'
                        : 'bg-white border-slate-200 text-slate-700 hover:border-primary-400 hover:bg-primary-50/50'
                  } ${slot.isRecommended && !disabled && !isSelected ? (compact ? 'ring-1 ring-emerald-400/90' : 'ring-2 ring-emerald-400/80 ring-offset-1') : ''}`}
                >
                  {slot.isRecommended && !disabled && !isSelected && (
                    <span className={`absolute rounded bg-emerald-500 font-black uppercase text-white leading-none ${
                      compact ? '-top-0.5 right-0.5 px-0.5 text-[6px]' : '-top-1 right-1 px-1 py-px text-[7px]'
                    }`}>
                      {compact ? '★' : 'Best'}
                    </span>
                  )}
                  <span className="leading-tight text-center">{slot.label}</span>
                  {slot.isBooked && (
                    <span className="inline-flex items-center gap-0.5 text-[8px] font-bold uppercase text-slate-400">
                      <Lock size={9} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default AvailabilityScheduler;
