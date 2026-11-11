"use client";

import { useState, useTransition } from "react";
import { addWhoToldMe, inviteWhoToldMe, removeWhoToldMe, type ToldResult } from "@/app/actions";
import { track } from "@/lib/analytics";
import { Avatar } from "./Avatar";

type FriendSource = { id: string; display_name: string; avatar_url: string | null };
type OutsideSource = { id: number; name: string };

// "Who told you about it?" Save recommendations that happened in a text or
// over dinner. Friends get the credit; anyone else can be invited to get it.
export function WhoToldYou({
  titleId,
  titleName,
  friendNames,
  fromFriends,
  outside,
}: {
  titleId: string;
  titleName: string;
  friendNames: string[];
  fromFriends: FriendSource[];
  outside: OutsideSource[];
}) {
  const [name, setName] = useState("");
  const [result, setResult] = useState<ToldResult | null>(null);
  const [busy, start] = useTransition();
  const hasAny = fromFriends.length + outside.length > 0;

  function add() {
    if (!name.trim()) return;
    start(async () => {
      const r = await addWhoToldMe(titleId, name);
      setResult(r);
      if (!r.error) {
        track("told_me_added", { friend: !r.outside });
        setName("");
      }
    });
  }

  return (
    <div className="space-y-3">
      {hasAny ? (
        <div className="flex flex-wrap gap-2">
          {fromFriends.map((f) => (
            <span key={f.id} className="flex items-center gap-1.5 rounded-full bg-accent-soft py-1 pr-3 pl-1 text-sm">
              <Avatar name={f.display_name} url={f.avatar_url} size={22} />
              <span className="ph-mask">{f.display_name}</span>
            </span>
          ))}
          {outside.map((o) => (
            <OutsideChip key={o.id} source={o} titleName={titleName} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted">
          Heard about it in a text, at work or over dinner? Save who told you, so you remember
          and they get the credit.
        </p>
      )}

      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          list={`told-${titleId}`}
          maxLength={60}
          placeholder={hasAny ? "Someone else?" : "Who? A friend, Mom, Dave…"}
          aria-label="Who told you about it?"
          className="input"
        />
        <datalist id={`told-${titleId}`}>
          {friendNames.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
        <button type="button" onClick={add} disabled={busy || !name.trim()} className="btn-primary shrink-0">
          {busy ? "Saving…" : "Add"}
        </button>
      </div>

      {result?.error ? <p className="text-sm text-red-500">{result.error}</p> : null}
      {result?.outside ? (
        <InvitePrompt source={result.outside} titleName={titleName} onDone={() => setResult(null)} />
      ) : result?.ok ? (
        <p className="text-sm text-green-600">{result.ok}</p>
      ) : null}
    </div>
  );
}

function OutsideChip({ source, titleName }: { source: OutsideSource; titleName: string }) {
  const [inviting, setInviting] = useState(false);
  const [busy, start] = useTransition();
  return (
    <>
      <span className="flex items-center gap-1.5 rounded-full border border-border py-1 pr-2 pl-1 text-sm">
        <Avatar name={source.name} url={null} size={22} />
        <span className="ph-mask">{source.name}</span>
        <button
          type="button"
          onClick={() => setInviting((v) => !v)}
          className="text-xs text-accent underline"
        >
          Invite
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => start(() => removeWhoToldMe(source.id))}
          aria-label={`Remove ${source.name}`}
          className="px-1 text-muted hover:text-foreground"
        >
          ×
        </button>
      </span>
      {inviting ? (
        <div className="w-full">
          <InvitePrompt source={source} titleName={titleName} onDone={() => setInviting(false)} />
        </div>
      ) : null}
    </>
  );
}

// Text the person a link: when they join, they get credit for the recommendation.
function InvitePrompt({
  source,
  titleName,
  onDone,
}: {
  source: OutsideSource;
  titleName: string;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok?: string; error?: string } | null>(null);

  async function invite() {
    setBusy(true);
    setStatus(null);
    try {
      const { code, error } = await inviteWhoToldMe(source.id);
      if (!code) {
        setStatus({ error: error ?? "Couldn't create the link." });
        return;
      }
      const url = `${window.location.origin}/invite/${code}`;
      const text = `${source.name}! You told me to watch ${titleName}, so it's on my list. I'm keeping track on Show Tracker. Join me so you get the credit when I watch it: ${url}`;
      track("told_me_invite_shared");
      let copied = false;
      try {
        await navigator.clipboard.writeText(text);
        copied = true;
      } catch {
        // Clipboard blocked: the share sheet below still works.
      }
      if (navigator.share) {
        try {
          await navigator.share({ text });
        } catch {
          // Share sheet closed: the text is already copied.
        }
      }
      setStatus({ ok: copied ? "Link copied. Send it to them." : `Send them this link: ${url}` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg bg-surface-2 p-3 text-sm">
      <p>
        <span className="ph-mask font-medium">{source.name}</span> isn&apos;t on Show Tracker.
        Invite them so they see you took their advice and get the credit.
      </p>
      <div className="mt-2 flex items-center gap-3">
        <button type="button" onClick={invite} disabled={busy} className="btn-secondary py-1.5">
          {busy ? "Making link…" : <>Invite <span className="ph-mask">{source.name}</span></>}
        </button>
        <button type="button" onClick={onDone} className="text-xs text-muted underline">
          Not now
        </button>
      </div>
      {status?.ok ? <p className="mt-2 break-words text-green-600">{status.ok}</p> : null}
      {status?.error ? <p className="mt-2 text-red-500">{status.error}</p> : null}
    </div>
  );
}
