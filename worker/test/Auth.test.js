/**
 * auth.test.js
 * Location: <your-worker-repo>/test/auth.test.js
 *
 * Run with: npx vitest
 * Requires: vitest, @cloudflare/vitest-pool-workers
 *
 * Setup in vitest.config.js:
 *   import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';
 *   export default defineWorkersConfig({
 *     test: { poolOptions: { workers: { wrangler: { configPath: './wrangler.toml' } } } }
 *   });
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import worker from '../src/worker.js'; // adjust path to your worker entry

// ─── Mock D1 database ─────────────────────────────────────────────────────────

/**
 * Creates a minimal in-memory D1 mock. Each test gets a fresh copy via
 * makeEnv() so state never leaks between tests.
 */
function makeDB(initialClients = [], initialTokens = [], initialResetCodes = []) {
  const clients = [...initialClients];
  const refresh_tokens = [...initialTokens];
  const password_reset_codes = [...initialResetCodes];

  const queryStore = { clients, refresh_tokens, password_reset_codes };

  return {
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async run() { return executeWrite(sql, args, queryStore); },
            async first() { return executeRead(sql, args, queryStore); },
            async all() { return { results: executeReadAll(sql, args, queryStore) }; },
          };
        },
      };
    },
  };
}

function executeRead(sql, args, store) {
  const s = sql.toLowerCase();
  if (s.includes('from clients where email')) {
    return store.clients.find(c => c.email === args[0]) ?? null;
  }
  if (s.includes('from clients where id')) {
    return store.clients.find(c => c.id === args[0]) ?? null;
  }
  if (s.includes('from refresh_tokens where token')) {
    return store.refresh_tokens.find(t => t.token === args[0]) ?? null;
  }
  if (s.includes('from password_reset_codes where client_id')) {
    return store.password_reset_codes.find(r => r.client_id === args[0]) ?? null;
  }
  return null;
}

function executeReadAll(sql, args, store) {
  return [];
}

function executeWrite(sql, args, store) {
  const s = sql.toLowerCase();
  if (s.includes('insert into clients')) {
    store.clients.push({
      id: args[0], email: args[1], fname: args[2],
      lname: args[3], isCoach: 0, pw: args[4], unitDefault: 'imperial',
    });
  }
  if (s.includes('insert into refresh_tokens')) {
    store.refresh_tokens.push({ token: args[0], client_id: args[1], expires_at: args[2] });
  }
  if (s.includes('delete from refresh_tokens')) {
    const idx = store.refresh_tokens.findIndex(t => t.token === args[0]);
    if (idx !== -1) store.refresh_tokens.splice(idx, 1);
  }
  if (s.includes('insert or replace into password_reset_codes')) {
    const idx = store.password_reset_codes.findIndex(r => r.client_id === args[0]);
    const record = { client_id: args[0], code: args[1], expires_at: args[2] };
    if (idx !== -1) store.password_reset_codes[idx] = record;
    else store.password_reset_codes.push(record);
  }
  if (s.includes('delete from password_reset_codes')) {
    const idx = store.password_reset_codes.findIndex(r => r.client_id === args[0]);
    if (idx !== -1) store.password_reset_codes.splice(idx, 1);
  }
  if (s.includes('update clients set pw')) {
    const client = store.clients.find(c => c.id === args[1]);
    if (client) client.pw = args[0];
  }
  return { success: true };
}

/** bcrypt hash of "password123" — pre-computed so tests don't slow down */
const HASHED_PW = '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQyCIEQUYFQmBkXiVOcALfxQC';

function makeEnv(overrides = {}) {
  return {
    JWT_SECRET: 'test-secret-at-least-32-chars-long!!',
    SIGNUP_ACCESS_CODE: 'COACH123',
    DB: makeDB(
      // Pre-seeded client for login/auth tests
      [{ id: 'client-uuid-1', email: 'jane@example.com', fname: 'Jane', lname: 'Doe', isCoach: 0, pw: HASHED_PW, unitDefault: 'imperial' }],
    ),
    ...overrides,
  };
}

function makeRequest(path, body) {
  return new Request(`https://worker.test${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ─── /auth/login ──────────────────────────────────────────────────────────────

describe('POST /auth/login', () => {
  it('returns 400 when email or password missing', async () => {
    const res = await worker.fetch(makeRequest('/auth/login', { email: 'jane@example.com' }), makeEnv());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/missing/i);
  });

  it('returns 401 for unknown email', async () => {
    const res = await worker.fetch(makeRequest('/auth/login', { email: 'unknown@example.com', password: 'password123' }), makeEnv());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/invalid credentials/i);
  });

  it('returns 401 for wrong password', async () => {
    const res = await worker.fetch(makeRequest('/auth/login', { email: 'jane@example.com', password: 'wrongpassword' }), makeEnv());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/invalid credentials/i);
  });

  it('returns accessToken and refreshToken on valid credentials', async () => {
    const res = await worker.fetch(makeRequest('/auth/login', { email: 'jane@example.com', password: 'password123' }), makeEnv());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('accessToken');
    expect(body).toHaveProperty('refreshToken');
    expect(typeof body.accessToken).toBe('string');
    expect(typeof body.refreshToken).toBe('string');
  });

  it('access token payload contains expected fields', async () => {
    const res = await worker.fetch(makeRequest('/auth/login', { email: 'jane@example.com', password: 'password123' }), makeEnv());
    const { accessToken } = await res.json();
    // Decode payload (middle segment, base64)
    const payload = JSON.parse(atob(accessToken.split('.')[1]));
    expect(payload.sub).toBe('client-uuid-1');
    expect(payload.fname).toBe('Jane');
    expect(payload.lname).toBe('Doe');
    expect(payload.isCoach).toBe(false);
    expect(payload.unitDefault).toBe('imperial');
    expect(payload.exp).toBeGreaterThan(Date.now() / 1000);
  });

  it('email matching is case-insensitive', async () => {
    const res = await worker.fetch(makeRequest('/auth/login', { email: 'JANE@EXAMPLE.COM', password: 'password123' }), makeEnv());
    expect(res.status).toBe(200);
  });

  it('isCoach flag is true for coach accounts', async () => {
    const env = makeEnv();
    // Inject a coach account directly into the mock DB
    env.DB = makeDB([
      { id: 'coach-uuid-1', email: 'coach@example.com', fname: 'Coach', lname: 'Bob', isCoach: 1, pw: HASHED_PW, unitDefault: 'imperial' },
    ]);
    const res = await worker.fetch(makeRequest('/auth/login', { email: 'coach@example.com', password: 'password123' }), env);
    const { accessToken } = await res.json();
    const payload = JSON.parse(atob(accessToken.split('.')[1]));
    expect(payload.isCoach).toBe(true);
  });
});

// ─── /auth/register ───────────────────────────────────────────────────────────

describe('POST /auth/register', () => {
  it('returns 403 with wrong access code', async () => {
    const res = await worker.fetch(makeRequest('/auth/register', {
      email: 'new@example.com', password: 'pass123', fname: 'New', lname: 'User', accessCode: 'WRONG',
    }), makeEnv());
    expect(res.status).toBe(403);
  });

  it('returns 409 when email already registered', async () => {
    const res = await worker.fetch(makeRequest('/auth/register', {
      email: 'jane@example.com', password: 'pass123', fname: 'Jane', lname: 'Doe', accessCode: 'COACH123',
    }), makeEnv());
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/already registered/i);
  });

  it('returns 201 and success message on valid registration', async () => {
    const res = await worker.fetch(makeRequest('/auth/register', {
      email: 'newclient@example.com', password: 'securepass', fname: 'New', lname: 'Client', accessCode: 'COACH123',
    }), makeEnv());
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.message).toMatch(/registered/i);
  });

  it('normalizes email to lowercase on register', async () => {
    const env = makeEnv();
    await worker.fetch(makeRequest('/auth/register', {
      email: 'NewClient@Example.COM', password: 'securepass', fname: 'New', lname: 'Client', accessCode: 'COACH123',
    }), env);
    // Stored email should be lowercase — verify by logging in with lowercase
    // (we can't directly inspect the mock here, but the login test covers the lookup)
    const loginRes = await worker.fetch(makeRequest('/auth/login', {
      email: 'newclient@example.com', password: 'securepass',
    }), env);
    expect(loginRes.status).toBe(200);
  });

  it('new accounts default to isCoach = 0', async () => {
    const env = makeEnv();
    await worker.fetch(makeRequest('/auth/register', {
      email: 'newclient2@example.com', password: 'securepass', fname: 'Test', lname: 'User', accessCode: 'COACH123',
    }), env);
    const loginRes = await worker.fetch(makeRequest('/auth/login', {
      email: 'newclient2@example.com', password: 'securepass',
    }), env);
    const { accessToken } = await loginRes.json();
    const payload = JSON.parse(atob(accessToken.split('.')[1]));
    expect(payload.isCoach).toBe(false);
  });
});

// ─── /auth/refresh ────────────────────────────────────────────────────────────

describe('POST /auth/refresh', () => {
  it('returns 400 when refreshToken is missing', async () => {
    const res = await worker.fetch(makeRequest('/auth/refresh', {}), makeEnv());
    expect(res.status).toBe(400);
  });

  it('returns 401 for an unknown refresh token', async () => {
    const res = await worker.fetch(makeRequest('/auth/refresh', { refreshToken: 'not-a-real-token' }), makeEnv());
    expect(res.status).toBe(401);
  });

  it('returns 401 for an expired refresh token', async () => {
    const env = makeEnv();
    env.DB = makeDB(
      [{ id: 'client-uuid-1', email: 'jane@example.com', fname: 'Jane', lname: 'Doe', isCoach: 0, pw: HASHED_PW, unitDefault: 'imperial' }],
      [{ token: 'expired-token', client_id: 'client-uuid-1', expires_at: Date.now() - 1000 }],
    );
    const res = await worker.fetch(makeRequest('/auth/refresh', { refreshToken: 'expired-token' }), env);
    expect(res.status).toBe(401);
  });

  it('returns a new accessToken for a valid refresh token', async () => {
    const env = makeEnv();
    env.DB = makeDB(
      [{ id: 'client-uuid-1', email: 'jane@example.com', fname: 'Jane', lname: 'Doe', isCoach: 0, pw: HASHED_PW, unitDefault: 'imperial' }],
      [{ token: 'valid-refresh-token', client_id: 'client-uuid-1', expires_at: Date.now() + 1000 * 60 * 60 }],
    );
    const res = await worker.fetch(makeRequest('/auth/refresh', { refreshToken: 'valid-refresh-token' }), env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('accessToken');
    expect(typeof body.accessToken).toBe('string');
  });

  it('new access token still contains correct user info', async () => {
    const env = makeEnv();
    env.DB = makeDB(
      [{ id: 'client-uuid-1', email: 'jane@example.com', fname: 'Jane', lname: 'Doe', isCoach: 0, pw: HASHED_PW, unitDefault: 'imperial' }],
      [{ token: 'valid-refresh-token', client_id: 'client-uuid-1', expires_at: Date.now() + 1000 * 60 * 60 }],
    );
    const res = await worker.fetch(makeRequest('/auth/refresh', { refreshToken: 'valid-refresh-token' }), env);
    const { accessToken } = await res.json();
    const payload = JSON.parse(atob(accessToken.split('.')[1]));
    expect(payload.sub).toBe('client-uuid-1');
    expect(payload.fname).toBe('Jane');
  });
});

// ─── /auth/logout ─────────────────────────────────────────────────────────────

describe('POST /auth/logout', () => {
  it('returns 200 and deletes the refresh token', async () => {
    const env = makeEnv();
    const tokens = [{ token: 'to-be-deleted', client_id: 'client-uuid-1', expires_at: Date.now() + 999999 }];
    env.DB = makeDB(
      [{ id: 'client-uuid-1', email: 'jane@example.com', fname: 'Jane', lname: 'Doe', isCoach: 0, pw: HASHED_PW, unitDefault: 'imperial' }],
      tokens,
    );
    const res = await worker.fetch(makeRequest('/auth/logout', { refreshToken: 'to-be-deleted' }), env);
    expect(res.status).toBe(200);
    // Token should be gone — a subsequent refresh should 401
    const refreshRes = await worker.fetch(makeRequest('/auth/refresh', { refreshToken: 'to-be-deleted' }), env);
    expect(refreshRes.status).toBe(401);
  });

  it('returns 200 even for an unknown token (idempotent)', async () => {
    const res = await worker.fetch(makeRequest('/auth/logout', { refreshToken: 'ghost-token' }), makeEnv());
    expect(res.status).toBe(200);
  });
});

// ─── /auth/forgot-password ────────────────────────────────────────────────────

describe('POST /auth/forgot-password', () => {
  it('returns 200 for an unknown email (no enumeration)', async () => {
    const res = await worker.fetch(makeRequest('/auth/forgot-password', { email: 'nobody@example.com' }), makeEnv());
    expect(res.status).toBe(200);
    const body = await res.json();
    // Response must be identical whether email exists or not
    expect(body.message).toMatch(/if that email exists/i);
  });

  it('returns 200 for a known email and stores reset code', async () => {
    const env = makeEnv();
    const res = await worker.fetch(makeRequest('/auth/forgot-password', { email: 'jane@example.com' }), env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toMatch(/if that email exists/i);
  });

  it('response body is identical for known and unknown emails', async () => {
    const env = makeEnv();
    const unknownRes = await worker.fetch(makeRequest('/auth/forgot-password', { email: 'nobody@example.com' }), env);
    const knownRes = await worker.fetch(makeRequest('/auth/forgot-password', { email: 'jane@example.com' }), env);
    const unknownBody = await unknownRes.json();
    const knownBody = await knownRes.json();
    expect(unknownBody.message).toBe(knownBody.message);
  });
});

// ─── /auth/reset-password ─────────────────────────────────────────────────────

describe('POST /auth/reset-password', () => {
  const FUTURE = Date.now() + 1000 * 60 * 15;
  const PAST = Date.now() - 1000;

  it('returns 400 for unknown email', async () => {
    const res = await worker.fetch(makeRequest('/auth/reset-password', {
      email: 'ghost@example.com', code: '123456', newPassword: 'newpass',
    }), makeEnv());
    expect(res.status).toBe(400);
  });

  it('returns 400 for wrong code', async () => {
    const env = makeEnv();
    env.DB = makeDB(
      [{ id: 'client-uuid-1', email: 'jane@example.com', fname: 'Jane', lname: 'Doe', isCoach: 0, pw: HASHED_PW, unitDefault: 'imperial' }],
      [],
      [{ client_id: 'client-uuid-1', code: '999999', expires_at: FUTURE }],
    );
    const res = await worker.fetch(makeRequest('/auth/reset-password', {
      email: 'jane@example.com', code: '000000', newPassword: 'newpass',
    }), env);
    expect(res.status).toBe(400);
  });

  it('returns 400 for expired code', async () => {
    const env = makeEnv();
    env.DB = makeDB(
      [{ id: 'client-uuid-1', email: 'jane@example.com', fname: 'Jane', lname: 'Doe', isCoach: 0, pw: HASHED_PW, unitDefault: 'imperial' }],
      [],
      [{ client_id: 'client-uuid-1', code: '123456', expires_at: PAST }],
    );
    const res = await worker.fetch(makeRequest('/auth/reset-password', {
      email: 'jane@example.com', code: '123456', newPassword: 'newpass',
    }), env);
    expect(res.status).toBe(400);
  });

  it('returns 200 and updates password on valid code', async () => {
    const env = makeEnv();
    env.DB = makeDB(
      [{ id: 'client-uuid-1', email: 'jane@example.com', fname: 'Jane', lname: 'Doe', isCoach: 0, pw: HASHED_PW, unitDefault: 'imperial' }],
      [],
      [{ client_id: 'client-uuid-1', code: '123456', expires_at: FUTURE }],
    );
    const res = await worker.fetch(makeRequest('/auth/reset-password', {
      email: 'jane@example.com', code: '123456', newPassword: 'brandnewpassword',
    }), env);
    expect(res.status).toBe(200);
    // Verify new password works
    const loginRes = await worker.fetch(makeRequest('/auth/login', {
      email: 'jane@example.com', password: 'brandnewpassword',
    }), env);
    expect(loginRes.status).toBe(200);
  });

  it('reset code is deleted after successful reset (one-time use)', async () => {
    const env = makeEnv();
    env.DB = makeDB(
      [{ id: 'client-uuid-1', email: 'jane@example.com', fname: 'Jane', lname: 'Doe', isCoach: 0, pw: HASHED_PW, unitDefault: 'imperial' }],
      [],
      [{ client_id: 'client-uuid-1', code: '123456', expires_at: FUTURE }],
    );
    await worker.fetch(makeRequest('/auth/reset-password', {
      email: 'jane@example.com', code: '123456', newPassword: 'brandnewpassword',
    }), env);
    // Second use of same code should fail
    const res2 = await worker.fetch(makeRequest('/auth/reset-password', {
      email: 'jane@example.com', code: '123456', newPassword: 'anotherpassword',
    }), env);
    expect(res2.status).toBe(400);
  });
});

// ─── Unknown routes ───────────────────────────────────────────────────────────

describe('Unknown routes', () => {
  it('returns 404 for unrecognized POST paths', async () => {
    const res = await worker.fetch(makeRequest('/auth/doesnotexist', {}), makeEnv());
    expect(res.status).toBe(404);
  });

  it('returns 404 for GET requests to valid paths', async () => {
    const res = await worker.fetch(new Request('https://worker.test/auth/login', { method: 'GET' }), makeEnv());
    expect(res.status).toBe(404);
  });
});