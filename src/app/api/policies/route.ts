import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/db';
import { policies, type NewPolicy } from '@/db/policy-schema';

const createPolicySchema = z.object({
  name: z.string().min(1).max(64),
  type: z.enum(['max_amount', 'recipient_allowlist', 'chain_restriction']),
  config: z.string(), // JSON string
  enabled: z.boolean().optional().default(true),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = createPolicySchema.parse(body);

    // Validate JSON config
    try {
      JSON.parse(validated.config);
    } catch {
      return NextResponse.json(
        { error: 'Config must be valid JSON' },
        { status: 400 }
      );
    }

    const newPolicy: NewPolicy = {
      name: validated.name,
      type: validated.type,
      config: validated.config,
      enabled: validated.enabled,
    };

    const [policy] = await db.insert(policies).values(newPolicy).returning();

    return NextResponse.json(policy, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request', details: error.issues },
        { status: 400 }
      );
    }

    console.error('Create policy error:', error);
    return NextResponse.json(
      { error: 'Failed to create policy' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const allPolicies = await db.select().from(policies);
    return NextResponse.json({ policies: allPolicies });
  } catch (error) {
    console.error('List policies error:', error);
    return NextResponse.json(
      { error: 'Failed to list policies' },
      { status: 500 }
    );
  }
}