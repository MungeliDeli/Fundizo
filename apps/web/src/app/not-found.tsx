import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="container-page flex flex-col gap-4 py-20">
      <h1 className="display m-0 text-3xl md:text-4xl">We couldn’t find that page</h1>
      <p className="m-0 text-ink-2">The link may be wrong, or the page may have moved.</p>
      <Link
        href="/"
        className="inline-flex h-12 items-center self-start rounded-control bg-ink px-5 font-semibold text-ground no-underline"
      >
        Back home
      </Link>
    </div>
  );
}
