import Link from "next/link";
import { STATUS_VERB, timeAgo } from "@/lib/labels";
import type { ActivityRow } from "@/lib/types";
import { Avatar } from "./Avatar";
import { Poster } from "./Poster";

export function ActivityItem({ item, showUser = true }: { item: ActivityRow; showUser?: boolean }) {
  const who = item.profiles;
  const title = item.titles;
  const verb =
    item.kind === "rating" ? "rated" : item.status ? STATUS_VERB[item.status] : "updated";

  return (
    <li className="flex gap-3 py-3">
      {showUser ? (
        <Link href={`/u/${who.username}`} className="pt-0.5">
          <Avatar name={who.display_name} url={who.avatar_url} size={36} />
        </Link>
      ) : null}
      <div className="min-w-0 flex-1 text-sm">
        <p>
          {showUser ? (
            <Link href={`/u/${who.username}`} className="font-semibold hover:underline">
              {who.display_name}
            </Link>
          ) : (
            <span className="font-semibold">You</span>
          )}{" "}
          <span className="text-muted">{verb}</span>{" "}
          <Link href={`/title/${title.id}`} className="font-medium hover:underline">
            {title.name}
          </Link>
          {item.kind === "rating" && item.rating ? (
            <>
              {" "}
              <span className="whitespace-nowrap font-semibold text-accent">{item.rating}/10</span>
            </>
          ) : null}
        </p>
        <p className="mt-0.5 text-xs text-muted">
          {title.media_type === "tv" ? "TV" : "Movie"}
          {title.year ? ` · ${title.year}` : ""} · {timeAgo(item.created_at)}
        </p>
      </div>
      <Link href={`/title/${title.id}`}>
        <Poster path={title.poster_path} name={title.name} className="w-10" />
      </Link>
    </li>
  );
}
