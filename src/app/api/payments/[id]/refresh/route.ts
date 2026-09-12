import { NextRequest, NextResponse } from 'next/server';
import { paymentService } from '@/lib/payment-service';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const payment = await paymentService.checkAndUpdatePaymentStatus(id);

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
      updatedAt: payment.updatedAt.toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to refresh payment';
    if (message === 'Payment not found') {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    console.error('Refresh payment error:', error);
    return NextResponse.json({ error: 'Failed to refresh payment' }, { status: 500 });
  }
}
