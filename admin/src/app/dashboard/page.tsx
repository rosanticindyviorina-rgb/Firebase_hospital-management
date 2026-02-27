'use client';

import { useEffect, useState } from 'react';
import Sidebar from '@/components/Sidebar';
import { useAuth } from '@/components/AuthProvider';
import { useRouter } from 'next/navigation';
import { adminApi } from '@/lib/api';

interface DashboardKPIs {
  totalUsers: number;
  activeBans: number;
  todayNewUsers: number;
  todayBans: number;
  todayTaskClaims: number;
}

export default function DashboardPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [kpis, setKpis] = useState<DashboardKPIs | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!loading && !user) router.push('/');
  }, [user, loading, router]);

  useEffect(() => {
    if (user) {
      adminApi.getDashboard().then(setKpis).catch((err) => setError(err.message));
    }
  }, [user]);

  if (loading || !user) return null;

  const kpiCards = [
    { label: 'Total Users', value: kpis?.totalUsers ?? '—', color: 'bg-primary-500' },
    { label: 'Active Bans', value: kpis?.activeBans ?? '—', color: 'bg-danger-500' },
    { label: 'New Users Today', value: kpis?.todayNewUsers ?? '—', color: 'bg-primary-400' },
    { label: 'Bans Today', value: kpis?.todayBans ?? '—', color: 'bg-warning-500' },
    { label: 'Task Claims Today', value: kpis?.todayTaskClaims ?? '—', color: 'bg-secondary-500' },
  ];

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-8 bg-gray-50">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h2>

        {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4">{error}</div>}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 mb-8">
          {kpiCards.map((card) => (
            <div key={card.label} className="bg-white rounded-xl shadow p-6">
              <div className={`w-10 h-10 ${card.color} rounded-lg mb-3 flex items-center justify-center`}>
                <span className="text-white text-lg font-bold">
                  {typeof card.value === 'number' ? '' : '#'}
                </span>
              </div>
              <p className="text-2xl font-bold text-gray-900">{card.value}</p>
              <p className="text-sm text-gray-500 mt-1">{card.label}</p>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-xl shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
          <div className="flex gap-3">
            <button
              onClick={() => router.push('/users')}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
            >
              Search Users
            </button>
            <button
              onClick={() => router.push('/ads')}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              Switch Ads
            </button>
            <button
              onClick={() => router.push('/withdrawals')}
              className="px-4 py-2 bg-secondary-500 text-white rounded-lg hover:bg-secondary-600 transition-colors"
            >
              Manage Withdrawals
            </button>
            <button
              onClick={() => router.push('/bans')}
              className="px-4 py-2 bg-danger-600 text-white rounded-lg hover:bg-danger-700 transition-colors"
            >
              View Fraud Logs
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
