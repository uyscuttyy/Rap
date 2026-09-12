import { NextRequest, NextResponse } from 'next/server';
import { paymentService } from '@/lib/payment-service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const payment = await paymentService.getPaymentById(id);

    if (!payment) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
    }

    return NextResponse.json({
      paymentId: payment.paymentId,
      status: payment.status,
      recipient: payment.recipient,
      amount: payment.amount,
      token: payment.token,
      network: payment.network,
      transactionHash: payment.transactionHash,
      keeperhubExecutionId: payment.keeperhubExecutionId,
      errorMessage: payment.errorMessage,
      createdAt: payment.createdAt.toISOString(),
      updatedAt: payment.updatedAt.toISOString(),
      executions: payment.executions.map(e => ({
        keeperhubExecutionId: e.keeperhubExecutionId,
        status: e.status,
        transactionHash: e.transactionHash,
        errorMessage: e.errorMessage,
        createdAt: e.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('Get payment error:', error);
    return NextResponse.json(
      { error: 'Failed to get payment' },
      { status: 500 }
    );
  }
}