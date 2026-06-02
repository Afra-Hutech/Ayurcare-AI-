const API_BASE_URL = "http://localhost:5002/api/patient";

export const authService = {
  // 1. SIGNUP (Now matches your FastAPI /api/patient/signup route)
  signup: async (name, email, password) => {
    try {
      const response = await fetch(`${API_BASE_URL}/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        return { user: null, error: data.detail || 'Signup failed' };
      }

      // Store user in local storage for session management
      localStorage.setItem('user', JSON.stringify(data));
      return { user: data, error: null };
    } catch (err) {
      return { user: null, error: 'Cannot connect to health server. Please check port 5001.' };
    }
  },

  // 2. LOGIN
  login: async (email, password) => {
    try {
      const response = await fetch(`${API_BASE_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        return { user: null, error: data.detail || 'Invalid credentials' };
      }

      localStorage.setItem('user', JSON.stringify(data));
      return { user: data, error: null };
    } catch (err) {
      return { user: null, error: 'Connection error' };
    }
  },

  // 3. MEDICAL RECORD UPLOAD (The "Practo" Feature)
  uploadRecord: async (file, note) => {
    try {
      const user = JSON.parse(localStorage.getItem('user'));
      const formData = new FormData();
      formData.append('file', file);
      formData.append('note', note);
      formData.append('patient_id', user.id);

      const response = await fetch(`${API_BASE_URL}/upload-record`, {
        method: 'POST',
        body: formData, // No Content-Type header; browser sets it for FormData
      });

      return await response.json();
    } catch (err) {
      return { error: 'Failed to upload record' };
    }
  },

  // 4. SESSION HELPERS
  getCurrentUser: () => {
    const user = localStorage.getItem('user');
    return user ? JSON.parse(user) : null;
  },

  logout: () => {
    localStorage.removeItem('user');
  }
};

// Export individual functions to keep your current component imports working
export const signupUser = (email, password, name) => authService.signup(name, email, password);
export const loginUser = (email, password) => authService.login(email, password);
export const logoutUser = () => authService.logout();

export const subscribeToAuthChanges = (callback) => {
  const interval = setInterval(() => {
    callback(authService.getCurrentUser());
  }, 1000);
  callback(authService.getCurrentUser());
  return () => clearInterval(interval);
};