'use client';

import { useEffect, useState } from 'react';
import Sidebar from '@/components/Sidebar';
import { useAuth } from '@/components/AuthProvider';
import { useRouter } from 'next/navigation';
import { adminApi } from '@/lib/api';

export default function RedeemPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [codes, setCodes] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [creating, setCreating] = useState(false);

  // Create form
  const [totalCoins, setTotalCoins] = useState(1000);
  const [maxClaims, setMaxClaims] = useState(10);

  useEffect(() => {
    if (!loading && !user) router.push('/');
  }, [user, loading, router]);

  useEffect(() => {
    if (user) loadCodes();
  }, [user]);

  async function loadCodes() {
    try {
      const data = await adminApi.getRedeemCodes();
      setCodes(data.codes);
    } catch (err: any) {
      setError(err.message);
    }
  }

  const handleCreate = async () => {
    setCreating(true);
    setError('');
    setSuccess('');
    try {
      const result = await adminApi.createRedeemCode(totalCoins, maxClaims);
      setSuccess(`Redeem code created: ${result.code} (${result.totalCoins} coins, ${result.maxClaims} claims)`);
      loadCodes();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleDeactivate = async (code: string) => {
    if (!confirm(`Deactivate code ${code}?`)) return;
    try {
      await adminApi.deactivateRedeemCode(code);
      loadCodes();
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (loading || !user) return null;

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-8 bg-gray-50">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Redeem Codes</h2>

        {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4">{error}</div>}
        {success && <div className="bg-green-50 text-green-600 p-3 rounded-lg mb-4">{success}</div>}

        {/* Create Form */}
        <div className="bg-white rounded-xl shadow p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Create Redeem Code</h3>
          <p className="text-sm text-gray-500 mb-4">
            Create a giveaway code. Coins are distributed randomly among users who claim it.
          </p>
          <div className="flex gap-4 items-end">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Total Coins Pool</label>
              <input
                type="number"
                value={totalCoins}
                onChange={(e) => setTotalCoins(parseInt(e.target.value) || 0)}
                className="w-40 px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max Claims</label>
              <input
                type="number"
                value={maxClaims}
                onChange={(e) => setMaxClaims(parseInt(e.target.value) || 0)}
                className="w-32 px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <button
              onClick={handleCreate}
              disabled={creating}
              className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
            >
              {creating ? 'Creating...' : 'Create Code'}
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Avg per user: ~{maxClaims > 0 ? Math.floor(totalCoins / maxClaims) : 0} coins
          </p>
        </div>

        {/* Codes Table */}
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Code</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Pool</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Remaining</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Claims</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Status</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {codes.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">No redeem codes yet</td>
                </tr>
              ) : (
                codes.map((c) => (
                  <tr key={c.code} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-mono font-bold">{c.code}</td>
                    <td className="px-4 py-3 text-sm">{c.totalCoins} coins</td>
                    <td className="px-4 py-3 text-sm">{c.remainingCoins} coins</td>
                    <td className="px-4 py-3 text-sm">{c.claimCount}/{c.maxClaims}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        c.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                      }`}>
                        {c.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {c.active && (
                        <button
                          onClick={() => handleDeactivate(c.code)}
                          className="text-red-600 hover:underline text-sm"
                        >
                          Deactivate
                        </button>
                      )}
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
