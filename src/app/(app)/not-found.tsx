import Link from "next/link";

export default function NotFound() {
  return (
    <div className="py-16 text-center">
      <h1 className="text-xl font-bold">Not found</h1>
      <p className="mt-2 text-sm text-muted">We couldn&apos;t find that page.</p>
      <Link href="/" className="btn-secondary mt-6">
        Back to your feed
      </Link>
    </div>
  );
}
