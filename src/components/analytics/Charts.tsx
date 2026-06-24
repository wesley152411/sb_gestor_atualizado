'use client';

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement,
} from 'chart.js';
import { Bar, Doughnut, Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement
);

// Financial Bar Chart
export function FinancialChart({ labels, revenue, costs }: { labels: string[], revenue: number[], costs: number[] }) {
  const data = {
    labels,
    datasets: [
      {
        label: 'Faturamento Bruto',
        data: revenue,
        backgroundColor: 'rgba(79, 70, 229, 0.8)',
        borderRadius: 4,
      },
      {
        label: 'Custos / Reposição',
        data: costs,
        backgroundColor: 'rgba(239, 68, 68, 0.8)',
        borderRadius: 4,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom' as const },
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: { color: 'rgba(0, 0, 0, 0.05)' },
      },
      x: {
        grid: { display: false },
      },
    },
  };

  return <Bar data={data} options={options} />;
}

// Themes Donut Chart
export function ThemesChart({ labels, dataValues }: { labels: string[], dataValues: number[] }) {
  const data = {
    labels,
    datasets: [
      {
        data: dataValues,
        backgroundColor: [
          'rgba(79, 70, 229, 0.8)',
          'rgba(16, 185, 129, 0.8)',
          'rgba(245, 158, 11, 0.8)',
          'rgba(236, 72, 153, 0.8)',
        ],
        borderWidth: 0,
        hoverOffset: 4,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'right' as const, labels: { boxWidth: 12 } },
    },
    cutout: '65%',
  };

  return <Doughnut data={data} options={options} />;
}

// Volume Line Chart
export function VolumeChart({ labels, dataValues }: { labels: string[], dataValues: number[] }) {
  const data = {
    labels,
    datasets: [
      {
        label: 'Eventos Realizados',
        data: dataValues,
        fill: true,
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        borderColor: 'rgba(16, 185, 129, 1)',
        tension: 0.4,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: { color: 'rgba(0, 0, 0, 0.05)' },
        ticks: { stepSize: 1 },
      },
      x: {
        grid: { display: false },
      },
    },
  };

  return <Line data={data} options={options} />;
}
