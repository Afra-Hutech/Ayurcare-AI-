import React from 'react'
import './report.css'
import { Activity, Download, ClipboardCheck, AlertCircle, Apple, RefreshCw, Leaf, Thermometer, ShieldCheck } from 'lucide-react'
import { sanitizeMarkdownText } from './utils/textUtils'

function ReportRenderer({ report }) {
   if (!report) return null

   const Section = ({ title, icon: Icon, children, colorClass = "text-slate-400" }) => (
      <div className="py-8 border-b border-slate-100 last:border-0">
         <div className="flex items-center gap-3 mb-6">
            <div className={`p-2 rounded-lg bg-slate-50 ${colorClass}`}>
               <Icon size={18} strokeWidth={2.5} />
            </div>
            <h4 className="text-[12px] font-bold text-slate-900 uppercase tracking-[1.5px]">{title}</h4>
         </div>
         <div className="pl-11">
            {children}
         </div>
      </div>
   )

   return (
      <div className="bg-white text-slate-800 animate-fade-in font-sans">
         {/* Title & Status */}
         <div className="pb-10 border-b border-slate-100">
            <h2 className="text-3xl font-bold text-slate-950 tracking-tight mb-4">{report.diagnosis?.name || "Clinical Assessment"}</h2>
            <div className="flex flex-wrap items-center gap-4 text-[11px] font-bold uppercase tracking-wider text-slate-400">
               <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-50 rounded-full text-slate-600">
                  <Activity size={12} strokeWidth={2.5} />
                  <span>{report.diagnosis?.dosha || "Vata-Pitta"}</span>
               </div>
               <div className="flex items-center gap-1.5 px-3 py-1 bg-rose-50 rounded-full text-rose-600">
                  <AlertCircle size={12} strokeWidth={2.5} />
                  <span>{report.threatLevel || "Standard"} Priority</span>
               </div>
               <div className="ml-auto text-emerald-600 flex items-center gap-1.5">
                  <ShieldCheck size={14} strokeWidth={2.5} />
                  <span>Verified Report</span>
               </div>
            </div>
         </div>

         {/* Narrative Rationale */}
         <div className="py-10 bg-slate-50/30 -mx-8 px-8 border-b border-slate-100">
            <p className="text-lg font-medium text-slate-600 leading-relaxed italic opacity-80">
               "{report.diagnosis?.reasoning || report.doshaRecommendation || 'Systemic restoration of biological homeostasis required.'}"
            </p>
         </div>

         <div className="space-y-4">
            <Section title="Dietary Modification" icon={Apple} colorClass="text-emerald-500">
               <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                  <div className="space-y-2">
                     <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest block">Inclusions (Pathya)</span>
                     <p className="text-[13px] leading-relaxed font-semibold text-slate-800">
                        {Array.isArray(report.dietaryGuide?.toConsume) ? report.dietaryGuide.toConsume.join(', ') : report.dietaryGuide?.toConsume || 'Nourishing sattvic intake.'}
                     </p>
                  </div>
                  <div className="space-y-2">
                     <span className="text-[9px] font-black text-rose-600 uppercase tracking-widest block">Exclusions (Apathya)</span>
                     <p className="text-[13px] leading-relaxed font-semibold text-slate-800">
                        {Array.isArray(report.dietaryGuide?.toAvoid) ? report.dietaryGuide.toAvoid.join(', ') : report.dietaryGuide?.toAvoid || 'Agitating or processed stimuli.'}
                     </p>
                  </div>
               </div>
            </Section>

            <Section title="Lifestyle Protocol" icon={RefreshCw} colorClass="text-blue-500">
               <p className="text-[13px] leading-loose font-semibold text-slate-700">
                  {Array.isArray(report.lifestyleChanges) ? report.lifestyleChanges.join('. ') : report.lifestyleChanges || 'Adherence to vertical rhythms.'}
               </p>
            </Section>

            {report.treatments && report.treatments.length > 0 && (
               <Section title="Clinical Modalities" icon={ClipboardCheck} colorClass="text-slate-600">
                  <div className="flex flex-wrap gap-2">
                     {report.treatments.map((t, i) => (
                        <span key={i} className="text-[10px] font-bold px-3 py-1 bg-slate-50 text-slate-600 rounded-md border border-slate-100 tracking-wide uppercase">✦ {t}</span>
                     ))}
                  </div>
               </Section>
            )}

            <Section title="Herbal Management" icon={Leaf} colorClass="text-ayur-sage">
               <div className="space-y-6">
                  {report.herbalPreparations && report.herbalPreparations.length > 0 ? (
                     report.herbalPreparations.map((h, i) => (
                        <div key={i} className="border-l-2 border-slate-100 pl-4 py-1 space-y-1">
                           <h5 className="font-bold text-slate-900 text-sm tracking-tight">{h.name}</h5>
                           <p className="text-[11px] font-medium text-slate-400 italic leading-snug">{h.purpose}</p>
                           {h.safety && (
                              <div className="text-[9px] font-bold text-amber-600 uppercase flex items-center gap-1.5 mt-2">
                                 <AlertCircle size={10} strokeWidth={3} />
                                 {h.safety}
                              </div>
                           )}
                        </div>
                     ))
                  ) : (
                     <p className="text-[11px] font-medium text-slate-300 italic">No specific herbal preparations assigned.</p>
                  )}
               </div>
            </Section>

            <Section title="Prognosis" icon={Thermometer} colorClass="text-slate-900">
               <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100">
                  <p className="text-sm font-bold text-slate-600 italic">"{report.prognosis || 'Favorable outcome expected with protocol adherence.'}"</p>
               </div>
            </Section>
         </div>
      </div>
   )
}

export default ReportRenderer;