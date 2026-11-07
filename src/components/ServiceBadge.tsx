// "On Netflix" tag for a title that's included with one of your services.
export function ServiceBadge({ names }: { names?: string[] }) {
  if (!names?.length) return null;
  const label = names.length > 1 ? `${names[0]} +${names.length - 1}` : names[0];
  return (
    <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent">
      <svg viewBox="0 0 24 24" className="h-3 w-3" fill="currentColor" aria-hidden>
        <path d="M8 5v14l11-7z" />
      </svg>
      On {label}
    </span>
  );
}
