'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { StatusBadge, StatusExplainer, formatEthAmount } from '@/components/payments/payment-card';
import { formatAddress, formatTransactionHash } from '@/lib/utils';
import { getExplorerUrl, BASE_SEPOLIA_CHAIN_ID } from '@/lib/keeperhub';
import { toast } from 'sonner';
import { Loader2, CheckCircle2, AlertCircle, XCircle, RefreshCw, ExternalLink, ChevronLeft } from 'lucide-react';

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

function Spinner({ size = 'sm' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'h-4 w-4', md: 'h-5 w-5', lg: 'h-8 w-8' };
  return (
    <Loader2 className={`${sizes[size]} animate-spin text-current`} aria-hidden="true" />
  );
}

function StatusIcon({ status }: { status: PaymentDetail['status'] }) {
  switch (status) {
    case 'paid':
      return <CheckCircle2 className="h-5 w-5 text-green-600" aria-hidden="true" />;
    case 'failed':
      return <XCircle className="h-5 w-5 text-red-600" aria-hidden="true" />;
    case 'pending':
      return <Loader2 className="h-5 w-5 animate-spin text-yellow-600" aria-hidden="true" />;
    case 'unknown':
      return <AlertCircle className="h-5 w-5 text-gray-600" aria-hidden="true" />;
  }
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
      <Link
        href="/history"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-black mb-6"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        Back to history
      </Link>

      {loading && (
        <div
          className="mx-auto mt-8 max-w-xl rounded-lg border border-gray-200 bg-white p-8 text-center"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center justify-center gap-2">
            <Spinner size="md" />
            <span className="text-gray-500">Loading payment...</span>
          </div>
        </div>
      )}

      {!loading && error && !payment && (
        <div
          className="mx-auto mt-8 max-w-xl rounded-lg border border-red-200 bg-red-50 p-8 text-center"
          role="alert"
        >
          <AlertCircle className="h-10 w-10 mx-auto text-red-500 mb-3" aria-hidden="true" />
          <p className="text-sm text-red-600">{error}</p>
          <Button variant="pillOutline" className="mt-4" onClick={load}>
            <RefreshCw className="h-4 w-4 mr-2" aria-hidden="true" />
            Try again
          </Button>
        </div>
      )}

      {!loading && payment && (
        <Card className="mx-auto mt-6 max-w-xl">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <StatusIcon status={payment.status} />
                <CardTitle>Payment details</CardTitle>
              </div>
              <StatusBadge status={payment.status} />
            </div>
            <CardDescription>
              <StatusExplainer status={payment.status} />
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <dl className="space-y-3 divide-y divide-gray-100">
              <div className="flex justify-between gap-4 py-2">
                <dt className="text-gray-500">Payment ID</dt>
                <dd className="font-mono text-xs break-all text-right">{payment.paymentId}</dd>
              </div>
              <div className="flex justify-between gap-4 py-2">
                <dt className="text-gray-500">To</dt>
                <dd className="font-mono text-xs">{formatAddress(payment.recipient)}</dd>
              </div>
              <div className="flex justify-between gap-4 py-2">
                <dt className="text-gray-500">Amount</dt>
                <dd className="font-medium">{formatEthAmount(payment.amount)} ETH</dd>
              </div>
              <div className="flex justify-between gap-4 py-2">
                <dt className="text-gray-500">Network</dt>
                <dd>{payment.network}</dd>
              </div>
              {payment.transactionHash && (
                <div className="flex justify-between gap-4 py-2">
                  <dt className="text-gray-500">Transaction</dt>
                  <dd className="flex items-center gap-2">
                    <a
                      href={getExplorerUrl(BASE_SEPOLIA_CHAIN_ID, payment.transactionHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-xs underline-offset-4 hover:underline flex items-center gap-1"
                    >
                      {formatTransactionHash(payment.transactionHash)}
                      <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </a>
                  </dd>
                </div>
              )}
              {payment.keeperhubExecutionId && (
                <div className="flex justify-between gap-4 py-2">
                  <dt className="text-gray-500">Execution</dt>
                  <dd className="font-mono text-xs">{payment.keeperhubExecutionId}</dd>
                </div>
              )}
            </dl>

            {payment.errorMessage && (
              <div className="rounded-md bg-red-50 border border-red-200 p-3" role="alert">
                <p className="text-sm text-red-600 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" aria-hidden="true" />
                  {payment.errorMessage}
                </p>
              </div>
            )}

            {payment.executions.length > 0 && (
              <div className="pt-2">
                <p className="font-medium">Execution attempts</p>
                <ul className="mt-2 space-y-2" role="list">
                  {payment.executions.map((e) => (
                    <li
                      key={e.keeperhubExecutionId}
                      className="rounded-md bg-gray-50 p-3 font-mono text-xs text-gray-600"
                    >
                      <p className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs ${
                            e.status === 'completed' ? 'bg-green-100 text-green-800' :
                            e.status === 'failed' ? 'bg-red-100 text-red-800' :
                            'bg-yellow-100 text-yellow-800'
                          }`}
                        >
                          {e.status}
                        </span>
                        {e.keeperhubExecutionId}
                      </p>
                      {e.transactionHash && (
                        <p className="mt-1 flex items-center gap-1">
                          <ExternalLink className="h-3 w-3" aria-hidden="true" />
                          {formatTransactionHash(e.transactionHash)}
                        </p>
                      )}
                      {e.errorMessage && (
                        <p className="mt-1 text-red-600 flex items-center gap-2">
                          <AlertCircle className="h-3 w-3" aria-hidden="true" />
                          {e.errorMessage}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {error && (
              <div className="rounded-md bg-red-50 border border-red-200 p-3" role="alert">
                <p className="text-sm text-red-600 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" aria-hidden="true" />
                  {error}
                </p>
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-2" role="group" aria-label="Payment actions">
              {payment.status !== 'paid' && (
                <Button onClick={handleRetry} variant="pill" size="sm" disabled={busy}>
                  {busy ? <Spinner /> : 'Retry this payment'}
                </Button>
              )}
              {payment.status === 'unknown' && (
                <Button onClick={handleRefresh} variant="pillOutline" size="sm" disabled={busy}>
                  <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} aria-hidden="true" />
                  <span>Check status</span>
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