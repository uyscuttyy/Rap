import { db } from '@/db';
import { policies, type Policy } from '@/db/policy-schema';
import { eq } from 'drizzle-orm';

export class PolicyService {
  private cache: Map<string, Policy[]> = new Map();
  private cacheExpiry = 0;

  async getActivePolicies(): Promise<Policy[]> {
    const now = Date.now();
    if (now < this.cacheExpiry && this.cache.size > 0) {
      const all = [];
      for (const policies of this.cache.values()) {
        all.push(...policies);
      }
      return all;
    }

    const active = await db.select().from(policies).where(eq(policies.enabled, true));

    this.cache.clear();
    this.cacheExpiry = now + 30000; // 30s TTL
    this.cache.set('active', active);

    return active;
  }

  async checkMaxAmount(amountWei: string): Promise<{ allowed: boolean; reason?: string }> {
    const activePolicies = await this.getActivePolicies();
    for (const policy of activePolicies) {
      if (policy.type === 'max_amount') {
        try {
          const config = JSON.parse(policy.config) as { maxAmountWei: string };
          if (BigInt(amountWei) > BigInt(config.maxAmountWei)) {
            return { allowed: false, reason: `Amount exceeds maximum of ${config.maxAmountWei} wei` };
          }
        } catch {
          // ignore malformed config
        }
      }
    }
    return { allowed: true };
  }

  async checkRecipientAllowlist(recipient: string): Promise<{ allowed: boolean; reason?: string }> {
    const activePolicies = await this.getActivePolicies();
    const allowlists = activePolicies.filter(p => p.type === 'recipient_allowlist');
    if (allowlists.length === 0) return { allowed: true };

    const normalized = recipient.toLowerCase();
    for (const policy of allowlists) {
      try {
        const config = JSON.parse(policy.config) as { recipients: string[] };
        if (config.recipients.some(r => r.toLowerCase() === normalized)) {
          return { allowed: true };
        }
      } catch {
        // ignore malformed config
      }
    }
    return { allowed: false, reason: 'Recipient not in allowlist' };
  }

  async checkChainAndToken(chainId: number, tokenAddress: string): Promise<{ allowed: boolean; reason?: string }> {
    const activePolicies = await this.getActivePolicies();
    for (const policy of activePolicies) {
      if (policy.type === 'chain_restriction') {
        try {
          const config = JSON.parse(policy.config) as { allowedChains: number[]; allowedTokens: string[] };
          if (!config.allowedChains.includes(chainId)) {
            return { allowed: false, reason: `Chain ${chainId} not allowed` };
          }
          if (config.allowedTokens.length > 0) {
            const normalized = tokenAddress.toLowerCase();
            if (!config.allowedTokens.some(t => t.toLowerCase() === normalized)) {
              return { allowed: false, reason: `Token ${tokenAddress} not allowed` };
            }
          }
        } catch {
          // ignore malformed config
        }
      }
    }
    return { allowed: true };
  }

  async evaluateAll(params: {
    amountWei: string;
    recipient: string;
    chainId: number;
    tokenAddress: string;
  }): Promise<{ allowed: boolean; reason?: string }> {
    const checks = await Promise.all([
      this.checkMaxAmount(params.amountWei),
      this.checkRecipientAllowlist(params.recipient),
      this.checkChainAndToken(params.chainId, params.tokenAddress),
    ]);

    for (const check of checks) {
      if (!check.allowed) return check;
    }
    return { allowed: true };
  }
}

export const policyService = new PolicyService();