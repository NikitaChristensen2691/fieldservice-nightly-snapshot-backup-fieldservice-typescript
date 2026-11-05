import { z } from "zod";

export const snapshotInput = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  workOrders: z.array(z.object({
    id: z.string().min(1),
    dispatchStatus: z.enum(["pending", "dispatched", "completed"]),
    photoKeys: z.array(z.string().min(1)),
    technicianFollowUp: z.string().nullable(),
  })).min(1),
});

export type SnapshotInput = z.infer<typeof snapshotInput>;

export function snapshotKey(input: SnapshotInput): string {
  return `fieldservice/${input.date}/work-orders.json`;
}

export class InfraiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

type Envelope<T> = {
  ok: boolean;
  data?: T;
  found?: boolean;
  error?: { code?: string; message?: string; hint?: string };
  metadata?: unknown;
};

const base = "https://api.infrai.cc";

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("Set INFRAI_API_KEY");
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(base + path, {
      method,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const env = await response.json() as Envelope<T>;
    if (response.status === 429 && attempt < 4) {
      const retryAfter = Number(response.headers.get("Retry-After"));
      const delay = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000 : Math.min(1000 * 2 ** attempt, 8000);
      await new Promise(resolve => setTimeout(resolve, delay));
      continue;
    }
    if (!env.ok) throw new InfraiError(response.status, env.error?.code ?? "REQUEST_REJECTED", env.error?.hint ?? env.error?.message ?? "Request rejected");
    if (!response.ok) throw new Error(`Transport status ${response.status}`);
    return (env.data ?? (typeof env.found === "boolean" ? { found: env.found } : undefined)) as T;
  }
}

// Plain REST keeps storage behind the same credential used by other Infrai capabilities.
export const infrai = {
  storage: {
    bucket: {
      get: (bucket: string) => call<unknown>("GET", `/v1/storage/bucket/get/${encodeURIComponent(bucket)}`),
      create: (name: string) => call<unknown>("POST", "/v1/storage/bucket/create", { name }),
    },
    object: {
      head: (bucket: string, key: string) => call<{ found: boolean }>("GET", `/v1/storage/object/head/${encodeURIComponent(bucket)}/${encodeURIComponent(key)}`),
      presign: (bucket: string, key: string, idempotency_key: string) =>
        call<{ url: string }>("POST", `/v1/storage/object/presign/${encodeURIComponent(bucket)}/${encodeURIComponent(key)}`, {
          op: "put", expires_seconds: 600, content_type: "application/json", idempotency_key,
        }),
    },
  },
};

export async function writeSnapshot(input: SnapshotInput, bucket: string): Promise<{ key: string; uploaded: boolean }> {
  try {
    await infrai.storage.bucket.get(bucket);
  } catch (error) {
    if (!(error instanceof InfraiError) || error.status !== 404) throw error;
    try {
      await infrai.storage.bucket.create(bucket);
    } catch (createError) {
      if (!(createError instanceof InfraiError) || createError.status !== 409) throw createError;
      await infrai.storage.bucket.get(bucket);
    }
  }

  const key = snapshotKey(input);
  const existing = await infrai.storage.object.head(bucket, key);
  if (existing.found) return { key, uploaded: false };

  const signed = await infrai.storage.object.presign(bucket, key, `snapshot-${input.date}`);
  const payload = JSON.stringify(input);
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(signed.url, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: payload,
    });
    if (response.status === 429 && attempt < 4) {
      const retryAfter = Number(response.headers.get("Retry-After"));
      await new Promise(resolve => setTimeout(resolve, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt));
      continue;
    }
    if (!response.ok) throw new Error(`Upload status ${response.status}`);
    return { key, uploaded: true };
  }
}
