const BASE = import.meta.env.VITE_API_URL || 'http://localhost:5001';

const authHeaders = () => {
  const token = localStorage.getItem('token');
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
};

export const paymentApi = {
  createOrder: (appointmentId) =>
    fetch(`${BASE}/api/payments/create-order`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ appointmentId }),
    }).then((r) => r.json()),

  verifyPayment: (data) =>
    fetch(`${BASE}/api/payments/verify`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(data),
    }).then((r) => r.json()),

  getPaymentStatus: (appointmentId) =>
    fetch(`${BASE}/api/payments/appointment/${appointmentId}`, {
      headers: authHeaders(),
    }).then((r) => r.json()),
};
