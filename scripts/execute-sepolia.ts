#!/usr/bin/env node
/**
 * RAP - Reactive Agentic Payments & Protection
 * Standalone Sepolia Testnet Execution Script
 * 
 * This script demonstrates a complete RAP workflow:
 * 1. Simulates an Aave health factor dip detection
 * 2. Executes a simulated x402 $0.01 USDC data fetch
 * 3. Runs pre-flight dry-run simulation through KeeperHub
 * 4. Broadcasts the live transaction to Sepolia via KeeperHub
 * 5. Outputs Etherscan link and writes audit receipt to ./execution-audit.json
 * 
 * Usage: npx ts-node scripts/execute-sepolia.ts
 */

import { createPublicClient, http, parseAbi, formatUnits, type Address } from 'viem';
import { sepolia } from 'viem/chains';
import { writeFileSync } from 'fs';
import { resolve } from 'path';

// Load environment variables
import 'dotenv/config';

// ============ CONFIGURATION ============
const RPC_URL = process.env.SEPOLIA_RPC_URL || 'https://sepolia.infura.io/v3/YOUR_KEY';
const KEEPERHUB_API_URL = process.env.KEEPERHUB_API_URL || 'https://app.keeperhub.com/api';
const KEEPERHUB_API_KEY = process.env.KEEPERHUB_API_KEY || '';
const KEEPERHUB_ORG_KEY = process.env.KEEPERHUB_ORG_KEY || '';

const SEPOLIA_CHAIN_ID = 11155111;
const SEPOLIA_USDC_ADDRESS = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238' as Address;
const SEPOLIA_WETH_ADDRESS = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14' as Address;
const SEPOLIA_AAVE_POOL_ADDRESS = '0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951' as Address;
const SEPOLIA_AAVE_POOL_DATA_PROVIDER = '0x3e9708d80f7B3e43118013075F7e95CE3AB31F31' as Address;

const X402_PAYMENT_AMOUNT_USDC = process.env.X402_PAYMENT_AMOUNT_USDC || '10000'; // $0.01 USDC
const X402_PAYMENT_RECIPIENT = (process.env.X402_PAYMENT_RECIPIENT || '0x0000000000000000000000000000000000000000') as Address;

// Demo user address (replace with actual test address)
const DEMO_USER_ADDRESS = (process.env.DEMO_USER_ADDRESS || '0x742d35Cc6634C0532925a3b844Bc454e4438f44e') as Address;

// ============ ABIs ============
const AAVE_POOL_ABI = parseAbi([
  'function getUserAccountData(address user) view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)',
  'function flashLoan(address receiver, address[] assets, uint256[] amounts, uint256[] modes, address onBehalfOf, bytes params, uint16 referralCode)',
]);

const AAVE_POOL_DATA_PROVIDER_ABI = parseAbi([
  'function getReserveTokensAddresses(address asset) view returns (address aToken, address stableDebtToken, address variableDebtToken)',
  'function getReserveData(address asset) view returns (uint256 availableLiquidity, uint256 totalStableDebt, uint256 totalVariableDebt, uint256 liquidityRate, uint256 variableBorrowRate, uint256 stableBorrowRate, uint256 averageStableBorrowRate, uint256 liquidityIndex, uint256 variableBorrowIndex, uint256 lastUpdateTimestamp)',
]);

const ERC20_ABI = parseAbi([
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
]);

// ============ CLIENT SETUP ============
const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(RPC_URL),
});

// ============ KEEPERHUB CLIENT ============
interface KeeperHubTransferRequest {
  chainId: number;
  recipientAddress: Address;
  amount: string;
  tokenAddress?: Address;
  gasLimitMultiplier?: string;
  simulate?: boolean;
}

interface KeeperHubContractCallRequest {
  chainId: number;
  contractAddress: Address;
  functionName: string;
  functionArgs: string;
  abi?: string;
  value?: string;
  gasLimitMultiplier?: string;
  simulate?: boolean;
}

interface KeeperHubCheckAndExecuteRequest {
  chainId: number;
  contractAddress: Address;
  functionName: string;
  functionArgs: string;
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

interface KeeperHubResponse {
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

interface CheckAndExecuteResponse {
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

interface ExecutionStatusResponse {
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

class KeeperHubClient {
  private apiKey: string;
  private orgKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = KEEPERHUB_API_KEY;
    this.orgKey = KEEPERHUB_ORG_KEY;
    this.baseUrl = KEEPERHUB_API_URL;
  }

  private getAuthHeaders(idempotencyKey?: string): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

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
      throw new Error(`KeeperHub Error: ${data.error || `HTTP ${response.status}`}`);
    }

    return data as T;
  }

  async simulateTransfer(request: KeeperHubTransferRequest): Promise<KeeperHubResponse> {
    return this.request<KeeperHubResponse>('POST', '/execute/transfer', {
      ...request,
      simulate: true,
    });
  }

  async executeTransfer(
    request: KeeperHubTransferRequest,
    idempotencyKey: string
  ): Promise<KeeperHubResponse> {
    return this.request<KeeperHubResponse>('POST', '/execute/transfer', request, idempotencyKey);
  }

  async simulateContractCall(request: KeeperHubContractCallRequest): Promise<KeeperHubResponse> {
    return this.request<KeeperHubResponse>('POST', '/execute/contract-call', {
      ...request,
      simulate: true,
    });
  }

  async executeContractCall(
    request: KeeperHubContractCallRequest,
    idempotencyKey: string
  ): Promise<KeeperHubResponse> {
    return this.request<KeeperHubResponse>('POST', '/execute/contract-call', request, idempotencyKey);
  }

  async simulateCheckAndExecute(request: KeeperHubCheckAndExecuteRequest): Promise<CheckAndExecuteResponse> {
    return this.request<CheckAndExecuteResponse>('POST', '/execute/check-and-execute', {
      ...request,
      simulate: true,
    });
  }

  async executeCheckAndExecute(
    request: KeeperHubCheckAndExecuteRequest,
    idempotencyKey: string
  ): Promise<CheckAndExecuteResponse> {
    return this.request<CheckAndExecuteResponse>('POST', '/execute/check-and-execute', request, idempotencyKey);
  }

  async getExecutionStatus(executionId: string): Promise<ExecutionStatusResponse> {
    return this.request<ExecutionStatusResponse>('GET', `/execute/${executionId}/status`);
  }

  async waitForExecution(
    executionId: string,
    maxWaitMs: number = 180000,
    pollIntervalMs: number = 5000
  ): Promise<ExecutionStatusResponse> {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      const status = await this.getExecutionStatus(executionId);

      if (status.status === 'completed' || status.status === 'failed') {
        return status;
      }

      if (status.status === 'unconfirmed') {
        // Keep polling
      }

      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }

    throw new Error(`Execution ${executionId} did not complete within ${maxWaitMs}ms`);
  }
}

// ============ X402 SERVICE ============
function generateX402Header(): string {
  const header = {
    scheme: 'exact',
    network: 'ethereum-sepolia',
    maxAmount: X402_PAYMENT_AMOUNT_USDC,
    asset: SEPOLIA_USDC_ADDRESS.toLowerCase(),
    payTo: X402_PAYMENT_RECIPIENT.toLowerCase(),
    description: 'RAP Agent Data Access - $0.01 USDC',
  };

  return `x402 ${Buffer.from(JSON.stringify(header)).toString('base64')}`;
}

// ============ AUDIT RECEIPT ============
interface AuditReceipt {
  timestamp: string;
  workflow: string;
  steps: AuditStep[];
  finalResult: 'success' | 'failed';
  transactionHash?: string;
  executionId?: string;
  explorerUrl?: string;
  gasUsed?: string;
  blockNumber?: number;
}

interface AuditStep {
  step: number;
  name: string;
  status: 'pending' | 'success' | 'failed' | 'simulated';
  details: Record<string, unknown>;
  timestamp: string;
}

const keeperHub = new KeeperHubClient();
const auditReceipt: AuditReceipt = {
  timestamp: new Date().toISOString(),
  workflow: 'RAP Guardian - Aave Health Factor Protection + x402 Data Access',
  steps: [],
  finalResult: 'failed',
};

function addAuditStep(step: number, name: string, status: AuditStep['status'], details: Record<string, unknown>) {
  auditReceipt.steps.push({
    step,
    name,
    status,
    details,
    timestamp: new Date().toISOString(),
  });
  console.log(`\n📋 Step ${step}: ${name} - ${status.toUpperCase()}`);
  console.log(JSON.stringify(details, null, 2));
}

// ============ MAIN EXECUTION ============
async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  RAP - Reactive Agentic Payments & Protection');
  console.log('  Sepolia Testnet Verification Script');
  console.log('═══════════════════════════════════════════════════════════\n');

  console.log('Configuration:');
  console.log(`  RPC URL: ${RPC_URL}`);
  console.log(`  KeeperHub: ${KEEPERHUB_API_URL}`);
  console.log(`  User: ${DEMO_USER_ADDRESS}`);
  console.log(`  x402 Amount: $${Number(X402_PAYMENT_AMOUNT_USDC) / 1e6} USDC`);

  if (!KEEPERHUB_API_KEY && !KEEPERHUB_ORG_KEY) {
    console.warn('\n⚠️  WARNING: No KeeperHub API key set. Simulation will run but live execution will fail.');
    console.warn('   Set KEEPERHUB_API_KEY or KEEPERHUB_ORG_KEY in .env\n');
  }

  // ---------- STEP 1: Check Aave Health Factor ----------
  addAuditStep(1, 'Check Aave Health Factor', 'pending', {
    user: DEMO_USER_ADDRESS,
    pool: SEPOLIA_AAVE_POOL_ADDRESS,
    threshold: 1.25,
  });

  try {
    const userAccountData = await publicClient.readContract({
      address: SEPOLIA_AAVE_POOL_ADDRESS,
      abi: AAVE_POOL_ABI,
      functionName: 'getUserAccountData',
      args: [DEMO_USER_ADDRESS],
    });

    const healthFactor = Number(formatUnits(userAccountData[5], 18));
    const totalCollateral = Number(formatUnits(userAccountData[0], 18));
    const totalDebt = Number(formatUnits(userAccountData[1], 18));

    console.log(`\n📊 Aave Position:`);
    console.log(`   Health Factor: ${healthFactor.toFixed(4)}`);
    console.log(`   Total Collateral: $${totalCollateral.toFixed(2)}`);
    console.log(`   Total Debt: $${totalDebt.toFixed(2)}`);
    console.log(`   Threshold: 1.25`);
    console.log(`   Below Threshold: ${healthFactor < 1.25 && healthFactor > 0 ? 'YES ⚠️' : 'NO ✅'}`);

    // Reserve snapshot: USDC + WETH liquidity and user token balances
    const [usdcReserve, wethReserve, usdcBalance, wethBalance] = await Promise.all([
      publicClient.readContract({
        address: SEPOLIA_AAVE_POOL_DATA_PROVIDER,
        abi: AAVE_POOL_DATA_PROVIDER_ABI,
        functionName: 'getReserveData',
        args: [SEPOLIA_USDC_ADDRESS],
      }),
      publicClient.readContract({
        address: SEPOLIA_AAVE_POOL_DATA_PROVIDER,
        abi: AAVE_POOL_DATA_PROVIDER_ABI,
        functionName: 'getReserveData',
        args: [SEPOLIA_WETH_ADDRESS],
      }),
      publicClient.readContract({
        address: SEPOLIA_USDC_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [DEMO_USER_ADDRESS],
      }),
      publicClient.readContract({
        address: SEPOLIA_WETH_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [DEMO_USER_ADDRESS],
      }),
    ]);

    console.log(`\n📦 Reserve Snapshot:`);
    console.log(`   USDC available liquidity: ${usdcReserve[0].toString()}`);
    console.log(`   WETH available liquidity: ${wethReserve[0].toString()}`);
    console.log(`   User USDC balance: ${usdcBalance.toString()}`);
    console.log(`   User WETH balance: ${wethBalance.toString()}`);

    addAuditStep(1, 'Check Aave Health Factor', 'success', {
      healthFactor,
      totalCollateralUSD: totalCollateral,
      totalDebtUSD: totalDebt,
      threshold: 1.25,
      isBelowThreshold: healthFactor < 1.25 && healthFactor > 0,
      reserves: {
        usdcAvailableLiquidity: usdcReserve[0].toString(),
        wethAvailableLiquidity: wethReserve[0].toString(),
      },
      balances: {
        usdc: usdcBalance.toString(),
        weth: wethBalance.toString(),
      },
    });
  } catch (error) {
    console.error('Failed to read Aave health factor:', error);
    addAuditStep(1, 'Check Aave Health Factor', 'failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    // Continue with demo values
  }

  // ---------- STEP 2: Simulate x402 Data Fetch ----------
  addAuditStep(2, 'x402 Micropayment ($0.01 USDC) for Data Access', 'pending', {
    amount: X402_PAYMENT_AMOUNT_USDC,
    recipient: X402_PAYMENT_RECIPIENT,
    token: SEPOLIA_USDC_ADDRESS,
    chainId: SEPOLIA_CHAIN_ID,
  });

  const x402Header = generateX402Header();
  console.log(`\n💰 x402 Payment Header:`);
  console.log(`   ${x402Header}`);

  // Simulate payment via KeeperHub (dry-run)
  let x402SimResult: KeeperHubResponse | null = null;
  try {
    x402SimResult = await keeperHub.simulateTransfer({
      chainId: SEPOLIA_CHAIN_ID,
      recipientAddress: X402_PAYMENT_RECIPIENT,
      amount: X402_PAYMENT_AMOUNT_USDC,
      tokenAddress: SEPOLIA_USDC_ADDRESS,
      gasLimitMultiplier: '1.2',
      simulate: true,
    });

    console.log(`\n🔬 x402 Simulation Result:`);
    console.log(`   Success: ${x402SimResult.success}`);
    console.log(`   Would Revert: ${x402SimResult.wouldRevert}`);
    console.log(`   Gas Estimate: ${x402SimResult.gasEstimate}`);
    console.log(`   From: ${x402SimResult.from}`);
    console.log(`   To: ${x402SimResult.to}`);
    console.log(`   Value: ${x402SimResult.value}`);

    addAuditStep(2, 'x402 Micropayment ($0.01 USDC) for Data Access', 'simulated', {
      success: x402SimResult.success,
      wouldRevert: x402SimResult.wouldRevert,
      gasEstimate: x402SimResult.gasEstimate,
      from: x402SimResult.from,
      to: x402SimResult.to,
      paymentHeader: x402Header,
    });
  } catch (error) {
    console.error('x402 simulation failed:', error);
    addAuditStep(2, 'x402 Micropayment ($0.01 USDC) for Data Access', 'failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }

  // ---------- STEP 3: KeeperHub Pre-flight Dry-run (check-and-execute) ----------
  // KeeperHub requires the check function to resolve to exactly one scalar,
  // so the guardian pre-check reads the USDC protection reserve balance and
  // only arms the $0.01 USDC transfer when the reserve covers it.
  addAuditStep(3, 'KeeperHub Dry-run: reserve check-and-execute', 'pending', {
    check: 'USDC balanceOf(reserve) >= 10000 base units',
    action: 'USDC transfer $0.01 to recipient',
    user: DEMO_USER_ADDRESS,
  });

  const ERC20_TRANSFER_ABI = parseAbi([
    'function balanceOf(address owner) view returns (uint256)',
    'function transfer(address to, uint256 amount) returns (bool)',
  ]);

  const checkAndExecutePayload = {
    chainId: SEPOLIA_CHAIN_ID,
    contractAddress: SEPOLIA_USDC_ADDRESS,
    functionName: 'balanceOf',
    functionArgs: JSON.stringify([DEMO_USER_ADDRESS]),
    abi: JSON.stringify(ERC20_TRANSFER_ABI),
    condition: {
      operator: 'gte' as const,
      value: '10000',
    },
    action: {
      contractAddress: SEPOLIA_USDC_ADDRESS,
      functionName: 'transfer',
      functionArgs: JSON.stringify([X402_PAYMENT_RECIPIENT, '10000']),
      abi: JSON.stringify(ERC20_TRANSFER_ABI),
    },
  };

  let dryRunResult: CheckAndExecuteResponse | null = null;
  try {
    dryRunResult = await keeperHub.simulateCheckAndExecute(checkAndExecutePayload);

    console.log(`\n🔬 KeeperHub Dry-run (Check-and-Execute):`);
    console.log(`   Condition Met: ${dryRunResult.conditionResult.met}`);
    console.log(`   Observed Value: ${dryRunResult.conditionResult.observedValue}`);
    console.log(`   Target Value: ${dryRunResult.conditionResult.targetValue}`);
    console.log(`   Operator: ${dryRunResult.conditionResult.operator}`);
    console.log(`   Would Execute: ${dryRunResult.executed}`);
    console.log(`   Simulation Success: ${dryRunResult.success}`);

    addAuditStep(3, 'KeeperHub Dry-run: reserve check-and-execute', 'simulated', {
      conditionMet: dryRunResult.conditionResult.met,
      observedValue: dryRunResult.conditionResult.observedValue,
      targetValue: dryRunResult.conditionResult.targetValue,
      wouldExecute: dryRunResult.executed,
      success: dryRunResult.success,
    });
  } catch (error) {
    console.error('KeeperHub dry-run failed:', error);
    addAuditStep(3, 'KeeperHub Dry-run: reserve check-and-execute', 'failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }

  // ---------- STEP 4: Live Execution (if API key available) ----------
  let liveResult: KeeperHubResponse | CheckAndExecuteResponse | null = null;
  let txHash: string | undefined;
  let execId: string | undefined;

  if (KEEPERHUB_API_KEY || KEEPERHUB_ORG_KEY) {
    addAuditStep(4, 'Live Execution via KeeperHub Relayer', 'pending', {
      mode: 'live',
      paymentId: `rap_${Date.now()}`,
    });

    try {
      // For demo, we'll execute a simple USDC transfer as the live transaction
      // In production, this would be the check-and-execute for Aave protection
      const idempotencyKey = `rap_live_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

      liveResult = await keeperHub.executeTransfer({
        chainId: SEPOLIA_CHAIN_ID,
        recipientAddress: X402_PAYMENT_RECIPIENT,
        amount: X402_PAYMENT_AMOUNT_USDC,
        tokenAddress: SEPOLIA_USDC_ADDRESS,
        gasLimitMultiplier: '1.2',
      }, idempotencyKey);

      console.log(`\n🚀 Live Execution Result:`);
      console.log(`   Execution ID: ${liveResult.executionId}`);
      console.log(`   Status: ${liveResult.status}`);
      console.log(`   Transaction Hash: ${liveResult.transactionHash || 'pending'}`);
      console.log(`   Sponsored: ${liveResult.sponsored}`);
      console.log(`   Idempotent Replay: ${liveResult.idempotentReplay}`);

      execId = liveResult.executionId;

      // Wait for completion if unconfirmed
      if (liveResult.status === 'unconfirmed') {
        console.log(`\n⏳ Waiting for transaction confirmation...`);
        const finalStatus = await keeperHub.waitForExecution(liveResult.executionId);
        
        console.log(`\n✅ Final Status:`);
        console.log(`   Status: ${finalStatus.status}`);
        console.log(`   Transaction Hash: ${finalStatus.transactionHash}`);
        console.log(`   Transaction Link: ${finalStatus.transactionLink}`);
        console.log(`   Sponsored: ${finalStatus.sponsored}`);
        console.log(`   Receipts: ${finalStatus.receipts?.length || 0} receipt(s)`);

        if (finalStatus.receipts && finalStatus.receipts.length > 0) {
          const receipt = finalStatus.receipts[0];
          console.log(`   Verified: ${receipt.verified}`);
          console.log(`   Receipt Status: ${receipt.receiptStatus}`);
          console.log(`   Block Number: ${receipt.blockNumber}`);
          console.log(`   Gas Used: ${receipt.gasUsed}`);

          txHash = receipt.hash;
          auditReceipt.blockNumber = receipt.blockNumber;
          auditReceipt.gasUsed = receipt.gasUsed;
        }

        addAuditStep(4, 'Live Execution via KeeperHub Relayer', finalStatus.status === 'completed' ? 'success' : 'failed', {
          executionId: liveResult.executionId,
          finalStatus: finalStatus.status,
          transactionHash: finalStatus.transactionHash,
          sponsored: finalStatus.sponsored,
          receipts: finalStatus.receipts,
        });
      } else {
        txHash = liveResult.transactionHash;
        addAuditStep(4, 'Live Execution via KeeperHub Relayer', liveResult.status === 'completed' ? 'success' : 'failed', {
          executionId: liveResult.executionId,
          status: liveResult.status,
          transactionHash: liveResult.transactionHash,
          sponsored: liveResult.sponsored,
        });
      }
    } catch (error) {
      console.error('Live execution failed:', error);
      addAuditStep(4, 'Live Execution via KeeperHub Relayer', 'failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  } else {
    console.log('\n⏭️  Skipping live execution (no KeeperHub API key)');
    addAuditStep(4, 'Live Execution via KeeperHub Relayer', 'pending', {
      skipped: true,
      reason: 'No KEEPERHUB_API_KEY or KEEPERHUB_ORG_KEY configured',
    });
  }

  // ---------- FINALIZE ----------
  auditReceipt.finalResult = auditReceipt.steps.every(s => s.status === 'success' || s.status === 'simulated') ? 'success' : 'failed';
  auditReceipt.transactionHash = txHash;
  auditReceipt.executionId = execId;
  auditReceipt.explorerUrl = txHash ? `https://sepolia.etherscan.io/tx/${txHash}` : undefined;

  // Write audit receipt
  const auditPath = resolve(process.cwd(), 'execution-audit.json');
  writeFileSync(auditPath, JSON.stringify(auditReceipt, null, 2));

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  EXECUTION COMPLETE');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`\n📄 Audit Receipt: ${auditPath}`);
  console.log(`   Final Result: ${auditReceipt.finalResult.toUpperCase()}`);
  if (txHash) {
    console.log(`   Transaction: ${auditReceipt.explorerUrl}`);
    console.log(`   Block: ${auditReceipt.blockNumber}`);
    console.log(`   Gas Used: ${auditReceipt.gasUsed}`);
  }
  console.log('\n✅ Ready for hackathon submission!\n');
}

main().catch(console.error);