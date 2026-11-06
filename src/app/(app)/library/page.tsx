import { Suspense } from "react";
import Link from "next/link";
import { Empty, PageTitle, Skeleton } from "@/components/Section";
import { Library } from "@/components/Library";
import { getMe } from "@/lib/auth";

export const metadata = { title: "Library" };

export default function LibraryPage() {
  return (
    <>
      <PageTitle sub="Everything you've logged.">Your library</PageTitle>
      <Suspense fallback={<Skeleton rows={6} />}>
        <MyLibrary />
      </Suspense>
    </>
  );
}

async function MyLibrary() {
  const me = await getMe();
  return (
    <Library
      userId={me.id}
      empty={
        <Empty>
          Nothing here yet. <Link href="/search" className="text-accent underline">Search</Link> for
          something you&apos;re watching.
        </Empty>
      }
    />
  );
}
