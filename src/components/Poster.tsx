import { posterUrl } from "@/lib/images";

export function Poster({
  path,
  name,
  className = "w-16",
  size = "w185",
}: {
  path: string | null;
  name: string;
  className?: string;
  size?: "w185" | "w342" | "w500";
}) {
  const src = posterUrl(path, size);
  return (
    <div
      className={`${className} aspect-[2/3] shrink-0 overflow-hidden rounded-md bg-surface-2 ring-1 ring-border`}
    >
      {src ? (
        <img src={src} alt={`${name} poster`} loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full items-center justify-center p-1 text-center text-[10px] text-muted">
          {name}
        </div>
      )}
    </div>
  );
}
