// GraphQL documents for GRID Open Access. Validated against the live schema (Nov 2026).
// VALORANT-only fields must be requested through inline fragments (`... on XxxValorant`).

export const CENTRAL_DATA_URL = "https://api-op.grid.gg/central-data/graphql";
export const SERIES_STATE_URL = "https://api-op.grid.gg/live-data-feed/series-state/graphql";
export const VALORANT_TITLE_ID = "6";

export const LIST_SERIES = /* GraphQL */ `
query ListSeries($after: Cursor, $from: String!, $titleId: ID!) {
  allSeries(
    filter: { titleId: $titleId, startTimeScheduled: { gte: $from } }
    orderBy: StartTimeScheduled
    orderDirection: ASC
    first: 50
    after: $after
  ) {
    pageInfo { hasNextPage endCursor }
    edges {
      node {
        id
        startTimeScheduled
        type
        format { nameShortened }
        tournament { id name nameShortened }
        teams { baseInfo { id name nameShortened colorPrimary } }
      }
    }
  }
}`;

export const SERIES_STATE = /* GraphQL */ `
query SeriesState($id: ID!) {
  seriesState(id: $id) {
    id
    started
    finished
    teams { id name won score }
    games {
      id
      sequenceNumber
      finished
      map { name }
      teams {
        id
        name
        side
        won
        score
        players {
          id
          name
          character { name }
          kills
          deaths
          killAssistsGiven
          ... on GamePlayerStateValorant {
            headshots
            damageDealt
            damageTaken
            weaponKills { weaponName count }
          }
        }
      }
      segments {
        sequenceNumber
        type
        teams {
          id
          side
          won
          firstKill
          kills
          deaths
          ... on SegmentTeamStateValorant {
            winType
            objectives { type completionCount }
            players {
              id
              kills
              deaths
              killAssistsGiven
              firstKill
              ... on SegmentPlayerStateValorant {
                alive
                headshots
                damageDealt
                damageTaken
              }
            }
          }
        }
      }
    }
  }
}`;
