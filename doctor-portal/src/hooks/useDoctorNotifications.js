import { useState, useEffect, useCallback } from 'react';
import { doctorService, doctorChatService } from '../services/api';
import {
  resolveAppointmentStart,
  normalizeAppointmentsList,
  getAppointmentStatusBucket,
} from '../utils/appointments';

function getPatientLabel(apt) {
  const p = apt?.patientId;
  if (!p) return 'Patient';
  if (typeof p === 'object') {
    return p.name || p.email?.split('@')[0] || 'Patient';
  }
  return 'Patient';
}

export function useDoctorNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const buildNotifications = useCallback(async () => {
    setLoading(true);
    const items = [];
    const now = new Date();
    const soon = new Date(now.getTime() + 2 * 60 * 60 * 1000);

    try {
      const chats = await doctorChatService.listChats();
      const chatList = Array.isArray(chats) ? chats : chats?.chats || [];
      chatList.forEach((c) => {
        const count = Number(c.unreadCount) || 0;
        if (count > 0) {
          items.push({
            id: `msg-${c._id}`,
            type: 'message',
            text: `${count} new message${count > 1 ? 's' : ''} from ${c.participantName || 'a patient'}`,
            time: c.updatedAt,
            path: `/messages/${c._id}`,
          });
        }
      });
    } catch (err) {
      console.warn('[Notifications] Could not load chats:', err?.message || err);
    }

    try {
      const raw = await doctorService.getAppointments();
      const aptList = normalizeAppointmentsList(raw);

      aptList
        .filter((apt) => getAppointmentStatusBucket(apt, now) === 'pending')
        .slice(0, 8)
        .forEach((apt) => {
          const start = resolveAppointmentStart(apt);
          const when = start
            ? start.toLocaleString([], {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })
            : `${apt.date || ''} ${apt.time || ''}`.trim();
          items.push({
            id: `pending-${apt._id}`,
            type: 'pending',
            appointmentId: apt._id,
            text: `Booking request from ${getPatientLabel(apt)}${when ? ` · ${when}` : ''}`,
            time: apt.createdAt || apt.startTime || apt.date,
            path: `/schedule?review=${apt._id}`,
          });
        });

      aptList
        .filter((apt) => {
          const start = resolveAppointmentStart(apt);
          if (!start) return false;
          if (start <= now || start > soon) return false;
          return getAppointmentStatusBucket(apt, now) === 'confirmed';
        })
        .forEach((apt) => {
          const start = resolveAppointmentStart(apt);
          items.push({
            id: `apt-${apt._id}`,
            type: 'appointment',
            text: `Upcoming: ${getPatientLabel(apt)} at ${start.toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}`,
            time: start.toISOString(),
            path: '/schedule',
          });
        });
    } catch (err) {
      console.warn('[Notifications] Could not load appointments:', err?.message || err);
    }

    items.sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0));
    setNotifications(items);
    setUnreadCount(items.length);
    setLoading(false);
  }, []);

  useEffect(() => {
    buildNotifications();
    const interval = setInterval(buildNotifications, 30000);
    const onChanged = () => buildNotifications();
    window.addEventListener('doctor-appointments-changed', onChanged);
    window.addEventListener('focus', onChanged);
    return () => {
      clearInterval(interval);
      window.removeEventListener('doctor-appointments-changed', onChanged);
      window.removeEventListener('focus', onChanged);
    };
  }, [buildNotifications]);

  return { notifications, unreadCount, loading, refresh: buildNotifications };
}
