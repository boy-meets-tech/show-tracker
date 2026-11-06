import Link from "next/link";
import { Poster } from "./Poster";

export function TitleRow({
  id,
  name,
  posterPath,
  year,
  mediaType,
  children,
}: {
  id: string;
  name: string;
  posterPath: string | null;
  year: number | null;
  mediaType: string;
  children?: React.ReactNode;
}) {
  return (
    <Link
      href={`/title/${id}`}
      className="flex gap-3 rounded-lg p-2 transition hover:bg-surface-2"
    >
      <Poster path={posterPath} name={name} className="w-12" />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{name}</div>
        <div className="text-xs text-muted">
          {mediaType === "tv" ? "TV" : "Movie"}
          {year ? ` · ${year}` : ""}
        </div>
        {children}
      </div>
    </Link>
  );
}
