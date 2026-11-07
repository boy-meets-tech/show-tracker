import { acceptFriendRequest, addFriend, deleteFriendRequest } from "@/app/actions";

export type Relation = "friend" | "sent" | "received" | "none";

// The right button for someone, depending on where you stand with them.
export function PersonAction({
  meId,
  person,
  relation,
}: {
  meId: string;
  person: { id: string; username: string };
  relation: Relation;
}) {
  if (relation === "friend") {
    return <span className="text-xs text-muted">Friends ✓</span>;
  }
  if (relation === "received") {
    return (
      <form action={acceptFriendRequest.bind(null, person.id)}>
        <button className="btn-primary py-1.5">Accept</button>
      </form>
    );
  }
  if (relation === "sent") {
    return (
      <form action={deleteFriendRequest.bind(null, meId, person.id)}>
        <button className="btn-secondary py-1.5" title="Cancel request">
          Requested
        </button>
      </form>
    );
  }
  return (
    <form action={addFriend.bind(null, person.username)}>
      <button className="btn-primary py-1.5">Add friend</button>
    </form>
  );
}
