// Shapes of the GRID responses for the documents in queries.ts.

export interface SeriesNode {
  id: string;
  startTimeScheduled: string;
  type: string;
  format: { nameShortened: string } | null;
  tournament: { id: string; name: string; nameShortened: string | null } | null;
  teams: { baseInfo: { id: string; name: string; nameShortened: string | null; colorPrimary: string | null; logoUrl: string | null } }[];
}

export interface ListSeriesData {
  allSeries: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    edges: { node: SeriesNode }[];
  };
}

export interface Objective { type: string; completionCount: number }

export interface SegmentPlayer {
  id: string;
  kills: number;
  deaths: number;
  killAssistsGiven: number;
  firstKill: boolean;
  alive?: boolean;
  headshots?: number;
  damageDealt?: number;
  damageTaken?: number;
}

export interface SegmentTeam {
  id: string;
  side: "attacker" | "defender" | string;
  won: boolean;
  firstKill: boolean;
  kills: number;
  deaths: number;
  winType?: string;
  objectives?: Objective[];
  players?: SegmentPlayer[];
}

export interface Segment { sequenceNumber: number; type: string; teams: SegmentTeam[] }

export interface GamePlayer {
  id: string;
  name: string;
  character: { name: string } | null;
  kills: number;
  deaths: number;
  killAssistsGiven: number;
  headshots?: number;
  damageDealt?: number;
  damageTaken?: number;
  weaponKills?: { weaponName: string; count: number }[];
}

export interface GameTeam {
  id: string;
  name: string;
  side: string;
  won: boolean;
  score: number;
  players: GamePlayer[];
}

export interface GameState {
  id: string;
  sequenceNumber: number;
  finished: boolean;
  map: { name: string } | null;
  teams: GameTeam[];
  segments: Segment[];
}

export interface SeriesState {
  id: string;
  started: boolean;
  finished: boolean;
  teams: { id: string; name: string; won: boolean; score: number }[];
  games: GameState[];
}

export interface SeriesStateData { seriesState: SeriesState | null }
