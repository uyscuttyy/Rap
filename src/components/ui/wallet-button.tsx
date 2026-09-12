'use client';

import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { Button } from './button';
import { formatAddress } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './dropdown-menu';

export function WalletButton() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected && address) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-50 border border-green-200 hover:bg-green-100 transition-colors">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-sm font-medium text-green-800">
              {formatAddress(address)}
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => disconnect()}>
            Disconnect
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  const connector = connectors[0];

  return (
    <Button
      onClick={() => connector && connect({ connector })}
      disabled={!connector || isPending}
      size="sm"
    >
      {isPending ? 'Connecting...' : 'Connect wallet'}
    </Button>
  );
}
