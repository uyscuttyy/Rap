import Link from 'next/link';
import { Button } from '@/components/ui/button';

function Code({ children, lang = 'bash' }: { children: string; lang?: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg bg-gray-950 p-4 font-mono text-xs leading-relaxed text-gray-100">
      <code className={`language-${lang}`}>{children}</code>
    </pre>
  );
}

export default function ApiDocsPage() {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-10 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">RAP API</h1>
        <p className="mt-2 text-center text-gray-600 max-w-xl mx-auto">
          The same payment engine the Pay Desk uses, available to any agent or application.
        </p>
      </header>

      <section className="mb-10 rounded-lg bg-gray-950 p-6 text-white">
        <h2 className="text-lg font-semibold">Core idea</h2>
        <p className="mt-2 text-sm text-gray-300">
          Create a payment and receive a payment ID. Execute it. Store the payment ID.
          If a request times out, check the same payment ID instead of creating a new payment.
          Never blindly create another payment, or the user may pay twice.
        </p>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-gray-300">
          <li>Create payment, receive payment ID</li>
          <li>Execute the payment through KeeperHub</li>
          <li>Store the payment ID durably</li>
          <li>On timeout or crash, check the same payment ID</li>
          <li>Only create a new payment for genuinely new work</li>
        </ol>
      </section>

      <div className="space-y-6">
        <section className="rounded-lg border border-gray-200 bg-white p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">1. Create a payment</h2>
            <span className="text-xs font-mono text-gray-500">POST /api/payments</span>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            Creates a payment intent and returns its unique payment ID. Amount is in wei as a decimal string.
          </p>
          <Code>{`curl -X POST ${base}/api/payments \\
  -H "Content-Type: application/json" \\
  -d '{
    "userAddress": "0xYourAddress...",
    "recipient": "0xRecipient...",
    "amount": "1000000000000000"
  }'`}</Code>
          <p className="mt-3 text-sm text-gray-600">
            Response (201):
          </p>
          <Code>{`{
  "paymentId": "rap_9f2c...",
  "status": "pending",
  "recipient": "0xRecipient...",
  "amount": "1000000000000000",
  "token": "0x0000000000000000000000000000000000000000",
  "network": "base-sepolia",
  "createdAt": "2026-09-11T15:00:00.000Z"
}`}</Code>
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">2. Execute the payment</h2>
            <span className="text-xs font-mono text-gray-500">POST /api/payments/:id/pay</span>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            Attempts to execute the payment through KeeperHub. Before executing, RAP checks whether
            this payment already succeeded or is still unresolved. Only a genuinely eligible payment
            reaches KeeperHub. The payment ID is sent as the idempotency key, so KeeperHub itself
            refuses a duplicate broadcast.
          </p>
          <Code>{`curl -X POST ${base}/api/payments/rap_9f2c.../pay`}</Code>
          <p className="mt-3 text-sm text-gray-600">
            Response:
          </p>
          <Code>{`{
  "paymentId": "rap_9f2c...",
  "status": "paid",
  "recipient": "0xRecipient...",
  "amount": "1000000000000000",
  "token": "0x0000000000000000000000000000000000000000",
  "network": "base-sepolia",
  "transactionHash": "0x...",
  "keeperhubExecutionId": "rap_9f2c...",
  "updatedAt": "2026-09-11T15:01:00.000Z"
}`}</Code>
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">3. Check payment status</h2>
            <span className="text-xs font-mono text-gray-500">GET /api/payments/:id</span>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            Returns the current state with execution info. Possible statuses:
            <code className="font-mono bg-gray-100 px-1 rounded">pending</code>,
            <code className="font-mono bg-gray-100 px-1 rounded">paid</code>,
            <code className="font-mono bg-gray-100 px-1 rounded">failed</code>,
            <code className="font-mono bg-gray-100 px-1 rounded">unknown</code>.
            Unknown means execution started but the result is not confirmed — keep checking, do not send again.
          </p>
          <Code>{`curl ${base}/api/payments/rap_9f2c...`}</Code>
          <p className="mt-3 text-sm text-gray-600">
            A refresh endpoint re-reads KeeperHub state:
          </p>
          <Code>{`curl -X POST ${base}/api/payments/rap_9f2c.../refresh`}</Code>
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">4. List payments</h2>
            <span className="text-xs font-mono text-gray-500">GET /api/payments?user=0x...</span>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            Lists all payments for a given wallet address.
          </p>
          <Code>{`curl "${base}/api/payments?user=0xYourAddress..."`}</Code>
          <p className="mt-3 text-sm text-gray-600">
            Response:
          </p>
          <Code>{`{
  "payments": [
    {
      "paymentId": "rap_9f2c...",
      "status": "paid",
      "recipient": "0xRecipient...",
      "amount": "1000000000000000",
      "token": "0x0000000000000000000000000000000000000000",
      "network": "base-sepolia",
      "transactionHash": "0x...",
      "keeperhubExecutionId": "rap_9f2c...",
      "createdAt": "2026-09-11T15:00:00.000Z",
      "updatedAt": "2026-09-11T15:01:00.000Z"
    }
  ]
}`}</Code>
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">5. Manage policies</h2>
            <span className="text-xs font-mono text-gray-500">POST /api/policies | GET /api/policies</span>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            Configure execution policies (max amount, recipient allowlist, chain restriction).
          </p>
          <Code>{`# Max amount: 0.1 ETH
curl -X POST ${base}/api/policies \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "daily-limit",
    "type": "max_amount",
    "config": "{\"maxAmountWei\": \"100000000000000000\"}",
    "enabled": true
  }'

# Recipient allowlist
curl -X POST ${base}/api/policies \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "approved-recipients",
    "type": "recipient_allowlist",
    "config": "{\"recipients\": [\"0xApproved1...\", \"0xApproved2...\"]}",
    "enabled": true
  }'`}</Code>
        </section>

        <section className="rounded-lg bg-gray-950 p-6 text-white">
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