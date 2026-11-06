import { Suspense } from "react";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="mx-auto mt-16 max-w-sm px-4">
      <h1 className="text-3xl font-bold tracking-tight">
        Show<span className="text-accent">Tracker</span>
      </h1>
      <p className="mt-2 text-muted">
        Track what you&apos;re watching, see what your friends are into, and swap recommendations.
      </p>
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
