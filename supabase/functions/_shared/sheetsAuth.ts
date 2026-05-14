// Google Sheets service-account auth for Supabase Edge Functions (Deno).
//
// Per DESIGN_DECISIONS.md (2026-05-11): use native Deno `crypto.subtle` to sign
// the RS256 JWT, exchange for an access token, and call the Sheets v4 API.
// No external libs — keeps cold-start fast and removes a version-pin dependency.
//
// Two env vars required:
//   * SHEETS_SERVICE_ACCOUNT_EMAIL
//   * SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY   (PEM, with literal \n escapes ok)
//
// Smoke-test parity: scripts/smoke-test-sheets.mjs uses Node googleapis locally
// to verify the same service account can read the same sheets. This file is the
// production path that runs inside the Edge Function.

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';
const JWT_BEARER_GRANT = 'urn:ietf:params:oauth:grant-type:jwt-bearer';

function b64urlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlEncodeString(s: string): string {
  return b64urlEncode(new TextEncoder().encode(s));
}

// PEM (-----BEGIN PRIVATE KEY-----) → PKCS8 DER bytes → CryptoKey.
// Accepts both real newlines and the literal `\n` sequences that env files
// commonly persist (the smoke script does the same `.replace(/\\n/g, '\n')`).
async function importServiceAccountKey(pem: string): Promise<CryptoKey> {
  const normalized = pem.replace(/\\n/g, '\n');
  const body = normalized
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s+/g, '');
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return await crypto.subtle.importKey(
    'pkcs8',
    der,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

async function signJwt(email: string, key: CryptoKey): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: email,
    scope: SHEETS_SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  };
  const signingInput = `${b64urlEncodeString(JSON.stringify(header))}.${b64urlEncodeString(JSON.stringify(claim))}`;
  const sigBuf = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${b64urlEncode(new Uint8Array(sigBuf))}`;
}

async function exchangeJwtForAccessToken(jwt: string): Promise<string> {
  const body = new URLSearchParams({ grant_type: JWT_BEARER_GRANT, assertion: jwt });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    throw new Error(`Google token exchange failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  if (!data.access_token) throw new Error('Token response missing access_token');
  return data.access_token as string;
}

export async function getSheetsAccessToken(): Promise<string> {
  const email = Deno.env.get('SHEETS_SERVICE_ACCOUNT_EMAIL');
  const rawKey = Deno.env.get('SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY');
  if (!email) throw new Error('Missing env: SHEETS_SERVICE_ACCOUNT_EMAIL');
  if (!rawKey) throw new Error('Missing env: SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY');
  const key = await importServiceAccountKey(rawKey);
  const jwt = await signJwt(email, key);
  return await exchangeJwtForAccessToken(jwt);
}

export type SheetsValuesResponse = {
  range: string;
  majorDimension: 'ROWS' | 'COLUMNS';
  values?: unknown[][];
};

export type SheetTabMeta = {
  sheetId: number;
  title: string;
};

// Lists every tab in a spreadsheet. Used by ingests that need to discover tabs
// dynamically (e.g. Marketing Expense, where the supervisor adds one tab per
// month and we want new months to be picked up without a code change).
// `fields=sheets.properties` keeps the response small — we don't need cells.
export async function getSheetTabs(
  accessToken: string,
  spreadsheetId: string,
): Promise<SheetTabMeta[]> {
  const url = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}`,
  );
  url.searchParams.set('fields', 'sheets.properties');
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Sheets metadata read failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { sheets?: Array<{ properties?: { sheetId?: number; title?: string } }> };
  const out: SheetTabMeta[] = [];
  for (const s of data.sheets ?? []) {
    const p = s.properties;
    if (p && typeof p.sheetId === 'number' && typeof p.title === 'string') {
      out.push({ sheetId: p.sheetId, title: p.title });
    }
  }
  return out;
}

// Read a single range from a sheet. `valueRenderOption=UNFORMATTED_VALUE` keeps
// dates as serial numbers and amounts as numbers (locked in DESIGN_DECISIONS).
export async function readSheetValues(
  accessToken: string,
  spreadsheetId: string,
  range: string,
): Promise<SheetsValuesResponse> {
  const url = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`,
  );
  url.searchParams.set('valueRenderOption', 'UNFORMATTED_VALUE');
  url.searchParams.set('dateTimeRenderOption', 'SERIAL_NUMBER');
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Sheets read failed (${range}): ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as SheetsValuesResponse;
}

// Convert a Google Sheets serial date number to an ISO date string (YYYY-MM-DD)
// in UTC. Sheets epoch is 1899-12-30 (Lotus 1-2-3 leap-year quirk). Returns null
// for non-numeric / non-finite inputs so callers can flag `unparseable_date`.
export function sheetsSerialToIsoDate(serial: unknown): string | null {
  if (typeof serial !== 'number' || !Number.isFinite(serial)) return null;
  const ms = Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// Parse a Nigerian D/M/YYYY (or D/M/YY) text date as an ISO YYYY-MM-DD string.
// Returns null on any shape that doesn't match — caller decides whether to flag.
// Supervisor's 2026 LAND sheet has ~60 rows typed as text (e.g. "13/01/2026")
// instead of as real date cells, so the ingest needs both serial and text paths.
export function parseDmyTextDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const m = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s*$/.exec(value);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > 2100) return null;
  // Validate against actual calendar (e.g. reject Feb 30).
  const d = new Date(Date.UTC(year, month - 1, day));
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) return null;
  const yyyy = String(year);
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// Unified date parser used by ingest functions. Tries serial-number first
// (the UNFORMATTED_VALUE path, which is the supervisor's preferred format),
// then falls back to D/M/YYYY text. Returns null only on truly unparseable
// cell values so callers can flag them.
export function parseSheetDate(value: unknown): string | null {
  return sheetsSerialToIsoDate(value) ?? parseDmyTextDate(value);
}
