import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertCircle,
  CheckCircle,
  Zap,
  TrendingUp,
  Clock,
  User,
  Phone,
  Calendar,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

/**
 * SEVERITY CLASSIFICATION UTILITY
 */
const getSeverityLevel = (patient) => {
  // Check for severity field in API response
  const severity = patient?.severity || patient?.caseStatus || 'stable';
  
  const severityMap = {
    critical: { level: 'CRITICAL', color: '#991B1B', bg: '#FEE2E2', border: '#DC2626' },
    high: { level: 'CRITICAL', color: '#991B1B', bg: '#FEE2E2', border: '#DC2626' },
    moderate: { level: 'MODERATE', color: '#854D0E', bg: '#FEF9C3', border: '#F59E0B' },
    yellow: { level: 'MODERATE', color: '#854D0E', bg: '#FEF9C3', border: '#F59E0B' },
    stable: { level: 'STABLE', color: '#166534', bg: '#DCFCE7', border: '#10B981' },
    green: { level: 'STABLE', color: '#166534', bg: '#DCFCE7', border: '#10B981' },
    low: { level: 'STABLE', color: '#166534', bg: '#DCFCE7', border: '#10B981' },
  };

  return severityMap[severity.toLowerCase()] || severityMap.stable;
};

/**
 * PULSING ANIMATION FOR CRITICAL CASES
 */
const CriticalPulse = () => (
  <motion.div
    animate={{ opacity: [1, 0.6, 1] }}
    transition={{ duration: 2, repeat: Infinity }}
    className="inline-block"
  >
    <AlertCircle size={20} />
  </motion.div>
);

/**
 * SEVERITY BADGE COMPONENT
 */
const SeverityBadge = ({ severity, animated }) => (
  <motion.div
    initial={{ scale: 0.95, opacity: 0 }}
    animate={{ scale: 1, opacity: 1 }}
    transition={{ duration: 0.3 }}
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      padding: '6px 12px',
      borderRadius: '20px',
      backgroundColor: severity.bg,
      color: severity.color,
      fontSize: '12px',
      fontWeight: '600',
      border: `2px solid ${severity.border}`,
    }}
  >
    {animated && severity.level === 'CRITICAL' ? (
      <CriticalPulse />
    ) : severity.level === 'CRITICAL' ? (
      <AlertCircle size={16} />
    ) : severity.level === 'MODERATE' ? (
      <Zap size={16} />
    ) : (
      <CheckCircle size={16} />
    )}
    {severity.level}
  </motion.div>
);

/**
 * LIVE PATIENT CASE CARD
 */
const PatientCaseCard = ({ patient, onClick }) => {
  const severity = getSeverityLevel(patient);
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <motion.div
      layout
      onClick={() => {
        setIsExpanded(!isExpanded);
        if (onClick) onClick(patient);
      }}
      style={{
        backgroundColor: 'rgba(255, 255, 255, 0.7)',
        backdropFilter: 'blur(10px)',
        border: `2px solid ${severity.border}`,
        borderRadius: '12px',
        padding: '16px',
        cursor: 'pointer',
        overflow: 'hidden',
      }}
      whileHover={{ scale: 1.02, boxShadow: '0 20px 25px rgba(0,0,0,0.1)' }}
      className="transition-all duration-300"
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
        <div>
          <h4 style={{ fontSize: '16px', fontWeight: '600', color: '#1F2937', margin: '0' }}>
            {patient.name || 'Patient'}
          </h4>
          <p style={{ fontSize: '13px', color: '#6B7280', margin: '4px 0 0 0' }}>
            {patient.age || 'N/A'} years • {patient.gender || 'N/A'}
          </p>
        </div>
        <SeverityBadge severity={severity} animated={severity.level === 'CRITICAL'} />
      </div>

      {/* Key Symptoms */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
        {patient.symptoms?.slice(0, 3).map((symptom, idx) => (
          <motion.span
            key={idx}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.1 }}
            style={{
              fontSize: '11px',
              backgroundColor: 'rgba(13, 148, 136, 0.1)',
              color: '#0D9488',
              padding: '4px 8px',
              borderRadius: '6px',
              fontWeight: '500',
            }}
          >
            {symptom}
          </motion.span>
        ))}
      </div>

      {/* Contact Info */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px', fontSize: '12px', color: '#6B7280' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Phone size={14} />
          {patient.phone || 'N/A'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Calendar size={14} />
          {patient.date || 'Today'}
        </div>
      </div>

      {/* Action Button */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        style={{
          width: '100%',
          padding: '10px',
          backgroundColor: '#0D9488',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          fontSize: '13px',
          fontWeight: '600',
          cursor: 'pointer',
          transition: 'all 0.2s',
        }}
      >
        View Full Report
      </motion.button>
    </motion.div>
  );
};

/**
 * LIVE FEED DASHBOARD
 */
const LiveFeedDashboard = ({ patients = [] }) => {
  const [filteredPatients, setFilteredPatients] = useState([]);
  const [selectedSeverity, setSelectedSeverity] = useState('all');

  useEffect(() => {
    if (selectedSeverity === 'all') {
      setFilteredPatients(patients);
    } else {
      setFilteredPatients(
        patients.filter((p) => getSeverityLevel(p).level === selectedSeverity)
      );
    }
  }, [patients, selectedSeverity]);

  const criticalCount = patients.filter((p) => getSeverityLevel(p).level === 'CRITICAL').length;
  const moderateCount = patients.filter((p) => getSeverityLevel(p).level === 'MODERATE').length;
  const stableCount = patients.filter((p) => getSeverityLevel(p).level === 'STABLE').length;

  return (
    <div style={{ padding: '24px' }}>
      {/* HEADER WITH STATS */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ marginBottom: '24px' }}
      >
        <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#1F2937', margin: '0 0 16px 0' }}>
          Live Patient Feed
        </h2>

        {/* STATUS CARDS */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
          {[
            { label: 'Critical', count: criticalCount, color: '#DC2626', bg: '#FEE2E2' },
            { label: 'Moderate', count: moderateCount, color: '#F59E0B', bg: '#FEF9C3' },
            { label: 'Stable', count: stableCount, color: '#10B981', bg: '#DCFCE7' },
          ].map((stat) => (
            <motion.div
              key={stat.label}
              whileHover={{ scale: 1.05 }}
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.7)',
                backdropFilter: 'blur(10px)',
                border: `2px solid ${stat.color}`,
                borderRadius: '12px',
                padding: '16px',
                textAlign: 'center',
              }}
            >
              <p style={{ fontSize: '32px', fontWeight: '700', color: stat.color, margin: '0' }}>
                {stat.count}
              </p>
              <p style={{ fontSize: '13px', color: '#6B7280', margin: '4px 0 0 0' }}>
                {stat.label}
              </p>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* FILTER BUTTONS */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {['all', 'CRITICAL', 'MODERATE', 'STABLE'].map((filter) => (
          <motion.button
            key={filter}
            onClick={() => setSelectedSeverity(filter)}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            style={{
              padding: '8px 16px',
              borderRadius: '20px',
              border: 'none',
              fontWeight: '600',
              fontSize: '13px',
              cursor: 'pointer',
              backgroundColor: selectedSeverity === filter ? '#0D9488' : '#F3F4F6',
              color: selectedSeverity === filter ? 'white' : '#6B7280',
              transition: 'all 0.2s',
            }}
          >
            {filter === 'all' ? 'All' : filter}
          </motion.button>
        ))}
      </div>

      {/* PATIENT CARDS GRID */}
      <AnimatePresence>
        <motion.div
          layout
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}
        >
          {filteredPatients.length > 0 ? (
            filteredPatients.map((patient, idx) => (
              <motion.div
                key={patient._id || idx}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ delay: idx * 0.05 }}
              >
                <PatientCaseCard patient={patient} />
              </motion.div>
            ))
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              style={{
                gridColumn: '1 / -1',
                textAlign: 'center',
                padding: '40px 20px',
                color: '#9CA3AF',
              }}
            >
              <AlertCircle size={40} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
              <p>No patients found matching the selected filter</p>
            </motion.div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export { LiveFeedDashboard, PatientCaseCard, SeverityBadge, getSeverityLevel, CriticalPulse };
