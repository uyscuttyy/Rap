import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { paymentService } from '@/lib/payment-service';

const createPaymentSchema = z.object({
  userAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address'),
  recipient: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address'),
  amount: z.string().regex(/^\d+$/, 'Amount must be a positive integer (wei)'),
  token: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid token address').optional(),
  network: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = createPaymentSchema.parse(body);

    const payment = await paymentService.createPayment({
      userAddress: validated.userAddress,
      recipient: validated.recipient,
      amount: validated.amount,
      token: validated.token,
      network: validated.network,
    });

    return NextResponse.json({
      paymentId: payment.paymentId,
      status: payment.status,
      recipient: payment.recipient,
      amount: payment.amount,
      token: payment.token,
      network: payment.network,
      createdAt: payment.createdAt.toISOString(),
    }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request', details: error.issues },
        { status: 400 }
      );
    }

    console.error('Create payment error:', error);
    return NextResponse.json(
      { error: 'Failed to create payment' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = request.nextUrl.searchParams.get('user');
    if (!user || !/^0x[a-fA-F0-9]{40}$/.test(user)) {
      return NextResponse.json(
        { error: 'Query param "user" must be a valid address' },
        { status: 400 }
      );
    }

    const payments = await paymentService.getPaymentsByUser(user);
    return NextResponse.json({
      payments: payments.map((p) => ({
        paymentId: p.paymentId,
        status: p.status,
        recipient: p.recipient,
        amount: p.amount,
        token: p.token,
        network: p.network,
        transactionHash: p.transactionHash,
        keeperhubExecutionId: p.keeperhubExecutionId,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('List payments error:', error);
    return NextResponse.json(
      { error: 'Failed to list payments' },
      { status: 500 }
    );
  }
}