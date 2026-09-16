import type { Address } from 'viem';

const KEEPERHUB_API_URL = process.env.KEEPERHUB_API_URL || 'https://app.keeperhub.com/api';
const KEEPERHUB_API_KEY = process.env.KEEPERHUB_API_KEY;
const KEEPERHUB_ORG_KEY = process.env.KEEPERHUB_ORG_KEY;

if (!KEEPERHUB_API_KEY) {
  console.warn('KEEPERHUB_API_KEY not set - KeeperHub integration will not work');
}

export interface TransferRequest {
  chainId: number;
  recipientAddress: Address;
  amount: string;
  tokenAddress?: Address;
  gasLimitMultiplier?: string;
  simulate?: boolean;
}

export interface ContractCallRequest {
  chainId: number;
  contractAddress: Address;
  functionName: string;
  functionArgs: string; // JSON array string
  abi?: string; // JSON string
  value?: string;
  gasLimitMultiplier?: string;
  simulate?: boolean;
}

export interface CheckAndExecuteRequest {
  chainId: number;
  contractAddress: Address;
  functionName: string;
  functionArgs: string; // JSON array string
  abi?: string;
  condition: {
    operator: 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte';
    value: string;
  };
  action: {
    contractAddress: Address;
    functionName: string;
    functionArgs: string;
    abi?: string;
    value?: string;
    gasLimitMultiplier?: string;
  };
  simulate?: boolean;
}

export interface TransferResponse {
  executionId: string;
  status: 'completed' | 'failed' | 'unconfirmed' | 'simulated';
  transactionHash?: string;
  transactionLink?: string;
  sponsored?: boolean;
  idempotentReplay?: boolean;
  error?: string;
  code?: string;
  retryable?: boolean;
  from?: string;
  to?: string;
  value?: string;
  gasEstimate?: string;
  simulatedReturnValue?: boolean;
  wouldRevert?: boolean;
  failureKind?: string;
  balanceWei?: string;
  requiredWei?: string;
  shortfallWei?: string;
  nativeSymbol?: string;
  originalError?: string;
  success: boolean;
}

export interface CheckAndExecuteResponse {
  executed: boolean;
  executionId?: string;
  status?: 'completed' | 'failed' | 'unconfirmed' | 'simulated';
  conditionResult: {
    met: boolean;
    observedValue: string;
    targetValue: string;
    operator: string;
  };
  transactionHash?: string;
  transactionLink?: string;
  sponsored?: boolean;
  error?: string;
  code?: string;
  retryable?: boolean;
  success: boolean;
}

export interface ExecutionStatusResponse {
  executionId: string;
  status: 'pending' | 'running' | 'unconfirmed' | 'completed' | 'failed';
  type: 'transfer' | 'contract-call' | 'check-and-execute';
  network: string;
  transactionHash?: string;
  transactionLink?: string;
  sponsored?: boolean;
  retryCount: number;
  receipts?: Array<{
    hash: string;
    chainId: number;
    verified: boolean;
    receiptStatus: 'success' | 'reverted' | 'safe_inner_failure' | 'not_found' | 'timeout';
    blockNumber?: number;
    gasUsed?: string;
  }>;
}

export interface KeeperHubError {
  error: string;
  field?: string;
  details?: string;
  code?: string;
  retryable?: boolean;
  required_scope?: string;
  granted_scope?: string;
}

export class KeeperHubService {
  private apiKey: string;
  private orgKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = KEEPERHUB_API_KEY || '';
    this.orgKey = KEEPERHUB_ORG_KEY || '';
    this.baseUrl = KEEPERHUB_API_URL;
  }

  private getAuthHeaders(idempotencyKey?: string): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    // Prefer org key for programmatic access
    const authKey = this.orgKey || this.apiKey;
    if (authKey) {
      headers['Authorization'] = `Bearer ${authKey}`;
    }

    if (idempotencyKey) {
      headers['Idempotency-Key'] = idempotencyKey;
    }

    return headers;
  }

  private async request<T>(
    method: string,
    endpoint: string,
    body?: unknown,
    idempotencyKey?: string
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method,
      headers: this.getAuthHeaders(idempotencyKey),
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json();

    if (!response.ok) {
      const error: KeeperHubError = {
        error: data.error || `HTTP ${response.status}`,
        ...data,
      };
      throw error;
    }

    return data as T;
  }

  // ===== TRANSFER (Native/ERC20) =====
  async simulateTransfer(request: TransferRequest): Promise<TransferResponse> {
    return this.request<TransferResponse>('POST', '/api/execute/transfer', {
      ...request,
      simulate: true,
    });
  }

  async executeTransfer(
    request: TransferRequest,
    idempotencyKey: string
  ): Promise<TransferResponse> {
    return this.request<TransferResponse>('POST', '/api/execute/transfer', request, idempotencyKey);
  }

  // ===== CONTRACT CALL (Read/Write) =====
  async simulateContractCall(request: ContractCallRequest): Promise<TransferResponse> {
    return this.request<TransferResponse>('POST', '/api/execute/contract-call', {
      ...request,
      simulate: true,
    });
  }

  async executeContractCall(
    request: ContractCallRequest,
    idempotencyKey: string
  ): Promise<TransferResponse> {
    return this.request<TransferResponse>('POST', '/api/execute/contract-call', request, idempotencyKey);
  }

  // ===== CHECK AND EXECUTE (Conditional Execution) =====
  async simulateCheckAndExecute(request: CheckAndExecuteRequest): Promise<CheckAndExecuteResponse> {
    return this.request<CheckAndExecuteResponse>('POST', '/api/execute/check-and-execute', {
      ...request,
      simulate: true,
    });
  }

  async executeCheckAndExecute(
    request: CheckAndExecuteRequest,
    idempotencyKey: string
  ): Promise<CheckAndExecuteResponse> {
    return this.request<CheckAndExecuteResponse>('POST', '/api/execute/check-and-execute', request, idempotencyKey);
  }

  // ===== EXECUTION STATUS =====
  async getExecutionStatus(executionId: string): Promise<ExecutionStatusResponse> {
    return this.request<ExecutionStatusResponse>('GET', `/api/execute/${executionId}/status`);
  }

  async waitForExecution(
    executionId: string,
    maxWaitMs: number = 120000,
    pollIntervalMs: number = 5000
  ): Promise<ExecutionStatusResponse> {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      const status = await this.getExecutionStatus(executionId);

      if (status.status === 'completed' || status.status === 'failed') {
        return status;
      }

      if (status.status === 'unconfirmed') {
        // Keep polling for unconfirmed
      }

      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }

    throw new Error(`Execution ${executionId} did not complete within ${maxWaitMs}ms`);
  }
}

export const keeperHub = new KeeperHubService();

export const BASE_SEPOLIA_CHAIN_ID = 84532;
export const BASE_SEPOLIA_USDC_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as Address;
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address;

export const SEPOLIA_CHAIN_ID = 11155111;
export const SEPOLIA_USDC_ADDRESS = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238' as Address;
export const SEPOLIA_WETH_ADDRESS = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14' as Address;
export const SEPOLIA_AAVE_POOL_ADDRESS = '0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951' as Address;
export const SEPOLIA_AAVE_POOL_DATA_PROVIDER = '0x69FA639f7B0BbC37b9E42A6c3180E47A8bE8b3E4' as Address;
export const SEPOLIA_UNISWAP_UNIVERSAL_ROUTER = '0x3fC91A3afd70395Cd427566f7c0d4aB2B5E8C6e5' as Address;

export function isNativeToken(tokenAddress: Address): boolean {
  return tokenAddress.toLowerCase() === ZERO_ADDRESS.toLowerCase();
}

export function getExplorerUrl(chainId: number, txHash: string): string {
  const explorers: Record<number, string> = {
    84532: 'https://sepolia.basescan.org',
    8453: 'https://basescan.org',
    1: 'https://etherscan.io',
    11155111: 'https://sepolia.etherscan.io',
  };
  const base = explorers[chainId] || 'https://etherscan.io';
  return `${base}/tx/${txHash}`;
}