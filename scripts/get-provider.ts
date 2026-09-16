import { createPublicClient, http, parseAbi } from 'viem';
import { sepolia } from 'viem/chains';

const client = createPublicClient({
  chain: sepolia,
  transport: http('https://ethereum-sepolia-rpc.publicnode.com'),
});

const POOL = '0x6ae43d3271ff6888e7fc43fd7321a503ff738951';

async function main() {
  const poolAbi = parseAbi(['function ADDRESSES_PROVIDER() view returns (address)']);
  const provider = (await client.readContract({
    address: POOL,
    abi: poolAbi,
    functionName: 'ADDRESSES_PROVIDER',
  })) as string;
  console.log('AddressesProvider:', provider);

  const providerAbi = parseAbi(['function getPoolDataProvider() view returns (address)']);
  const dataProvider = await client.readContract({
    address: provider.toLowerCase() as `0x${string}`,
    abi: providerAbi,
    functionName: 'getPoolDataProvider',
  });
  console.log('PoolDataProvider:', dataProvider);
}

main().catch((e) => {
  console.error('FAILED:', String(e.message || e).split('\n')[0]);
  process.exit(1);
});
