import React, { useState, useEffect } from 'react';
import {
  Home,
  User,
  LogOut,
  Stethoscope,
  Calendar,
  MessageSquare,
  History,
  Settings,
  ChevronRight,
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { logoutUser } from '../../services/api';
import { doctorService } from '../../services/api';
import { motion } from 'framer-motion';

const Sidebar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [profile, setProfile] = useState(null);
  const [onLeave, setOnLeave] = useState(false);
  const [toggling, setToggling] = useState(false);
  const user = JSON.parse(localStorage.getItem('user'));

  useEffect(() => {
    doctorService
      .getProfile()
      .then((p) => {
        if (p) {
          setProfile(p);
          setOnLeave(!!p.onLeave);
        }
      })
      .catch(() => {});
  }, []);

  const toggleLeave = async () => {
    if (toggling) return;
    setToggling(true);
    try {
      const result = await doctorService.toggleLeave();
      if (result.success) {
        setOnLeave(result.onLeave);
      }
    } catch (err) {
      console.error('Toggle error:', err);
    }
    setToggling(false);
  };

  const menuItems = [
    { id: 'home', label: 'Dashboard', icon: Home, path: '/dashboard' },
    { id: 'schedule', label: 'My Schedule', icon: Calendar, path: '/schedule' },
    { id: 'messages', label: 'Messages', icon: MessageSquare, path: '/messages' },
    { id: 'registry', label: 'Patient Registry', icon: History, path: '/registry' },
    { id: 'profile', label: 'My Profile', icon: User, path: '/profile' },
  ];

  const handleLogout = () => {
    logoutUser();
    navigate('/login');
  };

  return (
    <div className="sidebar">
      {/* BRAND */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="sidebar__brand"
      >
        <div className="sidebar__brand-icon">
          <Stethoscope size={20} />
        </div>
        <div>
          <div className="sidebar__brand-name">DocConnect</div>
          <p style={{ fontSize: '11px', color: '#9CA3AF', margin: '0', marginTop: '2px' }}>
            Pro
          </p>
        </div>
      </motion.div>

      {/* NAVIGATION */}
      <nav className="sidebar__nav">
        {menuItems.map((item, idx) => {
          const Icon = item.icon;
          const isActive = location.pathname.startsWith(item.path);

          return (
            <motion.button
              key={item.id}
              whileHover={{ x: 4 }}
              onClick={() => navigate(item.path)}
              className={`sidebar__nav-item ${isActive ? 'active' : ''}`}
            >
              <Icon size={20} />
              <span>{item.label}</span>
              {isActive && <ChevronRight size={16} style={{ marginLeft: 'auto' }} />}
            </motion.button>
          );
        })}
      </nav>

      {/* LEAVE STATUS */}
      <div className="sidebar__footer">
        <motion.button
          onClick={toggleLeave}
          disabled={toggling}
          whileHover={{ scale: 1.02 }}
          style={{
            width: '100%',
            padding: '12px 16px',
            borderRadius: '8px',
            border: `2px solid ${onLeave ? '#0D9488' : '#E5E7EB'}`,
            backgroundColor: onLeave ? '#F0FDFA' : 'transparent',
            color: onLeave ? '#0D9488' : '#6B7280',
            fontWeight: '600',
            fontSize: '14px',
            cursor: toggling ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s ease',
            marginBottom: '12px',
          }}
        >
          {onLeave ? '✓ On Leave' : 'Mark Leave'}
        </motion.button>

        <button
          onClick={handleLogout}
          className="sidebar__nav-item"
          style={{
            color: '#EF4444',
            marginTop: '8px',
          }}
        >
          <LogOut size={20} />
          <span>Sign Out</span>
        </button>
      </div>

      {/* PROFILE INFO */}
      {profile && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{
            marginTop: '16px',
            paddingTop: '16px',
            borderTop: '1px solid #E5E7EB',
            backgroundColor: '#F8F9FA',
            padding: '12px',
            borderRadius: '8px',
          }}
        >
          <p style={{ fontSize: '11px', fontWeight: '600', color: '#9CA3AF', marginBottom: '8px' }}>
            DOCTOR PROFILE
          </p>
          <p style={{ fontSize: '14px', fontWeight: '600', color: '#1F2937', marginBottom: '4px' }}>
            Dr. {profile.basicInfo?.name?.split(' ').pop()}
          </p>
          <p style={{ fontSize: '12px', color: '#6B7280', margin: '0' }}>
            {profile.basicInfo?.specialization || 'Ayurveda Specialist'}
          </p>
        </motion.div>
      )}
    </div>
  );
};

export default Sidebar;
