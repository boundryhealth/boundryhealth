import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve(process.cwd(), '.data');
const AUTH_FILE = path.join(DATA_DIR, 'owner-auth.json');

// Session signing secret stays in server memory if SESSION_SECRET is not set in env
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const TOKEN_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

interface StoredAdminCredential {
  salt: string;
  hash: string;
  claimedAt: string;
}

function readStoredCredential(): StoredAdminCredential | null {
  try {
    if (!fs.existsSync(AUTH_FILE)) return null;
    const raw = fs.readFileSync(AUTH_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as StoredAdminCredential;
    if (parsed?.salt && parsed?.hash) return parsed;
    return null;
  } catch {
    return null;
  }
}

function writeStoredCredential(cred: StoredAdminCredential): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(AUTH_FILE, JSON.stringify(cred, null, 2), { encoding: 'utf-8', mode: 0o600 });
}

function hashPasscodeScrypt(passcode: string, salt: string): string {
  return crypto.scryptSync(passcode, salt, 64).toString('hex');
}

function safeEqualStrings(a: string, b: string): boolean {
  const hashA = crypto.createHash('sha256').update(a).digest();
  const hashB = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

export function getOwnerAuthStatus(): { needsSetup: boolean; envConfigured: boolean } {
  const envPass = process.env.OWNER_ANALYTICS_PASSCODE?.trim() ?? '';
  if (envPass.length > 0) {
    return { needsSetup: false, envConfigured: true };
  }
  const stored = readStoredCredential();
  return { needsSetup: stored === null, envConfigured: false };
}

export function claimInitialOwnerPasscode(passcode: string): { ok: boolean; error?: string; token?: string } {
  const status = getOwnerAuthStatus();
  if (status.envConfigured || !status.needsSetup) {
    return { ok: false, error: 'Owner passcode is already configured.' };
  }

  const trimmed = String(passcode ?? '').trim();
  if (trimmed.length < 4 || trimmed.length > 128) {
    return { ok: false, error: 'Passcode must be between 4 and 128 characters.' };
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashPasscodeScrypt(trimmed, salt);
  writeStoredCredential({
    salt,
    hash,
    claimedAt: new Date().toISOString(),
  });

  return { ok: true, token: issueOwnerToken() };
}

export function verifyOwnerLogin(passcode: string): { ok: boolean; error?: string; token?: string } {
  const trimmed = String(passcode ?? '').trim();
  if (!trimmed) {
    return { ok: false, error: 'Passcode is required.' };
  }

  const envPass = process.env.OWNER_ANALYTICS_PASSCODE?.trim() ?? '';
  if (envPass.length > 0) {
    if (safeEqualStrings(trimmed, envPass)) {
      return { ok: true, token: issueOwnerToken() };
    }
    return { ok: false, error: 'Invalid owner passcode.' };
  }

  const stored = readStoredCredential();
  if (!stored) {
    return { ok: false, error: 'Owner passcode has not been claimed yet.' };
  }

  const candidateHash = hashPasscodeScrypt(trimmed, stored.salt);
  const bufA = Buffer.from(candidateHash, 'hex');
  const bufB = Buffer.from(stored.hash, 'hex');
  if (bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB)) {
    return { ok: true, token: issueOwnerToken() };
  }

  return { ok: false, error: 'Invalid owner passcode.' };
}

export function issueOwnerToken(): string {
  const payload = Buffer.from(
    JSON.stringify({
      role: 'owner',
      exp: Date.now() + TOKEN_TTL_MS,
      nonce: crypto.randomBytes(8).toString('hex'),
    })
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyOwnerToken(authHeader?: string): boolean {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
  const token = authHeader.slice(7).trim();
  const dotIdx = token.indexOf('.');
  if (dotIdx <= 0) return false;

  const payload = token.slice(0, dotIdx);
  const sig = token.slice(dotIdx + 1);
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');

  const bufA = Buffer.from(sig);
  const bufB = Buffer.from(expectedSig);
  if (bufA.length !== bufB.length || !crypto.timingSafeEqual(bufA, bufB)) {
    return false;
  }

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8')) as {
      role?: string;
      exp?: number;
    };
    return parsed.role === 'owner' && typeof parsed.exp === 'number' && parsed.exp > Date.now();
  } catch {
    return false;
  }
}
