import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { authService } from '../../services/api';

const ProtectedRoute = ({ children, requireOnboarded = true }) => {
  const user = authService.getCurrentUser();
  const location = useLocation();

  // If no user in local storage, redirect to login
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // If user is logged in but not onboarded and we're NOT on the onboarding page, go to onboarding
  if (requireOnboarded && !user.isOnboarded && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }

  // If user IS onboarded and trying to access the onboarding page, redirect to dashboard
  if (user.isOnboarded && location.pathname === '/onboarding') {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};

export default ProtectedRoute;
