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
      "Authentication required. To get an API key:\n" +
        '1. POST https://api.openwhispr.com/api/v1/auth/email-code with {"email": "your@email.com"}\n' +
        "2. Check your email for a 6-digit code\n" +
        '3. POST https://api.openwhispr.com/api/v1/auth/email-code/verify with {"email": "...", "code": "123456"}\n' +
        "4. POST https://api.openwhispr.com/api/v1/keys/create with Bearer token from step 3\n" +
        "5. Use the returned API key for all future requests"
    );
  }

  if (!res.ok) {
    const err = json as ApiError;
    throw new Error(err.error?.message || `API error ${res.status}`);
  }

  return json as T;
}
