import { PushSettings } from "@/components/PushSettings";
export default function P() {
  return <main className="mx-auto max-w-3xl px-4 pt-6"><PushSettings publicKey={null} settings={{ friend_requests: true, recommendations: true, friend_activity: false, friend_loved: true }} /></main>;
}
