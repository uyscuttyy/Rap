'use client';

import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { XCircle, CheckCircle2, Clock, EyeOff, Settings, ArrowDown, ArrowUp, Shield } from 'lucide-react';

export interface HealthIndicatorProps {
  healthFactor: number;
  threshold?: number;
  isBelowThreshold?: boolean;
}

export function HealthIndicator({ healthFactor, threshold = 1.25, isBelowThreshold = false }: HealthIndicatorProps) {
  const percentage = Math.min((healthFactor / threshold) * 100, 100);

  return (
    <Card className="p-4">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Health Factor</CardTitle>
      </CardHeader>
      <CardContent className="pt-2">
        <div className="relative h-32 w-32">
          <svg className="absolute inset-0 -rotate-90 text-gray-400" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="45" fill="none" stroke="#e5e7eb" strokeWidth="8" />
            <circle
              cx="50"
              cy="50"
              r="40"
              fill="none"
              stroke={isBelowThreshold ? '#ef4444' : '#10b981'}
              strokeWidth="8"
              strokeDasharray={`${percentage} 100`}
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span
              className="text-2xl font-semibold"
              style={{ color: isBelowThreshold ? '#ef4444' : '#10b981' }}
            >
              {healthFactor.toFixed(2)}
            </span>
            <span className="text-xs text-gray-500">
              {isBelowThreshold ? 'CRITICAL' : 'SAFE'}
            </span>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between text-xs text-gray-400">
          <span>Threshold: {threshold}</span>
          <span>{healthFactor.toFixed(2)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

export interface KeeperHubActivity {
  txHash: string;
  status: string;
  timestamp: string;
}

export interface X402Status {
  status: 'pending' | 'paid' | 'failed';
  timestamp?: string;
}

export interface GuardianDashboardProps {
  healthFactor?: number;
  keeperHubActivity?: KeeperHubActivity[];
  x402Status?: X402Status | null;
  usdcBalance?: string;
  rapEnabled?: boolean;
  onProtectionToggle?: (enabled: boolean) => void;
}

export function GuardianDashboard({
  healthFactor,
  keeperHubActivity = [],
  x402Status = null,
  usdcBalance,
  rapEnabled = true,
  onProtectionToggle,
}: GuardianDashboardProps) {
  const [isCollapsed, setIsCollapsed] = React.useState(false);

  return (
    <Card className="space-y-0 overflow-hidden">
      <CardHeader className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <Shield className="h-5 w-5 text-gray-300" aria-hidden="true" />
          <span className="text-lg font-semibold text-gray-900">RAP Guardian</span>
        </div>

        <div className="flex items-center gap-2">
          <Badge
            variant="secondary"
            className={rapEnabled ? '' : 'bg-gray-300 text-gray-400'}
          >
            {rapEnabled ? 'RAP ON' : 'RAP OFF'}
          </Badge>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => onProtectionToggle?.(!rapEnabled)}
            className="p-1 rounded-md hover:bg-gray-100 transition-colors"
            aria-label={rapEnabled ? 'Disable RAP protection' : 'Enable RAP protection'}
          >
            {rapEnabled ? <XCircle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-4 space-y-3">
        {healthFactor !== undefined && (
          <HealthIndicator
            healthFactor={healthFactor}
            threshold={1.25}
            isBelowThreshold={healthFactor < 1.25}
          />
        )}

        {x402Status && (
          <div
            className={`p-3 rounded-md ${
              x402Status.status === 'paid' ? 'bg-green-50 border-green-200' :
              x402Status.status === 'failed' ? 'bg-red-50 border-red-200' :
              'bg-yellow-50 border-yellow-200'
            }`}
          >
            <div className="flex items-center gap-2">
              {x402Status.status === 'paid' && <CheckCircle2 className="h-4 w-4 text-green-500" aria-hidden="true" />}
              {x402Status.status === 'failed' && <XCircle className="h-4 w-4 text-red-500" aria-hidden="true" />}
              {x402Status.status === 'pending' && <div className="h-4 w-4 animate-spin border-2 border-gray-300 rounded-full" />}
              <span className="text-sm font-medium">
                x402: {x402Status.status}
              </span>
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {x402Status.timestamp ? new Date(x402Status.timestamp).toLocaleTimeString() : 'No timestamp'}
            </div>
          </div>
        )}

        {keeperHubActivity.length > 0 ? (
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {keeperHubActivity.map((activity, index) => (
              <div key={index} className="flex items-center gap-2 px-2 py-1 rounded-md text-sm text-gray-500">
                <Clock className="h-3.5 w-3.5 text-gray-400" aria-hidden="true" />
                <span className="font-mono text-xs truncate">
                  {activity.txHash?.slice(0, 10)}...{activity.txHash?.slice(-6)}
                </span>
                <span className="text-xs text-gray-500 ml-auto">{activity.timestamp}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-gray-400 py-2">
            <EyeOff className="h-4 w-4 mr-1" aria-hidden="true" />
            No KeeperHub activity yet
          </div>
        )}

        {usdcBalance !== undefined && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-400">USDC</span>
              <span className="font-medium text-gray-800">{usdcBalance}</span>
            </div>
            <Button variant="outline" size="sm">View</Button>
          </div>
        )}
      </CardContent>

      <CardFooter className="flex flex-col sm:flex-row justify-between pt-2 px-4 border-t">
        <div className="flex items-center gap-2">
          <Badge variant="outline">View details</Badge>
          <Button variant="ghost" size="sm" onClick={() => setIsCollapsed(!isCollapsed)}>
            {isCollapsed ? <ArrowDown className="h-3.5 w-3.5" /> : <ArrowUp className="h-3.5 w-3.5" />}
          </Button>
        </div>

        {onProtectionToggle && (
          <Badge variant="secondary">
            <Settings className="h-3.5 w-3.5" aria-hidden="true" />
            {rapEnabled ? 'Disable RAP' : 'Enable RAP'}
          </Badge>
        )}
      </CardFooter>
    </Card>
  );
}
