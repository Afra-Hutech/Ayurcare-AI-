import React from 'react';
import {
  Chart as ChartJS,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
  ArcElement,
  CategoryScale,
  LinearScale,
  BarElement,
} from 'chart.js';
import { Radar, Pie, Bar } from 'react-chartjs-2';

ChartJS.register(
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
  ArcElement,
  CategoryScale,
  LinearScale,
  BarElement
);

const PDFChartContainer = ({ report }) => {
  if (!report) return null;

  const getDoshaData = (doshaProfile = {}, doshaStr = "") => {
    if (
      typeof doshaProfile?.vata === 'number' &&
      typeof doshaProfile?.pitta === 'number' &&
      typeof doshaProfile?.kapha === 'number'
    ) {
      return {
        vata: doshaProfile.vata,
        pitta: doshaProfile.pitta,
        kapha: doshaProfile.kapha,
      };
    }

    const data = { vata: 33, pitta: 33, kapha: 34 };
    const lowerStr = doshaStr.toLowerCase();
    if (lowerStr.includes('vata') && lowerStr.includes('pitta')) {
      data.vata = 45; data.pitta = 45; data.kapha = 10;
    } else if (lowerStr.includes('vata') && lowerStr.includes('kapha')) {
      data.vata = 45; data.kapha = 45; data.pitta = 10;
    } else if (lowerStr.includes('pitta') && lowerStr.includes('kapha')) {
      data.pitta = 45; data.kapha = 45; data.vata = 10;
    } else if (lowerStr.includes('vata')) {
      data.vata = 70; data.pitta = 15; data.kapha = 15;
    } else if (lowerStr.includes('pitta')) {
      data.pitta = 70; data.vata = 15; data.kapha = 15;
    } else if (lowerStr.includes('kapha')) {
      data.kapha = 70; data.vata = 15; data.pitta = 15;
    }
    return data;
  };

  const doshaData = getDoshaData(report.doshaProfile, report.diagnosis?.dosha || report.doshaProfile?.dominant || '');

  const radarData = {
    labels: ['Vata', 'Pitta', 'Kapha'],
    datasets: [{
      label: 'Current Dosha State',
      data: [doshaData.vata, doshaData.pitta, doshaData.kapha],
      backgroundColor: 'rgba(44, 70, 61, 0.2)',
      borderColor: '#2c463d',
      borderWidth: 2,
    }]
  };

  const dietData = {
    labels: ['Inclusions', 'Exclusions'],
    datasets: [{
      data: [
        Array.isArray(report.dietaryGuide?.toConsume) ? report.dietaryGuide.toConsume.length : 1,
        Array.isArray(report.dietaryGuide?.toAvoid) ? report.dietaryGuide.toAvoid.length : 1
      ],
      backgroundColor: ['#4e6c61', '#9a6f53'],
    }]
  };

  const severityScore =
    report.threatLevel === 'High' ? 80 :
      report.threatLevel === 'Moderate' ? 55 :
        report.threatLevel === 'Low' ? 28 : 40;

  const barData = {
    labels: ['Score'],
    datasets: [{
      label: 'Severity',
      data: [severityScore],
      backgroundColor: report.threatLevel === 'High' ? '#9a6f53' : '#4e6c61',
    }]
  };

  return (
    <div 
      style={{ 
        position: 'absolute', 
        left: '-9999px', // Render off-screen
        width: '600px',
        background: 'white'
      }}
    >
      <div id="chart-dosha" style={{ height: '350px', padding: '20px' }}>
        <h4 style={{ textAlign: 'center', marginBottom: '15px', color: '#2c463d' }}>Dosha Balance Analysis</h4>
        <Radar data={radarData} options={{ maintainAspectRatio: false, plugins: { legend: { display: false } } }} />
      </div>
      <div id="chart-priority" style={{ height: '250px', padding: '20px' }}>
        <h4 style={{ textAlign: 'center', marginBottom: '15px', color: '#2c463d' }}>Condition Priority Level</h4>
        <Bar data={barData} options={{ maintainAspectRatio: false, scales: { y: { beginAtZero: true, max: 100 } } }} />
      </div>
    </div>
  );
};

export default PDFChartContainer;
