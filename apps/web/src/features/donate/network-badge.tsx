import type { PayNetwork } from '@fundizo/shared';
import { cn } from '@/lib/cn';

export const NETWORK_LABEL: Record<PayNetwork, string> = {
  MTN: 'MTN MoMo',
  AIRTEL: 'Airtel Money',
};

/** Text badges in each network's colours (not their logos). */
export function NetworkBadge({ network, className }: { network: PayNetwork; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-7 shrink-0 items-center rounded-md px-2 text-xs font-bold',
        network === 'MTN' ? 'bg-[#FFCB05] text-[#1A1A1A]' : 'bg-[#E40000] text-white',
        className,
      )}
    >
      {network === 'MTN' ? 'MTN' : 'Airtel'}
    </span>
  );
}
