'use client';

import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { GuardianDashboard } from '@/components/guardian/dashboard';

interface HealthData {
  healthFactor: number;
  totalCollateralUSD: number;
  totalDebtUSD: number;
  availableBorrowsUSD: number;
  isBelowThreshold: boolean;
  threshold: number;
}

interface BalanceData {
  asset: string;
  symbol: string;
  balance: string;
  collateralEnabled: boolean;
}

export default function GuardianPage() {
  const { address, isConnected } = useAccount();
  const [health, setHealth] = useState<HealthData | null>(null);
  const [balances, setBalances] = useState<BalanceData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rapEnabled, setRapEnabled] = useState(true);

  useEffect(() => {
    if (!address) {
      setHealth(null);
      setBalances([]);
      return;
    }
    let alive = true;
    const ctrl = new AbortController();
    setLoading(true);
    fetch(`/api/guardian/status?user=${address}`, { signal: ctrl.signal })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load guardian status');
        if (!alive) return;
        setHealth(data.health);
        setBalances(data.balances);
        setError(null);
        setLoading(false);
      })
      .catch((err) => {
        if (!alive || err?.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Failed to load guardian status');
        setLoading(false);
      });
    return () => {
      alive = false;
      ctrl.abort();
    };
  }, [address]);

  const usdc = balances.find((b) => b.symbol === 'USDC');

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-8">
        <h1 className="text-center text-3xl font-semibold tracking-tight">Guardian</h1>
        <p className="mt-2 text-center text-gray-600">
          Live Aave position risk and KeeperHub protection status on Sepolia.
        </p>
      </header>

      <div className="mx-auto mt-8 max-w-xl">
        {!isConnected && (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
            <p className="text-gray-600">Connect your wallet to see your guarded position.</p>
          </div>
        )}

        {isConnected && loading && !health && (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center" role="status">
            <p className="text-gray-500">Reading on-chain position...</p>
          </div>
        )}

        {isConnected && error && !health && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-8 text-center" role="alert">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {isConnected && health && (
          <GuardianDashboard
            healthFactor={health.healthFactor}
            keeperHubActivity={[]}
            x402Status={null}
            usdcBalance={usdc ? usdc.balance : undefined}
            rapEnabled={rapEnabled}
            onProtectionToggle={setRapEnabled}
          />
        )}
      </div>
    </div>
  );
}
