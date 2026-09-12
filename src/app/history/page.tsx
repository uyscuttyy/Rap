'use client';

import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { PaymentCard, type PaymentSummary } from '@/components/payments/payment-card';

export default function HistoryPage() {
  const { address, isConnected } = useAccount();
  const [payments, setPayments] = useState<PaymentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!address) return;
    let alive = true;
    const ctrl = new AbortController();
    fetch(`/api/payments?user=${address}`, { signal: ctrl.signal })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load payments');
        if (!alive) return;
        setPayments(data.payments);
        setError(null);
        setLoading(false);
      })
      .catch((err) => {
        if (!alive || err?.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Failed to load payments');
        setLoading(false);
      });
    return () => {
      alive = false;
      ctrl.abort();
    };
  }, [address]);

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-center text-3xl font-semibold tracking-tight">Payment history</h1>
      <p className="mt-2 text-center text-gray-600">
        Every payment keeps its identity and state, even across refreshes.
      </p>

      <div className="mx-auto mt-8 max-w-xl space-y-3">
        {!isConnected && (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
            <p className="text-gray-600">Connect your wallet to see your payments.</p>
          </div>
        )}

        {isConnected && loading && (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
            <p className="text-gray-500">Loading payments...</p>
          </div>
        )}

        {isConnected && !loading && error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-8 text-center">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {isConnected && !loading && !error && payments.length === 0 && (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
            <p className="text-gray-600">No payments yet.</p>
            <Button variant="pill" size="sm" className="mt-4" asChild>
              <Link href="/pay">Create your first payment</Link>
            </Button>
          </div>
        )}

        {payments.map((p) => (
          <PaymentCard key={p.paymentId} payment={p} href={`/payments/${p.paymentId}`} />
        ))}
      </div>
    </div>
  );
}
