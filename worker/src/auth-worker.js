import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL = '30d';

// ── Helpers ──────────────────────────────────────────────────────────────────

async function hashPassword(pw) {
  return bcrypt.hash(pw, 12);
}

async function verifyPassword(pw, hash) {
  return bcrypt.compare(pw, hash);
}

async function signAccessToken(payload, env) {
  const secret = new TextEncoder().encode(env.JWT_SECRET);
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_TTL)
    .sign(secret);
}

async function signRefreshToken(clientId, env) {
  const token = crypto.randomUUID();
  const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
  await env.DB.prepare(
    `INSERT INTO refresh_tokens (token, client_id, expires_at) VALUES (?, ?, ?)`
  ).bind(token, clientId, expiresAt).run();
  return token;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ── Route handlers ────────────────────────────────────────────────────────────

export async function handleLogin(request, env) {
  const { email, password } = await request.json();
  if (!email || !password) return json({ error: 'Missing fields' }, 400);

  const client = await env.DB.prepare(
    `SELECT email, fname, lname, isCoach, pw, unitDefault FROM clients WHERE email = ?`
  ).bind(email.toLowerCase()).first();

  if (!client) return json({ error: 'Invalid credentials' }, 401);

  const valid = await verifyPassword(password, client.pw);
  if (!valid) return json({ error: 'Invalid credentials' }, 401);

  const accessToken = await signAccessToken({
    sub: client.email,
    email: client.email,
    fname: client.fname,
    lname: client.lname,
    isCoach: client.isCoach === 1,
    unitDefault: client.unitDefault,
  }, env);

  const refreshToken = await signRefreshToken(client.email, env);

  return json({ accessToken, refreshToken });
}

export async function handleRegister(request, env) {
  const { email, password, fname, lname, accessCode } = await request.json();

  if (!email || !password || !fname || !lname || !accessCode) {
    return json({ error: 'Missing fields' }, 400);
  }

  const normalizedEmail = email.trim().toLowerCase();

  const clientRow = await env.DB.prepare(
    'SELECT email, coachedBy FROM clients WHERE email = ? AND accessCode = ?'
  ).bind(normalizedEmail, accessCode).first();

  if (!clientRow) return json({ error: 'Invalid access code' }, 403);

  if (clientRow.pw) {
    return json({ error: 'Account already registered' }, 409);
  }

  const hashed = await hashPassword(password);

  await env.DB.prepare(`
    UPDATE clients SET pw = ?, fname = ?, lname = ?, emailConfirmed = 0
    WHERE email = ?
  `).bind(hashed, fname.trim(), lname.trim(), normalizedEmail).run();

  // Send confirmation email
  try {
    await sendEmail({
      to: normalizedEmail,
      subject: 'Confirm your Cherry Coaching account',
      html: `
        <p>Hi ${fname.trim()},</p>
        <p>Welcome to Cherry Coaching! Your account has been created.</p>
        <p>Your coach will be in touch with your program soon.</p>
      `,
    }, env);
  } catch (err) {
    // Non-fatal — account is created, email confirmation can be resent
    console.error('Welcome email failed:', err);
  }

  return json({ message: 'Registered successfully.' }, 201);
}

export async function handleRefresh(request, env) {
  const { refreshToken } = await request.json();
  if (!refreshToken) return json({ error: 'Missing token' }, 400);

  const record = await env.DB.prepare(
    `SELECT client_id, expires_at FROM refresh_tokens WHERE token = ?`
  ).bind(refreshToken).first();

  if (!record || record.expires_at < Date.now()) {
    return json({ error: 'Invalid or expired refresh token' }, 401);
  }

  const client = await env.DB.prepare(
    `SELECT email, fname, lname, isCoach, unitDefault FROM clients WHERE email = ?`
  ).bind(record.client_id).first();

  if (!client) return json({ error: 'User not found' }, 401);

  const accessToken = await signAccessToken({
    sub: client.email,
    email: client.email,
    fname: client.fname,
    lname: client.lname,
    isCoach: client.isCoach === 1,
    unitDefault: client.unitDefault,
  }, env);

  return json({ accessToken });
}

export async function handleLogout(request, env) {
  const { refreshToken } = await request.json();
  if (!refreshToken) return json({ error: 'Missing token' }, 400);
  await env.DB.prepare(
    `DELETE FROM refresh_tokens WHERE token = ?`
  ).bind(refreshToken).run();
  return json({ message: 'Logged out' });
}

export async function handleForgotPassword(request, env) {
  const { email } = await request.json();
  const client = await env.DB.prepare(
    `SELECT email, fname FROM clients WHERE email = ?`
  ).bind(email.toLowerCase()).first();

  // Always return 200 to avoid email enumeration
  if (!client) return json({ message: 'If that email exists, a code was sent.' });

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + 15 * 60 * 1000; // 15 min

  await env.DB.prepare(
    `INSERT OR REPLACE INTO password_reset_codes (client_id, code, expires_at)
     VALUES (?, ?, ?)`
  ).bind(client.email, code, expiresAt).run();

  try {
    await sendEmail({
      to: client.email,
      subject: 'Your Cherry Coaching password reset code',
      html: `
        <p>Hi ${client.fname},</p>
        <p>Your password reset code is:</p>
        <h2 style="letter-spacing: 4px;">${code}</h2>
        <p>This code expires in 15 minutes.</p>
        <p>If you didn't request this, you can ignore this email.</p>
      `,
    }, env);
  } catch (err) {
    console.error('Password reset email failed:', err);
    // Still return 200 — don't reveal whether email exists or send failed
  }

  return json({ message: 'If that email exists, a code was sent.' });
}

export async function handleResetPassword(request, env) {
  const { email, code, newPassword } = await request.json();
  if (!email || !code || !newPassword) return json({ error: 'Missing fields' }, 400);

  const normalizedEmail = email.toLowerCase();

  const client = await env.DB.prepare(
    `SELECT email FROM clients WHERE email = ?`
  ).bind(normalizedEmail).first();
  if (!client) return json({ error: 'Invalid request' }, 400);

  const record = await env.DB.prepare(
    `SELECT code, expires_at FROM password_reset_codes WHERE client_id = ?`
  ).bind(normalizedEmail).first();

  if (!record || record.code !== code || record.expires_at < Date.now()) {
    return json({ error: 'Invalid or expired code' }, 400);
  }

  const hashed = await hashPassword(newPassword);
  await env.DB.prepare(
    `UPDATE clients SET pw = ? WHERE email = ?`
  ).bind(hashed, normalizedEmail).run();

  await env.DB.prepare(
    `DELETE FROM password_reset_codes WHERE client_id = ?`
  ).bind(normalizedEmail).run();

  return json({ message: 'Password updated.' });
}

// ── Email via Resend ──────────────────────────────────────────────────────────

/**
 * Sends an email via Resend's REST API.
 * Env vars required:
 *   RESEND_API_KEY  — from resend.com dashboard
 *   FROM_EMAIL      — e.g. "Cherry Coaching <noreply@yourdomain.com>"
 */
export async function sendEmail({ to, subject, html }, env) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.FROM_EMAIL,
      to,
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend error: ${err}`);
  }

  return res.json();
}
