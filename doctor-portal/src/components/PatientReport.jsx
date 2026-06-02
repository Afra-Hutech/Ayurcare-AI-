import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { X, Download, AlertCircle, CheckCircle, TrendingUp } from 'lucide-react';
import { getSeverityLevel, SeverityBadge } from './ui/LivePatientFeed';

/**
 * PATIENT REPORT WITH DYNAMIC CHARTS
 */
const PatientReport = ({ patient, onClose }) => {
  const [activeTab, setActiveTab] = useState('overview');
  const [vitalTrends, setVitalTrends] = useState([]);
  const [symptomBreakdown, setSymptomBreakdown] = useState([]);
  const [doshaBalance, setDoshaBalance] = useState([]);

  const severity = getSeverityLevel(patient);

  useEffect(() => {
    // VITAL TRENDS DATA
    setVitalTrends([
      { date: 'Day 1', bp: 130, pulse: 75, temp: 98.6 },
      { date: 'Day 2', bp: 128, pulse: 72, temp: 98.4 },
      { date: 'Day 3', bp: 125, pulse: 70, temp: 98.2 },
      { date: 'Day 4', bp: 122, pulse: 68, temp: 98.0 },
    ]);

    // SYMPTOM DISTRIBUTION (DONUT CHART)
    const symptoms = patient.symptoms || ['Headache', 'Fatigue', 'Anxiety'];
    const symptomMap = {};
    symptoms.forEach((s) => {
      symptomMap[s] = (symptomMap[s] || 0) + 1;
    });
    setSymptomBreakdown(
      Object.entries(symptomMap).map(([name, value]) => ({ name, value }))
    );

    // DOSHA BALANCE (RADAR)
    setDoshaBalance([
      { dosha: 'Vata', value: patient?.dosha?.vata || 35 },
      { dosha: 'Pitta', value: patient?.dosha?.pitta || 45 },
      { dosha: 'Kapha', value: patient?.dosha?.kapha || 20 },
    ]);
  }, [patient]);

  const SYMPTOM_COLORS = ['#8B5CF6', '#F59E0B', '#10B981', '#06B6D4', '#EC4899'];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        backdropFilter: 'blur(4px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(20px)',
          borderRadius: '20px',
          border: `2px solid ${severity.border}`,
          maxWidth: '900px',
          width: '100%',
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 25px 50px rgba(0, 0, 0, 0.15)',
        }}
      >
        {/* HEADER */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            padding: '24px',
            borderBottom: `2px solid ${severity.border}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'start',
            backgroundColor: severity.bg,
            borderTopLeftRadius: '18px',
            borderTopRightRadius: '18px',
          }}
        >
          <div>
            <h2 style={{ fontSize: '24px', fontWeight: '700', color: severity.color, margin: '0' }}>
              {patient.name || 'Patient'}
            </h2>
            <div style={{ display: 'flex', gap: '12px', marginTop: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', color: '#6B7280' }}>
                {patient.age || 'N/A'} years • {patient.gender || 'N/A'}
              </span>
              <SeverityBadge severity={severity} animated={true} />
            </div>
          </div>

          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: severity.color,
              padding: '8px',
            }}
          >
            <X size={24} />
          </motion.button>
        </motion.div>

        {/* TAB NAVIGATION */}
        <div
          style={{
            display: 'flex',
            gap: '0',
            borderBottom: '1px solid #E5E7EB',
            backgroundColor: '#F9FAFB',
            padding: '0 24px',
          }}
        >
          {['overview', 'vitals', 'doshas', 'symptoms'].map((tab) => (
            <motion.button
              key={tab}
              onClick={() => setActiveTab(tab)}
              whileHover={{ backgroundColor: '#F3F4F6' }}
              style={{
                padding: '16px 20px',
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '600',
                color: activeTab === tab ? '#0D9488' : '#6B7280',
                borderBottom: activeTab === tab ? '3px solid #0D9488' : 'none',
                transition: 'all 0.2s',
              }}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </motion.button>
          ))}
        </div>

        {/* CONTENT AREA */}
        <div style={{ padding: '24px' }}>
          <AnimatePresence mode="wait">
            {activeTab === 'overview' && (
              <motion.div
                key="overview"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                  {/* PATIENT INFO */}
                  <div style={{ backgroundColor: '#F9FAFB', padding: '16px', borderRadius: '12px' }}>
                    <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#1F2937', marginBottom: '12px' }}>
                      📋 Patient Information
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
                      <div>
                        <span style={{ fontWeight: '600', color: '#6B7280' }}>Phone:</span>{' '}
                        <span>{patient.phone || 'N/A'}</span>
                      </div>
                      <div>
                        <span style={{ fontWeight: '600', color: '#6B7280' }}>Email:</span>{' '}
                        <span>{patient.email || 'N/A'}</span>
                      </div>
                      <div>
                        <span style={{ fontWeight: '600', color: '#6B7280' }}>Appointment:</span>{' '}
                        <span>{patient.date || 'Today'}</span>
                      </div>
                    </div>
                  </div>

                  {/* SYMPTOMS */}
                  <div style={{ backgroundColor: '#F9FAFB', padding: '16px', borderRadius: '12px' }}>
                    <h4 style={{ fontSize: '14px', fontWeight: '600', color: '#1F2937', marginBottom: '12px' }}>
                      🩹 Primary Symptoms
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {patient.symptoms?.slice(0, 4).map((symptom, idx) => (
                        <motion.div
                          key={idx}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: idx * 0.1 }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '6px 8px',
                            backgroundColor: 'white',
                            borderRadius: '6px',
                            fontSize: '12px',
                          }}
                        >
                          <span style={{ color: SYMPTOM_COLORS[idx % SYMPTOM_COLORS.length], fontWeight: '600' }}>
                            ●
                          </span>
                          {symptom}
                        </motion.div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* NOTES */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  style={{
                    marginTop: '20px',
                    backgroundColor: 'rgba(13, 148, 136, 0.05)',
                    border: '1px solid rgba(13, 148, 136, 0.2)',
                    borderRadius: '10px',
                    padding: '16px',
                  }}
                >
                  <p style={{ fontSize: '13px', color: '#0D9488', fontWeight: '600', marginBottom: '8px' }}>
                    📝 Clinical Notes
                  </p>
                  <p style={{ fontSize: '12px', color: '#6B7280', margin: '0', lineHeight: '1.5' }}>
                    {patient.notes || 'Patient presents with typical symptoms. Requires detailed assessment and treatment planning.'}
                  </p>
                </motion.div>
              </motion.div>
            )}

            {activeTab === 'vitals' && (
              <motion.div
                key="vitals"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <h4 style={{ fontSize: '16px', fontWeight: '600', color: '#1F2937', marginBottom: '16px' }}>
                  📈 Vital Signs Trends
                </h4>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  style={{ height: '300px', width: '100%' }}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={vitalTrends}>
                      <defs>
                        <linearGradient id="colorBp" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#0D9488" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#0D9488" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                      <XAxis dataKey="date" stroke="#6B7280" style={{ fontSize: '12px' }} />
                      <YAxis stroke="#6B7280" style={{ fontSize: '12px' }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'rgba(255, 255, 255, 0.95)',
                          border: '1px solid #E5E7EB',
                          borderRadius: '8px',
                        }}
                      />
                      <Legend />
                      <Area
                        type="monotone"
                        dataKey="bp"
                        stroke="#0D9488"
                        fill="url(#colorBp)"
                        name="Blood Pressure (mmHg)"
                      />
                      <Area type="monotone" dataKey="pulse" stroke="#F59E0B" fill="rgba(245, 158, 11, 0.1)" name="Pulse (bpm)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </motion.div>
              </motion.div>
            )}

            {activeTab === 'doshas' && (
              <motion.div
                key="doshas"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <h4 style={{ fontSize: '16px', fontWeight: '600', color: '#1F2937', marginBottom: '16px' }}>
                  ⚖️ Dosha Balance
                </h4>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  style={{ height: '300px', width: '100%' }}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={doshaBalance}>
                      <PolarGrid stroke="#E5E7EB" />
                      <PolarAngleAxis dataKey="dosha" stroke="#6B7280" style={{ fontSize: '12px' }} />
                      <PolarRadiusAxis stroke="#9CA3AF" style={{ fontSize: '11px' }} />
                      <Radar
                        name="Dosha Level"
                        dataKey="value"
                        stroke="#0D9488"
                        fill="#0D9488"
                        fillOpacity={0.3}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'rgba(255, 255, 255, 0.95)',
                          border: '1px solid #E5E7EB',
                          borderRadius: '8px',
                        }}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </motion.div>
              </motion.div>
            )}

            {activeTab === 'symptoms' && (
              <motion.div
                key="symptoms"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <h4 style={{ fontSize: '16px', fontWeight: '600', color: '#1F2937', marginBottom: '16px' }}>
                  🩺 Symptom Distribution
                </h4>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  style={{ height: '300px', width: '100%' }}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={symptomBreakdown}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, value }) => `${name} (${value})`}
                        outerRadius={100}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {symptomBreakdown.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={SYMPTOM_COLORS[index % SYMPTOM_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'rgba(255, 255, 255, 0.95)',
                          border: '1px solid #E5E7EB',
                          borderRadius: '8px',
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* FOOTER */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          style={{
            padding: '16px 24px',
            borderTop: '1px solid #E5E7EB',
            display: 'flex',
            gap: '12px',
            justifyContent: 'flex-end',
          }}
        >
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onClose}
            style={{
              padding: '10px 20px',
              backgroundColor: '#F3F4F6',
              color: '#1F2937',
              border: 'none',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer',
            }}
          >
            Close
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            style={{
              padding: '10px 20px',
              backgroundColor: '#0D9488',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <Download size={16} />
            Download Report
          </motion.button>
        </motion.div>
      </motion.div>
    </motion.div>
  );
};

export default PatientReport;
