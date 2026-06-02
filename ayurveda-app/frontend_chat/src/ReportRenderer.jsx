import React from 'react'
import { Activity, Shield, Clipboard, HeartPulse } from 'lucide-react'
import DoshaChart from './components/dashboard/DoshaChart'
import { deriveThreatLevel } from './utils/threatLevel'

function textToBullets(value) {
  if (value == null || value === '') return []
  if (Array.isArray(value)) {
    return value.flatMap((v) => textToBullets(v)).filter(Boolean)
  }
  const s = String(value).trim()
  if (!s) return []
  if (s.includes('•') || /\n/.test(s)) {
    return s
      .split(/[\n•]|(?:\d+\.)\s+/)
      .map((line) => line.replace(/^[-*]\s*/, '').trim())
      .filter((line) => line.length > 2)
  }
  if (s.length > 140) {
    return s
      .split(/(?<=[.!?])\s+/)
      .map((x) => x.trim())
      .filter((x) => x.length > 8)
      .slice(0, 12)
  }
  return [s]
}

function parseDoshaPercents(profile = {}) {
  const raw = profile.percentages || profile.balance || profile
  const v = Number(raw.vata ?? raw.Vata ?? 33)
  const p = Number(raw.pitta ?? raw.Pitta ?? 33)
  const k = Number(raw.kapha ?? raw.Kapha ?? 34)
  const sum = v + p + k || 100
  return {
    vata: Math.round((v / sum) * 100),
    pitta: Math.round((p / sum) * 100),
    kapha: Math.round((k / sum) * 100),
  }
}

function DoshaBars({ vata, pitta, kapha }) {
  const rows = [
    { label: 'Vata', value: vata, color: 'bg-violet-500' },
    { label: 'Pitta', value: pitta, color: 'bg-amber-500' },
    { label: 'Kapha', value: kapha, color: 'bg-emerald-500' },
  ]
  return (
    <div className="space-y-2.5 mb-4">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center gap-3">
          <span className="w-12 text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">{row.label}</span>
          <div className="flex-1 h-2 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
            <div className={`h-full rounded-full ${row.color}`} style={{ width: `${row.value}%` }} />
          </div>
          <span className="w-8 text-right text-xs font-bold text-slate-700 dark:text-slate-200">{row.value}%</span>
        </div>
      ))}
    </div>
  )
}

function RiskMeter({ value }) {
  const label = String(value || 'Moderate').toLowerCase()
  const pct = label.includes('high') || label.includes('severe') ? 85 : label.includes('low') || label.includes('mild') ? 25 : 55
  const color = pct > 70 ? 'bg-rose-500' : pct > 45 ? 'bg-amber-500' : 'bg-emerald-500'
  return (
    <div className="mb-4">
      <div className="flex justify-between text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500 mb-1">
        <span>Risk level</span>
        <span className="text-slate-700 dark:text-slate-200">{value}</span>
      </div>
      <div className="h-2.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function ReportRenderer({ report, reportType }) {
  if (!report) return null

  const normalizedType = reportType === 'Risk & Health Score Report' ? 'Risk Report' : reportType

  const Section = ({ title, icon: Icon, children }) => (
    <div className="mb-6 animate-fade-in">
      <div className="flex items-center gap-2 mb-3 border-b border-[#e0e7ed] dark:border-slate-600 pb-2">
        <Icon size={16} className="text-[#28328c] dark:text-[#14bef0]" />
        <h4 className="text-[10px] font-black uppercase tracking-[2px] text-slate-800 dark:text-slate-100">{title}</h4>
      </div>
      <div>{children}</div>
    </div>
  )

  const BulletBlock = ({ value }) => {
    const lines = textToBullets(value)
    if (!lines.length) return null
    return (
      <ul className="space-y-2 mb-2">
        {lines.map((line, i) => (
          <li key={i} className="flex gap-2.5 text-sm text-slate-600 dark:text-slate-300 leading-snug">
            <span className="text-[#14bef0] font-bold mt-0.5">•</span>
            <span>{line}</span>
          </li>
        ))}
      </ul>
    )
  }

  const KPICard = ({ label, value }) => {
    const isRisk = label.toLowerCase().includes('risk') || label.toLowerCase().includes('threat')
    return (
      <div className="p-3 rounded-xl bg-[#f0f4f7] dark:bg-slate-800 border border-[#e0e7ed] dark:border-slate-600">
        <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">{label}</p>
        <p className={`text-base font-black ${isRisk ? 'text-rose-600 dark:text-rose-400' : 'text-[#28328c] dark:text-[#14bef0]'}`}>{value}</p>
      </div>
    )
  }

  const PageHeader = ({ kicker, title }) => (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-1 h-3.5 bg-[#14bef0] rounded-full" />
        <span className="text-[9px] font-black uppercase tracking-[3px] text-[#14bef0]">{kicker}</span>
      </div>
      <h2 className="text-2xl font-black text-slate-900 dark:text-slate-50 tracking-tight leading-tight">{title}</h2>
    </div>
  )

  const shellClass =
    'max-w-3xl mx-auto py-6 px-5 sm:px-6 bg-white dark:bg-slate-900 shadow-md rounded-2xl border border-[#e0e7ed] dark:border-slate-700'

  const dosha = parseDoshaPercents(report.doshaProfile || {})
  const resolvedThreat = deriveThreatLevel(
    { threatLevel: report.threatLevel, symptoms: report.symptomsReported },
    report,
  )
  const riskKpi = (report.master_kpis || report.kpis || []).find((k) =>
    String(k.label || '').toLowerCase().includes('risk'),
  )

  const renderMaster = () => (
    <div className={shellClass}>
      <PageHeader kicker="Clinical Synthesis" title="Integrated Health Assessment" />

      {(report.master_kpis || report.kpis || []).length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-6">
          {(report.master_kpis || report.kpis || []).slice(0, 4).map((kpi, i) => (
            <KPICard key={i} label={kpi.label} value={kpi.value} />
          ))}
        </div>
      )}

      <RiskMeter value={riskKpi?.value || report.threatLevel || resolvedThreat} />

      <Section title="Diagnostic Summary" icon={Clipboard}>
        <BulletBlock value={report.diagnosis?.reasoning || report.integrated_synthesis || report.synthesis} />
      </Section>

      <Section title="Biological Constitution (Dosha)" icon={Activity}>
        <div className="grid md:grid-cols-2 gap-4 mb-2">
          <div>
            <p className="text-[10px] font-bold text-[#28328c] dark:text-[#14bef0] mb-2 uppercase tracking-widest">Dominant profile</p>
            <p className="text-lg font-black text-slate-800 dark:text-slate-100 mb-3">{report.doshaProfile?.dominant || 'Balanced'}</p>
            <DoshaBars vata={dosha.vata} pitta={dosha.pitta} kapha={dosha.kapha} />
            <BulletBlock value={report.doshaProfile?.interpretation} />
          </div>
          <DoshaChart vata={dosha.vata} pitta={dosha.pitta} kapha={dosha.kapha} />
        </div>
      </Section>

      <Section title="Clinical Findings" icon={HeartPulse}>
        <BulletBlock value={report.master_pain_points || report.pain_points || report.symptomsReported} />
      </Section>

      <Section title="Treatment Protocol" icon={Shield}>
        <h5 className="text-xs font-bold text-slate-800 dark:text-slate-200 mb-2">Herbal medications</h5>
        <BulletBlock value={report.herbal_meds || report.herbalPreparations || report.herbal_medications} />
        <h5 className="text-xs font-bold text-slate-800 dark:text-slate-200 mb-2 mt-4">Lifestyle adjustments</h5>
        <BulletBlock value={report.lifestyle_changes || report.routine_steps} />
      </Section>

      {report.closing && (
        <div className="mt-6 pt-4 border-t border-dashed border-[#e0e7ed] dark:border-slate-600">
          <BulletBlock value={report.closing} />
        </div>
      )}
    </div>
  )

  const renderGeneric = () => (
    <div className={shellClass}>
      <PageHeader kicker="Medical Report" title={reportType || 'Clinical Document'} />

      {report.kpis?.length > 0 && (
        <div className="grid grid-cols-2 gap-2.5 mb-6">
          {report.kpis.map((kpi, i) => (
            <KPICard key={i} label={kpi.label} value={kpi.value} />
          ))}
        </div>
      )}

      <Section title="Clinical Overview" icon={Clipboard}>
        <BulletBlock value={report.content || report.section1_content || report.clinicalImpression || report.intro} />
      </Section>

      {(report.pain_points || report.symptomsReported) && (
        <Section title="Findings" icon={Activity}>
          <BulletBlock value={report.pain_points || report.symptomsReported} />
        </Section>
      )}

      {report.section2_content && (
        <Section title="Details" icon={Shield}>
          <BulletBlock value={report.section2_content} />
        </Section>
      )}
    </div>
  )

  return normalizedType === 'Master Report' || normalizedType === 'Diagnosis Report'
    ? renderMaster()
    : renderGeneric()
}

export default ReportRenderer
