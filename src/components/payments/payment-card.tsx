import { Badge } from '@/components/ui/badge';
import { formatAddress, formatTransactionHash, PAYMENT_STATUS_LABELS } from '@/lib/utils';
import { getExplorerUrl, BASE_SEPOLIA_CHAIN_ID } from '@/lib/keeperhub';
import { cn } from '@/lib/cn';

export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'unknown';

const statusVariant: Record<PaymentStatus, 'warning' | 'success' | 'destructive' | 'secondary'> = {
  pending: 'warning',
  paid: 'success',
  failed: 'destructive',
  unknown: 'secondary',
};

export function StatusBadge({ status }: { status: PaymentStatus }) {
  return <Badge variant={statusVariant[status]}>{PAYMENT_STATUS_LABELS[status]}</Badge>;
}

export interface PaymentSummary {
  paymentId: string;
  status: PaymentStatus;
  recipient: string;
  amount: string;
  token: string;
  network: string;
  transactionHash: string | null;
  keeperhubExecutionId: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export function formatEthAmount(wei: string): string {
  try {
    const eth = Number(BigInt(wei)) / 1e18;
    return eth.toLocaleString('en-US', { maximumFractionDigits: 6 });
  } catch {
    return wei;
  }
}

export function PaymentCard({ payment, href }: { payment: PaymentSummary; href?: string }) {
  const content = (
    <div className="rounded-lg border border-gray-200 bg-white p-5 hover:border-gray-300 transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-xs text-gray-500 truncate">{payment.paymentId}</p>
          <p className="mt-1 text-sm">
            <span className="font-medium">{formatEthAmount(payment.amount)} ETH</span>
            <span className="text-gray-500"> to {formatAddress(payment.recipient)}</span>
          </p>
        </div>
        <StatusBadge status={payment.status} />
      </div>
      {payment.transactionHash && (
        <a
          href={getExplorerUrl(BASE_SEPOLIA_CHAIN_ID, payment.transactionHash)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="mt-3 inline-block font-mono text-xs text-gray-600 underline-offset-4 hover:underline"
        >
          {formatTransactionHash(payment.transactionHash)}
        </a>
      )}
    </div>
  );

  if (href) {
    return (
      <a href={href} className="block">
        {content}
      </a>
    );
  }
  return content;
}

export function StatusExplainer({ status }: { status: PaymentStatus }) {
  const copy: Record<PaymentStatus, string> = {
    pending: 'Created, not yet executed. Safe to pay.',
    paid: 'Verified onchain. Retrying returns this same transaction, never a new one.',
    failed: 'Genuinely failed. To try again, create a new payment with a new identity.',
    unknown: 'Execution started but the result is not confirmed. Do not send again, check back.',
  };
  return <p className={cn('text-sm text-gray-600')}>{copy[status]}</p>;
}
