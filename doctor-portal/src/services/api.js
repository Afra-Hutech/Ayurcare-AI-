import { buildRevenueSummaryFromAppointments } from '../utils/buildRevenueSummary';

const rawApiUrl = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? '/api' : 'http://localhost:5001/api');
const API_URL = String(rawApiUrl).replace(/\/+$/, '');

// Clears auth state and redirects to login on 401/403
const handleAuthResponse = (response) => {
  if (response.status === 401 || response.status === 403) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    if (window.location.pathname !== '/login' && window.location.pathname !== '/signup') {
      window.location.href = '/login';
    }
  }
  return response;
};

// Authenticated fetch: adds Authorization header, auto-redirects on 401/403
const authFetch = (url, options = {}) => {
  const token = localStorage.getItem('token');
  return fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  }).then(handleAuthResponse);
};

const isRevenueRouteMissing = (raw, contentType) =>
  contentType.includes('text/html')
  || raw.trim().startsWith('<!DOCTYPE')
  || /Cannot GET/i.test(raw);

/**
 * AUTH SERVICE
 */
export const authService = {
  // Signup
  signup: async (email, password, name) => {
    try {
      const response = await fetch(`${API_URL}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name, role: 'doctor' }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Signup failed');

      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      return { user: data.user, error: null };
    } catch (err) {
      return { user: null, error: err.message };
    }
  },

  // Login
  login: async (email, password) => {
    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Login failed');

      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      return { user: data.user, error: null };
    } catch (err) {
      return { user: null, error: err.message };
    }
  },

  // Logout
  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  },

  // Get Current User (Local)
  getCurrentUser: () => {
    const user = localStorage.getItem('user');
    return user ? JSON.parse(user) : null;
  },

  // Verify Auth with Backend — clears stale token and redirects on 401/403
  verifyAuth: async () => {
    if (!localStorage.getItem('token')) return null;
    try {
      const response = await authFetch(`${API_URL}/auth/me`);
      if (response && response.ok) return await response.json();
      return null;
    } catch (err) {
      return null;
    }
  }
};

/**
 * DOCTOR SERVICE
 */
export const doctorService = {
  // Get Doctor Profile
  getProfile: async () => {
    try {
      const response = await authFetch(`${API_URL}/doctor/profile?t=${Date.now()}`, {
        headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
      });
      if (response && response.ok) return await response.json();
      return null;
    } catch (err) {
      return null;
    }
  },

  updateProfile: async (formData) => {
    const token = localStorage.getItem('token');
    try {
      const response = await fetch(`${API_URL}/doctor/profile`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Profile update failed');
      return { success: true, data };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  toggleLeave: async () => {
    const token = localStorage.getItem('token');
    try {
      // Try dedicated toggle endpoint first
      const response = await fetch(`${API_URL}/doctor/leave-toggle`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
      });
      if (response.ok) {
        const data = await response.json();
        return { success: true, onLeave: data.onLeave };
      }
      // Fallback: use profile endpoint
      throw new Error('Toggle endpoint not available');
    } catch (err) {
      // Fallback: read current state then toggle via profile endpoint
      try {
        const profileRes = await fetch(`${API_URL}/doctor/profile`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (profileRes.ok) {
          const profile = await profileRes.json();
          const newVal = !profile.onLeave;
          const updateRes = await fetch(`${API_URL}/doctor/profile`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ onLeave: newVal }),
          });
          if (updateRes.ok) {
            return { success: true, onLeave: newVal };
          }
        }
        return { success: false, error: 'Failed to update leave status' };
      } catch (fallbackErr) {
        return { success: false, error: fallbackErr.message };
      }
    }
  },

  // Onboarding
  onboard: async (formData) => {
    const token = localStorage.getItem('token');
    try {
      const response = await fetch(`${API_URL}/doctor/onboarding`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Onboarding failed');

      // Update local storage status safely
      const userStr = localStorage.getItem('user');
      if (userStr) {
        try {
          const user = JSON.parse(userStr);
          user.isOnboarded = true;
          localStorage.setItem('user', JSON.stringify(user));
        } catch (e) {
          console.error("Error updating user in localStorage", e);
        }
      }

      return { success: true, error: null };
    } catch (err) {
      console.error("Onboarding service error:", err);
      return { success: false, error: err.message };
    }
  },

  // Get Appointments (Leads)
  getAppointments: async () => {
    if (!localStorage.getItem('token')) return [];
    try {
      const response = await authFetch(`${API_URL}/doctor/appointments`);
      if (!response || !response.ok) {
        if (response?.status === 404) {
          console.warn('[DocConnect] Doctor profile not found — complete onboarding to see appointments.');
        } else {
          console.warn('[DocConnect] Failed to load appointments:', response?.status);
        }
        return [];
      }
      const data = await response.json();
      if (Array.isArray(data)) return data;
      if (Array.isArray(data?.data)) return data.data;
      if (Array.isArray(data?.appointments)) return data.appointments;
      return [];
    } catch (err) {
      console.error('[DocConnect] getAppointments error:', err);
      return [];
    }
  },

  getRevenueSummary: async () => {
    if (!localStorage.getItem('token')) {
      return { ok: false, error: 'Not signed in.', data: null, status: null };
    }
    try {
      const response = await authFetch(`${API_URL}/doctor/revenue-summary`);
      if (!response) return { ok: false, error: 'Session expired', data: null, status: 403 };
      const raw = await response.text();
      const contentType = response.headers.get('content-type') || '';
      if (isRevenueRouteMissing(raw, contentType)) {
        const headers = { Authorization: `Bearer ${token}` };
        const [profileRes, aptRes] = await Promise.all([
          fetch(`${API_URL}/doctor/profile`, { headers }),
          fetch(`${API_URL}/doctor/appointments`, { headers }),
        ]);
        let profile = null;
        let appointments = [];
        if (profileRes.ok) profile = await profileRes.json().catch(() => null);
        if (aptRes.ok) {
          const aptData = await aptRes.json().catch(() => null);
          if (Array.isArray(aptData)) appointments = aptData;
          else if (Array.isArray(aptData?.data)) appointments = aptData.data;
          else if (Array.isArray(aptData?.appointments)) appointments = aptData.appointments;
        }
        if (appointments.length >= 0) {
          return {
            ok: true,
            error: null,
            data: buildRevenueSummaryFromAppointments(appointments, profile),
            status: 200,
          };
        }
        return {
          ok: false,
          error:
            'Revenue API route not found. Restart doctor-portal/server (npm start) on port 5001, or set VITE_API_URL=/api when using npm run dev.',
          data: null,
          status: response.status,
        };
      }
      let body = null;
      try {
        body = raw ? JSON.parse(raw) : null;
      } catch {
        body = { message: raw?.slice(0, 200) || 'Invalid server response' };
      }
      if (!response.ok) {
        return {
          ok: false,
          error: body?.message || `Request failed (${response.status})`,
          data: null,
          status: response.status,
        };
      }
      return { ok: true, error: null, data: body, status: response.status };
    } catch (err) {
      console.warn('[DocConnect] getRevenueSummary error:', err);
      return {
        ok: false,
        error: err?.message || 'Network error — is the API running?',
        data: null,
        status: null,
      };
    }
  },

  // Update Status
  updateAppointmentStatus: async (appointmentId, status, extra = {}) => {
    const token = localStorage.getItem('token');
    try {
      const response = await fetch(`${API_URL}/appointments/${appointmentId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status, ...extra }),
      });
      return response.ok;
    } catch (err) {
      return false;
    }
  },

  // Update Appointment (General)
  updateAppointment: async (appointmentId, updateData) => {
    const token = localStorage.getItem('token');
    try {
      const response = await fetch(`${API_URL}/appointments/${appointmentId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(updateData),
      });
      return response.ok;
    } catch (err) {
      return false;
    }
  },

  uploadAppointmentAttachments: async (appointmentId, files, status = 'completed') => {
    const token = localStorage.getItem('token');
    try {
      const formData = new FormData();
      formData.append('status', status);
      Array.from(files || []).forEach((file) => {
        formData.append('files', file);
      });

      const response = await fetch(`${API_URL}/appointments/${appointmentId}/attachments`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });
      if (!response.ok) throw new Error('Failed to upload attachments');
      return await response.json();
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  getAppointmentById: async (appointmentId) => {
    const token = localStorage.getItem('token');
    try {
      const response = await fetch(`${API_URL}/doctor/appointments/${appointmentId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to load appointment');
      return await response.json();
    } catch (err) {
      return null;
    }
  },

  getLiveKitToken: async (appointmentId) => {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_URL}/livekit/appointments/${appointmentId}/token`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Failed to join video room');
    return data;
  },

  startConsultation: async (appointmentId) => {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_URL}/doctor/consultation/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ appointmentId }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Failed to start consultation');
    return data;
  },

  endConsultation: async (appointmentId) => {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_URL}/doctor/consultation/end`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ appointmentId }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Failed to end consultation');
    return data;
  },

  getPrescriptionByAppointment: async (appointmentId) => {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_URL}/doctor/prescription/${appointmentId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Failed to load prescription');
    return data;
  },

  savePrescriptionDraft: async (payload) => {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_URL}/doctor/prescription/draft`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Failed to save draft');
    return data;
  },

  finalizePrescription: async (payload) => {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_URL}/doctor/prescription/finalize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Failed to finalize prescription');
    return data;
  },

  // Upload Profile Image
  uploadProfileImage: async (file) => {
    const token = localStorage.getItem('token');
    try {
      const formData = new FormData();
      formData.append('image', file);

      const response = await fetch(`${API_URL}/upload-profile-image`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Image upload failed');
      
      // Update local storage if needed
      const user = JSON.parse(localStorage.getItem('user'));
      if (user) {
        user.profileImage = data.imageUrl;
        localStorage.setItem('user', JSON.stringify(user));
      }

      return { success: true, imageUrl: data.imageUrl };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },

  getPatientWellnessHistory: async (patientId, days = 14) => {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_URL}/doctor/patients/${patientId}/wellness/history?days=${days}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Failed to load patient wellness');
    return data;
  },
};

export const doctorChatService = {
  listChats: async () => {
    const response = await authFetch(`${API_URL}/chat/list`);
    if (!response || !response.ok) throw new Error('Failed to load chats');
    return response.json();
  },

  initiateChat: async ({ userId }) => {
    const response = await authFetch(`${API_URL}/chat/initiate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    if (!response || !response.ok) throw new Error('Failed to initiate chat');
    return response.json();
  },

  getMessages: async (chatId) => {
    const response = await authFetch(`${API_URL}/chat/${chatId}/messages`);
    if (!response || !response.ok) throw new Error('Failed to load messages');
    return response.json();
  },

  sendMessage: async ({ chatId, message, userId }) => {
    const response = await authFetch(`${API_URL}/chat/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId, message, userId }),
    });
    if (!response || !response.ok) throw new Error('Failed to send message');
    return response.json();
  },

  markRead: async (chatId) => {
    await authFetch(`${API_URL}/chat/${chatId}/read`, { method: 'PATCH' });
  },

  createNegotiation: async ({ chatId, date, time, amount, mode }) => {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_URL}/chat/negotiations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ chatId, date, time, amount, mode }),
    });
    if (!response.ok) throw new Error('Failed to create negotiation');
    return response.json();
  },

  acceptNegotiation: async (negotiationId) => {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_URL}/chat/negotiations/${negotiationId}/accept`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.message || 'Failed to accept negotiation');
    }
    return data;
  },

  counterNegotiation: async ({ negotiationId, date, time, amount, mode }) => {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_URL}/chat/negotiations/${negotiationId}/counter`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ date, time, amount, mode }),
    });
    if (!response.ok) throw new Error('Failed to counter negotiation');
    return response.json();  },
  deleteChat: async (chatId) => {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_URL}/chat/${chatId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!response.ok) throw new Error('Failed to delete chat');
    return response.json();  }
};
export const loginUser = (email, password) => authService.login(email, password);
export const signupUser = (email, password, name) => authService.signup(email, password, name);
export const logoutUser = () => authService.logout();
