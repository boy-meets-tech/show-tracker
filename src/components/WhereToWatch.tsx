import Link from "next/link";
import { countryName } from "@/lib/country";
import { getWatchOptions, type Provider, type WatchOptions } from "@/lib/tmdb";
import { myWatchSetup } from "@/lib/watch";
import { Card } from "./Section";

// Streaming, free and rent/buy options for a title in the viewer's country.
export async function WhereToWatch({ titleId }: { titleId: string }) {
  const { country, services } = await myWatchSetup();
  const options = await getWatchOptions(titleId, country);
  return <WatchOptionsView options={options} place={countryName(country)} mine={services} />;
}

export function WatchOptionsView({
  options,
  place,
  mine = [],
}: {
  options: WatchOptions | null;
  place: string;
  mine?: number[];
}) {
  const yours = new Set(mine);
  const included = options ? [...options.stream, ...options.free].filter((p) => yours.has(p.id)) : [];
  const groups: [string, Provider[]][] = options
    ? [
        ["Stream", options.stream],
        ["Free", options.free],
        ["Rent or buy", options.rentOrBuy],
      ]
    : [];
  const any = groups.some(([, list]) => list.length > 0);

  return (
    <Card
      title={
        <span className="flex items-baseline justify-between gap-2">
          Where to watch
          <Link href="/settings#country" className="text-xs font-normal text-muted underline">
            {place}
          </Link>
        </span>
      }
    >
      {!options ? (
        <p className="text-sm text-muted">Streaming info isn&apos;t available right now.</p>
      ) : !any ? (
        <p className="text-sm text-muted">Not available to stream, rent or buy in {place} right now.</p>
      ) : (
        <div className="space-y-4">
          {included.length ? (
            <p className="rounded-lg bg-accent-soft px-3 py-2 text-sm font-medium text-accent">
              ✓ Included with your {included.map((p) => p.name).join(", ")}
            </p>
          ) : mine.length === 0 ? (
            <p className="text-xs text-muted">
              <Link href="/settings#services" className="underline">
                Pick your services
              </Link>{" "}
              to see at a glance what you can watch.
            </p>
          ) : null}
          {groups.map(([label, list]) =>
            list.length ? (
              <div key={label}>
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">{label}</h3>
                <ul className="flex flex-wrap gap-3">
                  {list.map((p) => (
                    <li key={p.id}>
                      <a
                        href={options.link ?? undefined}
                        target="_blank"
                        rel="noreferrer"
                        className="flex w-16 flex-col items-center gap-1 text-center"
                        title={`${p.name}: see all options`}
                      >
                        {p.logoPath ? (
                          <img
                            src={`https://image.tmdb.org/t/p/w92${p.logoPath}`}
                            alt=""
                            loading="lazy"
                            className={`h-12 w-12 rounded-xl ${yours.has(p.id) ? "ring-2 ring-accent" : "ring-1 ring-border"}`}
                          />
                        ) : (
                          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface-2 text-xs">
                            {p.name.slice(0, 2)}
                          </span>
                        )}
                        <span className="line-clamp-2 text-[11px] leading-tight">{p.name}</span>
                        {yours.has(p.id) && label !== "Rent or buy" ? (
                          <span className="text-[10px] font-semibold text-accent">Yours</span>
                        ) : null}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null
          )}
        </div>
      )}
      <p className="mt-4 text-[11px] text-muted">
        Streaming data from{" "}
        <a href="https://www.justwatch.com" target="_blank" rel="noreferrer" className="underline">
          JustWatch
        </a>
        . Availability can change daily.
      </p>
    </Card>
  );
}
