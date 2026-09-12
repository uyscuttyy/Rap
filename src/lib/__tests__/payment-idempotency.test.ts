import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetExecutionStatus, mockExecuteTransfer } = vi.hoisted(() => ({
  mockGetExecutionStatus: vi.fn(),
  mockExecuteTransfer: vi.fn(),
}));

vi.mock('@/db', () => ({
  db: {
    insert: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('@/lib/keeperhub', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/keeperhub')>();
  return {
    ...original,
    keeperHub: {
      getExecutionStatus: mockGetExecutionStatus,
      executeTransfer: mockExecuteTransfer,
    },
  };
});

import { db } from '@/db';
import { paymentService } from '@/lib/payment-service';
import { ZERO_ADDRESS } from '@/lib/keeperhub';

const mockDb = vi.mocked(db, true);

function paymentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    paymentId: 'rap_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    userAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    recipient: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    amount: '1000000000000000',
    token: ZERO_ADDRESS.toLowerCase(),
    network: 'base-sepolia',
    status: 'pending',
    keeperhubExecutionId: null,
    transactionHash: null,
    errorMessage: null,
    createdAt: new Date('2026-09-11T15:00:00Z'),
    updatedAt: new Date('2026-09-11T15:00:00Z'),
    ...overrides,
  };
}

// Queue-based select mock: each getPaymentById consumes two entries,
// one for the payment row array and one for the executions array.
let selectQueue: unknown[][] = [];

function queuePayment(row: Record<string, unknown>, executions: unknown[] = []) {
  selectQueue.push([row], executions);
}

function setupDb(insertResult: unknown[] = []) {
  selectQueue = [];
  mockDb.insert.mockReturnValue({
    values: vi.fn().mockReturnValue({
      returning: vi.fn(async () => insertResult),
    }),
  } as never);
  mockDb.select.mockImplementation(
    () =>
      ({
        from: () => ({
          where: () => ({
            limit: async () => selectQueue.shift() ?? [],
            orderBy: async () => selectQueue.shift() ?? [],
          }),
        }),
      }) as never
  );
  mockDb.update.mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn(async () => []),
    }),
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetExecutionStatus.mockReset();
  mockExecuteTransfer.mockReset();
});

describe('payment idempotency guarantees', () => {
  it('Test 1: created payment receives a unique persisted ID', async () => {
    setupDb([paymentRow()]);
    await paymentService.createPayment({
      userAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      recipient: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      amount: '1000000000000000',
    });
    const firstValues = mockDb.insert.mock.results[0].value.values.mock.calls[0][0];
    const firstPaymentId: string = firstValues.paymentId;

    setupDb([paymentRow()]);
    await paymentService.createPayment({
      userAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      recipient: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      amount: '1000000000000000',
    });
    const insertResults = mockDb.insert.mock.results;
    const secondValues = insertResults[insertResults.length - 1].value.values.mock.calls[0][0];
    const secondPaymentId: string = secondValues.paymentId;

    expect(firstPaymentId).toMatch(/^rap_[a-f0-9]{32}$/);
    expect(secondPaymentId).toMatch(/^rap_[a-f0-9]{32}$/);
    expect(firstPaymentId).not.toBe(secondPaymentId);
    expect(mockDb.insert).toHaveBeenCalledTimes(2);
  });

  it('Test 2: valid pending payment executes once via KeeperHub with payment ID as idempotency key', async () => {
    const row = paymentRow();
    setupDb();
    queuePayment(row);
    mockExecuteTransfer.mockResolvedValue({
      success: true,
      executionId: row.paymentId,
      status: 'completed',
      transactionHash: '0xhash',
    });
    // Refresh after update
    queuePayment({ ...row, status: 'paid', transactionHash: '0xhash' });

    await paymentService.executePayment(row.paymentId as string);

    expect(mockExecuteTransfer).toHaveBeenCalledTimes(1);
    const [transferRequest, idempotencyKey] = mockExecuteTransfer.mock.calls[0];
    expect(idempotencyKey).toBe(row.paymentId);
    expect(transferRequest.recipientAddress).toBe(row.recipient);
    expect(transferRequest.chainId).toBe(84532);
  });

  it('Test 3: successful payment cannot create another transaction on retry', async () => {
    const row = paymentRow({ status: 'paid', transactionHash: '0xhash' });
    setupDb();
    queuePayment(row);
    queuePayment(row);
    queuePayment(row);

    await expect(paymentService.executePayment(row.paymentId as string)).rejects.toThrow(
      'Payment already completed'
    );
    await expect(paymentService.executePayment(row.paymentId as string)).rejects.toThrow(
      'Payment already completed'
    );
    await expect(paymentService.executePayment(row.paymentId as string)).rejects.toThrow(
      'Payment already completed'
    );
    expect(mockExecuteTransfer).not.toHaveBeenCalled();
  });

  it('Test 4: pending payment with unresolved execution cannot create another transaction', async () => {
    const row = paymentRow({ keeperhubExecutionId: 'rap_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' });
    setupDb();
    queuePayment(row);
    mockGetExecutionStatus.mockResolvedValue({ status: 'running' });

    await expect(paymentService.executePayment(row.paymentId as string)).rejects.toThrow(
      'Payment execution still in progress'
    );
    expect(mockExecuteTransfer).not.toHaveBeenCalled();
  });

  it('Test 4b: unknown payment resolving to success is marked paid without a new broadcast', async () => {
    const row = paymentRow({
      status: 'unknown',
      keeperhubExecutionId: 'rap_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    });
    setupDb();
    queuePayment(row);
    mockGetExecutionStatus.mockResolvedValue({
      status: 'completed',
      transactionHash: '0xhash',
      receipts: [{ verified: true, receiptStatus: 'success' }],
    });
    queuePayment({ ...row, status: 'paid', transactionHash: '0xhash' });

    const result = await paymentService.executePayment(row.paymentId as string);
    expect(result.status).toBe('paid');
    expect(mockExecuteTransfer).not.toHaveBeenCalled();
  });

  it('Test 5: genuinely failed payment requires a new payment identity', async () => {
    const row = paymentRow({ status: 'failed', errorMessage: 'Execution failed' });
    setupDb();
    queuePayment(row);

    await expect(paymentService.executePayment(row.paymentId as string)).rejects.toThrow(
      'Payment failed. Create a new payment to retry.'
    );
    expect(mockExecuteTransfer).not.toHaveBeenCalled();
  });

  it('Test 6: repeated direct execution calls never broadcast twice', async () => {
    const row = paymentRow({ status: 'paid', transactionHash: '0xhash' });
    setupDb();
    for (let i = 0; i < 5; i++) queuePayment(row);

    for (let i = 0; i < 5; i++) {
      await expect(paymentService.executePayment(row.paymentId as string)).rejects.toThrow();
    }
    expect(mockExecuteTransfer).not.toHaveBeenCalled();
  });
});
