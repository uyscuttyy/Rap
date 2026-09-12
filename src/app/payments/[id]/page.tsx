'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { StatusBadge, StatusExplainer, formatEthAmount } from '@/components/payments/payment-card';
import { formatAddress, formatTransactionHash } from '@/lib/utils';
import { getExplorerUrl, BASE_SEPOLIA_CHAIN_ID } from '@/lib/keeperhub';
import { toast } from 'sonner';

interface ExecutionInfo {
  keeperhubExecutionId: string;
  status: string;
  transactionHash: string | null;
  errorMessage: string | null;
  createdAt: string;
}

interface PaymentDetail {
  paymentId: string;
  status: 'pending' | 'paid' | 'failed' | 'unknown';
  recipient: string;
  amount: string;
  token: string;
  network: string;
  transactionHash: string | null;
  keeperhubExecutionId: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  executions: ExecutionInfo[];
}

async function fetchPayment(id: string): Promise<PaymentDetail> {
  const res = await fetch(`/api/payments/${id}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Payment not found');
  return data as PaymentDetail;
}

export default function PaymentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [payment, setPayment] = useState<PaymentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setPayment(await fetchPayment(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load payment');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let alive = true;
    fetchPayment(id)
      .then((data) => {
        if (!alive) return;
        setPayment(data);
        setLoading(false);
      })
      .catch((err) => {
        if (!alive) return;
        setError(err instanceof Error ? err.message : 'Failed to load payment');
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [id]);

  async function handleRetry() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/payments/${id}/pay`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Retry failed');
      setPayment(data);
      toast.success('Retry processed');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Retry failed.');
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function handleRefresh() {
    setBusy(true);
    try {
      const res = await fetch(`/api/payments/${id}/refresh`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Refresh failed');
      setPayment(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Refresh failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <Link href="/history" className="text-sm text-gray-500 hover:text-black">
        Back to history
      </Link>

      {loading && (
        <div className="mx-auto mt-8 max-w-xl rounded-lg border border-gray-200 bg-white p-8 text-center">
          <p className="text-gray-500">Loading payment...</p>
        </div>
      )}

      {!loading && error && !payment && (
        <div className="mx-auto mt-8 max-w-xl rounded-lg border border-red-200 bg-red-50 p-8 text-center">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {!loading && payment && (
        <Card className="mx-auto mt-6 max-w-xl">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Payment details</CardTitle>
              <StatusBadge status={payment.status} />
            </div>
            <CardDescription>
              <StatusExplainer status={payment.status} />
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-gray-500">Payment ID</span>
              <span className="font-mono text-xs break-all text-right">{payment.paymentId}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-500">To</span>
              <span className="font-mono text-xs">{formatAddress(payment.recipient)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-500">Amount</span>
              <span className="font-medium">{formatEthAmount(payment.amount)} ETH</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-500">Network</span>
              <span>{payment.network}</span>
            </div>
            {payment.transactionHash && (
              <div className="flex justify-between gap-4">
                <span className="text-gray-500">Transaction</span>
                <a
                  href={getExplorerUrl(BASE_SEPOLIA_CHAIN_ID, payment.transactionHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-xs underline-offset-4 hover:underline"
                >
                  {formatTransactionHash(payment.transactionHash)}
                </a>
              </div>
            )}
            {payment.keeperhubExecutionId && (
              <div className="flex justify-between gap-4">
                <span className="text-gray-500">Execution</span>
                <span className="font-mono text-xs">{payment.keeperhubExecutionId}</span>
              </div>
            )}
            {payment.errorMessage && (
              <p className="text-sm text-red-600">{payment.errorMessage}</p>
            )}
            {payment.executions.length > 0 && (
              <div className="pt-2">
                <p className="font-medium">Execution attempts</p>
                <ul className="mt-2 space-y-2">
                  {payment.executions.map((e) => (
                    <li key={e.keeperhubExecutionId} className="rounded-md bg-gray-50 p-3 font-mono text-xs text-gray-600">
                      <p>{e.keeperhubExecutionId} : {e.status}</p>
                      {e.transactionHash && <p className="mt-1">{formatTransactionHash(e.transactionHash)}</p>}
                      {e.errorMessage && <p className="mt-1 text-red-600">{e.errorMessage}</p>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex flex-wrap gap-2 pt-2">
              {payment.status !== 'paid' && (
                <Button onClick={handleRetry} variant="pill" size="sm" disabled={busy}>
                  {busy ? 'Working...' : 'Retry this payment'}
                </Button>
              )}
              {payment.status === 'unknown' && (
                <Button onClick={handleRefresh} variant="pillOutline" size="sm" disabled={busy}>
                  Check status
                </Button>
              )}
              {payment.status === 'failed' && (
                <Button variant="pillOutline" size="sm" asChild>
                  <Link href="/pay">Create new payment</Link>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
