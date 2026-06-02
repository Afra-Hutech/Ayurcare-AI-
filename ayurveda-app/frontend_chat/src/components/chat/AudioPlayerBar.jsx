import React from 'react';
import { Pause, Play, Square } from 'lucide-react';

/** Floating TTS controls with a simple “now playing” visualizer */
export default function AudioPlayerBar({ status, label, onPlay, onPause, onStop }) {
  if (status === 'idle') return null;

  const playing = status === 'playing';

  return (
    <div className="fixed bottom-[108px] left-1/2 z-50 -translate-x-1/2 w-[min(420px,calc(100vw-2rem))]">
      <div className="flex items-center gap-3 rounded-2xl border border-[#e0e7ed] bg-white px-4 py-3 shadow-lg">
        <div className="flex items-end gap-0.5 h-6 w-8 flex-shrink-0" aria-hidden>
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className={`w-1 rounded-full bg-[#14bef0] ${playing ? 'animate-pulse' : 'opacity-40'}`}
              style={{
                height: playing ? `${8 + (i % 3) * 6}px` : '6px',
                animationDelay: `${i * 0.12}s`,
                animationDuration: '0.55s',
              }}
            />
          ))}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#14bef0]">
            {playing ? 'Now playing' : 'Paused'}
          </p>
          <p className="text-xs font-medium text-slate-700 truncate">{label || 'Vaidya AI narration'}</p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {playing ? (
            <button
              type="button"
              onClick={onPause}
              className="w-9 h-9 rounded-xl bg-[#f0f4f7] text-[#28328c] flex items-center justify-center hover:bg-[#e0e7ed] transition"
              title="Pause"
            >
              <Pause size={16} />
            </button>
          ) : (
            <button
              type="button"
              onClick={onPlay}
              className="w-9 h-9 rounded-xl bg-[#28328c] text-white flex items-center justify-center hover:bg-[#1e2570] transition"
              title="Resume"
            >
              <Play size={16} className="ml-0.5" />
            </button>
          )}
          <button
            type="button"
            onClick={onStop}
            className="w-9 h-9 rounded-xl border border-slate-200 text-slate-600 flex items-center justify-center hover:bg-red-50 hover:text-red-600 transition"
            title="Stop"
          >
            <Square size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
