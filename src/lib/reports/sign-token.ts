import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

const TTL_MS = 60_000;

function getSecret(): string {
  const s = process.env.REPORT_INTERNAL_SECRET;
  if (!s || s.length < 16) {
    throw new Error(
      "REPORT_INTERNAL_SECRET is not set (or is too short). Add a 32-byte random value to .env (and to the Northflank secret group)."
    );
  }
  return s;
}

function b64urlEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

type TokenPayload = {
  uid: string;
  pid: string;
  exp: number;
};

export function newPayloadId(): string {
  return randomUUID();
}

export function signReportToken(opts: { userId: string; payloadId: string }): string {
  const payload: TokenPayload = {
    uid: opts.userId,
    pid: opts.payloadId,
    exp: Date.now() + TTL_MS,
  };
  const body = b64urlEncode(Buffer.from(JSON.stringify(payload)));
  const sig = b64urlEncode(createHmac("sha256", getSecret()).update(body).digest());
  return `${body}.${sig}`;
}

export function verifyReportToken(token: string): TokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;

  const expected = b64urlEncode(createHmac("sha256", getSecret()).update(body).digest());
  const a = Buffer.from(expected);
  const b = Buffer.from(sig);
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;

  try {
    const decoded = JSON.parse(b64urlDecode(body).toString("utf-8")) as TokenPayload;
    if (typeof decoded.exp !== "number" || decoded.exp < Date.now()) return null;
    if (typeof decoded.uid !== "string" || typeof decoded.pid !== "string") return null;
    return decoded;
  } catch {
    return null;
  }
}
