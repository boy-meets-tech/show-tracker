"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useRef, useState, useSyncExternalStore } from "react";

const LINKS = [
  { href: "/", label: "Feed", icon: "M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" },
  { href: "/search", label: "Search", icon: "M11 4a7 7 0 1 0 4.2 12.6L20 21.4 21.4 20l-4.8-4.8A7 7 0 0 0 11 4z" },
  { href: "/library", label: "Library", icon: "M4 4h4v16H4zM10 4h4v16h-4zM16 5l3.8-1 3 15.4-3.8 1z" },
  { href: "/recs", label: "For you", icon: "M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z" },
  { href: "/friends", label: "Friends", icon: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm7 0a3 3 0 1 0 0-6M2 21c0-4 3-6 7-6s7 2 7 6M17 15c3 0 5 2 5 5" },
];

// True while the on-screen keyboard is up: a text box has focus and the
// visible area has shrunk. iPhone Safari otherwise floats the fixed tab bar
// up into the middle of the page while typing and scrolling.
function subscribeKeyboard(onChange: () => void) {
  const vv = window.visualViewport;
  vv?.addEventListener("resize", onChange);
  window.addEventListener("focusin", onChange);
  window.addEventListener("focusout", onChange);
  return () => {
    vv?.removeEventListener("resize", onChange);
    window.removeEventListener("focusin", onChange);
    window.removeEventListener("focusout", onChange);
  };
}

function keyboardOpen() {
  const el = document.activeElement;
  const typing =
    el instanceof HTMLTextAreaElement ||
    (el instanceof HTMLInputElement && !["button", "checkbox", "radio", "submit"].includes(el.type));
  const vv = window.visualViewport;
  return typing && !!vv && vv.height < window.innerHeight - 120;
}

function useKeyboardOpen() {
  return useSyncExternalStore(subscribeKeyboard, keyboardOpen, () => false);
}

// After the keyboard closes, iPhone sometimes leaves the page's bottom edge
// where the top of the keyboard was, so a bar pinned to "bottom: 0" floats
// mid-screen. Measure where the bar really sits against the bottom of what's
// visible, and move it down by the difference.
function useStickToBottom(ref: React.RefObject<HTMLElement | null>) {
  const [gap, setGap] = useState(0);
  useEffect(() => {
    let current = 0;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const el = ref.current;
        const vv = window.visualViewport;
        if (!el || !vv || el.getClientRects().length === 0) return; // hidden
        const naturalBottom = el.getBoundingClientRect().bottom - current;
        const visibleBottom = vv.offsetTop + vv.height;
        const next = Math.round(visibleBottom - naturalBottom);
        // Only move down onto the real bottom; ignore tiny rounding.
        const clamped = next > 2 ? Math.min(next, 600) : 0;
        if (clamped !== current) {
          current = clamped;
          setGap(clamped);
        }
      });
    };
    // Also nudge iPhone into recalculating once the keyboard has gone.
    const afterKeyboard = () =>
      setTimeout(() => {
        window.scrollTo(window.scrollX, window.scrollY);
        measure();
      }, 300);
    // Only re-check when the screen size changes (keyboard opening or
    // closing), never while scrolling: iPhone's bounce at the end of a page
    // briefly moves everything and would make the bar jump.
    const vv = window.visualViewport;
    vv?.addEventListener("resize", measure);
    window.addEventListener("resize", measure);
    window.addEventListener("focusout", afterKeyboard);
    measure();
    return () => {
      cancelAnimationFrame(frame);
      vv?.removeEventListener("resize", measure);
      window.removeEventListener("resize", measure);
      window.removeEventListener("focusout", afterKeyboard);
    };
  }, [ref]);
  return gap;
}

export function Nav() {
  // The current path is only known at request time, so the highlighted tab
  // streams in; the prerendered shell shows the nav without a highlight.
  return (
    <Suspense fallback={<NavView pathname={null} />}>
      <NavWithPath />
    </Suspense>
  );
}

function NavWithPath() {
  return <NavView pathname={usePathname()} />;
}

function NavView({ pathname }: { pathname: string | null }) {
  const hideTabs = useKeyboardOpen();
  const tabsRef = useRef<HTMLElement>(null);
  const gap = useStickToBottom(tabsRef);
  const isActive = (href: string) =>
    pathname !== null && (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-border bg-background/85 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-6 px-[max(1rem,env(safe-area-inset-left))]">
          <Link href="/" className="text-lg font-bold tracking-tight">
            Show<span className="text-accent">Tracker</span>
          </Link>
          <nav className="hidden gap-1 sm:flex">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-md px-3 py-1.5 text-sm ${
                  isActive(l.href) ? "bg-surface-2 font-medium" : "text-muted hover:text-foreground"
                }`}
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <Link
            href="/settings"
            className={`ml-auto text-sm ${isActive("/settings") ? "font-medium" : "text-muted hover:text-foreground"}`}
          >
            Settings
          </Link>
        </div>
      </header>
      <nav className={`fixed inset-x-0 bottom-0 z-20 border-t ${hideTabs ? "hidden" : "flex"} border-border bg-background/95 px-[env(safe-area-inset-left)] pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur sm:hidden`}
        ref={tabsRef}
        style={gap ? { transform: `translateY(${gap}px)` } : undefined}
      >
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${
              isActive(l.href) ? "text-accent" : "text-muted"
            }`}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" aria-hidden>
              <path d={l.icon} />
            </svg>
            {l.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
