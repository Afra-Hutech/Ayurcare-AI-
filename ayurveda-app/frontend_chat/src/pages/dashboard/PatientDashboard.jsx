import React from 'react';
import { Outlet, Navigate, useLocation } from 'react-router-dom';
import Sidebar from '../../components/dashboard/Sidebar';
import Navbar from '../../components/dashboard/Navbar';
import { motion, AnimatePresence } from 'framer-motion';

const PatientDashboard = () => {
  const location = useLocation();
  const currentToken = localStorage.getItem('token');
  const isChatRoute = location.pathname.startsWith('/chat');
  const isMessagesRoute = location.pathname.startsWith('/messages');
  const isFullHeightRoute = isChatRoute || isMessagesRoute;
  /** Full labels in the shell sidebar everywhere — chat has its own session list inside the page. */
  const shellSidebarCompact = false;
  // Stable animation key — don't re-mount the whole Chat tree when session ID in URL changes
  const animKey = isChatRoute ? 'chat' : isMessagesRoute ? 'messages' : location.pathname;

  if (!currentToken) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-[var(--practo-bg)] overflow-hidden font-sans selection:bg-emerald-200 dark:selection:bg-emerald-900">
      {!isChatRoute && <Sidebar compact={shellSidebarCompact} />}

      <div className="flex-1 flex flex-col min-w-0 min-h-0 h-full relative overflow-hidden">
        {!isChatRoute && <Navbar />}

        <main
          className={`flex-1 min-h-0 relative overflow-hidden page-shell ${
            isFullHeightRoute
              ? 'bg-[var(--practo-bg)] max-lg:pt-14 lg:pt-0'
              : 'bg-gradient-to-br from-slate-50 via-emerald-50/20 to-slate-50 dark:from-[#0a0f16] dark:via-[#0f1419] dark:to-[#0a0f16] max-lg:pt-14 lg:pt-0'
          }`}
        >
          <div className={`w-full h-full min-h-0 ${isFullHeightRoute ? 'overflow-hidden flex flex-col' : 'page-scroll'}`}>
            <AnimatePresence mode="sync">
              <motion.div
                key={animKey}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.1 }}
                className={`w-full min-w-0 mx-auto ${isFullHeightRoute ? 'h-full min-h-0 flex flex-col' : 'max-w-[1440px]'}`}
              >
                <Outlet />
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>
    </div>
  );
};

export default PatientDashboard;
