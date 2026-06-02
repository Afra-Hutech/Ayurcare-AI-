import React, { useState, useEffect, useCallback } from 'react';
import ReportCard from '../../components/dashboard/ReportCard';
import ReportRenderer from '../../ReportRenderer';
import { SlidersHorizontal, Activity, FileText, ChevronRight, Loader2, X, Download, Grid3x3, List } from 'lucide-react';
import { patientApi, chatApi } from '../../services/api';
import { Link, useLocation } from 'react-router-dom';
import { downloadMedicalReportPDF } from '../../utils/pdfExport';
import { resolveReportsFromSession, pickMainReport } from '../../utils/reportPayload';
import { deriveThreatLevel } from '../../utils/threatLevel';
import { resolvePatientUserId } from '../../utils/patientUser';
import { formatClinicalTitle } from '../../utils/ayurvedicTerms';

const Consultations = () => {
  const location = useLocation();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortOrder, setSortOrder] = useState('newest'); // 'newest' or 'oldest'
  const [viewMode, setViewMode] = useState('list'); // 'grid' or 'list'
  const [selectedReportId, setSelectedReportId] = useState(null);
  const [fullReportData, setFullReportData] = useState(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isDetailsLoading, setIsDetailsLoading] = useState(false);

  const extractReportPayload = (text) => {
    if (!text) return null;
    try {
      if (typeof text === 'object') return text;
      const raw = text.includes('---REPORT_DATA---') ? text.split('---REPORT_DATA---').pop() : text;
      const clean = raw.replace(/```json/g, '').replace(/```/g, '').trim();
      return JSON.parse(clean);
    } catch (_err) {
      return null;
    }
  };

  const normalizeReports = (payload, fallbackPatientInfo = {}) => {
    if (!payload) return [];
    const patientInfo = payload.patientInfo || fallbackPatientInfo || {};
    if (payload.reports && Array.isArray(payload.reports)) {
      return payload.reports
        .filter(r => r && typeof r === 'object')
        .map(r => ({
          reportType: r.reportType || 'Diagnosis Report',
          title: r.title || r.reportType || 'Clinical Report',
          reportData: {
            ...(r.reportData || {}),
            patientInfo: r.reportData?.patientInfo || patientInfo,
          }
        }));
    }
    return [{
      reportType: 'Diagnosis Report',
      title: 'Clinical Diagnosis',
      reportData: {
        ...payload,
        patientInfo,
      }
    }];
  };

  const openReportDrawer = async (report) => {
    setSelectedReportId(report._id);
    setIsDrawerOpen(true);
    setIsDetailsLoading(true);
    setFullReportData(null);
    try {
      if (report.sessionId) {
        const res = await chatApi.getSession(report.sessionId);
        const sessionData = res.data;
        const allReports = resolveReportsFromSession(sessionData, report.patientInfo || {});
        if (allReports.length > 0) {
          setFullReportData(allReports);
          return;
        }
      }
      if (report.reportData && typeof report.reportData === 'object') {
        if (Array.isArray(report.reportData.reports)) {
          const normalizedFromBundle = normalizeReports(report.reportData, report.reportData.patientInfo || {});
          if (normalizedFromBundle.length > 0) {
            setFullReportData(normalizedFromBundle);
            return;
          }
        }
        const payload = extractReportPayload(report.reportData.fullDiagnosisText || report.reportData);
        const normalized = normalizeReports(payload, report.patientInfo || {});
        if (normalized.length > 0) {
          setFullReportData(normalized);
          return;
        }
      }
    } catch (err) {
      console.error('Failed to load full report:', err);
    } finally {
      setIsDetailsLoading(false);
    }
  };

  const closeDrawer = () => {
    setIsDrawerOpen(false);
    setTimeout(() => {
      setFullReportData(null);
      setSelectedReportId(null);
    }, 300);
  };

  const downloadSingleReport = (reportItem) => {
    if (!reportItem || !reportItem.reportData) return;
    downloadMedicalReportPDF(reportItem.reportData, {
      reportType: reportItem.reportType,
      reportTitle: reportItem.title
    });
  };

  const buildReportRowFromSession = (session) => {
    if (!session?.diagnosis || !String(session.diagnosis).includes('---REPORT_DATA---')) {
      return null;
    }
    const payload = extractReportPayload(session.diagnosis);
    const bundle = payload?.reports && Array.isArray(payload.reports) ? payload : null;
    const diagEntry = bundle?.reports?.find((r) => r.reportType === 'Diagnosis Report');
    const rd = diagEntry?.reportData || {};
    const rawDiag = rd.diagnosis;
    let label = '';
    if (rawDiag && typeof rawDiag === 'object') {
      label = formatClinicalTitle(
        rawDiag.name || rawDiag.label || '',
        rawDiag.ayurvedicName || rawDiag.ayurvedic_name || rawDiag.sanskritName,
      );
    } else if (typeof rawDiag === 'string' && rawDiag.trim()) {
      label = formatClinicalTitle(rawDiag.trim(), '');
    }
    if (!String(label || '').trim()) {
      label = formatClinicalTitle(session.title || '', '') || 'AI Consultation';
    }
    const sym = rd.symptomsReported || rd.supportingFindings || [];
    const lifestyle = bundle?.reports?.find((r) => r.reportType === 'Lifestyle Report');
    const lifeSteps = lifestyle?.reportData?.routine_steps || [];
    return {
      _id: String(session._id),
      sessionId: session._id,
      reportType: 'AI Consultation',
      reportTitle: label,
      diagnosis: label,
      symptoms: Array.isArray(sym) ? sym.join(', ') : '',
      recommendations: Array.isArray(lifeSteps) ? lifeSteps.map((s) => `• ${s}`).join('\n') : '',
      threatLevel: deriveThreatLevel(
        { threatLevel: rd.threatLevel, symptoms: Array.isArray(sym) ? sym.join(', ') : '', diagnosis: label },
        rd,
      ),
      severity: deriveThreatLevel(
        { threatLevel: rd.threatLevel, symptoms: Array.isArray(sym) ? sym.join(', ') : '', diagnosis: label },
        rd,
      ),
      reportData: bundle || { source: 'ai_chat', fullDiagnosisText: session.diagnosis },
      patientInfo: payload?.patientInfo || {},
      createdAt: session.updatedAt || session.createdAt,
      date: session.updatedAt
        ? new Date(session.updatedAt).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10),
    };
  };

  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      let userId = null;
      try {
        userId = resolvePatientUserId();
      } catch {
        userId = null;
      }

      const [reportsRes, sessionsRes] = await Promise.all([
        patientApi.getReports().catch(() => ({ data: [] })),
        userId ? chatApi.getSessions(userId).catch(() => ({ data: { data: [] } })) : Promise.resolve({ data: { data: [] } }),
      ]);

      const dbReports = Array.isArray(reportsRes.data) ? reportsRes.data : [];
      const sessions = sessionsRes.data?.data || [];
      const sessionIdsInDb = new Set(
        dbReports.filter((r) => r.sessionId).map((r) => String(r.sessionId)),
      );

      const fromChat = sessions
        .map(buildReportRowFromSession)
        .filter(Boolean)
        .filter((row) => !sessionIdsInDb.has(String(row.sessionId)));

      const merged = [...dbReports, ...fromChat].sort(
        (a, b) => new Date(b.createdAt || b.date).getTime() - new Date(a.createdAt || a.date).getTime(),
      );
      setReports(merged);
    } catch (err) {
      console.error('Failed to fetch reports:', err);
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (location.pathname !== '/consultations') return;
    fetchReports();
  }, [location.pathname, fetchReports]);

  useEffect(() => {
    const onSync = () => fetchReports();
    window.addEventListener('consultations-sync', onSync);
    return () => window.removeEventListener('consultations-sync', onSync);
  }, [fetchReports]);

  const handleDeleteReport = async (reportId) => {
    try {
      await patientApi.deleteReport(reportId);
      setReports(prev => prev.filter(r => r._id !== reportId));
    } catch (err) {
      console.error('Failed to delete report:', err);
    }
  };

  const sortedReports = [...reports].sort((a, b) => {
    const dateA = new Date(a.createdAt || a.date).getTime();
    const dateB = new Date(b.createdAt || b.date).getTime();
    return sortOrder === 'newest' ? dateB - dateA : dateA - dateB;
  });

  const displayedReports = sortedReports.reduce((acc, report) => {
    const groupingKey = report.sessionId ? String(report.sessionId) : String(report._id);
    if (!acc.seen.has(groupingKey)) {
      acc.seen.add(groupingKey);
      acc.items.push(report);
    }
    return acc;
  }, { seen: new Set(), items: [] }).items;

  return (
    <div className="h-full page-scroll">
      <div className="page-content max-w-[1240px] space-y-5 pb-8">
        <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-700">
          <div className="space-y-1 min-w-0">
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
              <span className="text-slate-400 dark:text-slate-500">Patient</span>
              <span className="mx-1.5 text-slate-300 dark:text-slate-600">/</span>
              <span className="text-slate-800 dark:text-slate-200 font-semibold">AI Doc</span>
            </p>
            <div className="flex items-center gap-2 text-[#28328c] dark:text-[#14bef0] font-bold uppercase text-[10px] tracking-[2px]">
              <FileText size={14} strokeWidth={2.5} />
              <span>Clinical Repository</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-50 tracking-tight">AI Doc Records</h1>
            <p className="text-slate-600 dark:text-slate-300 font-medium text-sm leading-snug max-w-xl">
              Every AI-generated diagnosis from your sessions appears here and stays in your account until you remove it.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'}`}
                title="Grid view"
              >
                <Grid3x3 size={18} strokeWidth={2.5} />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'}`}
                title="List view"
              >
                <List size={18} strokeWidth={2.5} />
              </button>
            </div>

            <div className="relative group/sort">
              <SlidersHorizontal className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within/sort:text-slate-900 transition-colors" size={18} strokeWidth={2.5} />
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                className="pl-12 pr-10 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 focus:border-[#28328c] dark:focus:border-[#14bef0] focus:bg-white dark:focus:bg-slate-800 rounded-lg outline-none text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100 appearance-none transition-all duration-300 shadow-sm cursor-pointer min-w-[180px]"
              >
                <option value="newest">Most Recent</option>
                <option value="oldest">Oldest First</option>
              </select>
              <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                <ChevronRight size={16} strokeWidth={3} className="rotate-90" />
              </div>
            </div>
          </div>
        </header>

        {loading ? (
          viewMode === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map(i => <div key={i} className="h-44 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl animate-pulse"></div>)}
            </div>
          ) : (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <div key={i} className="h-16 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl animate-pulse"></div>)}
            </div>
          )
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {displayedReports.map(report => (
              <ReportCard key={report._id} report={report} onView={() => openReportDrawer(report)} onDelete={handleDeleteReport} isListView={false} />
            ))}

            {displayedReports.length === 0 && (
              <div className="col-span-full py-16 sm:py-24 bg-slate-50 dark:bg-slate-900/40 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl flex flex-col items-center justify-center text-center space-y-4 animate-fade-in">
                <FileText size={40} className="text-slate-300 dark:text-slate-600" />
                <div>
                  <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">No Reports Found</h3>
                  <p className="text-slate-500 dark:text-slate-400 text-sm mt-1 max-w-xs">Complete an AI consultation and reply <strong>Yes</strong> when asked to generate your report.</p>
                </div>
                <Link to="/chat" className="bg-slate-900 dark:bg-slate-700 text-white px-6 py-2 rounded-xl font-bold text-sm shadow hover:bg-black transition-all flex items-center gap-2">
                  <span>Start consultation</span>
                  <Activity size={14} strokeWidth={3} className="text-emerald-400" />
                </Link>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {displayedReports.map(report => (
              <ReportCard key={report._id} report={report} onView={() => openReportDrawer(report)} onDelete={handleDeleteReport} isListView={true} />
            ))}

            {displayedReports.length === 0 && (
              <div className="py-16 sm:py-24 bg-slate-50 dark:bg-slate-900/40 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl flex flex-col items-center justify-center text-center space-y-4 animate-fade-in">
                <FileText size={40} className="text-slate-300 dark:text-slate-600" />
                <div>
                  <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">No Reports Found</h3>
                  <p className="text-slate-500 dark:text-slate-400 text-sm mt-1 max-w-xs">Complete an AI consultation and reply <strong>Yes</strong> when asked to generate your report.</p>
                </div>
                <Link to="/chat" className="bg-slate-900 dark:bg-slate-700 text-white px-6 py-2 rounded-xl font-bold text-sm shadow hover:bg-black transition-all flex items-center gap-2">
                  <span>Start consultation</span>
                  <Activity size={14} strokeWidth={3} className="text-emerald-400" />
                </Link>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Report Bundle Modal */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in"
            onClick={closeDrawer}
          />

          <div className="relative w-[92vw] max-w-[960px] max-h-[85vh] bg-white dark:bg-slate-900 rounded-[32px] border border-slate-100 dark:border-slate-700 shadow-2xl flex flex-col overflow-hidden animate-fade-in">
            <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between bg-white dark:bg-slate-900">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2 text-[#28328c] dark:text-[#14bef0] font-bold text-xs tracking-tight">
                  <FileText size={14} strokeWidth={2.5} />
                  <span>Clinical Assessment</span>
                </div>
                <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-50 tracking-tight">All Clinical Reports</h3>
              </div>
              <button
                onClick={closeDrawer}
                className="p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-400 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-500 transition-all"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-50/40 dark:bg-slate-950/50 p-8">
              {isDetailsLoading ? (
                <div className="h-full flex flex-col items-center justify-center space-y-4">
                  <Loader2 size={48} className="animate-spin text-ayur-forest" />
                  <p className="text-xs font-bold tracking-tight text-slate-400">Synthesizing clinical data...</p>
                </div>
              ) : fullReportData ? (
                <div className="animate-fade-in space-y-8">
                  {pickMainReport(fullReportData) && (
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/80 dark:bg-indigo-950/40 px-4 py-3">
                      <p className="text-xs font-semibold text-indigo-800 dark:text-indigo-200">
                        {fullReportData.length} specialist reports · scroll to read each section
                      </p>
                      <button
                        type="button"
                        onClick={() => downloadSingleReport(pickMainReport(fullReportData))}
                        className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-black shrink-0"
                      >
                        <Download size={12} />
                        Master PDF
                      </button>
                    </div>
                  )}
                  <div className="space-y-8">
                    {(Array.isArray(fullReportData) ? fullReportData : [fullReportData]).map((r, idx) => (
                      <section
                        key={`${r.reportType || 'report'}-${idx}`}
                        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden shadow-sm"
                      >
                        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-100 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/80">
                          <div className="min-w-0">
                            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-[#28328c] dark:text-[#14bef0]">
                              {r.reportType || 'Clinical Report'}
                            </span>
                            <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">{r.title || 'Clinical Summary'}</h4>
                          </div>
                          <button
                            type="button"
                            onClick={() => downloadSingleReport(r)}
                            className="flex items-center gap-1 rounded-lg bg-slate-800 px-2.5 py-1.5 text-[10px] font-bold text-white hover:bg-slate-900 shrink-0"
                            title="Download PDF"
                          >
                            <Download size={12} />
                            PDF
                          </button>
                        </div>
                        <div className="max-h-[min(420px,50vh)] overflow-y-auto custom-scrollbar">
                          <ReportRenderer report={r.reportData} reportType={r.reportType} />
                        </div>
                      </section>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center space-y-4 opacity-20">
                  <FileText size={80} />
                  <p className="font-bold text-sm">Failed to load detailed report data.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Consultations;

