'use client';

import { useEffect, useState } from 'react';
import Sidebar from '@/components/Sidebar';
import { useAuth } from '@/components/AuthProvider';
import { useRouter } from 'next/navigation';
import { adminApi } from '@/lib/api';

export default function ConfigPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [config, setConfig] = useState<any>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  // Editable fields
  const [exchangeCoins, setExchangeCoins] = useState(3000);
  const [exchangePkr, setExchangePkr] = useState(100);
  const [minWithdrawal, setMinWithdrawal] = useState(3000);
  const [dailyAdLimit, setDailyAdLimit] = useState(8);
  const [adCooldownHours, setAdCooldownHours] = useState(7);
  const [inviteBonus, setInviteBonus] = useState(150);

  useEffect(() => {
    if (!loading && !user) router.push('/');
  }, [user, loading, router]);

  useEffect(() => {
    if (user) {
      adminApi.getConfig().then((cfg) => {
        setConfig(cfg);
        setExchangeCoins(cfg.exchange_rate_coins || 3000);
        setExchangePkr(cfg.exchange_rate_pkr || 100);
        setMinWithdrawal(cfg.min_withdrawal_coins || 3000);
        setDailyAdLimit(cfg.daily_ad_limit || 8);
        setAdCooldownHours(cfg.ad_cooldown_hours || 7);
        setInviteBonus(cfg.l1_invite_bonus_coins || 150);
      }).catch((err) => setError(err.message));
    }
  }, [user]);

  if (loading || !user) return null;

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await adminApi.updateConfig({
        exchange_rate_coins: exchangeCoins,
        exchange_rate_pkr: exchangePkr,
        min_withdrawal_coins: minWithdrawal,
        daily_ad_limit: dailyAdLimit,
        ad_cooldown_hours: adCooldownHours,
        l1_invite_bonus_coins: inviteBonus,
      });
      setSuccess('Configuration saved successfully');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-8 bg-gray-50">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">App Configuration</h2>

        {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4">{error}</div>}
        {success && <div className="bg-green-50 text-green-600 p-3 rounded-lg mb-4">{success}</div>}

        <div className="bg-white rounded-xl shadow p-6 space-y-6">
          {/* Exchange Rate */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Exchange Rate</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Coins per unit</label>
                <input
                  type="number"
                  value={exchangeCoins}
                  onChange={(e) => setExchangeCoins(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">PKR per unit</label>
                <input
                  type="number"
                  value={exchangePkr}
                  onChange={(e) => setExchangePkr(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Current: {exchangeCoins} Coins = {exchangePkr} PKR
            </p>
          </div>

          {/* Withdrawal */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Withdrawal</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Minimum withdrawal (coins)</label>
              <input
                type="number"
                value={minWithdrawal}
                onChange={(e) => setMinWithdrawal(parseInt(e.target.value) || 0)}
                className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-lg"
              />
              <p className="text-xs text-gray-400 mt-1">
                = {Math.floor((minWithdrawal / exchangeCoins) * exchangePkr)} PKR
              </p>
            </div>
          </div>

          {/* Ad Limits */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Ad Limits</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Daily ad limit (rewarded videos)</label>
                <input
                  type="number"
                  value={dailyAdLimit}
                  onChange={(e) => setDailyAdLimit(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ad cooldown (hours)</label>
                <input
                  type="number"
                  value={adCooldownHours}
                  onChange={(e) => setAdCooldownHours(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
            </div>
          </div>

          {/* Referral */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Referral</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">L1 invite bonus (coins)</label>
              <input
                type="number"
                value={inviteBonus}
                onChange={(e) => setInviteBonus(parseInt(e.target.value) || 0)}
                className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : 'Save Configuration'}
          </button>
        </div>
      </main>
    </div>
  );
}
