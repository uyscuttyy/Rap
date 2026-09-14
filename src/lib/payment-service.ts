import { db } from '@/db';
import { payments, paymentExecutions, type NewPayment, type NewPaymentExecution } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { generatePaymentId } from '@/lib/utils';
import { keeperHub, type TransferRequest, BASE_SEPOLIA_CHAIN_ID, ZERO_ADDRESS } from '@/lib/keeperhub';
import { policyService } from '@/lib/policy-service';

export interface CreatePaymentParams {
  userAddress: string;
  recipient: string;
  amount: string;
  token?: string;
  network?: string;
}

export interface PaymentWithExecutions {
  id: string;
  paymentId: string;
  userAddress: string;
  recipient: string;
  amount: string;
  token: string;
  network: string;
  status: 'pending' | 'paid' | 'failed' | 'unknown';
  keeperhubExecutionId: string | null;
  transactionHash: string | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
  executions: Array<{
    id: string;
    keeperhubExecutionId: string;
    status: string;
    transactionHash: string | null;
    errorMessage: string | null;
    createdAt: Date;
  }>;
}

export class PaymentService {
  async createPayment(params: CreatePaymentParams): Promise<PaymentWithExecutions> {
    const paymentId = generatePaymentId();

    const newPayment: NewPayment = {
      paymentId,
      userAddress: params.userAddress.toLowerCase(),
      recipient: params.recipient.toLowerCase(),
      amount: params.amount,
      token: (params.token || ZERO_ADDRESS).toLowerCase(),
      network: params.network || 'base-sepolia',
      status: 'pending',
    };

    const [payment] = await db.insert(payments).values(newPayment).returning();

    return this.mapPaymentWithExecutions(payment, []);
  }

  async getPaymentById(paymentId: string): Promise<PaymentWithExecutions | null> {
    const [payment] = await db
      .select()
      .from(payments)
      .where(eq(payments.paymentId, paymentId))
      .limit(1);

    if (!payment) return null;

    const executions = await db
      .select()
      .from(paymentExecutions)
      .where(eq(paymentExecutions.paymentId, payment.id))
      .orderBy(desc(paymentExecutions.createdAt));

    return this.mapPaymentWithExecutions(payment, executions);
  }

  async getPaymentByInternalId(id: string): Promise<PaymentWithExecutions | null> {
    const [payment] = await db
      .select()
      .from(payments)
      .where(eq(payments.id, id))
      .limit(1);

    if (!payment) return null;

    const executions = await db
      .select()
      .from(paymentExecutions)
      .where(eq(paymentExecutions.paymentId, payment.id))
      .orderBy(desc(paymentExecutions.createdAt));

    return this.mapPaymentWithExecutions(payment, executions);
  }

  async getPaymentsByUser(userAddress: string): Promise<PaymentWithExecutions[]> {
    const userPayments = await db
      .select()
      .from(payments)
      .where(eq(payments.userAddress, userAddress.toLowerCase()))
      .orderBy(desc(payments.createdAt));

    const result: PaymentWithExecutions[] = [];
    for (const payment of userPayments) {
      const executions = await db
        .select()
        .from(paymentExecutions)
        .where(eq(paymentExecutions.paymentId, payment.id))
        .orderBy(desc(paymentExecutions.createdAt));

      result.push(this.mapPaymentWithExecutions(payment, executions));
    }

    return result;
  }

  async executePayment(paymentId: string): Promise<PaymentWithExecutions> {
    const payment = await this.getPaymentById(paymentId);
    if (!payment) {
      throw new Error('Payment not found');
    }

    if (payment.status === 'paid') {
      throw new Error('Payment already completed');
    }

    if (payment.status === 'pending' && payment.keeperhubExecutionId) {
      const status = await keeperHub.getExecutionStatus(payment.keeperhubExecutionId);
      
      if (status.status === 'completed' && status.receipts?.some(r => r.verified && r.receiptStatus === 'success')) {
        await this.updatePaymentStatus(payment.id, 'paid', status.transactionHash);
        return this.getPaymentById(paymentId) as Promise<PaymentWithExecutions>;
      }

      if (status.status === 'failed') {
        await this.updatePaymentStatus(payment.id, 'failed', null, status.receipts?.[0]?.hash || 'Execution failed');
      }

      if (status.status === 'unconfirmed' || status.status === 'running' || status.status === 'pending') {
        throw new Error('Payment execution still in progress');
      }
    }

    if (payment.status === 'unknown' && payment.keeperhubExecutionId) {
      const status = await keeperHub.getExecutionStatus(payment.keeperhubExecutionId);
      
      if (status.status === 'completed' && status.receipts?.some(r => r.verified && r.receiptStatus === 'success')) {
        await this.updatePaymentStatus(payment.id, 'paid', status.transactionHash);
        return this.getPaymentById(paymentId) as Promise<PaymentWithExecutions>;
      }

      if (status.status === 'failed') {
        await this.updatePaymentStatus(payment.id, 'failed', null, status.receipts?.[0]?.hash || 'Execution failed');
        throw new Error('Payment failed. Create a new payment to retry.');
      }

      if (status.status === 'unconfirmed' || status.status === 'running' || status.status === 'pending') {
        throw new Error('Payment execution still in progress');
      }
    }

    if (payment.status === 'failed') {
      throw new Error('Payment failed. Create a new payment to retry.');
    }

    // Evaluate policies before execution
    const policyCheck = await policyService.evaluateAll({
      amountWei: payment.amount,
      recipient: payment.recipient,
      chainId: BASE_SEPOLIA_CHAIN_ID,
      tokenAddress: payment.token,
    });
    if (!policyCheck.allowed) {
      throw new Error(`Policy violation: ${policyCheck.reason}`);
    }

    const isNative = payment.token.toLowerCase() === ZERO_ADDRESS.toLowerCase();
    const tokenAddress = isNative ? undefined : payment.token as `0x${string}`;

    const transferRequest: TransferRequest = {
      chainId: BASE_SEPOLIA_CHAIN_ID,
      recipientAddress: payment.recipient as `0x${string}`,
      amount: payment.amount,
      tokenAddress,
      gasLimitMultiplier: '1.2',
    };

    const executionId = payment.paymentId;
    const response = await keeperHub.executeTransfer(transferRequest, executionId);

    const newExecution: NewPaymentExecution = {
      paymentId: payment.id,
      keeperhubExecutionId: response.executionId,
      status: response.status,
      transactionHash: response.transactionHash || null,
      errorMessage: response.error || null,
      rawResponse: JSON.stringify(response),
    };

    await db.insert(paymentExecutions).values(newExecution);

    if (response.idempotentReplay) {
      return this.getPaymentById(paymentId) as Promise<PaymentWithExecutions>;
    }

    if (response.status === 'completed' && response.transactionHash) {
      await this.updatePaymentStatus(payment.id, 'paid', response.transactionHash, null, response.executionId);
    } else if (response.status === 'failed') {
      await this.updatePaymentStatus(payment.id, 'failed', null, response.error || 'Execution failed', response.executionId);
    } else if (response.status === 'unconfirmed') {
      await this.updatePaymentStatus(payment.id, 'unknown', null, null, response.executionId);
    }

    return this.getPaymentById(paymentId) as Promise<PaymentWithExecutions>;
  }

  async checkAndUpdatePaymentStatus(paymentId: string): Promise<PaymentWithExecutions> {
    const payment = await this.getPaymentById(paymentId);
    if (!payment) {
      throw new Error('Payment not found');
    }

    if (!payment.keeperhubExecutionId) {
      return payment;
    }

    if (payment.status === 'paid' || payment.status === 'failed') {
      return payment;
    }

    const status = await keeperHub.getExecutionStatus(payment.keeperhubExecutionId);

    if (status.status === 'completed' && status.receipts?.some(r => r.verified && r.receiptStatus === 'success')) {
      await this.updatePaymentStatus(payment.id, 'paid', status.transactionHash);
    } else if (status.status === 'failed') {
      await this.updatePaymentStatus(payment.id, 'failed', null, status.receipts?.[0]?.hash || 'Execution failed');
    } else if (status.status === 'unconfirmed' || status.status === 'running' || status.status === 'pending') {
      await this.updatePaymentStatus(payment.id, 'unknown');
    }

    return this.getPaymentById(paymentId) as Promise<PaymentWithExecutions>;
  }

  private async updatePaymentStatus(
    paymentInternalId: string,
    status: 'pending' | 'paid' | 'failed' | 'unknown',
    transactionHash: string | null = null,
    errorMessage: string | null = null,
    keeperhubExecutionId: string | null = null
  ): Promise<void> {
    await db
      .update(payments)
      .set({
        status,
        transactionHash,
        errorMessage,
        keeperhubExecutionId: keeperhubExecutionId || undefined,
        updatedAt: new Date(),
      })
      .where(eq(payments.id, paymentInternalId));
  }

  private mapPaymentWithExecutions(payment: typeof payments.$inferSelect, executions: typeof paymentExecutions.$inferSelect[]): PaymentWithExecutions {
    return {
      id: payment.id,
      paymentId: payment.paymentId,
      userAddress: payment.userAddress,
      recipient: payment.recipient,
      amount: payment.amount,
      token: payment.token,
      network: payment.network,
      status: payment.status,
      keeperhubExecutionId: payment.keeperhubExecutionId,
      transactionHash: payment.transactionHash,
      errorMessage: payment.errorMessage,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
      executions: executions.map(e => ({
        id: e.id,
        keeperhubExecutionId: e.keeperhubExecutionId,
        status: e.status,
        transactionHash: e.transactionHash,
        errorMessage: e.errorMessage,
        createdAt: e.createdAt,
      })),
    };
  }
}

export const paymentService = new PaymentService();