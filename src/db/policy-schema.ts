import { pgTable, uuid, varchar, text, timestamp, pgEnum, boolean } from 'drizzle-orm/pg-core';

export const paymentStatusEnum = pgEnum('payment_status', [
  'pending',
  'paid',
  'failed',
  'unknown',
]);

export const policyTypeEnum = pgEnum('policy_type', [
  'max_amount',
  'recipient_allowlist',
  'chain_restriction',
]);

export const policies = pgTable('policies', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 64 }).notNull(),
  type: policyTypeEnum('type').notNull(),
  config: text('config').notNull(), // JSON string
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Policy = typeof policies.$inferSelect;
export type NewPolicy = typeof policies.$inferInsert;

export interface MaxAmountPolicyConfig {
  maxAmountWei: string;
}

export interface RecipientAllowlistPolicyConfig {
  recipients: string[]; // checksummed addresses
}

export interface ChainRestrictionPolicyConfig {
  allowedChains: number[];
  allowedTokens: string[]; // token addresses, empty = native only
}