'use client';

import { useState } from 'react';
import { useAccount, useBalance } from 'wagmi';
import { isAddress, parseEther, formatUnits } from 'viem';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { StatusBadge, StatusExplainer, formatEthAmount, type PaymentSummary } from '@/components/payments/payment-card';
import { formatAddress, formatTransactionHash } from '@/lib/utils';
import { getExplorerUrl, BASE_SEPOLIA_CHAIN_ID } from '@/lib/keeperhub';
import { toast } from 'sonner';
import { Loader2, CheckCircle2, AlertCircle, XCircle, RefreshCw, ExternalLink } from 'lucide-react';

type Step = 'form' | 'created' | 'executing' | 'done';

function Spinner({ size = 'sm' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'h-4 w-4', md: 'h-5 w-5', lg: 'h-8 w-8' };
  return (
    <Loader2 className={`${sizes[size]} animate-spin text-current`} aria-hidden="true" />
  );
}

function StatusIcon({ status }: { status: PaymentSummary['status'] }) {
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

function ActionButtons({
  payment,
  busy,
  onRetry,
  onRefresh,
  onNewPayment,
}: {
  payment: PaymentSummary;
  busy: boolean;
  onRetry: () => void;
  onRefresh: () => void;
  onNewPayment: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 pt-2" role="group" aria-label="Payment actions">
      {payment.status !== 'paid' && (
        <Button onClick={onRetry} variant="pill" size="sm" disabled={busy}>
          {busy ? <Spinner /> : 'Retry this payment'}
        </Button>
      )}
      {payment.status === 'unknown' && (
        <Button onClick={onRefresh} variant="pillOutline" size="sm" disabled={busy}>
          <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} aria-hidden="true" />
          <span>Check status</span>
        </Button>
      )}
      {(payment.status === 'failed' || payment.status === 'paid') && (
        <Button onClick={onNewPayment} variant="pillOutline" size="sm" disabled={busy}>
          {payment.status === 'failed' ? 'Create new payment' : 'New payment'}
        </Button>
      )}
    </div>
  );
}

export default function PayPage() {
  const { address, isConnected } = useAccount();
  const { data: balance } = useBalance({ address });
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [step, setStep] = useState<Step>('form');
  const [payment, setPayment] = useState<PaymentSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function api(path: string, options?: RequestInit) {
    const res = await fetch(path, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  async function handleCreateAndPay(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!isConnected || !address) {
      setError('Connect your wallet first.');
      return;
    }
    if (!isAddress(recipient)) {
      setError('Recipient is not a valid address.');
      return;
    }
    let wei: bigint;
    try {
      wei = parseEther(amount);
      if (wei <= BigInt(0)) throw new Error('non-positive');
    } catch {
      setError('Amount must be a positive number in ETH.');
      return;
    }

    setBusy(true);
    try {
      const created = await api('/api/payments', {
        method: 'POST',
        body: JSON.stringify({
          userAddress: address,
          recipient,
          amount: wei.toString(),
        }),
      });
      setPayment(created);
      setStep('created');

      setStep('executing');
      try {
        const executed = await api(`/api/payments/${created.paymentId}/pay`, { method: 'POST' });
        setPayment(executed);
      } catch (err) {
        const refreshed = await api(`/api/payments/${created.paymentId}`);
        setPayment(refreshed);
        throw err;
      }
      setStep('done');
      toast.success('Payment processed');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setStep(payment ? 'done' : 'form');
    } finally {
      setBusy(false);
    }
  }

  async function handleRetry() {
    if (!payment) return;
    setError(null);
    setBusy(true);
    try {
      const executed = await api(`/api/payments/${payment.paymentId}/pay`, { method: 'POST' });
      setPayment(executed);
      toast.success('Retry processed');
    } catch (err) {
      const refreshed = await api(`/api/payments/${payment.paymentId}`);
      setPayment(refreshed);
      setError(err instanceof Error ? err.message : 'Retry failed.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRefresh() {
    if (!payment) return;
    setBusy(true);
    try {
      const refreshed = await api(`/api/payments/${payment.paymentId}/refresh`, { method: 'POST' });
      setPayment(refreshed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Refresh failed.');
    } finally {
      setBusy(false);
    }
  }

  function handleNewPayment() {
    setPayment(null);
    setRecipient('');
    setAmount('');
    setError(null);
    setStep('form');
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-8">
        <h1 className="text-center text-3xl font-semibold tracking-tight">Pay Desk</h1>
        <p className="mt-2 text-center text-gray-600">
          Create a payment. RAP gives it an identity and executes it exactly once.
        </p>
        {isConnected && balance && (
          <p className="mt-3 text-center text-sm text-gray-500">
            Wallet balance: <span className="font-medium text-black">{Number(formatUnits(balance.value, balance.decimals)).toLocaleString('en-US', { maximumFractionDigits: 6 })} {balance.symbol}</span>
          </p>
        )}
      </header>

      {step === 'form' && (
        <Card className="mx-auto mt-8 max-w-xl">
          <CardHeader>
            <CardTitle>New payment</CardTitle>
            <CardDescription>Sent on Base Sepolia via KeeperHub.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateAndPay} className="space-y-4" noValidate>
              <div className="space-y-2">
                <Label htmlFor="recipient">Recipient</Label>
                <Input
                  id="recipient"
                  placeholder="0x..."
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  disabled={busy}
                  aria-describedby="recipient-hint"
                />
                <p id="recipient-hint" className="text-xs text-gray-500">Ethereum address (0x...)</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="amount">Amount (ETH)</Label>
                <Input
                  id="amount"
                  placeholder="0.001"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={busy}
                  aria-describedby="amount-hint"
                />
                <p id="amount-hint" className="text-xs text-gray-500">Minimum 0.000001 ETH</p>
              </div>
              {error && (
                <div className="rounded-md bg-red-50 border border-red-200 p-3" role="alert">
                  <p className="text-sm text-red-600 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" aria-hidden="true" />
                    {error}
                  </p>
                </div>
              )}
              <Button
                type="submit"
                variant="pill"
                className="w-full"
                disabled={busy || !isConnected}
              >
                {busy ? (
                  <>
                    <Spinner /> Working...
                  </>
                ) : isConnected ? (
                  'Pay'
                ) : (
                  'Connect wallet to pay'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {(step === 'created' || step === 'executing' || step === 'done') && payment && (
        <Card className="mx-auto mt-8 max-w-xl">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <StatusIcon status={payment.status} />
                <CardTitle>Payment</CardTitle>
              </div>
              <StatusBadge status={payment.status} />
            </div>
            <CardDescription>
              {step === 'executing' ? (
                <span className="flex items-center gap-2">
                  <Spinner size="sm" /> Executing through KeeperHub...
                </span>
              ) : (
                <StatusExplainer status={payment.status} />
              )}
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
            {error && (
              <div className="rounded-md bg-red-50 border border-red-200 p-3" role="alert">
                <p className="text-sm text-red-600 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" aria-hidden="true" />
                  {error}
                </p>
              </div>
            )}
            <ActionButtons
              payment={payment}
              busy={busy}
              onRetry={handleRetry}
              onRefresh={handleRefresh}
              onNewPayment={handleNewPayment}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}