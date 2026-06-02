import axios from 'axios';

const API_BASE_URL =
  import.meta.env.VITE_API_URL
  || (import.meta.env.DEV ? '/api' : 'http://localhost:5001/api');
const CHAT_API_BASE_URL = import.meta.env.VITE_CHAT_API_URL || 'http://127.0.0.1:5002';

const api = axios.create({
  baseURL: API_BASE_URL,
});

/** Public directory endpoints — no auth header so listings work even if token refresh fails */
const publicApiClient = axios.create({
  baseURL: API_BASE_URL,
});

// Add a request interceptor to include the JWT token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    if (status === 401 || status === 403) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// Create a separate instance for chat API with token support
const chatApiInstance = axios.create({
  baseURL: CHAT_API_BASE_URL,
});

chatApiInstance.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

export const patientApi = {
  getReports: () => api.get('/patient/reports'),
  getAppointments: () => api.get('/patient/appointments'),
  getPrescription: (appointmentId) => api.get(`/patient/prescription/${appointmentId}`),
  listPrescriptions: () => api.get('/patient/prescriptions'),
  updateProfile: (data) => api.patch('/patient/profile', data),
  hideAppointment: (id) => api.delete(`/patient/appointments/${id}`),
  getLiveKitToken: async (appointmentId) => {
    const { data } = await api.post(`/livekit/appointments/${appointmentId}/token`);
    return data;
  },
  deleteReport: (id) => api.delete(`/patient/reports/${id}`),
  uploadProfileImage: (file) => {
    const formData = new FormData();
    formData.append('image', file);
    return api.post('/upload-profile-image', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
  // Medical Vault API
  getRecords: () => api.get('/patient/medical-records'),
  uploadRecord: (formData, config) => api.post('/patient/medical-records/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    ...config
  }),
  deleteRecord: (recordId) => api.delete(`/patient/medical-records/${recordId}`),
  downloadRecord: (recordId) => api.get(`/patient/medical-records/${recordId}/download`, {
    responseType: 'blob'
  }),
  getWellnessToday: () => api.get('/patient/wellness/today'),
  upsertWellnessToday: (data) => api.put('/patient/wellness/today', data),
  getWellnessHistory: (days = 14) => api.get(`/patient/wellness/history?days=${days}`),
  getAyurvedicRecommendations: (sessionId, diagnosis, options = {}) =>
    api.post(`/patient/recommendations/${sessionId}`, { diagnosis, force: !!options.force }),
};

export const publicApi = {
  getNearbyDoctors: (lat, lng) => publicApiClient.get(`/public/doctors/nearby?lat=${lat}&lng=${lng}`),
  getAllDoctors: () => publicApiClient.get('/public/doctors/nearby?all=true'),
  getDoctorAvailability: (id) => publicApiClient.get(`/public/doctors/${id}/availability`),
  getDoctorSlots: (id, date) => publicApiClient.get(`/public/doctors/${id}/slots?date=${date}`),
  bookAppointment: (data) => publicApiClient.post('/public/appointments/book', data),
};

export const doctorChatApi = {
  listChats: () => api.get('/chat/list'),
  initiateChat: ({ doctorId, userId }) => api.post('/chat/initiate', { doctorId, userId }),
  getMessages: (chatId) => api.get(`/chat/${chatId}/messages`),
  sendMessage: ({ chatId, message, doctorId, userId }) => api.post('/chat/messages', { chatId, message, doctorId, userId }),
  markRead: (chatId) => api.patch(`/chat/${chatId}/read`),
  deleteChat: (chatId) => api.delete(`/chat/${chatId}`),
  createNegotiation: ({ chatId, date, time, amount, mode }) => api.post('/chat/negotiations', { chatId, date, time, amount, mode }),
  acceptNegotiation: (negotiationId) => api.post(`/chat/negotiations/${negotiationId}/accept`),
  counterNegotiation: ({ negotiationId, date, time, amount, mode }) => api.post(`/chat/negotiations/${negotiationId}/counter`, { date, time, amount, mode }),
};

// Chat API (FastAPI with JWT auth)
export const chatApi = {
  getSessions: (userId) => chatApiInstance.get(`/api/chat/sessions/${userId}`),
  getSession: (sessionId) => chatApiInstance.get(`/api/chat/session/${sessionId}`),
  createSession: (userId) => chatApiInstance.post(`/api/chat/create`, { userId }),
  deleteSession: (sessionId) => chatApiInstance.delete(`/api/chat/session/${sessionId}`),
  ask: (sessionId, text, diagnosis, options = {}) =>
    chatApiInstance.post(`/api/chat/ask/${sessionId}`, { text, diagnosis }, { signal: options.signal }),
  getRecipes: (sessionId, diagnosis, options = {}) =>
    chatApiInstance.post(`/api/chat/recipes/${sessionId}`, { diagnosis, force: !!options.force }),
  getAyurvedicRecommendations: (sessionId, diagnosis, options = {}) =>
    chatApiInstance.post(`/api/chat/recommendations/${sessionId}`, {
      diagnosis,
      force: !!options.force,
    }),
};

export default api;
