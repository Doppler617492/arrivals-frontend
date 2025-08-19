// Lightweight API helper and shared types. Adjust shapes as your backend evolves.
export type Arrival = Record<string, any>;

const base = import.meta.env.VITE_API_BASE ?? "";

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(\`\${base}\${path}\`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const msg = await safeText(res);
    throw new Error(\`HTTP \${res.status} \${res.statusText}: \${msg}\`);
  }
  return (await res.json()) as T;
}
async function safeText(res: Response) {
  try { return await res.text(); } catch { return ""; }
}

export const api = {
  listArrivals: () => http<Arrival[]>("/api/arrivals"),
  updateArrival: (id: string | number, patch: Partial<Arrival>) =>
    http<Arrival>(\`/api/arrivals/\${id}\`, { method: "PATCH", body: JSON.stringify(patch) }),
  bulkUpdate: (ids: Array<string | number>, patch: Partial<Arrival>) =>
    http<Arrival[]>(\`/api/arrivals/bulk\`, { method: "POST", body: JSON.stringify({ ids, patch }) }),
};
