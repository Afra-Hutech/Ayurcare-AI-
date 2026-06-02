import React, { useCallback } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Video } from 'lucide-react';
import LiveKitConsultationRoom from '../../components/video/LiveKitConsultationRoom';
import { patientApi } from '../../services/api';

const VideoConsultation = () => {
  const { appointmentId } = useParams();
  const navigate = useNavigate();

  const fetchToken = useCallback(
    (id) => patientApi.getLiveKitToken(id),
    [],
  );

  return (
    <div className="h-full min-h-0 flex flex-col bg-[var(--practo-bg)]">
      <div className="flex-shrink-0 px-4 sm:px-6 py-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-[#161f2e] flex items-center gap-3">
        <Link
          to="/appointments"
          className="p-2 rounded-lg border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
        >
          <ArrowLeft size={18} />
        </Link>
        <div className="flex items-center gap-2 min-w-0">
          <Video size={18} className="text-[#28328c] dark:text-indigo-400 shrink-0" />
          <div className="min-w-0">
            <h1 className="text-sm font-bold text-slate-900 dark:text-slate-50 truncate">Video consultation</h1>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Secure room powered by LiveKit</p>
          </div>
        </div>
      </div>
      <div className="flex-1 min-h-0 relative overflow-hidden p-4 sm:p-6">
        <LiveKitConsultationRoom
          appointmentId={appointmentId}
          fetchToken={fetchToken}
          onDisconnected={() => navigate('/appointments')}
          className="absolute inset-4 sm:inset-6 h-[calc(100%-2rem)] sm:h-[calc(100%-3rem)] min-h-[60vh]"
        />
      </div>
    </div>
  );
};

export default VideoConsultation;
