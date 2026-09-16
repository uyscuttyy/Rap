import { createPublicClient, http, parseAbi, encodeAbiParameters, type Address, type PublicClient, type Hex } from 'viem';
import { sepolia } from 'viem/chains';
import {
  SEPOLIA_CHAIN_ID,
  SEPOLIA_UNISWAP_UNIVERSAL_ROUTER,
} from '@/lib/keeperhub';

const RPC_URL = process.env.SEPOLIA_RPC_URL || 'https://sepolia.infura.io/v3/YOUR_KEY';

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(RPC_URL),
});

const UNIVERSAL_ROUTER_ABI = parseAbi([
  'function execute(bytes calldata commands, bytes[] calldata inputs, uint256 deadline) payable returns (bytes memory)',
]);

const ERC20_ABI = parseAbi([
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
]);

// Universal Router command codes
const COMMANDS = {
  V3_SWAP_EXACT_IN: 0x00,
  V3_SWAP_EXACT_OUT: 0x01,
  PERMIT2_PERMIT: 0x02,
  PERMIT2_TRANSFER_FROM: 0x03,
  SWEEP: 0x04,
  TRANSFER: 0x05,
  PAY_PORTION: 0x06,
  UNWRAP_WETH: 0x07,
  WRAP_ETH: 0x08,
  BALANCE_CHECK_ERC20: 0x09,
  BALANCE_CHECK_ETH: 0x0A,
} as const;

export interface SwapParams {
  tokenIn: Address;
  tokenOut: Address;
  amountIn: string; // wei
  amountOutMinimum: string; // wei
  recipient: Address;
  fee: number; // 500, 3000, 10000
  sqrtPriceLimitX96?: string;
}

export interface SwapResult {
  amountOut: string;
  executionId?: string;
  transactionHash?: string;
}

export class UniswapService {
  private client: PublicClient;

  constructor(client: PublicClient = publicClient) {
    this.client = client;
  }

  async getTokenInfo(token: Address): Promise<{ symbol: string; decimals: number }> {
    const [symbol, decimals] = await Promise.all([
      this.client.readContract({ address: token, abi: ERC20_ABI, functionName: 'symbol' }),
      this.client.readContract({ address: token, abi: ERC20_ABI, functionName: 'decimals' }),
    ]);
    return { symbol, decimals };
  }

  async getBalance(token: Address, owner: Address): Promise<bigint> {
    return this.client.readContract({
      address: token,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [owner],
    });
  }

  async getAllowance(token: Address, owner: Address, spender: Address): Promise<bigint> {
    return this.client.readContract({
      address: token,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [owner, spender],
    });
  }

  // Encode V3_SWAP_EXACT_IN for Universal Router
  encodeV3SwapExactIn(params: SwapParams): { commands: string; inputs: string[] } {
    // Path encoding: tokenIn -> fee -> tokenOut
    const path = [
      params.tokenIn,
      (params.fee).toString(16).padStart(6, '0'),
      params.tokenOut,
    ];

    // V3_SWAP_EXACT_IN input: [recipient, amountIn, amountOutMinimum, sqrtPriceLimitX96, path]
    const input = this.encodeParameters(
      params.recipient,
      params.amountIn,
      params.amountOutMinimum,
      params.sqrtPriceLimitX96 || '0',
      this.encodePath(path)
    );

    return {
      commands: String.fromCharCode(COMMANDS.V3_SWAP_EXACT_IN),
      inputs: [input],
    };
  }

  // Build full Universal Router execute payload
  buildExecutePayload(swapParams: SwapParams, deadline: number = Math.floor(Date.now() / 1000) + 1200): {
    commands: string;
    inputs: string[];
    deadline: number;
  } {
    const { commands, inputs } = this.encodeV3SwapExactIn(swapParams);
    return { commands, inputs, deadline };
  }

  // Build check-and-execute for automated swaps (e.g., when price hits target)
  buildPriceTriggeredSwap(
    userAddress: Address,
    swapParams: SwapParams,
    priceOracleAddress: Address,
    thresholdPrice: string, // in wei
    operator: 'gt' | 'lt' = 'gt'
  ): {
    chainId: number;
    contractAddress: Address;
    functionName: string;
    functionArgs: string;
    abi: string;
    condition: { operator: 'gt' | 'lt'; value: string };
    action: {
      contractAddress: Address;
      functionName: string;
      functionArgs: string;
      abi: string;
    };
  } {
    const { commands, inputs } = this.encodeV3SwapExactIn(swapParams);

    return {
      chainId: SEPOLIA_CHAIN_ID,
      contractAddress: priceOracleAddress,
      functionName: 'latestRoundData',
      functionArgs: '[]',
      abi: JSON.stringify([
        'function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
      ]),
      condition: {
        operator,
        value: thresholdPrice,
      },
      action: {
        contractAddress: SEPOLIA_UNISWAP_UNIVERSAL_ROUTER,
        functionName: 'execute',
        functionArgs: JSON.stringify([commands, inputs, swapParams.amountIn]),
        abi: JSON.stringify(UNIVERSAL_ROUTER_ABI),
      },
    };
  }

  // Helper: encode path for V3 swaps
  private encodePath(path: (Address | string)[]): Hex {
    let encoded = '0x';
    for (let i = 0; i < path.length; i++) {
      if (i % 2 === 0) {
        // Address
        encoded += path[i].slice(2).toLowerCase().padStart(40, '0');
      } else {
        // Fee (24 bits)
        encoded += path[i].toString().padStart(6, '0');
      }
    }
    return encoded as Hex;
  }

  // ABI-encode V3_SWAP_EXACT_IN inputs with viem
  private encodeParameters(
    recipient: Address,
    amountIn: string,
    amountOutMinimum: string,
    sqrtPriceLimitX96: string,
    path: Hex
  ): Hex {
    return encodeAbiParameters(
      [
        { type: 'address' },
        { type: 'uint256' },
        { type: 'uint256' },
        { type: 'uint160' },
        { type: 'bytes' },
      ],
      [recipient, BigInt(amountIn), BigInt(amountOutMinimum), BigInt(sqrtPriceLimitX96), path]
    );
  }
}

export const uniswapService = new UniswapService();

// Build KeeperHub check-and-execute payload for Uniswap swap.
// Encodes a real V3_SWAP_EXACT_IN input with viem and reuses it for the action.
export function createUniswapSwapCheckAndExecute(
  userAddress: Address,
  tokenIn: Address,
  tokenOut: Address,
  amountIn: string,
  amountOutMinimum: string,
  fee: number = 3000
) {
  const feeHex = fee.toString(16).padStart(6, '0');
  const path = `0x${tokenIn.slice(2).toLowerCase()}${feeHex}${tokenOut.slice(2).toLowerCase()}` as Hex;
  const deadline = Math.floor(Date.now() / 1000) + 1200;
  const swapInput = encodeAbiParameters(
    [
      { type: 'address' },
      { type: 'uint256' },
      { type: 'uint256' },
      { type: 'uint160' },
      { type: 'bytes' },
    ],
    [userAddress, BigInt(amountIn), BigInt(amountOutMinimum), BigInt(0), path]
  );
  const commands = String.fromCharCode(COMMANDS.V3_SWAP_EXACT_IN);
  const executeArgs = JSON.stringify([commands, [swapInput], deadline]);

  return {
    chainId: SEPOLIA_CHAIN_ID,
    contractAddress: SEPOLIA_UNISWAP_UNIVERSAL_ROUTER,
    functionName: 'execute',
    functionArgs: executeArgs,
    abi: JSON.stringify(UNIVERSAL_ROUTER_ABI),
    condition: {
      operator: 'gt',
      value: amountOutMinimum,
    },
    action: {
      contractAddress: SEPOLIA_UNISWAP_UNIVERSAL_ROUTER,
      functionName: 'execute',
      functionArgs: executeArgs,
      abi: JSON.stringify(UNIVERSAL_ROUTER_ABI),
    },
  };
}