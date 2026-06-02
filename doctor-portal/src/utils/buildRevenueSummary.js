/** Client-side revenue rollup when /doctor/revenue-summary is unavailable (older API process). */

const parseFee = (raw) => {
  if (raw == null || raw === '') return 0;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return raw;
  const n = Number(String(raw).replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

const inferDefaultListingFee = (profile, appointments) => {
  const fromProfile = parseFee(profile?.availability?.fees);
  if (fromProfile > 0) return fromProfile;
  const fees = (Array.isArray(appointments) ? appointments : [])
    .map((a) => parseFee(a?.fee))
    .filter((f) => f > 0);
  return fees.length ? Math.max(...fees) : null;
};

const feeOf = (a, defaultListingFee = null) => {
  const stored = parseFee(a?.fee);
  if (stored > 0) return stored;
  const status = String(a?.status || '').toLowerCase();
  if (
    status === 'completed'
    && defaultListingFee != null
    && Number.isFinite(defaultListingFee)
    && defaultListingFee > 0
  ) {
    return defaultListingFee;
  }
  return 0;
};

const patientName = (a) => {
  const p = a?.patientId;
  if (!p) return '';
  if (typeof p === 'object') {
    return String(p.name || '').trim() || String(p.email || '').trim() || '';
  }
  return '';
};

const patientEmail = (a) => {
  const p = a?.patientId;
  if (!p || typeof p !== 'object') return '';
  return String(p.email || '').trim();
};

export function buildRevenueSummaryFromAppointments(appointments, profile = null) {
  const apps = Array.isArray(appointments) ? appointments : [];
  const defaultListingFee = inferDefaultListingFee(profile, apps);

  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const thirtyAgo = new Date(startOfToday);
  thirtyAgo.setDate(thirtyAgo.getDate() - 30);

  const isCompleted = (a) => String(a.status || '').toLowerCase() === 'completed';
  const realized = apps.filter(isCompleted);
  if (defaultListingFee) {
    realized.forEach((a) => {
      if (parseFee(a?.fee) <= 0) a.fee = defaultListingFee;
    });
  }
  const fee = (a) => {
    const stored = parseFee(a?.fee);
    if (stored > 0) return stored;
    return feeOf(a, defaultListingFee);
  };
  const totalRealized = realized.reduce((s, a) => s + fee(a), 0);
  const realizedWithFeeCount = realized.filter((a) => fee(a) > 0).length;

  const monthly = [];
  for (let i = 5; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleString('en-IN', { month: 'short', year: 'numeric' });
    let amount = 0;
    let visits = 0;
    realized.forEach((a) => {
      if (!a.startTime) return;
      const t = new Date(a.startTime);
      const k = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`;
      if (k !== key) return;
      const f = fee(a);
      amount += f;
      if (f > 0) visits += 1;
    });
    monthly.push({ key, label, amount, visits });
  }

  let last30Days = 0;
  realized.forEach((a) => {
    if (!a.startTime) return;
    const t = new Date(a.startTime);
    if (t >= thirtyAgo && t <= now) last30Days += fee(a);
  });

  const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const thisMonthRow = monthly.find((m) => m.key === thisMonthKey);
  const thisMonth = thisMonthRow ? thisMonthRow.amount : 0;

  let upcomingExpected = 0;
  let upcomingCount = 0;
  const upcomingForExport = [];

  apps.forEach((a) => {
    const s = String(a.status || '').toLowerCase();
    if (!['pending', 'scheduled', 'confirmed'].includes(s)) return;
    if (!a.startTime) return;
    const t = new Date(a.startTime);
    if (Number.isNaN(t.getTime()) || t < startOfToday) return;
    const f = fee(a);
    if (f <= 0) return;
    upcomingExpected += f;
    upcomingCount += 1;
    upcomingForExport.push(a);
  });

  const completedLineItems = [...realized]
    .sort((a, b) => (new Date(b.startTime || 0) - new Date(a.startTime || 0)))
    .map((a) => ({
      patientName: patientName(a),
      patientEmail: patientEmail(a),
      visitIso: a.startTime ? new Date(a.startTime).toISOString() : '',
      visitLocal: a.startTime
        ? new Date(a.startTime).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
        : '',
      feeInr: fee(a),
      visitType: a.type || '',
      status: 'completed',
    }));

  const upcomingLineItems = [...upcomingForExport]
    .sort((a, b) => new Date(a.startTime || 0) - new Date(b.startTime || 0))
    .map((a) => ({
      patientName: patientName(a),
      patientEmail: patientEmail(a),
      visitIso: a.startTime ? new Date(a.startTime).toISOString() : '',
      visitLocal: a.startTime
        ? new Date(a.startTime).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
        : '',
      expectedFeeInr: fee(a),
      visitType: a.type || '',
      status: String(a.status || '').toLowerCase(),
    }));

  return {
    currency: 'INR',
    defaultListingFee: Number.isFinite(defaultListingFee) ? defaultListingFee : null,
    totals: {
      realized: totalRealized,
      realizedVisits: realized.length,
      realizedVisitsWithFee: realizedWithFeeCount,
      last30Days,
      thisMonth,
      upcomingExpected,
      upcomingCount,
    },
    monthly,
    lineItems: {
      completed: completedLineItems,
      upcoming: upcomingLineItems,
    },
    meta: {
      doctorProfileFound: !!profile,
      generatedAt: new Date().toISOString(),
      source: 'client-appointments-fallback',
    },
  };
}
