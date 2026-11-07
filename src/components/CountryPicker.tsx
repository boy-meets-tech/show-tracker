"use client";

import { useState, useTransition } from "react";
import { setWatchCountry } from "@/app/actions";

export function CountryPicker({
  current,
  detected,
  detectedName,
  countries,
}: {
  current: string | null;
  detected: string;
  detectedName: string;
  countries: { code: string; name: string }[];
}) {
  const [value, setValue] = useState(current ?? "");
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  return (
    <div id="country">
      <label className="block text-sm">
        <span className="mb-1 block text-muted">Country for streaming services</span>
        <select
          className="input"
          value={value}
          disabled={pending}
          onChange={(e) => {
            const next = e.target.value;
            setValue(next);
            setSaved(false);
            start(async () => {
              await setWatchCountry(next || null);
              setSaved(true);
            });
          }}
        >
          <option value="">Automatic ({detectedName})</option>
          {countries.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <p className="mt-1 text-xs text-muted">
        {pending ? "Saving…" : saved ? "Saved." : `Detected from your location: ${detected}.`}
      </p>
    </div>
  );
}
