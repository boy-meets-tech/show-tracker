import type { WatchStatus } from "./labels";

export type TitleRowData = {
  id: string;
  name: string;
  media_type: "tv" | "movie";
  poster_path: string | null;
  year: number | null;
};

export type ProfileRow = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
};

export type ActivityRow = {
  id: number;
  kind: "status" | "rating";
  status: WatchStatus | null;
  rating: number | null;
  created_at: string;
  profiles: ProfileRow;
  titles: TitleRowData;
};

export type EntryRow = {
  title_id: string;
  status: WatchStatus;
  rating: number | null;
  updated_at: string;
  titles: TitleRowData;
};
