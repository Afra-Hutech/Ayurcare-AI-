import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './features/auth/Login';
import Signup from './features/auth/Signup';
import ForgotPassword from './features/auth/ForgotPassword';
import ProtectedRoute from './components/ui/ProtectedRoute';
import { ThemeProvider } from './context/ThemeContext';
import { authService } from './services/api';

const Onboarding = lazy(() => import('./features/onboarding/Onboarding'));
const Dashboard = lazy(() => import('./features/dashboard/Dashboard'));
const RevenueReport = lazy(() => import('./features/dashboard/RevenueReport'));
const MySchedule = lazy(() => import('./features/schedule/MySchedule'));
const Profile = lazy(() => import('./features/profile/Profile'));
const Messages = lazy(() => import('./features/messages/Messages'));
const Registry = lazy(() => import('./features/registry/Registry'));
const ConsultationWorkspace = lazy(() => import('./features/consultation/ConsultationWorkspace'));

const PageFallback = () => (
  <div className="flex h-screen w-full items-center justify-center bg-[var(--practo-bg)] text-[var(--practo-text-light)] text-sm font-semibold">
    Loading…
  </div>
);

function App() {
  return (
    <ThemeProvider>
      <Router>
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ForgotPassword />} />

            <Route
              path="/onboarding"
              element={
                <ProtectedRoute requireOnboarded={false}>
                  <Onboarding />
                </ProtectedRoute>
              }
            />

            <Route
              path="/dashboard"
              element={
                <ProtectedRoute requireOnboarded={true}>
                  <Dashboard />
                </ProtectedRoute>
              }
            />

            <Route
              path="/revenue"
              element={
                <ProtectedRoute requireOnboarded={true}>
                  <RevenueReport />
                </ProtectedRoute>
              }
            />

            <Route
              path="/schedule"
              element={
                <ProtectedRoute requireOnboarded={true}>
                  <MySchedule />
                </ProtectedRoute>
              }
            />

            <Route
              path="/messages"
              element={
                <ProtectedRoute requireOnboarded={true}>
                  <Messages />
                </ProtectedRoute>
              }
            />

            <Route
              path="/messages/:chatId"
              element={
                <ProtectedRoute requireOnboarded={true}>
                  <Messages />
                </ProtectedRoute>
              }
            />

            <Route
              path="/registry"
              element={
                <ProtectedRoute requireOnboarded={true}>
                  <Registry />
                </ProtectedRoute>
              }
            />

            <Route
              path="/consultation/:appointmentId"
              element={
                <ProtectedRoute requireOnboarded={true}>
                  <ConsultationWorkspace />
                </ProtectedRoute>
              }
            />

            <Route
              path="/profile"
              element={
                <ProtectedRoute requireOnboarded={true}>
                  <Profile />
                </ProtectedRoute>
              }
            />

            <Route
              path="/"
              element={
                authService.getCurrentUser() ? (
                  <Navigate to="/dashboard" replace />
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </Router>
    </ThemeProvider>
  );
}

export default App;
