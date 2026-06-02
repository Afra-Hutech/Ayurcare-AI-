import React, { useEffect, useState } from 'react';
import { LiveKitRoom, VideoConference, RoomAudioRenderer } from '@livekit/components-react';
import '@livekit/components-styles';
import '../../styles/livekit-room.css';
import { Loader2 } from 'lucide-react';

/**
 * @param {{ appointmentId: string, fetchToken: (id: string) => Promise<{ token: string, serverUrl: string }>, onDisconnected?: () => void, className?: string }}
 */
const LiveKitConsultationRoom = ({ appointmentId, fetchToken, onDisconnected, className = '' }) => {
  const [session, setSession] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setSession(null);
    setError('');

    (async () => {
      try {
        const data = await fetchToken(appointmentId);
        if (cancelled) return;
        if (!data?.token || !data?.serverUrl) {
          throw new Error('Invalid video session from server');
        }
        setSession({ token: data.token, serverUrl: data.serverUrl });
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || 'Could not join the video room');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [appointmentId, fetchToken]);

  if (error) {
    return (
      <div className={`flex items-center justify-center p-6 text-center ${className}`}>
        <p className="text-sm font-semibold text-rose-600 dark:text-rose-400">{error}</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className={`flex flex-col items-center justify-center gap-3 p-10 ${className}`}>
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Connecting to secure video…</p>
      </div>
    );
  }

  return (
    <div className={`lk-room-host ${className}`.trim()}>
      <LiveKitRoom
        video
        audio
        token={session.token}
        serverUrl={session.serverUrl}
        connect
        onDisconnected={onDisconnected}
        className="lk-room-root"
        data-lk-theme="default"
      >
        <RoomAudioRenderer />
        <div className="lk-room-shell">
          <VideoConference />
        </div>
      </LiveKitRoom>
    </div>
  );
};

export default LiveKitConsultationRoom;
