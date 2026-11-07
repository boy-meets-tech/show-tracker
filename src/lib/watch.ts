import { getMe } from "@/lib/auth";
import { detectedCountry } from "@/lib/country";
import { availableOn } from "@/lib/tmdb";

// The viewer's "Where to watch" country and services.
export async function myWatchSetup() {
  const me = await getMe();
  return { country: me.country ?? (await detectedCountry()), services: me.services ?? [] };
}

// Which of the viewer's services include each title, e.g. { "tv-1396": ["Netflix"] }.
export async function onMyServices(titleIds: string[]) {
  const { country, services } = await myWatchSetup();
  return availableOn(titleIds, country, services);
}
