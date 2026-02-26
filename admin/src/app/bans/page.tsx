'use client';

import { useEffect, useState } from 'react';
import Sidebar from '@/components/Sidebar';
import { useAuth } from '@/components/AuthProvider';
import { useRouter } from 'next/navigation';
import { adminApi } from '@/lib/api';

export default function BansPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [logs, setLogs] = useState<any[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!loading && !user) router.push('/');
  }, [user, loading, router]);

  useEffect(() => {
    if (user) {
      adminApi.getFraudLogs(100).then((data) => setLogs(data.logs)).catch((err) => setError(err.message));
    }
  }, [user]);

  if (loading || !user) return null;

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-8 bg-gray-50">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Bans & Fraud Logs</h2>

        {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4">{error}</div>}

        <div className="bg-white rounded-xl shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">UID</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Reason</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Banned By</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Date</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">No ban records found</td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-mono">{log.uid?.substring(0, 12)}...</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded-full">
                        {log.reason}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">{log.bannedBy || 'system'}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {log.bannedAt?._seconds
                        ? new Date(log.bannedAt._seconds * 1000).toLocaleString()
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => router.push(`/users?uid=${log.uid}`)}
                        className="text-primary-600 hover:underline text-sm"
                      >
                        View User
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
