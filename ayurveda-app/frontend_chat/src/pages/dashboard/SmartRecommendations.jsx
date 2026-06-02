import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { MessageSquare, FileText } from 'lucide-react';
import { chatApi, patientApi } from '../../services/api';
import AyurvedicRecommendationEngine from '../../components/dashboard/AyurvedicRecommendationEngine';
import DiagnosisHistoryTabs from '../../components/dashboard/DiagnosisHistoryTabs';
import {
  mergePatientConsultationReports,
  normalizeChatSessionsResponse,
} from '../../utils/consultationReports';
import {
  buildRecommendationsFromReport,
  listDiagnosisHistory,
  normalizeRecommendationPlan,
} from '../../utils/ayurvedicRecommendations';
import { resolvePatientUserId } from '../../utils/patientUser';

function formatOptionDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function SmartRecommendations() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const sessionIdParam = searchParams.get('sessionId');

  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [historyOptions, setHistoryOptions] = useState([]);
  const [selectedKey, setSelectedKey] = useState('');

  const selectedOption = useMemo(
    () => historyOptions.find((o) => o.key === selectedKey) || historyOptions[0] || null,
    [historyOptions, selectedKey],
  );

  const loadHistory = useCallback(async () => {
    const userId = resolvePatientUserId();

    const [reportsRes, sessionsRes] = await Promise.all([
      patientApi.getReports().catch(() => ({ data: [] })),
      userId
        ? chatApi.getSessions(userId).catch(() => ({ data: { data: [] } }))
        : Promise.resolve({ data: { data: [] } }),
    ]);

    const dbReports = Array.isArray(reportsRes.data) ? reportsRes.data : [];
    const sessions = normalizeChatSessionsResponse(sessionsRes);
    const mergedReports = mergePatientConsultationReports(dbReports, sessions);

    const options = listDiagnosisHistory(mergedReports, sessions);
    setHistoryOptions(options);

    if (!options.length) return null;

    const fromUrl = sessionIdParam
      ? options.find((o) => o.sessionId === sessionIdParam)
      : null;
    const pick = fromUrl || options[0];
    setSelectedKey(pick.key);
    return pick;
  }, [sessionIdParam]);

  const loadPlanForOption = useCallback(async (option, force = false) => {
    if (!option) {
      setPlan(null);
      setError('Complete a Vaidya AI consultation first to unlock personalized recommendations.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const localFromReport = option.report
        ? normalizeRecommendationPlan(buildRecommendationsFromReport(option.report))
        : null;

      if (localFromReport?.herbs?.length || localFromReport?.yoga?.length) {
        setPlan(localFromReport);
      }

      const sid = option.sessionId;
      const diagnosis = option.diagnosisText;

      if (sid && diagnosis) {
        const applyRemote = (data) => {
          const remote = normalizeRecommendationPlan(data?.plan ?? data);
          if (remote) setPlan(remote);
        };
        try {
          const res = await patientApi.getAyurvedicRecommendations(sid, diagnosis, { force });
          applyRemote(res.data);
          return;
        } catch (apiErr) {
          if (localFromReport) return;
          try {
            const chatRes = await chatApi.getAyurvedicRecommendations(sid, diagnosis, { force });
            applyRemote(chatRes.data);
            return;
          } catch (chatErr) {
            const msg =
              chatErr?.response?.data?.detail
              || chatErr?.response?.data?.message
              || apiErr?.response?.data?.message
              || apiErr?.response?.data?.detail
              || chatErr?.message
              || apiErr?.message;
            throw new Error(msg || 'Could not reach the recommendation service. Start bot-brain on port 5002 and doctor API on 5001.');
          }
        }
      }

      if (localFromReport) return;

      setError('No clinical report data found for this consultation.');
      setPlan(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const option = await loadHistory();
        if (!mounted) return;
        if (!option) {
          setLoading(false);
          setPlan(null);
          return;
        }
        await loadPlanForOption(option, false);
      } catch (err) {
        if (mounted) {
          setError(err?.message || 'Could not build your Ayurvedic recommendation plan.');
          setPlan(null);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [loadHistory, loadPlanForOption]);

  const onSelectDiagnosis = async (key) => {
    const option = historyOptions.find((o) => o.key === key);
    if (!option) return;
    setSelectedKey(key);
    if (option.sessionId) {
      setSearchParams({ sessionId: option.sessionId }, { replace: true });
    } else {
      setSearchParams({}, { replace: true });
    }
    try {
      await loadPlanForOption(option, false);
    } catch (err) {
      setError(err?.message || 'Could not load plan for this diagnosis.');
      setPlan(null);
    }
  };

  const onRefresh = async () => {
    if (!selectedOption) return;
    try {
      await loadPlanForOption(selectedOption, true);
    } catch (err) {
      setError(err?.message || 'Could not refresh plan.');
    }
  };

  const hasHistory = historyOptions.length > 0;

  return (
    <div className="flex-1 overflow-y-auto bg-[var(--practo-bg)]">
      <div className="max-w-4xl mx-auto px-5 py-6 sm:px-8 sm:py-8 space-y-6">
        <header className="pb-4 border-b border-[var(--practo-border)]">
          <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600 mb-1">Personalized Plan</p>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-50 tracking-tight">Ayurvedic Guide</h1>
          <p className="text-sm text-[var(--practo-text-light)] leading-relaxed mt-1">
            Personalized herbs, diet, movement, and daily rhythm from your latest Vaidya consultation.
          </p>
        </header>

        {!loading && !hasHistory ? (
          <div className="rounded-2xl border border-dashed border-[var(--practo-border)] bg-[var(--practo-white)] p-8 text-center">
            <FileText size={36} className="mx-auto text-slate-300 mb-3" />
            <p className="text-sm text-[var(--practo-text-light)] mb-4">
              Finish a consultation with Vaidya AI to generate your personalized plan.
            </p>
            <Link
              to="/chat"
              className="inline-flex items-center gap-2 rounded-xl bg-[#28328c] dark:bg-primary-600 text-white text-sm font-bold px-4 py-2.5"
            >
              <MessageSquare size={16} /> Start consultation
            </Link>
          </div>
        ) : (
          <>
            <DiagnosisHistoryTabs
              options={historyOptions}
              selectedKey={selectedKey}
              onSelect={onSelectDiagnosis}
              loading={loading}
              formatOptionDate={formatOptionDate}
            />
            <AyurvedicRecommendationEngine
              plan={plan}
              loading={loading}
              error={error}
              onRefresh={onRefresh}
            />
          </>
        )}

        <div className="mt-6 flex flex-wrap gap-3 justify-center text-xs font-semibold">
          <Link to="/consultations" className="text-[#14bef0] hover:underline">
            AI doc records →
          </Link>
          <button
            type="button"
            onClick={() => navigate('/chat')}
            className="text-[var(--practo-text-light)] hover:underline"
          >
            New Vaidya consultation
          </button>
        </div>
      </div>
    </div>
  );
}
