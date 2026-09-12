import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function Home() {
  return (
    <div>
      <section className="mx-auto max-w-3xl px-6 pt-24 pb-16 text-center">
        <p className="text-sm font-medium text-gray-500">Reliable Agent Payments</p>
        <h1 className="mt-4 text-5xl font-semibold tracking-tight">
          Your agent can retry. You should not pay twice.
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-lg text-gray-600">
          Payments fail in ambiguous ways: timeouts, crashes, lost responses.
          The dangerous answer is send it again. RAP gives every payment an
          identity, so a retry can never become a second charge.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Button variant="pill" size="lg" asChild>
            <Link href="/pay">Start with RAP</Link>
          </Button>
          <Button variant="pillOutline" size="lg" asChild>
            <Link href="/api-docs">Integrate RAP</Link>
          </Button>
        </div>
      </section>

      <section className="w-full bg-gray-50">
        <div className="mx-auto max-w-3xl px-6 py-16">
          <h2 className="text-center text-2xl font-semibold tracking-tight">The problem</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-gray-200 bg-white p-6">
              <p className="font-medium">Your agent sends a payment.</p>
              <p className="mt-2 text-sm text-gray-600">The request times out. The app crashes. The connection drops.</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-6">
              <p className="font-medium">The response disappears.</p>
              <p className="mt-2 text-sm text-gray-600">Did it go through? The chain may have the transaction, or it may not.</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-6">
              <p className="font-medium">Retry blindly, pay twice.</p>
              <p className="mt-2 text-sm text-gray-600">Sending again without knowing is how users get charged two times.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-6 py-16">
        <h2 className="text-center text-2xl font-semibold tracking-tight">How RAP solves it</h2>
        <ol className="mx-auto mt-8 max-w-xl space-y-4 text-left">
          <li className="flex gap-4">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-black text-xs font-semibold text-white">1</span>
            <p className="text-gray-700"><span className="font-medium text-black">Create a payment.</span> RAP assigns it a unique payment ID, its identity for life.</p>
          </li>
          <li className="flex gap-4">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-black text-xs font-semibold text-white">2</span>
            <p className="text-gray-700"><span className="font-medium text-black">KeeperHub executes it once.</span> The payment ID travels as the idempotency key, so the network itself refuses duplicates.</p>
          </li>
          <li className="flex gap-4">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-black text-xs font-semibold text-white">3</span>
            <p className="text-gray-700"><span className="font-medium text-black">Retry safely.</span> Already paid returns the original transaction. Still checking waits. Genuinely failed needs a new payment.</p>
          </li>
        </ol>
        <div className="mt-10 text-center">
          <Button variant="pill" size="lg" asChild>
            <Link href="/api-docs">API Docs</Link>
          </Button>
        </div>
      </section>

      <section className="w-full bg-gray-950 text-white">
        <div className="mx-auto max-w-3xl px-6 py-16 text-center">
          <h2 className="text-2xl font-semibold tracking-tight">One payment identity. Never two charges.</h2>
          <p className="mx-auto mt-4 max-w-xl text-gray-400">
            Real execution through KeeperHub on Base Sepolia, verified onchain before any payment is marked paid.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Button variant="pillOutline" size="lg" className="border-gray-700 bg-transparent text-white hover:bg-gray-900" asChild>
              <Link href="/pay">Open the Pay Desk</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
