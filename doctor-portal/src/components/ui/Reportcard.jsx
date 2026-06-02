import React from 'react';
import { AlertOctagon, CheckCircle, AlertTriangle } from 'lucide-react';

const ReportCard = ({ title, description, severity = 'Low' }) => {
  // Configuration for dynamic states
  const statusConfig = {
    High: {
      container: 'bg-red-50 border-red-200 text-red-700',
      icon: <AlertOctagon className="w-5 h-5 text-red-600" />,
      showPulse: true,
    },
    Medium: {
      container: 'bg-amber-50 border-amber-200 text-amber-700',
      icon: <AlertTriangle className="w-5 h-5 text-amber-600" />,
      showPulse: false,
    },
    Low: {
      container: 'bg-emerald-50 border-emerald-200 text-emerald-700',
      icon: <CheckCircle className="w-5 h-5 text-emerald-600" />,
      showPulse: false,
    },
  };

  const currentStatus = statusConfig[severity] || statusConfig.Low;

  return (
    <div className={`p-5 rounded-xl border transition-all duration-300 ${currentStatus.container} shadow-sm`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {currentStatus.icon}
          <h4 className="font-bold text-lg">{title}</h4>
          {currentStatus.showPulse && (
            <span className="flex h-3 w-3 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
            </span>
          )}
        </div>
        <span className="text-xs font-bold uppercase tracking-wider opacity-70">
          {severity} Priority
        </span>
      </div>
      
      <p className="text-sm leading-relaxed mb-4 opacity-90">
        {description}
      </p>

      <button className="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-medium transition-transform hover:scale-105 active:scale-95 shadow-md">
        Book Consultation
      </button>
    </div>
  );
};

export default ReportCard;