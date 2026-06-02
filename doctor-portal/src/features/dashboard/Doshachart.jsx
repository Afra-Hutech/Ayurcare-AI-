import React from 'react';
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
} from 'recharts';

const DoshaChart = ({ vata = 33, pitta = 33, kapha = 33 }) => {
  // Formatting data for Recharts
  const data = [
    { subject: 'Vata', A: vata, fullMark: 100 },
    { subject: 'Pitta', A: pitta, fullMark: 100 },
    { subject: 'Kapha', A: kapha, fullMark: 100 },
  ];

  return (
    <div className="w-full h-[350px] p-6 rounded-2xl bg-white/30 backdrop-blur-md border border-white/20 shadow-xl">
      <h3 className="text-slate-800 font-bold mb-4 text-center">Dosha Analysis</h3>
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart cx="50%" cy="50%" outerRadius="80%" data={data}>
          <PolarGrid stroke="#e2e8f0" />
          <PolarAngleAxis 
            dataKey="subject" 
            tick={{ fill: '#1e293b', fontWeight: 'bold', fontSize: 14 }} 
          />
          <Radar
            name="Dosha"
            dataKey="A"
            stroke="#0ea5e9"
            fill="#0ea5e9"
            fillOpacity={0.4}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default DoshaChart;