import React, { useEffect, useState } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import Chat from './Chat'
import Auth from './pages/Auth'
import PatientDashboard from './pages/dashboard/PatientDashboard'
import DashboardHome from './pages/dashboard/DashboardHome'
import DoshaAssessment from './pages/dashboard/DoshaAssessment'
import MedicalVault from './pages/dashboard/MedicalVault'
import Prescriptions from './pages/dashboard/Prescriptions'
import SmartRecommendations from './pages/dashboard/SmartRecommendations'
import MealPlanner from './pages/dashboard/MealPlanner'
import MedicineChecker from './pages/dashboard/MedicineChecker'

import Consultations from './pages/dashboard/Consultations'
import Appointments from './pages/dashboard/Appointments'
import VideoConsultation from './pages/dashboard/VideoConsultation'
import FindDoctors from './pages/dashboard/FindDoctors'
import Profile from './pages/dashboard/Profile'
import Messages from './pages/dashboard/Messages'
import { ThemeProvider } from './context/ThemeContext'
import ErrorBoundary from './components/ErrorBoundary'
import RedirectToPortalHub from './components/RedirectToPortalHub'
import ForgotPassword from './pages/ForgotPassword'

const ProtectedRoute = ({ children }) => {
  const token = localStorage.getItem('token')
  if (!token) {
    return <Navigate to="/login" replace />
  }
  return children
}

export default function App() {
  const [, setIsAuthenticated] = useState(!!localStorage.getItem('token'))

  useEffect(() => {
    const handleStorageChange = () => {
      setIsAuthenticated(!!localStorage.getItem('token'))
    }
    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [])

  return (
    <ThemeProvider>
    <ErrorBoundary>
    <Router>
      <div className="app-root h-screen w-screen overflow-hidden">
        <Routes>
          {/* Landing / role picker only on portal-hub (:8080) */}
          <Route path="/welcome" element={<RedirectToPortalHub />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ForgotPassword />} />

          <Route path="/login" element={<Auth />} />
          <Route path="/signup" element={<Auth />} />

          {/* Protected Patient Dashboard routes */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <PatientDashboard />
              </ProtectedRoute>
            }
          >
              <Route index element={<DashboardHome />} />
            <Route path="dosha-assessment" element={<DoshaAssessment />} />
            <Route path="consultations" element={<Consultations />} />
            <Route path="appointments" element={<Appointments />} />
            <Route path="video/:appointmentId" element={<VideoConsultation />} />
            <Route path="find-doctors" element={<FindDoctors />} />
            <Route path="profile" element={<Profile />} />
            <Route path="messages" element={<Messages />} />
            <Route path="messages/:chatId" element={<Messages />} />
            <Route path="medical-vault" element={<MedicalVault />} />
            <Route path="prescriptions" element={<Prescriptions />} />
            <Route path="care-plan" element={<Navigate to="/ayurvedic-guide" replace />} />
            <Route path="ayurvedic-guide" element={<SmartRecommendations />} />
            <Route path="chat/:sessionId?" element={<Chat />} />
            <Route path="meal-planner" element={<MealPlanner />} />
            <Route path="medicine-checker" element={<MedicineChecker />} />
          </Route>

          {/* Catch-all */}
          <Route
            path="*"
            element={
              localStorage.getItem('token')
                ? <Navigate to="/" replace />
                : <Navigate to="/login" replace />
            }
          />
        </Routes>
      </div>
    </Router>
    </ErrorBoundary>
    </ThemeProvider>
  )
}
