import { acceptFriendRequest, addFriend, deleteFriendRequest } from "@/app/actions";
import { SubmitButton } from "./SubmitButton";

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
        <SubmitButton className="btn-primary py-1.5">Accept</SubmitButton>
      </form>
    );
  }
  if (relation === "sent") {
    return (
      <form action={deleteFriendRequest.bind(null, meId, person.id)}>
        <SubmitButton className="btn-secondary py-1.5" title="Cancel request">
          Requested
        </SubmitButton>
      </form>
    );
  }
  return (
    <form action={addFriend.bind(null, person.username)}>
      <SubmitButton className="btn-primary py-1.5" pendingText="Adding…">Add friend</SubmitButton>
    </form>
  );
}
