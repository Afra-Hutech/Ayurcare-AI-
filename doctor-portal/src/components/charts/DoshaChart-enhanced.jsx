import React, { useEffect, useState } from 'react';
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  AreaChart,
  Area,
} from 'recharts';
import { motion } from 'framer-motion';

/**
 * ENHANCED DOSHA CHART WITH RADAR & TRENDS
 */
const DoshaChart = ({ patientData = {} }) => {
  const [chartType, setChartType] = useState('radar'); // 'radar' or 'trends'
  const [doshaData, setDoshaData] = useState([]);
  const [trendData, setTrendData] = useState([]);

  useEffect(() => {
    // Parse patient dosha data from API response
    const vata = patientData?.dosha?.vata || 35;
    const pitta = patientData?.dosha?.pitta || 45;
    const kapha = patientData?.dosha?.kapha || 20;

    setDoshaData([
      { dosha: 'Vata', value: vata, fullMark: 100, color: '#8B5CF6' },
      { dosha: 'Pitta', value: pitta, fullMark: 100, color: '#F59E0B' },
      { dosha: 'Kapha', value: kapha, fullMark: 100, color: '#10B981' },
    ]);

    // Trend data (sample - would come from historical data)
    setTrendData([
      { date: 'Day 1', vata: 40, pitta: 40, kapha: 20 },
      { date: 'Day 3', vata: 38, pitta: 42, kapha: 20 },
      { date: 'Day 5', vata: 35, pitta: 45, kapha: 20 },
      { date: 'Day 7', vata: 35, pitta: 45, kapha: 20 },
    ]);
  }, [patientData]);

  const COLORS = {
    vata: '#8B5CF6',
    pitta: '#F59E0B',
    kapha: '#10B981',
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      style={{
        backgroundColor: 'rgba(255, 255, 255, 0.7)',
        backdropFilter: 'blur(10px)',
        borderRadius: '16px',
        border: '1px solid rgba(229, 231, 235, 0.5)',
        padding: '24px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.08)',
      }}
    >
      {/* HEADER */}
      <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1F2937', margin: '0' }}>
          Dosha Balance Analysis
        </h3>

        {/* TOGGLE BUTTONS */}
        <div style={{ display: 'flex', gap: '8px', backgroundColor: '#F3F4F6', padding: '4px', borderRadius: '8px' }}>
          {['radar', 'trends'].map((type) => (
            <motion.button
              key={type}
              onClick={() => setChartType(type)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                border: 'none',
                fontSize: '12px',
                fontWeight: '600',
                cursor: 'pointer',
                backgroundColor: chartType === type ? 'white' : 'transparent',
                color: chartType === type ? '#0D9488' : '#6B7280',
                boxShadow: chartType === type ? '0 2px 4px rgba(0,0,0,0.1)' : 'none',
                transition: 'all 0.2s',
              }}
            >
              {type === 'radar' ? '📊 Radar' : '📈 Trends'}
            </motion.button>
          ))}
        </div>
      </div>

      {/* DOSHA LEGEND */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
        {[
          { name: 'Vata (Ether/Air)', value: doshaData[0]?.value || 0, color: COLORS.vata, icon: '💨' },
          { name: 'Pitta (Fire/Water)', value: doshaData[1]?.value || 0, color: COLORS.pitta, icon: '🔥' },
          { name: 'Kapha (Water/Earth)', value: doshaData[2]?.value || 0, color: COLORS.kapha, icon: '🌊' },
        ].map((dosha, idx) => (
          <motion.div
            key={idx}
            whileHover={{ scale: 1.05 }}
            style={{
              backgroundColor: `${dosha.color}15`,
              border: `2px solid ${dosha.color}`,
              borderRadius: '10px',
              padding: '12px',
              textAlign: 'center',
            }}
          >
            <p style={{ fontSize: '24px', margin: '0 0 6px 0' }}>{dosha.icon}</p>
            <p style={{ fontSize: '11px', fontWeight: '600', color: '#6B7280', margin: '0 0 4px 0' }}>
              {dosha.name}
            </p>
            <p style={{ fontSize: '20px', fontWeight: '700', color: dosha.color, margin: '0' }}>
              {dosha.value}%
            </p>
          </motion.div>
        ))}
      </div>

      {/* CHARTS */}
      {chartType === 'radar' ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          style={{ height: '300px', width: '100%' }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={doshaData}>
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
                  boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                }}
              />
              <Legend wrapperStyle={{ paddingTop: '20px' }} />
            </RadarChart>
          </ResponsiveContainer>
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          style={{ height: '300px', width: '100%' }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="date" stroke="#6B7280" style={{ fontSize: '12px' }} />
              <YAxis stroke="#6B7280" style={{ fontSize: '12px' }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(255, 255, 255, 0.95)',
                  border: '1px solid #E5E7EB',
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                }}
              />
              <Legend wrapperStyle={{ paddingTop: '20px' }} />
              <Line
                type="monotone"
                dataKey="vata"
                stroke={COLORS.vata}
                strokeWidth={2}
                dot={{ fill: COLORS.vata, r: 4 }}
                name="Vata"
              />
              <Line
                type="monotone"
                dataKey="pitta"
                stroke={COLORS.pitta}
                strokeWidth={2}
                dot={{ fill: COLORS.pitta, r: 4 }}
                name="Pitta"
              />
              <Line
                type="monotone"
                dataKey="kapha"
                stroke={COLORS.kapha}
                strokeWidth={2}
                dot={{ fill: COLORS.kapha, r: 4 }}
                name="Kapha"
              />
            </LineChart>
          </ResponsiveContainer>
        </motion.div>
      )}

      {/* INSIGHTS */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        style={{
          marginTop: '20px',
          backgroundColor: 'rgba(13, 148, 136, 0.05)',
          border: '1px solid rgba(13, 148, 136, 0.2)',
          borderRadius: '10px',
          padding: '12px',
        }}
      >
        <p style={{ fontSize: '13px', color: '#0D9488', fontWeight: '600', margin: '0 0 6px 0' }}>
          💡 Dosha Insight
        </p>
        <p style={{ fontSize: '12px', color: '#6B7280', margin: '0' }}>
          {doshaData[1]?.value > 40
            ? "Pitta dominance detected. Recommend cooling therapies and dietary adjustments."
            : doshaData[0]?.value > 40
            ? "Vata imbalance noted. Focus on grounding and warming treatments."
            : "Kapha influence observed. Consider stimulating and heating approaches."}
        </p>
      </motion.div>
    </motion.div>
  );
};

export default DoshaChart;
