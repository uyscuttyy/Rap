/**
 * x402 Micropayment Integration
 * 
 * Handles HTTP 402 Payment Required headers for agent data fetching.
 * On Sepolia testnet, uses $0.01 USDC payments via KeeperHub.
 */

import { createPublicClient, http, parseAbi, type Address, type PublicClient } from 'viem';
import { sepolia } from 'viem/chains';
import {
  SEPOLIA_CHAIN_ID,
  SEPOLIA_USDC_ADDRESS,
  BASE_SEPOLIA_CHAIN_ID,
} from '@/lib/keeperhub';

const RPC_URL = process.env.SEPOLIA_RPC_URL || 'https://sepolia.infura.io/v3/YOUR_KEY';

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(RPC_URL),
});

const ERC20_ABI = parseAbi([
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function transferFrom(address from, address to, uint256 amount) returns (bool)',
]);

export interface X402PaymentConfig {
  amount: string; // in USDC base units (6 decimals)
  recipient: Address;
  token: Address;
  chainId: number;
  description?: string;
}

export interface X402PaymentResult {
  success: boolean;
  transactionHash?: string;
  executionId?: string;
  error?: string;
  paymentHeader?: string;
}

export interface X402PaymentHeader {
  scheme: 'exact';
  network: string;
  maxAmount: string;
  asset: string;
  payTo: string;
  description: string;
}

const DEFAULT_X402_CONFIG: X402PaymentConfig = {
  amount: process.env.X402_PAYMENT_AMOUNT_USDC || '10000', // $0.01 USDC
  recipient: (process.env.X402_PAYMENT_RECIPIENT || '0x0000000000000000000000000000000000000000') as Address,
  token: SEPOLIA_USDC_ADDRESS,
  chainId: SEPOLIA_CHAIN_ID,
  description: 'RAP Agent Data Access - $0.01 USDC',
};

export class X402Service {
  private config: X402PaymentConfig;
  private client: PublicClient;

  constructor(config: Partial<X402PaymentConfig> = {}, client: PublicClient = publicClient) {
    this.config = { ...DEFAULT_X402_CONFIG, ...config };
    this.client = client;
  }

  /**
   * Generate x402 payment header for HTTP requests
   */
  generatePaymentHeader(): string {
    const header: X402PaymentHeader = {
      scheme: 'exact',
      network: this.config.chainId === BASE_SEPOLIA_CHAIN_ID ? 'base-sepolia' : 'ethereum-sepolia',
      maxAmount: this.config.amount,
      asset: this.config.token.toLowerCase(),
      payTo: this.config.recipient.toLowerCase(),
      description: this.config.description || 'RAP Agent Data Access',
    };

    return `x402 ${Buffer.from(JSON.stringify(header)).toString('base64')}`;
  }

  /**
   * Parse x402 payment header from HTTP response
   */
  static parsePaymentHeader(header: string): X402PaymentHeader | null {
    try {
      if (!header.startsWith('x402 ')) return null;
      const decoded = Buffer.from(header.slice(5), 'base64').toString('utf-8');
      return JSON.parse(decoded);
    } catch {
      return null;
    }
  }

  /**
   * Execute USDC payment via KeeperHub (for actual payment)
   * This would be called when the agent needs to actually pay
   */
  async executePayment(idempotencyKey: string): Promise<X402PaymentResult> {
    // Import dynamically to avoid circular dependency
    const { keeperHub } = await import('@/lib/keeperhub');

    try {
      const response = await keeperHub.executeTransfer({
        chainId: this.config.chainId,
        recipientAddress: this.config.recipient,
        amount: this.config.amount,
        tokenAddress: this.config.token,
        gasLimitMultiplier: '1.2',
      }, idempotencyKey);

      if (response.success && response.transactionHash) {
        return {
          success: true,
          transactionHash: response.transactionHash,
          executionId: response.executionId,
          paymentHeader: this.generatePaymentHeader(),
        };
      }

      return {
        success: false,
        error: response.error || 'Payment failed',
        paymentHeader: this.generatePaymentHeader(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        paymentHeader: this.generatePaymentHeader(),
      };
    }
  }

  /**
   * Simulate payment to check if it would succeed
   */
  async simulatePayment(): Promise<X402PaymentResult> {
    const { keeperHub } = await import('@/lib/keeperhub');

    try {
      const response = await keeperHub.simulateTransfer({
        chainId: this.config.chainId,
        recipientAddress: this.config.recipient,
        amount: this.config.amount,
        tokenAddress: this.config.token,
        gasLimitMultiplier: '1.2',
        simulate: true,
      });

      return {
        success: response.success,
        error: response.error,
        paymentHeader: this.generatePaymentHeader(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Simulation failed',
        paymentHeader: this.generatePaymentHeader(),
      };
    }
  }

  /**
   * Check USDC balance for payment capability
   */
  async checkBalance(userAddress: Address): Promise<{ sufficient: boolean; balance: string }> {
    const balance = await this.client.readContract({
      address: this.config.token,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [userAddress],
    });

    const required = BigInt(this.config.amount);
    return {
      sufficient: balance >= required,
      balance: balance.toString(),
    };
  }

  /**
   * Check USDC allowance for spender (e.g., KeeperHub relayer)
   */
  async checkAllowance(userAddress: Address, spender: Address): Promise<{ sufficient: boolean; allowance: string }> {
    const allowance = await this.client.readContract({
      address: this.config.token,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [userAddress, spender],
    });

    const required = BigInt(this.config.amount);
    return {
      sufficient: allowance >= required,
      allowance: allowance.toString(),
    };
  }

  /**
   * Check whether an incoming request carries a valid x402 payment header.
   * Returns the parsed header, or null when payment is required.
   * Route handlers should return 402 with `requiredPaymentHeader()` when null.
   */
  static checkPaymentHeader(req: Request): X402PaymentHeader | null {
    const paymentHeader =
      req.headers.get('x-payment') || req.headers.get('authorization');
    if (!paymentHeader) return null;
    return X402Service.parsePaymentHeader(paymentHeader);
  }

  /**
   * Build a 402 Payment Required response body for route handlers.
   */
  requiredPaymentResponse() {
    return {
      error: 'Payment Required',
      message: 'This endpoint requires a $0.01 USDC micropayment',
      paymentHeader: this.generatePaymentHeader(),
      instructions: 'Include "x-payment" header with valid x402 payment proof',
    };
  }

  /**
   * Create a payment verification receipt for audit logging
   */
  createPaymentReceipt(
    transactionHash: string,
    executionId: string,
    metadata: Record<string, unknown> = {}
  ) {
    return {
      timestamp: new Date().toISOString(),
      transactionHash,
      executionId,
      amount: this.config.amount,
      token: this.config.token,
      chainId: this.config.chainId,
      recipient: this.config.recipient,
      description: this.config.description,
      ...metadata,
    };
  }
}

export const x402Service = new X402Service();

/**
 * Fetch data with automatic x402 payment handling
 * Use this for agent data queries that require micropayment
 */
export async function fetchWithX402<T>(
  url: string,
  options: RequestInit = {},
  paymentConfig?: Partial<X402PaymentConfig>
): Promise<{ data: T; receipt?: X402PaymentResult['paymentHeader'] }> {
  const service = new X402Service(paymentConfig);

  // First attempt - include payment header
  const response = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      'x-payment': service.generatePaymentHeader(),
    },
  });

  if (response.status === 402) {
    // Payment required - extract payment details and execute
    const paymentHeader = response.headers.get('x-payment-required');
    if (paymentHeader) {
      // In production, you'd parse the header and execute payment via KeeperHub
      // For now, we'll simulate
      const receipt = service.generatePaymentHeader();

      // Retry with payment proof
      const retryResponse = await fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          'x-payment': receipt,
        },
      });

      if (retryResponse.ok) {
        return { data: await retryResponse.json(), receipt };
      }
    }
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return { data: await response.json() };
}