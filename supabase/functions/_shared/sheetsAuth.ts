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
