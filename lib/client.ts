const DEFAULT_BASE_URL = "https://api.openwhispr.com";

interface RequestOptions {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  apiKey: string;
  body?: Record<string, unknown>;
  query?: Record<string, string>;
}

interface ApiError {
  error: { code: string; message: string };
}

export async function apiRequest<T>(opts: RequestOptions): Promise<T> {
  const baseUrl = process.env.OPENWHISPR_API_URL || DEFAULT_BASE_URL;
  const url = new URL(`/api/v1${opts.path}`, baseUrl);

  if (opts.query) {
    for (const [key, value] of Object.entries(opts.query)) {
      if (value !== undefined) url.searchParams.set(key, value);
    }
  }

  const res = await fetch(url, {
    method: opts.method,
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  if (res.status === 204) return undefined as T;

  const json = await res.json();

  if (!res.ok) {
    const err = json as ApiError;
    throw new Error(err.error?.message || `API error ${res.status}`);
  }

  return json as T;
}
