import { headers } from "next/headers";

// The country the request came from, as detected by Vercel from the IP
// address (e.g. "US"). Falls back to the US when unknown (local development).
export async function detectedCountry(): Promise<string> {
  const code = (await headers()).get("x-vercel-ip-country")?.toUpperCase();
  return code && /^[A-Z]{2}$/.test(code) ? code : "US";
}

export function countryName(code: string) {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}
