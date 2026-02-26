'use client';

import { useEffect, useState } from 'react';
import Sidebar from '@/components/Sidebar';
import { useAuth } from '@/components/AuthProvider';
import { useRouter } from 'next/navigation';
import { adminApi } from '@/lib/api';

export default function AuditPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [logs, setLogs] = useState<any[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!loading && !user) router.push('/');
  }, [user, loading, router]);

  useEffect(() => {
    if (user) {
      adminApi.getAuditLogs(100).then((data) => setLogs(data.logs)).catch((err) => setError(err.message));
    }
  }, [user]);

  if (loading || !user) return null;

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-8 bg-gray-50">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Admin Audit Logs</h2>

        {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4">{error}</div>}

        <div className="bg-white rounded-xl shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Action</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Admin UID</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Target</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Details</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">No audit logs found</td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        log.action === 'ban_user' ? 'bg-red-100 text-red-700' :
                        log.action === 'unban_user' ? 'bg-green-100 text-green-700' :
                        log.action === 'switch_ads' ? 'bg-blue-100 text-blue-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm font-mono">{log.adminUid?.substring(0, 12)}...</td>
                    <td className="px-4 py-3 text-sm font-mono">
                      {log.targetUid?.substring(0, 12) || log.provider || '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {log.reason || log.provider || '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {log.timestamp?._seconds
                        ? new Date(log.timestamp._seconds * 1000).toLocaleString()
                        : '—'}
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
