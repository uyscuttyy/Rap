import { NextRequest, NextResponse } from 'next/server';
import { aaveService } from '@/lib/aave';
import type { Address } from 'viem';

export async function GET(request: NextRequest) {
  try {
    const user = request.nextUrl.searchParams.get('user');
    if (!user || !/^0x[a-fA-F0-9]{40}$/.test(user)) {
      return NextResponse.json(
        { error: 'Query param "user" must be a valid address' },
        { status: 400 }
      );
    }

    const address = user as Address;
    const [health, balances] = await Promise.all([
      aaveService.getHealthFactor(address),
      aaveService.getUserBalances(address),
    ]);

    return NextResponse.json({ health, balances });
  } catch (error) {
    console.error('Guardian status error:', error);
    return NextResponse.json(
      { error: 'Failed to read on-chain position' },
      { status: 500 }
    );
  }
}
