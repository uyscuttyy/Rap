import { pgTable, uuid, varchar, text, timestamp, numeric, pgEnum, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const paymentStatusEnum = pgEnum('payment_status', [
  'pending',
  'paid',
  'failed',
  'unknown',
]);

export const payments = pgTable('payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  paymentId: varchar('payment_id', { length: 64 }).notNull().unique(),
  userAddress: varchar('user_address', { length: 42 }).notNull(),
  recipient: varchar('recipient', { length: 42 }).notNull(),
  amount: numeric('amount', { precision: 36, scale: 18 }).notNull(),
  token: varchar('token', { length: 42 }).notNull().default('0x0000000000000000000000000000000000000000'),
  network: varchar('network', { length: 32 }).notNull().default('base-sepolia'),
  status: paymentStatusEnum('status').notNull().default('pending'),
  keeperhubExecutionId: varchar('keeperhub_execution_id', { length: 64 }),
  transactionHash: varchar('transaction_hash', { length: 66 }),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  paymentIdIdx: index('payments_payment_id_idx').on(table.paymentId),
  userAddressIdx: index('payments_user_address_idx').on(table.userAddress),
  statusIdx: index('payments_status_idx').on(table.status),
  createdAtIdx: index('payments_created_at_idx').on(table.createdAt),
}));

export const paymentsRelations = relations(payments, ({ many }) => ({
  executions: many(paymentExecutions),
}));

export const paymentExecutions = pgTable('payment_executions', {
  id: uuid('id').primaryKey().defaultRandom(),
  paymentId: uuid('payment_id').notNull().references(() => payments.id, { onDelete: 'cascade' }),
  keeperhubExecutionId: varchar('keeperhub_execution_id', { length: 64 }).notNull(),
  status: varchar('status', { length: 32 }).notNull(),
  transactionHash: varchar('transaction_hash', { length: 66 }),
  errorMessage: text('error_message'),
  rawResponse: text('raw_response'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  keeperhubExecutionIdIdx: index('payment_executions_keeperhub_execution_id_idx').on(table.keeperhubExecutionId),
  paymentIdIdx: index('payment_executions_payment_id_idx').on(table.paymentId),
}));

export const paymentExecutionsRelations = relations(paymentExecutions, ({ one }) => ({
  payment: one(payments, {
    fields: [paymentExecutions.paymentId],
    references: [payments.id],
  }),
}));

export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
export type PaymentExecution = typeof paymentExecutions.$inferSelect;
export type NewPaymentExecution = typeof paymentExecutions.$inferInsert;