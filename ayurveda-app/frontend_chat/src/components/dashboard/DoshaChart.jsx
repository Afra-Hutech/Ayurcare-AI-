import React from 'react';
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from 'recharts';

const DoshaChart = ({ vata = 33, pitta = 33, kapha = 34 }) => {
  const data = [
    { subject: 'Vata', A: vata, fullMark: 100 },
    { subject: 'Pitta', A: pitta, fullMark: 100 },
    { subject: 'Kapha', A: kapha, fullMark: 100 },
  ];

  return (
    <div className="w-full h-[300px] bg-white rounded-3xl p-4 border border-slate-100 shadow-sm">
      <h4 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4 text-center">Dosha Equilibrium</h4>
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart cx="50%" cy="50%" outerRadius="80%" data={data}>
          <PolarGrid stroke="#e2e8f0" />
          <PolarAngleAxis 
            dataKey="subject" 
            tick={{ fill: '#64748b', fontSize: 12, fontWeight: 600 }}
          />
          <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
          <Radar
            name="Dosha"
            dataKey="A"
            stroke="#0ea5e9"
            fill="#0ea5e9"
            fillOpacity={0.5}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default DoshaChart;
