/**
 * Page registry shared by the Worker (SSR) and the browser (hydration).
 * The Worker renders <App> to HTML and embeds the same props as JSON; the client hydrates from them.
 */
import type { ComponentProps, ComponentType } from "react";
import { Layout } from "@/components/layout";
import { MapList, MapPage } from "@/pages/maps";
import { SeriesDetail, SeriesList } from "@/pages/matches";
import { About, Home, Leaderboards, NotFound, SearchPage } from "@/pages/misc";
import { PlayerList, PlayerPage } from "@/pages/players";
import { ComparePage, TeamList, TeamPage } from "@/pages/teams";

export const PAGES = {
  home: Home,
  matches: SeriesList,
  match: SeriesDetail,
  teams: TeamList,
  team: TeamPage,
  compare: ComparePage,
  players: PlayerList,
  player: PlayerPage,
  maps: MapList,
  map: MapPage,
  leaderboards: Leaderboards,
  search: SearchPage,
  about: About,
  notFound: NotFound,
} satisfies Record<string, ComponentType<any>>;

export type PageName = keyof typeof PAGES;
export type PageProps<P extends PageName> = ComponentProps<(typeof PAGES)[P]>;

export interface Payload<P extends PageName = PageName> {
  page: P;
  props: PageProps<P>;
  siteName: string;
  active?: string;
}

export function App({ page, props, siteName, active }: Payload) {
  const Page = PAGES[page] as ComponentType<any>;
  return (
    <Layout siteName={siteName} active={active}>
      <Page {...(props as object)} />
    </Layout>
  );
}
