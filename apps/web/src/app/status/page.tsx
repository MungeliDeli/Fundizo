import type { Metadata } from 'next';
import { StatusPanel } from '@/features/status/status-panel';

export const metadata: Metadata = { title: 'System status' };

export default function StatusPage() {
  return (
    <div className="container-page flex flex-col gap-6 py-10 md:py-16">
      <div className="flex flex-col gap-2">
        <h1 className="display m-0 text-3xl md:text-4xl">System status</h1>
        <p className="m-0 max-w-prose text-ink-2">
          Whether Fundizo’s services are reachable right now. This page checks again every 10
          seconds.
        </p>
      </div>
      <StatusPanel />
    </div>
  );
}
