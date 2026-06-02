import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, X, MessageSquare, Clock, AlertCircle } from 'lucide-react';
import { useDoctorNotifications } from '../../hooks/useDoctorNotifications';

/**
 * Doctor notification bell — unread messages, pending bookings, upcoming visits.
 * variant: navbar (top bar icon) | sidebar (full-width footer button)
 */
const NotificationBell = ({ variant = 'navbar' }) => {
  const navigate = useNavigate();
  const { notifications, unreadCount, loading, refresh } = useDoctorNotifications();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    const onEsc = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  const handleSelect = (n) => {
    setOpen(false);
    if (n.appointmentId) {
      navigate(n.path, { state: { reviewAppointmentId: n.appointmentId } });
    } else {
      navigate(n.path);
    }
  };

  const panel = (
    <div
      className={`absolute z-[250] bg-white dark:bg-[var(--practo-white)] rounded-2xl border border-slate-200 dark:border-[var(--practo-border)] shadow-2xl shadow-slate-200/60 dark:shadow-black/50 overflow-hidden ${
        variant === 'navbar'
          ? 'right-0 top-full mt-2 w-[min(22rem,calc(100vw-2rem))] max-h-[min(24rem,70vh)]'
          : 'left-0 right-0 bottom-full mb-2'
      }`}
      role="dialog"
      aria-label="Notifications"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-[var(--practo-border)]">
        <span className="text-xs font-black uppercase tracking-widest text-slate-500 dark:text-[var(--practo-text-light)]">
          Notifications
          {unreadCount > 0 ? ` (${unreadCount})` : ''}
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 transition"
          aria-label="Close notifications"
        >
          <X size={14} />
        </button>
      </div>
      <div className="max-h-72 overflow-y-auto">
        {loading && notifications.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-slate-400">Loading…</div>
        ) : notifications.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-slate-400">
            All caught up! No new notifications.
          </div>
        ) : (
          notifications.map((n) => (
            <button
              type="button"
              key={n.id}
              onClick={() => handleSelect(n)}
              className="w-full text-left px-4 py-3 border-b border-slate-50 dark:border-[var(--practo-border)] hover:bg-slate-50 dark:hover:bg-[var(--practo-bg)] transition flex items-start gap-3"
            >
              <div
                className={`mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  n.type === 'message'
                    ? 'bg-blue-50 text-blue-500'
                    : n.type === 'pending'
                      ? 'bg-red-50 text-red-500'
                      : 'bg-amber-50 text-amber-500'
                }`}
              >
                {n.type === 'message' ? (
                  <MessageSquare size={13} />
                ) : n.type === 'pending' ? (
                  <AlertCircle size={13} />
                ) : (
                  <Clock size={13} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-800 dark:text-[var(--practo-text)] leading-snug">{n.text}</p>
                {n.time && (
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {new Date(n.time).toLocaleString([], {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                )}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );

  if (variant === 'sidebar') {
    return (
      <div ref={rootRef} className="relative">
        <button
          type="button"
          onClick={() => {
            setOpen((v) => !v);
            if (!open) refresh();
          }}
          className="w-full flex items-center justify-between px-5 py-3.5 rounded-2xl border border-slate-100 bg-slate-50 hover:bg-slate-100 transition-all"
        >
          <div className="flex items-center gap-3">
            <Bell
              size={18}
              className={unreadCount > 0 ? 'text-[#82a18d]' : 'text-slate-400'}
            />
            <span className="text-sm font-bold text-slate-700">Notifications</span>
          </div>
          {unreadCount > 0 && (
            <span className="min-w-5 h-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
        {open && panel}
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          if (!open) refresh();
        }}
        className="relative text-slate-500 hover:text-[#82a18d] transition-colors p-2 hover:bg-slate-100 rounded-lg"
        aria-label={unreadCount ? `${unreadCount} notifications` : 'Notifications'}
        aria-expanded={open}
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
      {open && panel}
    </div>
  );
};

export default NotificationBell;
