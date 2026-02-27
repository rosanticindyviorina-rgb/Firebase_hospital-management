'use client';

import { useEffect, useState } from 'react';
import Sidebar from '@/components/Sidebar';
import { useAuth } from '@/components/AuthProvider';
import { useRouter } from 'next/navigation';
import { adminApi } from '@/lib/api';

type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected';

export default function WithdrawalsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [filter, setFilter] = useState<StatusFilter>('pending');
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rejectModal, setRejectModal] = useState<{ id: string; open: boolean }>({ id: '', open: false });
  const [rejectReason, setRejectReason] = useState('');

  useEffect(() => {
    if (!loading && !user) router.push('/');
  }, [user, loading, router]);

  useEffect(() => {
    if (user) loadWithdrawals();
  }, [user, filter]);

  async function loadWithdrawals() {
    try {
      setError('');
      const data = await adminApi.getWithdrawals(filter);
      setWithdrawals(data.withdrawals);
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleApprove(id: string) {
    setActionLoading(id);
    try {
      await adminApi.approveWithdrawal(id);
      await loadWithdrawals();
    } catch (err: any) {
      setError(err.message);
    }
    setActionLoading(null);
  }

  async function handleReject() {
    if (!rejectModal.id) return;
    setActionLoading(rejectModal.id);
    try {
      await adminApi.rejectWithdrawal(rejectModal.id, rejectReason);
      setRejectModal({ id: '', open: false });
      setRejectReason('');
      await loadWithdrawals();
    } catch (err: any) {
      setError(err.message);
    }
    setActionLoading(null);
  }

  function getMethodBadge(method: string) {
    const colors: Record<string, string> = {
      easypaisa: 'bg-green-100 text-green-700',
      jazzcash: 'bg-red-100 text-red-700',
      usdt: 'bg-teal-100 text-teal-700',
    };
    return colors[method] || 'bg-gray-100 text-gray-700';
  }

  function getStatusBadge(status: string) {
    const colors: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-700',
      approved: 'bg-green-100 text-green-700',
      rejected: 'bg-red-100 text-red-700',
    };
    return colors[status] || 'bg-gray-100 text-gray-700';
  }

  if (loading || !user) return null;

  const pendingCount = withdrawals.filter(w => w.status === 'pending').length;
  const totalAmount = withdrawals.reduce((sum: number, w: any) => sum + (w.amount || 0), 0);

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-8 bg-gray-50">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Withdrawal Management</h2>
            <p className="text-sm text-gray-500 mt-1">
              {filter === 'pending' ? `${pendingCount} pending requests` : `${withdrawals.length} withdrawals`}
              {' '}&middot; Total: PKR {totalAmount.toLocaleString()}
            </p>
          </div>

          {/* Filter tabs */}
          <div className="flex gap-1 bg-white rounded-lg p-1 shadow-sm">
            {(['pending', 'approved', 'rejected', 'all'] as StatusFilter[]).map((status) => (
              <button
                key={status}
                onClick={() => setFilter(status)}
                className={`px-4 py-2 text-sm rounded-md transition-colors ${
                  filter === status
                    ? 'bg-primary-600 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4">{error}</div>}

        <div className="bg-white rounded-xl shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">User</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Method</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Amount</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Account</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Status</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Date</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {withdrawals.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    No {filter !== 'all' ? filter : ''} withdrawals found
                  </td>
                </tr>
              ) : (
                withdrawals.map((w) => (
                  <tr key={w.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-mono">{w.uid?.substring(0, 12)}...</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 text-xs rounded-full font-medium ${getMethodBadge(w.method)}`}>
                        {w.method?.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold">
                      PKR {(w.amount || 0).toLocaleString()}
                      {w.fee > 0 && (
                        <span className="text-xs text-gray-400 ml-1">(fee: {w.fee})</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="font-mono text-xs">{w.accountNumber}</div>
                      {w.accountName && <div className="text-xs text-gray-400">{w.accountName}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 text-xs rounded-full font-medium ${getStatusBadge(w.status)}`}>
                        {w.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {w.createdAt ? new Date(w.createdAt).toLocaleString() : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {w.status === 'pending' && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleApprove(w.id)}
                            disabled={actionLoading === w.id}
                            className="px-3 py-1 text-xs bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                          >
                            {actionLoading === w.id ? '...' : 'Approve'}
                          </button>
                          <button
                            onClick={() => setRejectModal({ id: w.id, open: true })}
                            disabled={actionLoading === w.id}
                            className="px-3 py-1 text-xs bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
                          >
                            Reject
                          </button>
                        </div>
                      )}
                      {w.status === 'rejected' && w.rejectionReason && (
                        <span className="text-xs text-gray-400">{w.rejectionReason}</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Reject Modal */}
        {rejectModal.open && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 w-96 shadow-2xl">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Reject Withdrawal</h3>
              <p className="text-sm text-gray-500 mb-3">
                This will refund the balance back to the user.
              </p>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Reason for rejection (optional)"
                className="w-full border border-gray-300 rounded-lg p-3 text-sm mb-4 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                rows={3}
              />
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => {
                    setRejectModal({ id: '', open: false });
                    setRejectReason('');
                  }}
                  className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReject}
                  disabled={actionLoading !== null}
                  className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                >
                  {actionLoading ? 'Rejecting...' : 'Reject & Refund'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
