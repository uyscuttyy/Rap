import { v4 as uuidv4 } from 'uuid';

export function generatePaymentId(): string {
  return `rap_${uuidv4().replace(/-/g, '')}`;
}

export function isValidPaymentId(paymentId: string): boolean {
  return /^rap_[a-f0-9]{32}$/.test(paymentId);
}

export function formatAddress(address: string): string {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function formatAmount(amount: string | number, decimals: number = 18): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return (num / Math.pow(10, decimals)).toFixed(4);
}

export function parseAmount(amount: string, decimals: number = 18): bigint {
  const [whole, fraction = ''] = amount.split('.');
  const paddedFraction = (fraction + '0'.repeat(decimals)).slice(0, decimals);
  return BigInt(whole + paddedFraction);
}

export function formatTransactionHash(hash: string): string {
  if (!hash) return '';
  return `${hash.slice(0, 10)}...${hash.slice(-8)}`;
}

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  paid: 'Paid',
  failed: 'Failed',
  unknown: 'Unknown',
};

export const PAYMENT_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  paid: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  unknown: 'bg-gray-100 text-gray-800',
};