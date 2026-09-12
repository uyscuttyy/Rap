import Link from 'next/link';
import { Button } from '@/components/ui/button';

function Code({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg bg-gray-950 p-4 font-mono text-xs leading-relaxed text-gray-100">
      {children}
    </pre>
  );
}

export default function ApiDocsPage() {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-center text-3xl font-semibold tracking-tight">RAP API</h1>
      <p className="mt-2 text-center text-gray-600">
        The same payment engine the Pay Desk uses, available to any agent or application.
      </p>

      <div className="mt-10 space-y-4">
        <section className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="text-lg font-semibold">Core idea</h2>
          <p className="mt-2 text-sm text-gray-600">
            Create a payment and receive a payment ID. Execute it. Store the payment ID.
            If a request times out, check the same payment ID instead of creating a new payment.
            Never blindly create another payment, or the user may pay twice.
          </p>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-gray-700">
            <li>Create payment, receive payment ID</li>
            <li>Execute the payment through KeeperHub</li>
            <li>Store the payment ID durably</li>
            <li>On timeout or crash, check the same payment ID</li>
            <li>Only create a new payment for genuinely new work</li>
          </ol>
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="text-lg font-semibold">1. Create a payment</h2>
          <p className="mt-2 font-mono text-xs text-gray-500">POST /api/payments</p>
          <div className="mt-3">
            <Code>{`POST ${base}/api/payments
Content-Type: application/json

{
  "userAddress": "0xYourAddress...",
  "recipient": "0xRecipient...",
  "amount": "1000000000000000"
}`}</Code>
          </div>
          <p className="mt-3 text-sm text-gray-600">
            Amount is in wei as a decimal string. Returns 201 with the new payment ID and status pending.
          </p>
          <div className="mt-3">
            <Code>{`{
  "paymentId": "rap_9f2c...",
  "status": "pending",
  "recipient": "0xRecipient...",
  "amount": "1000000000000000",
  "token": "0x0000000000000000000000000000000000000000",
  "network": "base-sepolia",
  "createdAt": "2026-09-11T15:00:00.000Z"
}`}</Code>
          </div>
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="text-lg font-semibold">2. Execute the payment</h2>
          <p className="mt-2 font-mono text-xs text-gray-500">POST /api/payments/:id/pay</p>
          <div className="mt-3">
            <Code>{`POST ${base}/api/payments/rap_9f2c.../pay`}</Code>
          </div>
          <p className="mt-3 text-sm text-gray-600">
            Before executing, RAP checks whether this payment already succeeded or is still
            unresolved. Only a genuinely eligible payment reaches KeeperHub. The payment ID is
            sent as the idempotency key, so KeeperHub itself refuses a duplicate broadcast.
          </p>
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="text-lg font-semibold">3. Check payment status</h2>
          <p className="mt-2 font-mono text-xs text-gray-500">GET /api/payments/:id</p>
          <div className="mt-3">
            <Code>{`GET ${base}/api/payments/rap_9f2c...`}</Code>
          </div>
          <p className="mt-3 text-sm text-gray-600">
            Returns the current state with execution info. Possible statuses: pending, paid,
            failed, unknown. Unknown means execution started but the result is not confirmed,
            keep checking, do not send again. A refresh endpoint re-reads KeeperHub state:
          </p>
          <p className="mt-2 font-mono text-xs text-gray-500">POST /api/payments/:id/refresh</p>
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="text-lg font-semibold">4. List payments</h2>
          <p className="mt-2 font-mono text-xs text-gray-500">GET /api/payments?user=0x...</p>
          <div className="mt-3">
            <Code>{`GET ${base}/api/payments?user=0xYourAddress...`}</Code>
          </div>
        </section>

        <section className="w-full rounded-lg bg-gray-950 p-6 text-white">
          <h2 className="text-lg font-semibold">Safe retry behavior</h2>
          <ul className="mt-3 space-y-2 text-sm text-gray-300">
            <li>Already paid, retry returns the original transaction. No new transaction is broadcast.</li>
            <li>Still checking, retry waits. No second transaction is sent while the first is unresolved.</li>
            <li>Genuinely failed, retry is rejected. Create a new payment with a new identity.</li>
            <li>These rules are enforced server-side. A client calling the API directly cannot bypass them.</li>
          </ul>
          <p className="mt-4 text-sm text-gray-300">
            When a request times out, the safe pattern is: GET the same payment ID, then decide.
            The payment ID you stored before the first attempt is the key to the whole protocol.
          </p>
          <div className="mt-6">
            <Button variant="pillOutline" className="border-gray-700 bg-transparent text-white hover:bg-gray-900" asChild>
              <Link href="/pay">Try it in the Pay Desk</Link>
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
