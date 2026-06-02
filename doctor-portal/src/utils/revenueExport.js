import * as XLSX from 'xlsx';

/**
 * Build a multi-sheet .xlsx workbook from GET /doctor/revenue-summary payload.
 * Opens cleanly in Microsoft Excel / Google Sheets.
 */
export function downloadRevenueSpreadsheet(payload) {
  if (!payload || typeof payload !== 'object') return;

  const wb = XLSX.utils.book_new();
  const exportedAt = new Date();
  const totals = payload.totals || {};

  const summaryAoA = [
    ['DocConnect — Consultation revenue'],
    [`Exported (local): ${exportedAt.toLocaleString('en-IN')}`],
    [`Server generated: ${payload.meta?.generatedAt || '—'}`],
    [],
    ['Metric', 'Amount (INR)', 'Detail'],
    ['Realized (all time)', totals.realized ?? 0, 'Sum of fee on completed visits'],
    ['This month (calendar)', totals.thisMonth ?? 0, 'Completed visits in current month'],
    ['Last 30 days', totals.last30Days ?? 0, 'By visit start date'],
    ['Upcoming expected', totals.upcomingExpected ?? 0, 'Future pending/scheduled/confirmed with fee from today'],
    [],
    ['Completed visit count', totals.realizedVisits ?? 0, 'All completed rows'],
    ['Completed with fee > 0', totals.realizedVisitsWithFee ?? 0, 'Used in INR sums'],
    ['Upcoming bookings (with fee)', totals.upcomingCount ?? 0, 'From today forward'],
    ['Default listing fee (profile)', payload.defaultListingFee ?? '—', 'availability.fees'],
    ['Currency', payload.currency || 'INR', ''],
  ];

  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryAoA), 'Summary');

  const monthly = (payload.monthly || []).map((m) => ({
    Month: m.label,
    MonthKey: m.key,
    RealizedINR: m.amount,
    VisitsWithFee: m.visits,
  }));
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(monthly.length ? monthly : [{ Month: 'No data', RealizedINR: 0 }]),
    'Monthly trend',
  );

  const completed = (payload.lineItems?.completed || []).map((r) => ({
    Patient: r.patientName || '',
    Email: r.patientEmail || '',
    VisitLocal: r.visitLocal || '',
    VisitISO: r.visitIso || '',
    FeeINR: r.feeInr ?? 0,
    Type: r.visitType || '',
    Status: r.status || '',
  }));
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      completed.length ? completed : [{ Patient: '(No completed visits)', FeeINR: '' }],
    ),
    'Completed visits',
  );

  const upcoming = (payload.lineItems?.upcoming || []).map((r) => ({
    Patient: r.patientName || '',
    Email: r.patientEmail || '',
    VisitLocal: r.visitLocal || '',
    VisitISO: r.visitIso || '',
    ExpectedFeeINR: r.expectedFeeInr ?? 0,
    Type: r.visitType || '',
    Status: r.status || '',
  }));
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      upcoming.length ? upcoming : [{ Patient: '(No upcoming fee-bearing visits)', ExpectedFeeINR: '' }],
    ),
    'Upcoming expected',
  );

  const safeDate = exportedAt.toISOString().slice(0, 10);
  XLSX.writeFile(wb, `DocConnect-revenue-${safeDate}.xlsx`);
}
