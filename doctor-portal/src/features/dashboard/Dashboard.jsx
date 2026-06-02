import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { authService, doctorService } from '../../services/api';
import Sidebar from '../../components/ui/Sidebar';
import Navbar from '../../components/ui/Navbar';
import {
  Users,
  Calendar,
  Clock3,
  AlertCircle,
  CheckCircle,
  ChevronRight,
  Search,
  Video,
  Building2,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';
import {
  normalizeAppointmentsList,
  resolveAppointmentStart,
  isSameLocalDay,
  normalizeStatus,
  getPatientKey,
  getAppointmentStatusBucket,
  isAppointmentJoinWindowOpen,
  isAppointmentSlotPast,
} from '../../utils/appointments';
import { computeDoctorDashboardStats } from '../../utils/dashboardStats';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

const ACTIVE_STATUSES = new Set(['pending', 'scheduled', 'confirmed']);
const STATUS_COLORS = {
  confirmed: '#10B981',
  pending: '#F59E0B',
  scheduled: '#3B82F6',
  completed: '#64748B',
  cancelled: '#EF4444',
  'no-show': '#94A3B8',
};

const Dashboard = () => {
  const [user] = useState(authService.getCurrentUser());
  const [doctorData, setDoctorData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [appointments, setAppointments] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [now, setNow] = useState(() => new Date());
  const navigate = useNavigate();
  const { isDark } = useTheme();

  const chartGridStroke = isDark ? '#334155' : '#F1F5F9';
  const chartTickFill = '#94A3B8';
  const chartTooltipStyle = useMemo(
    () => ({
      borderRadius: '8px',
      border: 'none',
      boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
      backgroundColor: isDark ? '#1e293b' : '#ffffff',
      color: isDark ? '#f8fafc' : '#0f172a',
    }),
    [isDark],
  );

  const patientKey = useCallback((apt) => getPatientKey(apt), []);

  const fetchData = async () => {
    try {
      const [profile, apts] = await Promise.all([
        doctorService.getProfile(),
        doctorService.getAppointments(),
      ]);
      setDoctorData(profile);
      setAppointments(normalizeAppointmentsList(apts));
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return undefined;
    fetchData();
    const interval = setInterval(fetchData, 30000);
    const onRefresh = () => fetchData();
    const onVisible = () => {
      if (document.visibilityState === 'visible') fetchData();
    };
    window.addEventListener('doctor-appointments-changed', onRefresh);
    window.addEventListener('focus', onRefresh);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      window.removeEventListener('doctor-appointments-changed', onRefresh);
      window.removeEventListener('focus', onRefresh);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [user]);

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(tick);
  }, []);

  const todayAppointments = useMemo(() => {
    const list = Array.isArray(appointments) ? appointments : [];
    return list
      .filter((a) => {
        const t = resolveAppointmentStart(a);
        return t && isSameLocalDay(t, now);
      })
      .sort((a, b) => (resolveAppointmentStart(a)?.getTime() ?? 0) - (resolveAppointmentStart(b)?.getTime() ?? 0));
  }, [appointments, now]);

  /** Today's visits excluding cancelled — aligns dashboard tiles with real workload */
  const todayMeaningfulAppointments = useMemo(() => {
    const MEANINGFUL = new Set(['pending', 'scheduled', 'confirmed', 'completed', 'no-show']);
    return todayAppointments.filter((a) => MEANINGFUL.has(normalizeStatus(a.status)));
  }, [todayAppointments]);

  const todayAppointmentsSubtitle = useMemo(() => {
    const { todayVisits, todayPatients, todayConfirmed, todayPending, todayCompleted } =
      computeDoctorDashboardStats(appointments, now);
    if (todayVisits <= 0) return 'Nothing scheduled for today';

    const peopleLine =
      todayPatients < todayVisits
        ? `${todayPatients} patient, ${todayVisits} appointments`
        : `${todayVisits} appointment${todayVisits === 1 ? '' : 's'}`;

    const statusParts = [];
    if (todayConfirmed > 0) statusParts.push(`${todayConfirmed} confirmed`);
    if (todayPending > 0) statusParts.push(`${todayPending} pending`);
    if (todayCompleted > 0) statusParts.push(`${todayCompleted} completed`);

    if (statusParts.length === 0) return peopleLine;
    if (todayCompleted === todayVisits && todayConfirmed === 0 && todayPending === 0) {
      return `${peopleLine} · all completed`;
    }
    return `${peopleLine} · ${statusParts.join(', ')}`;
  }, [appointments, now]);

  const stats = useMemo(() => {
    const base = computeDoctorDashboardStats(appointments, now);
    const list = Array.isArray(appointments) ? appointments : [];
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);

    const nextUpcoming = list
      .filter((a) => {
        const bucket = getAppointmentStatusBucket(a, now);
        if (bucket !== 'confirmed' && bucket !== 'pending') return false;
        const start = resolveAppointmentStart(a);
        return start && start > endOfToday;
      })
      .sort((a, b) => (resolveAppointmentStart(a)?.getTime() ?? 0) - (resolveAppointmentStart(b)?.getTime() ?? 0))[0] || null;

    return {
      ...base,
      today: base.todayVisits,
      todayActive: todayMeaningfulAppointments.filter((a) => ACTIVE_STATUSES.has(normalizeStatus(a.status))).length,
      confirmedActive: base.confirmedAll,
      pending: base.pendingAll,
      completed: base.todayCompleted,
      nextUpcoming,
    };
  }, [appointments, now, todayMeaningfulAppointments]);

  const todayHourlyData = useMemo(() => {
    const buckets = {};
    for (let h = 7; h <= 20; h += 1) {
      const label = h === 12 ? '12 PM' : h < 12 ? `${h} AM` : `${h - 12} PM`;
      buckets[h] = { hour: label, hourNum: h, visits: 0, confirmed: 0 };
    }
    todayMeaningfulAppointments.forEach((a) => {
      const t = resolveAppointmentStart(a);
      if (!t) return;
      const h = t.getHours();
      if (h < 7 || h > 20) return;
      buckets[h].visits += 1;
      if (normalizeStatus(a.status) === 'confirmed') buckets[h].confirmed += 1;
    });
    return Object.values(buckets);
  }, [todayMeaningfulAppointments]);

  const todayStatusChart = useMemo(() => {
    const counts = {};
    todayAppointments.forEach((a) => {
      const s = normalizeStatus(a.status);
      counts[s] = (counts[s] || 0) + 1;
    });
    return Object.entries(counts).map(([name, count]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      count,
      fill: STATUS_COLORS[name] || '#0D9488',
    }));
  }, [todayAppointments]);

  const patientInflowData = useMemo(() => {
    const list = Array.isArray(appointments) ? appointments : [];
    const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const days = [];
    for (let i = 6; i >= 0; i -= 1) {
      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);
      dayStart.setDate(dayStart.getDate() - i);
      const dayEnd = new Date(dayStart);
      dayEnd.setHours(23, 59, 59, 999);
      let visits = 0;
      list.forEach((a) => {
        const t = resolveAppointmentStart(a);
        if (t && t >= dayStart && t <= dayEnd) visits += 1;
      });
      days.push({
        date: labels[dayStart.getDay()],
        label: `${dayStart.getMonth() + 1}/${dayStart.getDate()}`,
        visits,
        isToday: isSameLocalDay(dayStart, now),
      });
    }
    return days;
  }, [appointments, now]);

  const statusBreakdownData = useMemo(() => {
    const list = Array.isArray(appointments) ? appointments : [];
    const keys = ['pending', 'scheduled', 'confirmed', 'completed', 'cancelled', 'no-show'];
    const counts = Object.fromEntries(keys.map((k) => [k, 0]));
    list.forEach((a) => {
      const s = normalizeStatus(a.status);
      if (s in counts) counts[s] += 1;
    });
    return keys
      .map((key) => ({
        name: key === 'no-show' ? 'No-show' : key.charAt(0).toUpperCase() + key.slice(1),
        count: counts[key],
        fill: STATUS_COLORS[key] || '#0D9488',
      }))
      .filter((row) => row.count > 0);
  }, [appointments]);

  const todayQueue = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return todayAppointments
      .filter((apt) => {
        if (!q) return true;
        const name = apt.patientId?.name?.toLowerCase() || '';
        const email = apt.patientId?.email?.toLowerCase() || '';
        return name.includes(q) || email.includes(q);
      })
      .filter((a) => {
        const bucket = getAppointmentStatusBucket(a, now);
        return bucket === 'confirmed' || bucket === 'pending';
      });
  }, [todayAppointments, searchQuery, now]);

  const renderQueueAction = (apt) => {
    const bucket = getAppointmentStatusBucket(apt, now);
    if (bucket === 'finished' || bucket === 'cancelled') {
      return (
        <span className="rounded-lg border border-[var(--practo-border)] bg-[var(--practo-bg)] px-3 py-1.5 text-xs font-bold capitalize text-[var(--practo-text-light)]">
          {bucket === 'finished' ? 'Completed' : 'Cancelled'}
        </span>
      );
    }
    if (bucket === 'pending') {
      return (
        <button
          type="button"
          onClick={() => navigate('/schedule')}
          className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-700"
        >
          Review
        </button>
      );
    }
    if (bucket === 'confirmed' && apt.type === 'online') {
      if (isAppointmentSlotPast(apt, now)) {
        return (
          <button
            type="button"
            onClick={() => navigate(`/consultation/${apt._id}`)}
            className="rounded-lg border border-slate-300 bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
          >
            View notes
          </button>
        );
      }
      if (!isAppointmentJoinWindowOpen(apt, now)) {
        const start = resolveAppointmentStart(apt);
        const label = start
          ? `Opens ${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
          : 'Not yet';
        return (
          <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-500 dark:border-slate-600 dark:bg-slate-800/60">
            {label}
          </span>
        );
      }
      return (
        <button
          type="button"
          onClick={() => navigate(`/consultation/${apt._id}`)}
          className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-teal-600 dark:bg-slate-700"
        >
          Start call
        </button>
      );
    }
    if (bucket === 'confirmed') {
      return (
        <span className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 px-3 py-1.5 text-xs font-bold text-emerald-800 dark:text-emerald-200">
          Confirmed
        </span>
      );
    }
    return null;
  };

  const getPatientName = (apt) => {
    const p = apt?.patientId;
    if (!p) return 'Patient';
    if (typeof p === 'string') {
      const id = p.replace(/\s/g, '');
      return id.length > 6 ? `Patient · …${id.slice(-6)}` : 'Patient';
    }
    const email = String(p.email || '').trim();
    const rawName = String(p.name || '').trim();
    const looksGeneric =
      !rawName ||
      /^patient$/i.test(rawName) ||
      /^user$/i.test(rawName) ||
      /^anonymous$/i.test(rawName);
    if (looksGeneric && email) {
      const local = email.split('@')[0].replace(/[._]+/g, ' ').trim();
      if (local) return local.charAt(0).toUpperCase() + local.slice(1);
    }
    if (rawName) return rawName;
    if (p._id) return `Patient · …${String(p._id).slice(-6)}`;
    return 'Patient';
  };

  const isSlotNow = (apt) => {
    const start = resolveAppointmentStart(apt);
    if (!start) return false;
    const end = apt.endTime ? new Date(apt.endTime) : new Date(start.getTime() + (Number(apt.duration) || 30) * 60000);
    return now >= start && now <= end;
  };

  if (loading) {
    return (
      <motion.div className="flex h-screen w-full items-center justify-center bg-[var(--practo-bg)]">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
          className="flex flex-col items-center gap-4"
        >
          <div className="h-12 w-12 rounded-full border-4 border-slate-200 dark:border-slate-600 border-t-[#0d9488]" />
          <p className="text-slate-500 dark:text-slate-400 font-medium">Loading DocConnect practitioner dashboard…</p>
        </motion.div>
      </motion.div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[var(--practo-bg)] text-[var(--practo-text)]">
      <Sidebar />

      <div className="flex-1 ml-64 min-w-0 flex flex-col min-h-screen">
        <Navbar />

        <main className="flex-1 overflow-y-auto p-6 md:p-8">
          <div className="max-w-7xl mx-auto">
            <header className="mb-8">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-slate-50">
                  Welcome, Dr. {doctorData?.basicInfo?.name?.split(' ').pop() || 'Practitioner'}
                </h1>
                <p className="text-gray-500 dark:text-slate-300 mt-1">
                  {stats.todayVisits > 0
                    ? stats.todayPatients < stats.todayVisits
                      ? `Today: ${stats.todayPatients} patient with ${stats.todayVisits} appointments on your calendar`
                      : `Today: ${stats.todayVisits} appointment${stats.todayVisits === 1 ? '' : 's'} on your calendar`
                    : stats.confirmedActive > 0 && stats.nextUpcoming
                      ? `${stats.confirmedActive} confirmed booking${stats.confirmedActive === 1 ? '' : 's'} · Next: ${resolveAppointmentStart(stats.nextUpcoming)?.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
                      : stats.confirmedActive > 0
                        ? `${stats.confirmedActive} confirmed booking${stats.confirmedActive === 1 ? '' : 's'} (none scheduled for today)`
                        : stats.pending > 0
                          ? `${stats.pending} pending request${stats.pending === 1 ? '' : 's'} awaiting review`
                          : appointments.length > 0
                            ? `${stats.totalPatients} total patients in your practice`
                            : 'No active consultations scheduled yet.'}
                </p>
              </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              {[
                {
                  label: 'Appointments today',
                  sub: todayAppointmentsSubtitle,
                  value: stats.todayVisits,
                  icon: Calendar,
                  color: '#0D9488',
                  path: '/schedule',
                },
                {
                  label: 'Completed today',
                  sub: 'Visits marked completed in your registry',
                  value: stats.todayCompleted,
                  icon: Clock3,
                  color: '#F59E0B',
                  path: '/schedule',
                },
                {
                  label: 'Confirmed today',
                  sub: stats.confirmedAll > stats.todayConfirmed
                    ? `${stats.confirmedAll} confirmed overall (future dates included)`
                    : "Scheduled and ready for today's slots",
                  value: stats.todayConfirmed,
                  icon: CheckCircle,
                  color: '#10B981',
                  path: '/schedule',
                },
                {
                  label: 'Pending requests',
                  sub: stats.pendingAll > 0 ? 'Across all dates · needs your review' : 'Nothing waiting for approval',
                  value: stats.pendingAll,
                  icon: AlertCircle,
                  color: '#EF4444',
                  path: '/schedule',
                },
              ].map((stat, i) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  whileHover={{ y: -4 }}
                  onClick={() => stat.path && navigate(stat.path)}
                  className={`bg-[var(--practo-white)] p-6 rounded-xl shadow-sm border border-[var(--practo-border)] flex justify-between items-center ${stat.path ? 'cursor-pointer hover:border-teal-300 hover:shadow-md dark:hover:border-teal-700' : ''}`}
                >
                  <div>
                    <p className="text-sm font-medium text-[var(--practo-text-light)]">{stat.label}</p>
                    {stat.sub && <p className="text-xs text-[var(--practo-text-light)] opacity-90 mt-0.5">{stat.sub}</p>}
                    <p className="text-2xl font-bold mt-1 text-[var(--practo-text)]">{stat.value}</p>
                  </div>
                  <div className="p-3 rounded-lg" style={{ backgroundColor: `${stat.color}15` }}>
                    <stat.icon size={24} style={{ color: stat.color }} />
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Today's live schedule — primary focus */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
              <div className="lg:col-span-2 rounded-xl border border-[var(--practo-border)] bg-[var(--practo-white)] p-6 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-[var(--practo-text)]">Today&apos;s consultations</h3>
                    <p className="text-xs text-[var(--practo-text-light)]">
                      Live schedule for {now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate('/schedule')}
                    className="text-xs font-bold text-teal-600 hover:text-teal-700 dark:text-teal-400 dark:hover:text-teal-300"
                  >
                    Open calendar
                  </button>
                </div>

                {todayQueue.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[var(--practo-border)] bg-[var(--practo-bg)] py-12 text-center">
                    <Calendar className="mx-auto mb-3 text-[var(--practo-text-light)] opacity-50" size={32} />
                    <p className="text-sm font-semibold text-[var(--practo-text)]">No visits on today&apos;s calendar</p>
                    <p className="mt-1 text-xs text-[var(--practo-text-light)]">Confirmed bookings will appear here automatically.</p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
                    {todayQueue.map((apt, idx) => {
                      const start = resolveAppointmentStart(apt);
                      const status = normalizeStatus(apt.status);
                      const live = isSlotNow(apt);
                      return (
                        <motion.div
                          key={apt._id || idx}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: idx * 0.04 }}
                          className={`flex items-center justify-between rounded-xl border p-4 transition-all ${
                            live
                              ? 'border-emerald-400 bg-emerald-50/90 ring-2 ring-emerald-300/50 dark:bg-emerald-950/35 dark:ring-emerald-400/35'
                              : 'border-[var(--practo-border)] bg-[var(--practo-bg)] hover:border-teal-300 dark:hover:border-teal-700'
                          }`}
                        >
                          <div className="flex items-center gap-4 min-w-0">
                            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-teal-100 font-bold text-teal-800 dark:bg-teal-900/50 dark:text-teal-200">
                              {getPatientName(apt).charAt(0)}
                            </div>
                            <div className="min-w-0">
                              <h4 className="truncate font-bold text-[var(--practo-text)]">{getPatientName(apt)}</h4>
                              <div className="mt-1 flex flex-wrap gap-3 text-xs text-[var(--practo-text-light)]">
                                <span className="flex items-center gap-1">
                                  <Clock3 size={12} />
                                  {start?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                                <span className="flex items-center gap-1">
                                  {apt.type === 'online' ? <Video size={12} /> : <Building2 size={12} />}
                                  {apt.type === 'online' ? 'Video' : 'Clinic'}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span
                              className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide"
                              style={{
                                backgroundColor: `${STATUS_COLORS[status] || '#0D9488'}20`,
                                color: STATUS_COLORS[status] || '#0D9488',
                              }}
                            >
                              {status}
                            </span>
                            {live && (
                              <span className="px-2 py-1 rounded-full bg-emerald-600 text-white text-[10px] font-bold animate-pulse">
                                NOW
                              </span>
                            )}
                            {renderQueueAction(apt)}
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-[var(--practo-border)] bg-[var(--practo-white)] p-6 shadow-sm">
                <h3 className="mb-1 font-bold text-[var(--practo-text)]">Today by hour</h3>
                <p className="mb-4 text-xs text-[var(--practo-text-light)]">Confirmed slots highlighted</p>
                <div className="h-[280px] w-full min-w-0">
                  <ResponsiveContainer width="100%" height={280} minWidth={0}>
                    <BarChart data={todayHourlyData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartGridStroke} />
                      <XAxis dataKey="hour" tick={{ fill: chartTickFill, fontSize: 10 }} interval={1} />
                      <YAxis allowDecimals={false} tick={{ fill: chartTickFill, fontSize: 11 }} />
                      <Tooltip contentStyle={chartTooltipStyle} />
                      <Bar dataKey="visits" name="Visits" radius={[4, 4, 0, 0]}>
                        {todayHourlyData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.confirmed > 0 ? '#10B981' : '#0D9488'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="rounded-xl border border-[var(--practo-border)] bg-[var(--practo-white)] p-6 shadow-sm">
                <h3 className="mb-1 font-bold text-[var(--practo-text)]">Visit volume (last 7 days)</h3>
                <p className="mb-4 text-xs text-[var(--practo-text-light)]">Today highlighted in the trend</p>
                <div className="h-[250px] w-full min-w-0">
                  <ResponsiveContainer width="100%" height={250} minWidth={0}>
                    <AreaChart data={patientInflowData}>
                      <defs>
                        <linearGradient id="colorInflow" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#0D9488" stopOpacity={0.15} />
                          <stop offset="95%" stopColor="#0D9488" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartGridStroke} />
                      <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: chartTickFill, fontSize: 12 }} />
                      <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: chartTickFill, fontSize: 12 }} />
                      <Tooltip
                        formatter={(value) => [value, 'Visits']}
                        labelFormatter={(_, payload) =>
                          payload?.[0] ? `${payload[0].payload.date} (${payload[0].payload.label})` : ''
                        }
                        contentStyle={chartTooltipStyle}
                      />
                      <Area
                        type="monotone"
                        dataKey="visits"
                        stroke="#0D9488"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#colorInflow)"
                        dot={({ cx, cy, payload }) =>
                          payload.isToday ? (
                            <circle
                              cx={cx}
                              cy={cy}
                              r={5}
                              fill="#F59E0B"
                              stroke={isDark ? '#161f2e' : '#ffffff'}
                              strokeWidth={2}
                            />
                          ) : null
                        }
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="rounded-xl border border-[var(--practo-border)] bg-[var(--practo-white)] p-6 shadow-sm">
                <h3 className="mb-1 font-bold text-[var(--practo-text)]">
                  {todayStatusChart.length ? "Today's status mix" : 'All appointment statuses'}
                </h3>
                <p className="mb-4 text-xs text-[var(--practo-text-light)]">From your live practice data</p>
                <div className="h-[250px] w-full min-w-0">
                  {(todayStatusChart.length ? todayStatusChart : statusBreakdownData).length === 0 ? (
                    <div className="flex h-full items-center justify-center text-sm text-[var(--practo-text-light)]">No appointments yet</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={250} minWidth={0}>
                      <BarChart
                        data={todayStatusChart.length ? todayStatusChart : statusBreakdownData}
                        layout="vertical"
                        margin={{ left: 8, right: 16 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={chartGridStroke} />
                        <XAxis type="number" allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: chartTickFill, fontSize: 12 }} />
                        <YAxis type="category" dataKey="name" width={88} axisLine={false} tickLine={false} tick={{ fill: chartTickFill, fontSize: 12 }} />
                        <Tooltip contentStyle={chartTooltipStyle} />
                        <Bar dataKey="count" radius={[0, 6, 6, 0]} name="Count">
                          {(todayStatusChart.length ? todayStatusChart : statusBreakdownData).map((entry, index) => (
                            <Cell key={`status-${index}`} fill={entry.fill || '#0D9488'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-[var(--practo-border)] bg-[var(--practo-white)] shadow-sm">
              <div className="flex items-center justify-between border-b border-[var(--practo-border)] p-6">
                <div>
                  <h3 className="text-lg font-bold text-[var(--practo-text)]">Today&apos;s queue</h3>
                  <p className="text-sm text-[var(--practo-text-light)]">Search and start today&apos;s patient sessions</p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/schedule')}
                  className="flex items-center gap-1 rounded-lg bg-teal-50 px-4 py-2 text-sm font-bold text-teal-700 transition-colors hover:bg-teal-100 dark:bg-teal-950/60 dark:text-teal-300 dark:hover:bg-teal-900/50"
                >
                  View Full Schedule <ChevronRight size={16} />
                </button>
              </div>

              <div className="p-6">
                <div className="relative mb-6">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--practo-text-light)] opacity-70" size={18} />
                  <input
                    type="text"
                    placeholder="Search today's patients..."
                    className="w-full rounded-xl border border-[var(--practo-border)] bg-[var(--practo-bg)] py-2.5 pl-10 pr-4 text-[var(--practo-text)] outline-none transition-all placeholder:text-[var(--practo-text-light)] focus:bg-[var(--practo-white)] focus:ring-2 focus:ring-teal-500/40"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>

                <div className="space-y-3">
                  {todayQueue.length > 0 ? (
                    todayQueue.map((apt) => {
                      const start = resolveAppointmentStart(apt);
                      return (
                        <motion.div
                          key={apt._id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="flex items-center justify-between rounded-xl border border-[var(--practo-border)] bg-[var(--practo-bg)] p-4 transition-all hover:border-teal-300 dark:hover:border-teal-700"
                        >
                          <div className="flex items-center gap-4">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-teal-100 font-bold text-teal-800 dark:bg-teal-900/45 dark:text-teal-200">
                              {getPatientName(apt).charAt(0)}
                            </div>
                            <div>
                              <h4 className="font-bold text-[var(--practo-text)]">{getPatientName(apt)}</h4>
                              <div className="mt-1 flex gap-4 text-xs text-[var(--practo-text-light)]">
                                <span className="flex items-center gap-1">
                                  <Clock3 size={12} />
                                  {start?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                                <span className="capitalize">{normalizeStatus(apt.status)}</span>
                              </div>
                            </div>
                          </div>
                          {renderQueueAction(apt)}
                        </motion.div>
                      );
                    })
                  ) : (
                    <div className="py-12 text-center">
                      <p className="font-medium text-[var(--practo-text-light)]">No patients scheduled for today.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Dashboard;
