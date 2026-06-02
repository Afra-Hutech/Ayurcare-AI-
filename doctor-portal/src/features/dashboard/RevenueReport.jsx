import React, { useEffect, useState, useMemo } from 'react';
import Sidebar from '../../components/ui/Sidebar';
import Navbar from '../../components/ui/Navbar';
import { doctorService } from '../../services/api';
import { motion } from 'framer-motion';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { IndianRupee, CalendarDays, TrendingUp, ClipboardCheck, Wallet, Download, AlertCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { downloadRevenueSpreadsheet } from '../../utils/revenueExport';

const fmtInr = (n) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Number(n) || 0);

const RevenueReport = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const loadRevenue = async () => {
    setLoading(true);
    setLoadError(null);
    const res = await doctorService.getRevenueSummary();
    setLoading(false);
    if (res.ok && res.data) {
      setData(res.data);
      setLoadError(null);
    } else {
      setData(null);
      setLoadError(res.error || 'Could not load earnings.');
    }
  };

  useEffect(() => {
    loadRevenue();
    const onFocus = () => loadRevenue();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  const chartRows = useMemo(() => {
    if (!data?.monthly?.length) return [];
    return data.monthly.map((m) => ({ ...m, labelShort: m.label }));
  }, [data]);

  const tooltipContent = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const row = payload[0]?.payload;
    return (
      <div className="rounded-lg border border-[var(--practo-border)] bg-[var(--practo-white)] px-3 py-2 text-xs shadow-md">
        <p className="font-semibold text-[var(--practo-text)]">{row?.label}</p>
        <p className="text-[var(--practo-text)] tabular-nums">{fmtInr(row?.amount)}</p>
        <p className="text-[var(--practo-text-light)]">{row?.visits || 0} paid visit{(row?.visits || 0) === 1 ? '' : 's'}</p>
      </div>
    );
  };

  const statCards = data
    ? [
        {
          label: 'Total collected',
          hint: 'Fees from completed consultations',
          value: fmtInr(data.totals?.realized),
          detail: `${data.totals?.realizedVisitsWithFee || 0} with fee · ${data.totals?.realizedVisits || 0} completed`,
          icon: Wallet,
        },
        {
          label: 'This month',
          hint: 'Completed visits this calendar month',
          value: fmtInr(data.totals?.thisMonth),
          detail: new Date().toLocaleString('en-IN', { month: 'long', year: 'numeric' }),
          icon: CalendarDays,
        },
        {
          label: 'Last 30 days',
          hint: 'By visit date',
          value: fmtInr(data.totals?.last30Days),
          detail: 'Rolling total',
          icon: TrendingUp,
        },
        {
          label: 'Upcoming',
          hint: 'Confirmed future visits with a fee',
          value: fmtInr(data.totals?.upcomingExpected),
          detail: `${data.totals?.upcomingCount || 0} booking${data.totals?.upcomingCount === 1 ? '' : 's'}`,
          icon: ClipboardCheck,
        },
      ]
    : [];

  return (
    <div className="flex min-h-screen bg-[var(--practo-bg)] text-[var(--practo-text)]">
      <Sidebar />
      <div className="flex-1 ml-64 min-w-0 flex flex-col min-h-screen">
        <Navbar />
        <main className="flex-1 overflow-y-auto p-6 md:p-8">
          <div className="max-w-5xl space-y-6">
            <div className="flex w-full items-start gap-4">
              <div className="min-w-0 flex-1">
                <h1 className="text-2xl font-bold text-[var(--practo-text)] tracking-tight">Earnings overview</h1>
                <p className="text-sm text-[var(--practo-text-light)] mt-1">
                  Totals update when you finalize a consultation (or mark it completed). Uses each visit fee, or your profile listing fee when none was saved.
                </p>
              </div>
              {!loading && data && (
                <button
                  type="button"
                  onClick={() => downloadRevenueSpreadsheet(data)}
                  className="ml-auto flex-shrink-0 inline-flex items-center gap-2 rounded-xl border border-[var(--practo-border)] bg-[var(--practo-white)] px-4 py-2.5 text-sm font-semibold text-[var(--practo-text)] shadow-sm hover:border-primary-500/40 transition"
                >
                  <Download size={18} aria-hidden />
                  Export Excel
                </button>
              )}
            </div>

            {loading ? (
              <div className="flex justify-center py-20">
                <div className="h-9 w-9 animate-spin rounded-full border-2 border-[var(--practo-border)] border-t-primary-600" />
              </div>
            ) : loadError ? (
              <div className="rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 px-5 py-4 text-sm text-rose-900 dark:text-rose-100">
                <p className="font-semibold">{loadError}</p>
                <button
                  type="button"
                  className="mt-3 text-xs font-bold text-primary-600 hover:underline"
                  onClick={() => loadRevenue()}
                >
                  Try again
                </button>
              </div>
            ) : !data ? null : (
              <>
                {(data.totals?.realizedVisits || 0) > 0
                  && (data.totals?.realizedVisitsWithFee || 0) === 0
                  && (data.totals?.realized || 0) === 0
                  && !data.meta?.defaultListingFee ? (
                  <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-5 py-4 flex gap-3">
                    <AlertCircle className="h-5 w-5 text-amber-700 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-amber-950 dark:text-amber-100">
                      <p className="font-semibold">Completed visit has no fee recorded</p>
                      <p className="mt-1 text-amber-900/90 dark:text-amber-200/90">
                        Set your <strong>consultation fee</strong> in Profile (Availability section), save, then refresh this page.
                        Fees from chat bookings are applied automatically when a locked offer amount exists.
                      </p>
                      <Link
                        to="/profile"
                        className="inline-block mt-2 text-xs font-bold text-primary-700 dark:text-primary-400 hover:underline"
                      >
                        Open Profile →
                      </Link>
                    </div>
                  </div>
                ) : null}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {statCards.map((card, i) => (
                    <motion.div
                      key={card.label}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.04 }}
                      className="rounded-xl border border-[var(--practo-border)] bg-[var(--practo-white)] p-5 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-[var(--practo-text)]">{card.label}</p>
                          <p className="text-[11px] text-[var(--practo-text-light)] mt-0.5">{card.hint}</p>
                          <p className="text-2xl font-bold tabular-nums text-[var(--practo-text)] mt-2">{card.value}</p>
                          <p className="text-xs text-[var(--practo-text-light)] mt-1">{card.detail}</p>
                        </div>
                        <div className="rounded-lg bg-[var(--practo-bg)] p-2.5 text-primary-600 dark:text-[#14bef0]">
                          <card.icon size={20} />
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>

                <div className="rounded-xl border border-[var(--practo-border)] bg-[var(--practo-white)] p-5 shadow-sm">
                  <h2 className="text-base font-semibold text-[var(--practo-text)]">Monthly collections</h2>
                  <p className="text-xs text-[var(--practo-text-light)] mt-0.5 mb-5">Last 6 months · completed visits with a fee</p>
                  <div className="h-[260px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartRows} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--practo-border)" vertical={false} />
                        <XAxis
                          dataKey="label"
                          tick={{ fontSize: 11, fill: 'var(--practo-text-light)' }}
                          interval={0}
                          angle={-20}
                          textAnchor="end"
                          height={48}
                        />
                        <YAxis
                          tick={{ fontSize: 11, fill: 'var(--practo-text-light)' }}
                          tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
                        />
                        <Tooltip content={tooltipContent} cursor={{ fill: 'rgba(20, 190, 240, 0.08)' }} />
                        <Bar dataKey="amount" name="Collected" fill="#0d9488" radius={[6, 6, 0, 0]} maxBarSize={40} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default RevenueReport;
