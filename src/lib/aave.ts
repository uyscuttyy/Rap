import { createPublicClient, http, parseAbi, formatUnits, type Address, type PublicClient } from 'viem';
import { sepolia } from 'viem/chains';
import {
  SEPOLIA_CHAIN_ID,
  SEPOLIA_AAVE_POOL_ADDRESS,
  SEPOLIA_AAVE_POOL_DATA_PROVIDER,
  SEPOLIA_USDC_ADDRESS,
  SEPOLIA_WETH_ADDRESS,
} from '@/lib/keeperhub';

const RPC_URL = process.env.SEPOLIA_RPC_URL || 'https://sepolia.infura.io/v3/YOUR_KEY';

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(RPC_URL),
});

const AAVE_POOL_ABI = parseAbi([
  'function getUserAccountData(address user) view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)',
  'function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)',
  'function withdraw(address asset, uint256 amount, address to)',
  'function borrow(address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf)',
  'function repay(address asset, uint256 amount, uint256 interestRateMode, address onBehalfOf)',
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
]);

export interface HealthFactorData {
  healthFactor: number;
  totalCollateralUSD: number;
  totalDebtUSD: number;
  availableBorrowsUSD: number;
  isBelowThreshold: boolean;
  threshold: number;
}

export interface ReserveData {
  symbol: string;
  decimals: number;
  availableLiquidity: string;
  totalDebt: string;
  liquidityRate: number;
  variableBorrowRate: number;
}

export interface UserPosition {
  asset: Address;
  symbol: string;
  balance: string;
  collateralEnabled: boolean;
}

export class AaveService {
  private client: PublicClient;

  constructor(client: PublicClient = publicClient) {
    this.client = client;
  }

  async getHealthFactor(userAddress: Address): Promise<HealthFactorData> {
      const data = await this.client.readContract({
        address: SEPOLIA_AAVE_POOL_ADDRESS,
        abi: AAVE_POOL_ABI,
        functionName: 'getUserAccountData',
        args: [userAddress],
      });

      const healthFactor = Number(formatUnits(data[5], 18)); // healthFactor is in ray (1e18)
      const totalCollateral = Number(formatUnits(data[0], 18));
      const totalDebt = Number(formatUnits(data[1], 18));
      const availableBorrowsUSD = Number(formatUnits(data[2], 18));

      return {
        healthFactor,
        totalCollateralUSD: totalCollateral,
        totalDebtUSD: totalDebt,
        availableBorrowsUSD,
        isBelowThreshold: healthFactor < 1.25 && healthFactor > 0,
        threshold: 1.25,
      };
    }

  async getReserveData(asset: Address): Promise<ReserveData> {
    const [reserveData, decimals, symbol] = await Promise.all([
      this.client.readContract({
        address: SEPOLIA_AAVE_POOL_DATA_PROVIDER,
        abi: AAVE_POOL_DATA_PROVIDER_ABI,
        functionName: 'getReserveData',
        args: [asset],
      }),
      this.client.readContract({
        address: asset,
        abi: ERC20_ABI,
        functionName: 'decimals',
      }),
      this.client.readContract({
        address: asset,
        abi: ERC20_ABI,
        functionName: 'symbol',
      }),
    ]);

    return {
      symbol,
      decimals,
      availableLiquidity: reserveData[0].toString(),
      totalDebt: (reserveData[1] + reserveData[2]).toString(),
      liquidityRate: Number(formatUnits(reserveData[3], 27)), // Ray precision
      variableBorrowRate: Number(formatUnits(reserveData[5], 27)),
    };
  }

  async getUserBalances(userAddress: Address): Promise<UserPosition[]> {
    const assets = [SEPOLIA_USDC_ADDRESS, SEPOLIA_WETH_ADDRESS];
    const positions: UserPosition[] = [];

    for (const asset of assets) {
      const [balance, symbol] = await Promise.all([
        this.client.readContract({
          address: asset,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [userAddress],
        }),
        this.client.readContract({
          address: asset,
          abi: ERC20_ABI,
          functionName: 'symbol',
        }),
      ]);

      positions.push({
        asset,
        symbol,
        balance: balance.toString(),
        collateralEnabled: true, // Would need to check pool config
      });
    }

    return positions;
  }

  // Build a flash loan repayment payload for KeeperHub check-and-execute.
  // collateralAsset is the asset the receiver must supply back within the
  // flash loan callback; it is encoded into params for the receiver contract.
  buildFlashLoanRepaymentPayload(
    userAddress: Address,
    debtAsset: Address,
    repayAmount: string,
    collateralAsset: Address
  ) {
    return {
      chainId: SEPOLIA_CHAIN_ID,
      contractAddress: SEPOLIA_AAVE_POOL_ADDRESS,
      functionName: 'flashLoan',
      functionArgs: JSON.stringify([
        userAddress, // receiver
        [debtAsset], // assets
        [repayAmount], // amounts
        [0], // modes (0 = no debt)
        userAddress, // onBehalfOf
        collateralAsset, // params: collateral to return in callback
        0, // referralCode
      ]),
      abi: JSON.stringify(AAVE_POOL_ABI),
    };
  }

  // Build a supply collateral payload
  buildSupplyCollateralPayload(
    userAddress: Address,
    asset: Address,
    amount: string
  ) {
    return {
      chainId: SEPOLIA_CHAIN_ID,
      contractAddress: SEPOLIA_AAVE_POOL_ADDRESS,
      functionName: 'supply',
      functionArgs: JSON.stringify([asset, amount, userAddress, 0]),
      abi: JSON.stringify(AAVE_POOL_ABI),
    };
  }

  // Build a repay debt payload
  buildRepayDebtPayload(
    userAddress: Address,
    asset: Address,
    amount: string
  ) {
    return {
      chainId: SEPOLIA_CHAIN_ID,
      contractAddress: SEPOLIA_AAVE_POOL_ADDRESS,
      functionName: 'repay',
      functionArgs: JSON.stringify([asset, amount, 2, userAddress]), // 2 = variable rate
      abi: JSON.stringify(AAVE_POOL_ABI),
    };
  }
}

export const aaveService = new AaveService();

// Helper to create KeeperHub check-and-execute for health factor monitoring
export function createHealthFactorCheckAndExecute(
  userAddress: Address,
  threshold: number = 1.25
): {
  chainId: number;
  contractAddress: Address;
  functionName: string;
  functionArgs: string;
  abi: string;
  condition: { operator: 'lt'; value: string };
  action: {
    contractAddress: Address;
    functionName: string;
    functionArgs: string;
    abi: string;
  };
} {
  const healthFactorThreshold = BigInt(Math.floor(threshold * 1e18));

  return {
    chainId: SEPOLIA_CHAIN_ID,
    contractAddress: SEPOLIA_AAVE_POOL_ADDRESS,
    functionName: 'getUserAccountData',
    functionArgs: JSON.stringify([userAddress]),
    abi: JSON.stringify(AAVE_POOL_ABI),
    condition: {
      operator: 'lt',
      value: healthFactorThreshold.toString(),
    },
    action: {
      contractAddress: SEPOLIA_AAVE_POOL_ADDRESS,
      functionName: 'flashLoan',
      functionArgs: JSON.stringify([
        userAddress,
        [SEPOLIA_USDC_ADDRESS],
        ['1000000'], // placeholder - will be calculated at execution
        [0],
        userAddress,
        '0x',
        0,
      ]),
      abi: JSON.stringify(AAVE_POOL_ABI),
    },
  };
}