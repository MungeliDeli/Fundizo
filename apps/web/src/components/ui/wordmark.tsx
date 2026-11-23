export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={`display tracking-[-0.03em] ${className ?? ''}`}>
      fundizo<span className="text-accent">.</span>
    </span>
  );
}
