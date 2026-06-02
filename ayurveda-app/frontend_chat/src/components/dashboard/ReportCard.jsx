import React from 'react';
import { FileText, Download, Eye, Calendar, ShieldCheck, Loader2, Trash2, AlertCircle, AlertTriangle, CheckCircle } from 'lucide-react';
import { downloadMedicalReportPDF } from '../../utils/pdfExport';
import { chatApi } from '../../services/api';
import { parseReportPayload, validateAndNormalizeV2Payload, pickMainReport, resolveReportsFromSession } from '../../utils/reportPayload';
import { deriveThreatLevel } from '../../utils/threatLevel';
import { formatClinicalTitle } from '../../utils/ayurvedicTerms';

/** Normalize diagnosis strings/objects for AI Doc Records & saved reports */
function reportDiagnosisDisplayTitle(report) {
  const d = report?.diagnosis;
  if (d != null && typeof d === 'object') {
    const t = formatClinicalTitle(
      d.name || d.label || '',
      d.ayurvedicName || d.ayurvedic_name || d.sanskritName,
    );
    if (t) return t;
  }
  if (typeof d === 'string' && d.trim()) {
    return formatClinicalTitle(d.trim(), '');
  }
  if (report?.reportTitle?.trim()) {
    return formatClinicalTitle(report.reportTitle.trim(), '');
  }
  return '';
}

const BOT_PHRASE_MARKERS = [
  'thank you for sharing',
  'could you please tell me',
  'when the symptoms started',
  'what makes them better or worse',
];

const sanitizeReportSymptoms = (items) => {
  if (!Array.isArray(items)) return [];
  return items.filter((item) => {
    const text = String(item || '').trim();
    if (!text || text.length > 120) return false;
    const lower = text.toLowerCase();
    return !BOT_PHRASE_MARKERS.some((m) => lower.includes(m)) && !text.endsWith('?');
  });
};

const ReportCard = ({ report, onView, onDelete, isListView = false }) => {
  const [downloading, setDownloading] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  const bundle = report.reportData;
  const diagnosisData =
    bundle?.reports?.find((r) => r.reportType === 'Diagnosis Report')?.reportData ||
    pickMainReport(bundle?.reports || [])?.reportData ||
    bundle;
  const severity = deriveThreatLevel(report, diagnosisData || {});

  const getSeverityStyles = () => {
    switch (severity) {
      case 'High':
        return {
          container: 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 hover:border-red-300 dark:hover:border-red-700 shadow-red-500/10',
          icon: <AlertCircle size={18} className="text-red-600 dark:text-red-400 animate-pulse" />,
          badge: 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800',
          text: 'text-red-700 dark:text-red-300',
          dot: 'bg-red-500'
        };
      case 'Medium':
      case 'Moderate':
        return {
          container: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 hover:border-amber-300 dark:hover:border-amber-700 shadow-amber-500/10',
          icon: <AlertTriangle size={18} className="text-amber-600 dark:text-amber-400" />,
          badge: 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
          text: 'text-amber-700 dark:text-amber-300',
          dot: 'bg-amber-500'
        };
      default:
        return {
          container: 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800 hover:border-indigo-300 dark:hover:border-indigo-700 shadow-indigo-500/10',
          icon: <CheckCircle size={18} className="text-indigo-600 dark:text-indigo-400" />,
          badge: 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
          text: 'text-indigo-700 dark:text-indigo-300',
          dot: 'bg-indigo-500'
        };
    }
  };

  const styles = getSeverityStyles();

  const handleDownload = async (e) => {
    if (e) e.stopPropagation();
    if (downloading) return;
    setDownloading(true);
    try {
      let sessionData = null;
      if (report.sessionId) {
        const res = await chatApi.getSession(report.sessionId);
        sessionData = res.data;
      }

      const resolvePatientInfo = (fallbackPatientInfo = {}) => {
        let bundleRoot = {};
        if (sessionData?.diagnosis) {
          const payload = parseReportPayload(sessionData.diagnosis);
          if (payload?.patientInfo) bundleRoot = payload.patientInfo;
        }
        const source = bundleRoot.name ? bundleRoot
          : (report.reportData?.patientInfo || sessionData?.patientInfo || report.patientInfo || fallbackPatientInfo || {});
        return {
          ...source,
          name: source.name || source.fullName || sessionData?.patientName || sessionData?.name || report.patientName || report.name || 'Patient',
          height: source.height || bundleRoot.height || 'N/A',
          weight: source.weight || bundleRoot.weight || 'N/A',
          age: source.age || bundleRoot.age || 'N/A',
          gender: source.gender || bundleRoot.gender || 'N/A',
        };
      };

      if (report.reportData && typeof report.reportData === 'object' && Array.isArray(report.reportData.reports)) {
        const bundlePatientInfo = resolvePatientInfo(report.reportData.patientInfo || report.patientInfo);
        const bundleReports = report.reportData.reports
          .filter((item) => item?.reportData && typeof item.reportData === 'object')
          .map((item) => ({
            reportType: item.reportType,
            title: item.title || item.reportType,
            reportData: { ...item.reportData, patientInfo: item.reportData.patientInfo || bundlePatientInfo },
          }));
        const main = pickMainReport(bundleReports);
        if (main) {
          downloadMedicalReportPDF(main.reportData, {
            reportType: main.reportType,
            reportTitle: main.title || main.reportType,
            patientInfo: main.reportData.patientInfo || bundlePatientInfo,
          });
          return;
        }
      }
      if (report.reportData && typeof report.reportData === 'object') {
        downloadMedicalReportPDF(report.reportData, {
          reportType: report.reportType,
          reportTitle: report.reportTitle || report.reportType,
          patientInfo: resolvePatientInfo(report.reportData.patientInfo),
        });
        return;
      }
      if (report.sessionId) {
        const allReports = resolveReportsFromSession(sessionData, report.patientInfo || {});
        const main = pickMainReport(allReports);
        const match = main || allReports.find((r) => r.reportType === report.reportType) || allReports[0];
        if (match?.reportData) {
          const diagObj = match.reportData;
          const bundleInfo = sessionData?.patientInfo || report.patientInfo || {};
          downloadMedicalReportPDF({
            ...diagObj,
            patientInfo: { ...bundleInfo, ...(diagObj.patientInfo || {}), ...resolvePatientInfo(bundleInfo) },
            symptomsReported: sanitizeReportSymptoms(diagObj.symptomsReported || diagObj.findings || []),
            dietaryGuide: diagObj.dietaryGuide || {},
            lifestyleChanges: diagObj.lifestyleChanges || diagObj.lifestyle_changes || [],
            herbalPreparations: diagObj.herbalPreparations || diagObj.herbal_preparations || [],
          }, { reportType: match.reportType, reportTitle: match.title || match.reportType });
        }
      } else {
        downloadMedicalReportPDF({
          diagnosis: report.diagnosis,
          findings: report.symptoms?.split(', ') || [],
          root_causes: report.recommendations?.split('\n') || [],
          dietaryGuide: { toConsume: [], toAvoid: [] },
          lifestyleChanges: report.recommendations || 'Holistic guidelines provided'
        });
      }
    } catch (err) {
      console.error('Failed to download report:', err);
      alert('Unable to download: report format is invalid or outdated.');
    } finally {
      setDownloading(false);
    }
  };

  const handleDelete = async (e) => {
    if (e) e.stopPropagation();
    if (!onDelete || deleting) return;
    if (!window.confirm('Hide this report from your list?')) return;
    setDeleting(true);
    try {
      await onDelete(report._id);
    } finally {
      setDeleting(false);
    }
  };

  if (isListView) {
    return (
      <div className={`border rounded-lg p-5 hover:shadow-md transition-all duration-300 flex items-start justify-between gap-4 group ${styles.container}`}>
        <div className="flex items-start gap-4 flex-1 min-w-0">
          <div className="w-12 h-12 bg-white/50 border border-white/20 rounded-lg flex items-center justify-center text-slate-600 flex-shrink-0 group-hover:bg-white/80 transition-colors shadow-sm">
            <FileText size={20} strokeWidth={2.5} />
          </div>
          
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm line-clamp-1">{reportDiagnosisDisplayTitle(report) || '—'}</h3>
              <span className={`px-2 py-1 rounded-full text-xs font-bold tracking-tight border flex items-center gap-1 flex-shrink-0 ${styles.badge}`}>
                {styles.icon}
                {severity === 'Low' ? 'Safe' : severity}
              </span>
            </div>

            {report.reportType && (
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{report.reportType}</span>
            )}
            
            <p className="text-xs text-slate-500 font-medium line-clamp-1">{(report.symptoms || "").split(',').slice(0, 2).join(', ')}</p>
            
            <div className="flex items-center gap-4 text-xs text-slate-400 font-medium">
              <div className="flex items-center gap-1">
                <Calendar size={12} strokeWidth={2.5} />
                <span>{report.date || new Date(report.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2 flex-shrink-0">
          <button 
            onClick={onView}
            className="p-2.5 bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 active:scale-95 transition-all"
            title="View Report"
          >
            <Eye size={16} strokeWidth={2.5} />
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="p-2.5 bg-white border border-slate-200 text-slate-400 rounded-lg hover:bg-red-50 hover:text-red-500 active:scale-95 transition-all disabled:opacity-60"
            title="Remove Report"
          >
            {deleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} strokeWidth={2.5} />}
          </button>
          <button 
            onClick={handleDownload}
            disabled={downloading}
            className="p-2.5 bg-slate-900 text-white rounded-lg hover:bg-black active:scale-95 transition-all disabled:bg-slate-400"
            title="Download PDF"
          >
            {downloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} strokeWidth={2.5} />}
          </button>
        </div>
      </div>
    );
  }

  // Grid view — compact card matching doctor portal style
  return (
    <div className={`p-5 rounded-2xl border shadow-sm hover:shadow-md transition-all duration-300 relative overflow-hidden group ${styles.container}`}>
      <div className="flex items-start gap-4 mb-4">
        <div className="w-12 h-12 bg-white/60 border border-white/30 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm">
          <FileText size={22} className="text-slate-500" strokeWidth={2} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2 flex-wrap">
            <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm leading-tight line-clamp-2 flex-1">{reportDiagnosisDisplayTitle(report) || 'Ayurvedic Assessment'}</h3>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold tracking-tight border flex items-center gap-1 flex-shrink-0 ${styles.badge}`}>
              {severity === 'Low' ? 'Safe' : severity}
            </span>
          </div>
          {report.reportType && (
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mt-0.5">{report.reportType}</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 mb-4 pb-4 border-b border-slate-200/60 text-xs text-slate-500">
        <div className="flex items-center gap-1">
          <Calendar size={12} strokeWidth={2.5} />
          <span className="font-semibold">{report.date || new Date(report.createdAt).toLocaleDateString()}</span>
        </div>
        <span className={`ml-auto font-bold ${styles.text}`}>{severity === 'Low' ? 'Safe' : `${severity} Risk`}</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={onView}
          className="flex items-center justify-center gap-1.5 py-2 bg-white/70 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold hover:bg-white active:scale-95 transition-all"
        >
          <Eye size={14} strokeWidth={2.5} />
          <span>View</span>
        </button>
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="flex items-center justify-center gap-1.5 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-black active:scale-95 transition-all disabled:bg-slate-400"
        >
          {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} strokeWidth={2.5} />}
          <span>{downloading ? 'Loading' : 'PDF'}</span>
        </button>
      </div>
    </div>
  );
};

export default ReportCard;
