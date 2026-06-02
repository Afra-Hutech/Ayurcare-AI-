import React, { useState } from 'react';
import { Bell, Search, Settings, LogOut } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { logoutUser } from '../../services/api';

const Navbar = () => {
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user'));

  // Sample notifications
  const notifications = [
    { id: 1, type: 'appointment', message: 'New appointment request from John Doe', time: '5 mins ago' },
    { id: 2, type: 'message', message: 'Patient message: Follow-up query', time: '1 hour ago' },
    { id: 3, type: 'alert', message: 'Lab report available for patient review', time: '3 hours ago' },
  ];

  const handleLogout = () => {
    logoutUser();
    navigate('/login');
  };

  return (
    <nav className="navbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: '24px', flex: 1 }}>
        {/* Search Bar */}
        <div className="navbar__search">
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Search
              size={18}
              style={{
                position: 'absolute',
                left: '12px',
                color: '#9CA3AF',
              }}
            />
            <input
              type="text"
              placeholder="Search patients, reports..."
              style={{
                width: '100%',
                padding: '10px 16px 10px 40px',
                border: '1px solid #E5E7EB',
                borderRadius: '8px',
                backgroundColor: '#F8F9FA',
                fontSize: '14px',
                outline: 'none',
                transition: 'all 0.2s ease',
              }}
              onFocus={(e) => {
                e.target.style.borderColor = '#0D9488';
                e.target.style.boxShadow = '0 0 0 3px #F0FDFA';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = '#E5E7EB';
                e.target.style.boxShadow = 'none';
              }}
            />
          </div>
        </div>
      </div>

      {/* ACTIONS */}
      <div className="navbar__actions">
        {/* Notification Bell */}
        <div style={{ position: 'relative' }}>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setNotificationsOpen(!notificationsOpen)}
            className="navbar__action-btn"
          >
            <Bell size={20} />
            <div className="navbar__notification-badge">3</div>
          </motion.button>

          {/* Notifications Dropdown */}
          <AnimatePresence>
            {notificationsOpen && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: '0',
                  marginTop: '8px',
                  width: '320px',
                  backgroundColor: 'white',
                  border: '1px solid #E5E7EB',
                  borderRadius: '12px',
                  boxShadow: '0 10px 15px rgba(0, 0, 0, 0.08)',
                  zIndex: 100,
                  overflow: 'hidden',
                }}
              >
                <div style={{ padding: '16px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#1F2937', margin: '0 0 12px 0' }}>
                    Notifications
                  </h3>
                </div>
                <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                  {notifications.map((notif) => (
                    <motion.div
                      key={notif.id}
                      whileHover={{ backgroundColor: '#F8F9FA' }}
                      style={{
                        padding: '12px 16px',
                        borderTop: '1px solid #E5E7EB',
                        cursor: 'pointer',
                        transition: 'background-color 0.2s',
                      }}
                    >
                      <p style={{ fontSize: '14px', color: '#1F2937', margin: '0 0 4px 0', fontWeight: '500' }}>
                        {notif.message}
                      </p>
                      <p style={{ fontSize: '12px', color: '#9CA3AF', margin: '0' }}>
                        {notif.time}
                      </p>
                    </motion.div>
                  ))}
                </div>
                <div
                  style={{
                    padding: '12px 16px',
                    borderTop: '1px solid #E5E7EB',
                    textAlign: 'center',
                  }}
                >
                  <button
                    style={{
                      color: '#0D9488',
                      fontSize: '13px',
                      fontWeight: '600',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    View All Notifications
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Settings */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => navigate('/profile')}
          className="navbar__action-btn"
        >
          <Settings size={20} />
        </motion.button>

        {/* Profile Menu */}
        <div style={{ position: 'relative' }}>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setProfileOpen(!profileOpen)}
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '8px',
              backgroundColor: '#0D9488',
              color: 'white',
              border: 'none',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {user?.name?.charAt(0) || 'D'}
          </motion.button>

          {/* Profile Dropdown */}
          <AnimatePresence>
            {profileOpen && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: '0',
                  marginTop: '8px',
                  width: '200px',
                  backgroundColor: 'white',
                  border: '1px solid #E5E7EB',
                  borderRadius: '12px',
                  boxShadow: '0 10px 15px rgba(0, 0, 0, 0.08)',
                  zIndex: 100,
                  overflow: 'hidden',
                }}
              >
                <div style={{ padding: '12px 16px', borderBottom: '1px solid #E5E7EB' }}>
                  <p style={{ fontSize: '14px', fontWeight: '600', color: '#1F2937', margin: '0' }}>
                    {user?.name || 'Doctor'}
                  </p>
                  <p style={{ fontSize: '12px', color: '#6B7280', margin: '4px 0 0 0' }}>
                    {user?.email}
                  </p>
                </div>
                <button
                  onClick={() => navigate('/profile')}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: 'none',
                    background: 'none',
                    textAlign: 'left',
                    fontSize: '14px',
                    color: '#1F2937',
                    cursor: 'pointer',
                    transition: 'background-color 0.2s',
                  }}
                  onMouseEnter={(e) => (e.target.style.backgroundColor = '#F8F9FA')}
                  onMouseLeave={(e) => (e.target.style.backgroundColor = 'transparent')}
                >
                  View Profile
                </button>
                <button
                  onClick={handleLogout}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: 'none',
                    background: 'none',
                    textAlign: 'left',
                    fontSize: '14px',
                    color: '#EF4444',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    borderTop: '1px solid #E5E7EB',
                    transition: 'background-color 0.2s',
                  }}
                  onMouseEnter={(e) => (e.target.style.backgroundColor = '#F8F9FA')}
                  onMouseLeave={(e) => (e.target.style.backgroundColor = 'transparent')}
                >
                  <LogOut size={16} />
                  Sign Out
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
