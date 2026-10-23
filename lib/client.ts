const DEFAULT_BASE_URL = "https://api.openwhispr.com";

export function apiUrl(path: string): URL {
  return new URL(`/api/v1${path}`, process.env.OPENWHISPR_API_URL || DEFAULT_BASE_URL);
}

interface RequestOptions {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  apiKey: string;
  body?: Record<string, unknown>;
  form?: FormData;
  query?: Record<string, string>;
}

interface ApiError {
  error: { code: string; message: string };
}

export async function apiRequest<T>(opts: RequestOptions): Promise<T> {
  const url = apiUrl(opts.path);

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
    body: opts.form ?? (opts.body ? JSON.stringify(opts.body) : undefined),
  });

  if (res.status === 204) return undefined as T;

  const json = await res.json();

  if (res.status === 401) {
    throw new Error(
      "Your OpenWhispr connection has expired or was revoked. Reconnect OpenWhispr in your assistant's connection settings, then try again."
    );
  }

  if (!res.ok) {
    const err = json as ApiError;
    throw new Error(err.error?.message || `API error ${res.status}`);
  }

  return json as T;
}
