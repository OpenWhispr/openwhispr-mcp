import type { VercelRequest, VercelResponse } from "@vercel/node";

export default function handler(req: VercelRequest, res: VercelResponse): void {
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    res.status(405).end();
    return;
  }

  const token = process.env.OPENAI_APPS_CHALLENGE;
  if (!token) {
    res.status(404).end();
    return;
  }

  // The portal compares the exact response: no JSON wrapper or added newline.
  res.status(200);
  if (req.method === "HEAD") res.end();
  else res.send(token);
}
