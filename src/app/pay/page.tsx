'use client';

import { useState } from 'react';
import { useAccount } from 'wagmi';
import { isAddress, parseEther } from 'viem';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { StatusBadge, StatusExplainer, formatEthAmount, type PaymentSummary } from '@/components/payments/payment-card';
import { formatAddress, formatTransactionHash } from '@/lib/utils';
import { getExplorerUrl, BASE_SEPOLIA_CHAIN_ID } from '@/lib/keeperhub';
import { toast } from 'sonner';

type Step = 'form' | 'created' | 'executing' | 'done';

export default function PayPage() {
  const { address, isConnected } = useAccount();
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
      <h1 className="text-center text-3xl font-semibold tracking-tight">Pay Desk</h1>
      <p className="mt-2 text-center text-gray-600">
        Create a payment. RAP gives it an identity and executes it exactly once.
      </p>

      {step === 'form' && (
        <Card className="mx-auto mt-8 max-w-xl">
          <CardHeader>
            <CardTitle>New payment</CardTitle>
            <CardDescription>Sent on Base Sepolia via KeeperHub.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateAndPay} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="recipient">Recipient</Label>
                <Input
                  id="recipient"
                  placeholder="0x..."
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  disabled={busy}
                />
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
                />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <Button type="submit" variant="pill" className="w-full" disabled={busy || !isConnected}>
                {busy ? 'Working...' : isConnected ? 'Pay' : 'Connect wallet to pay'}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {(step === 'created' || step === 'executing' || step === 'done') && payment && (
        <Card className="mx-auto mt-8 max-w-xl">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Payment</CardTitle>
              <StatusBadge status={payment.status} />
            </div>
            <CardDescription>
              {step === 'executing' ? 'Executing through KeeperHub...' : <StatusExplainer status={payment.status} />}
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
                <Button onClick={handleNewPayment} variant="pillOutline" size="sm" disabled={busy}>
                  Create new payment
                </Button>
              )}
              {payment.status === 'paid' && (
                <Button onClick={handleNewPayment} variant="pillOutline" size="sm" disabled={busy}>
                  New payment
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
