import { firebaseAuth } from './firebase';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const user = firebaseAuth().currentUser;
  if (!user) throw new Error('Not authenticated');

  const token = await user.getIdToken();
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...headers, ...options.headers },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

// Admin API methods
export const adminApi = {
  // Dashboard
  getDashboard: () => apiRequest<{
    totalUsers: number;
    activeBans: number;
    todayNewUsers: number;
    todayBans: number;
    todayTaskClaims: number;
  }>('/admin/dashboard'),

  // Users
  searchUsers: (query: string, field: string) =>
    apiRequest<{ users: any[] }>(`/admin/searchUsers?query=${encodeURIComponent(query)}&field=${field}`),

  getUserDetail: (uid: string) =>
    apiRequest<{ user: any; referral: any; ban: any; recentTasks: any[]; recentLedger: any[] }>(
      `/admin/userDetail/${uid}`
    ),

  // Bans
  banUser: (targetUid: string, reason: string) =>
    apiRequest('/admin/banUser', {
      method: 'POST',
      body: JSON.stringify({ targetUid, reason }),
    }),

  unbanUser: (targetUid: string) =>
    apiRequest('/admin/unbanUser', {
      method: 'POST',
      body: JSON.stringify({ targetUid }),
    }),

  // Ads
  switchAds: (provider: string) =>
    apiRequest('/admin/switchAds', {
      method: 'POST',
      body: JSON.stringify({ provider }),
    }),

  getConfig: () => apiRequest<{ ad_provider: string; maintenance_mode: boolean }>('/admin/config'),

  // Logs
  getFraudLogs: (limit = 50) =>
    apiRequest<{ logs: any[] }>(`/admin/fraudLogs?limit=${limit}`),

  getAuditLogs: (limit = 50) =>
    apiRequest<{ logs: any[] }>(`/admin/auditLogs?limit=${limit}`),

  // Withdrawals
  getWithdrawals: (status?: string, limit = 50) =>
    apiRequest<{ withdrawals: any[] }>(`/withdrawals/admin/all?status=${status || 'all'}&limit=${limit}`),

  getPendingWithdrawals: () =>
    apiRequest<{ withdrawals: any[] }>('/withdrawals/admin/pending'),

  approveWithdrawal: (withdrawalId: string) =>
    apiRequest('/withdrawals/admin/approve', {
      method: 'POST',
      body: JSON.stringify({ withdrawalId }),
    }),

  rejectWithdrawal: (withdrawalId: string, reason: string) =>
    apiRequest('/withdrawals/admin/reject', {
      method: 'POST',
      body: JSON.stringify({ withdrawalId, reason }),
    }),
};
