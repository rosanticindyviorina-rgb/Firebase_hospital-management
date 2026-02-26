'use client';

import { useEffect, useState } from 'react';
import Sidebar from '@/components/Sidebar';
import { useAuth } from '@/components/AuthProvider';
import { useRouter } from 'next/navigation';
import { adminApi } from '@/lib/api';

const AD_PROVIDERS = ['admob', 'applovin', 'unity', 'adcolony'];

export default function AdsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [currentProvider, setCurrentProvider] = useState('');
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!loading && !user) router.push('/');
  }, [user, loading, router]);

  useEffect(() => {
    if (user) {
      adminApi.getConfig().then((config) => {
        setCurrentProvider(config.ad_provider || 'admob');
      }).catch((err) => setError(err.message));
    }
  }, [user]);

  if (loading || !user) return null;

  const handleSwitch = async (provider: string) => {
    if (provider === currentProvider) return;
    setSwitching(true);
    setError('');
    setSuccess('');
    try {
      await adminApi.switchAds(provider);
      setCurrentProvider(provider);
      setSuccess(`Ad provider switched to ${provider}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSwitching(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-8 bg-gray-50">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Switch Ads</h2>

        {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4">{error}</div>}
        {success && <div className="bg-green-50 text-green-600 p-3 rounded-lg mb-4">{success}</div>}

        <div className="bg-white rounded-xl shadow p-6">
          <p className="text-sm text-gray-500 mb-6">
            Select the active ad provider. The app will fetch the updated config on next launch or refresh.
          </p>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {AD_PROVIDERS.map((provider) => {
              const isActive = provider === currentProvider;
              return (
                <button
                  key={provider}
                  onClick={() => handleSwitch(provider)}
                  disabled={switching}
                  className={`p-6 rounded-xl border-2 transition-all text-center ${
                    isActive
                      ? 'border-primary-500 bg-primary-50 ring-2 ring-primary-200'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  } ${switching ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <p className="text-lg font-semibold capitalize">{provider}</p>
                  {isActive && (
                    <span className="inline-block mt-2 px-3 py-1 text-xs bg-primary-100 text-primary-700 rounded-full">
                      Active
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-600">
              <strong>Current provider:</strong>{' '}
              <span className="font-mono bg-gray-200 px-2 py-1 rounded">{currentProvider}</span>
            </p>
            <p className="text-xs text-gray-400 mt-2">
              Changes are logged in the audit trail. The app reads config via Remote Config / Firestore.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
