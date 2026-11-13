/** Minimal GRID GraphQL client. The API key is a Worker secret and never leaves the server (ToS 3.3). */

export class RateLimitedError extends Error {}

export class GridError extends Error {
  constructor(message: string, readonly errors: unknown[] = []) {
    super(message);
  }
}

export async function gridQuery<T>(
  url: string,
  apiKey: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey },
    body: JSON.stringify({ query, variables }),
  });
  if (res.status === 429) throw new RateLimitedError(`GRID rate limit (429) on ${url}`);
  if (!res.ok) throw new GridError(`GRID HTTP ${res.status} on ${url}`);

  const body = (await res.json()) as { data?: T; errors?: { message: string; extensions?: { errorType?: string } }[] };
  if (body.errors?.length) {
    if (body.errors.some((e) => e.extensions?.errorType === "UNAVAILABLE" && /rate|limit/i.test(e.message))) {
      throw new RateLimitedError(body.errors[0].message);
    }
    // Partial data (e.g. one field denied) is still useful; only fail when nothing came back.
    if (!body.data) throw new GridError(body.errors.map((e) => e.message).join("; "), body.errors);
  }
  if (!body.data) throw new GridError("GRID returned no data");
  return body.data;
}
