'use client';

import { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { useAuth } from '@/components/AuthProvider';
import { useRouter } from 'next/navigation';
import { adminApi } from '@/lib/api';

export default function UsersPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [field, setField] = useState('phone');
  const [results, setResults] = useState<any[]>([]);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [error, setError] = useState('');
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.push('/');
  }, [user, loading, router]);

  if (loading || !user) return null;

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setError('');
    try {
      const data = await adminApi.searchUsers(query.trim(), field);
      setResults(data.users);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSearching(false);
    }
  };

  const handleViewDetail = async (uid: string) => {
    try {
      const detail = await adminApi.getUserDetail(uid);
      setSelectedUser(detail);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleBan = async (uid: string) => {
    const reason = prompt('Enter ban reason:');
    if (!reason) return;
    try {
      await adminApi.banUser(uid, reason);
      alert('User banned successfully');
      handleViewDetail(uid);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleUnban = async (uid: string) => {
    if (!confirm('Are you sure you want to unban this user?')) return;
    try {
      await adminApi.unbanUser(uid);
      alert('User unbanned successfully');
      handleViewDetail(uid);
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-8 bg-gray-50">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">User Management</h2>

        {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4">{error}</div>}

        {/* Search */}
        <div className="bg-white rounded-xl shadow p-6 mb-6">
          <div className="flex gap-3">
            <select
              value={field}
              onChange={(e) => setField(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="phone">Phone</option>
              <option value="uid">UID</option>
              <option value="referralCode">Referral Code</option>
            </select>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder={`Search by ${field}...`}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
            />
            <button
              onClick={handleSearch}
              disabled={searching}
              className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
            >
              {searching ? 'Searching...' : 'Search'}
            </button>
          </div>
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div className="bg-white rounded-xl shadow overflow-hidden mb-6">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">UID</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Phone</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Status</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Balance</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {results.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-mono">{u.uid?.substring(0, 12)}...</td>
                    <td className="px-4 py-3 text-sm">{u.phone}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        u.status === 'active' ? 'bg-green-100 text-green-700' :
                        u.status === 'banned' ? 'bg-red-100 text-red-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {u.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">{u.balance ?? 0} PKR</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleViewDetail(u.uid || u.id)}
                        className="text-primary-600 hover:underline text-sm mr-3"
                      >
                        View
                      </button>
                      {u.status === 'active' ? (
                        <button onClick={() => handleBan(u.uid || u.id)} className="text-red-600 hover:underline text-sm">
                          Ban
                        </button>
                      ) : (
                        <button onClick={() => handleUnban(u.uid || u.id)} className="text-green-600 hover:underline text-sm">
                          Unban
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* User Detail Modal */}
        {selectedUser && (
          <div className="bg-white rounded-xl shadow p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">User Detail</h3>
              <button onClick={() => setSelectedUser(null)} className="text-gray-400 hover:text-gray-600">Close</button>
            </div>

            {selectedUser.user && (
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div><span className="text-sm text-gray-500">UID:</span> <span className="text-sm font-mono">{selectedUser.user.uid}</span></div>
                <div><span className="text-sm text-gray-500">Phone:</span> <span className="text-sm">{selectedUser.user.phone}</span></div>
                <div><span className="text-sm text-gray-500">Status:</span> <span className="text-sm font-semibold">{selectedUser.user.status}</span></div>
                <div><span className="text-sm text-gray-500">Balance:</span> <span className="text-sm">{selectedUser.user.balance} PKR</span></div>
                <div><span className="text-sm text-gray-500">Total Earned:</span> <span className="text-sm">{selectedUser.user.totalEarned} PKR</span></div>
                <div><span className="text-sm text-gray-500">Referral Code:</span> <span className="text-sm font-mono">{selectedUser.user.referralCode}</span></div>
              </div>
            )}

            {selectedUser.referral && (
              <div className="border-t pt-4 mt-4">
                <h4 className="text-sm font-medium text-gray-700 mb-2">Referral Info</h4>
                <div className="text-sm">
                  <p>Invited by: <span className="font-mono">{selectedUser.referral.inviterUid}</span></p>
                  <p>L1 Children: {selectedUser.referral.childrenL1?.length || 0}</p>
                  <p>Verified L1 Invites: {selectedUser.referral.verifiedInvitesL1 || 0}</p>
                </div>
              </div>
            )}

            {selectedUser.ban && (
              <div className="border-t pt-4 mt-4">
                <h4 className="text-sm font-medium text-red-700 mb-2">Ban Record</h4>
                <div className="text-sm bg-red-50 p-3 rounded-lg">
                  <p>Reason: {selectedUser.ban.reason}</p>
                  <p>Banned by: {selectedUser.ban.bannedBy}</p>
                </div>
              </div>
            )}

            {selectedUser.recentLedger?.length > 0 && (
              <div className="border-t pt-4 mt-4">
                <h4 className="text-sm font-medium text-gray-700 mb-2">Recent Ledger</h4>
                <div className="space-y-2">
                  {selectedUser.recentLedger.map((entry: any) => (
                    <div key={entry.id} className="flex justify-between text-sm bg-gray-50 p-2 rounded">
                      <span>{entry.type}</span>
                      <span className="font-medium">{entry.amount} PKR</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
