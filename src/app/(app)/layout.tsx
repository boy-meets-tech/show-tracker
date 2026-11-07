import { Nav } from "@/components/Nav";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <Nav />
      <main className="mx-auto max-w-3xl px-4 pt-6 pb-[calc(7rem+env(safe-area-inset-bottom))] sm:pb-12">{children}</main>
    </>
  );
}
