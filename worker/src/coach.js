/**
 * Env vars required:
 *   JWT_SECRET      — same secret used to sign access tokens
 *   RESEND_API_KEY  — from resend.com dashboard
 *   FROM_EMAIL      — e.g. "Cherry Coaching <noreply@yourdomain.com>"
 *   APP_URL         — e.g. "https://yourapp.com" (used in invite email link)
 */

import { jwtVerify } from 'jose';

// ── Helpers ───────────────────────────────────────────────────────────────────

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function generateAccessCode() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const segment = () =>
    Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `${segment()}-${segment()}`;
}

async function requireCoach(request, env) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '').trim();

  if (!token) throw json({ error: 'Unauthorized' }, 401);

  try {
    const secret = new TextEncoder().encode(env.JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);
    if (!payload.isCoach) throw json({ error: 'Forbidden: coaches only' }, 403);
    return payload;
  } catch (err) {
    if (err instanceof Response) throw err;
    throw json({ error: 'Unauthorized' }, 401);
  }
}

// ── Email via Resend ──────────────────────────────────────────────────────────

async function sendEmail({ to, subject, html }, env) {
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

async function sendInviteEmail({ toEmail, toName, coachName, accessCode }, env) {
  const signupUrl = env.APP_URL ? `${env.APP_URL}/signup` : 'https://cherry-coaching.com/signup';

  await sendEmail({
    to: toEmail,
    subject: `${coachName} has added you to Cherry Coaching`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>You've been added to ${coachName}'s coaching program</h2>
        <p>Hi ${toName},</p>
        <p>${coachName} has created an account for you on Cherry Coaching.</p>
        <p>Download the app and sign up using your access code:</p>
        <div style="
          font-size: 28px;
          font-weight: bold;
          letter-spacing: 6px;
          text-align: center;
          padding: 20px;
          margin: 20px 0;
          background: #fae9e9;
          border-radius: 8px;
        ">
          ${accessCode}
        </div>
        <p>
          <a href="${signupUrl}" style="
            display: inline-block;
            padding: 12px 24px;
            background: #fba8a0;
            color: black;
            text-decoration: none;
            border-radius: 8px;
            font-weight: bold;
          ">
            Sign up now
          </a>
        </p>
        <p style="color: #888; font-size: 12px;">
          If you weren't expecting this, you can ignore this email.
        </p>
      </div>
    `,
  }, env);
}

// ── Route: POST /coach/add-client ─────────────────────────────────────────────

export async function handleAddClient(request, env) {
  let coach;
  try {
    coach = await requireCoach(request, env);
  } catch (errResponse) {
    return errResponse;
  }

  const { fname, lname, email } = await request.json();

  if (!fname?.trim() || !lname?.trim() || !email?.trim()) {
    return json({ error: 'fname, lname, and email are required' }, 400);
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email.trim())) {
    return json({ error: 'Invalid email address' }, 400);
  }

  const normalizedEmail = email.trim().toLowerCase();

  const existing = await env.DB.prepare(
    'SELECT email, coachedBy FROM clients WHERE email = ?'
  ).bind(normalizedEmail).first();

  if (existing) {
    if (existing.coachedBy === coach.email) {
      return json({ error: 'This client is already in your roster' }, 409);
    }
    return json({ error: 'An account with that email already exists' }, 409);
  }

  // Generate unique access code — retry on collision
  let accessCode;
  let attempts = 0;
  do {
    accessCode = generateAccessCode();
    const collision = await env.DB.prepare(
      'SELECT email FROM clients WHERE accessCode = ?'
    ).bind(accessCode).first();
    if (!collision) break;
    attempts++;
  } while (attempts < 5);

  const coachFullName = `${coach.fname} ${coach.lname}`;

  // Insert client row — no password yet, they set one on sign-up
  await env.DB.prepare(`
    INSERT INTO clients (email, fname, lname, isCoach, pw, unitDefault, coachedBy, accessCode, emailConfirmed)
    VALUES (?, ?, ?, 0, '', 'imperial', ?, ?, 0)
  `).bind(normalizedEmail, fname.trim(), lname.trim(), coach.email, accessCode).run();

  // Send invite — roll back row if email fails so coach can retry
  try {
    await sendInviteEmail(
      { toEmail: normalizedEmail, toName: `${fname.trim()} ${lname.trim()}`, coachName: coachFullName, accessCode },
      env,
    );
  } catch (emailErr) {
    await env.DB.prepare('DELETE FROM clients WHERE email = ?').bind(normalizedEmail).run();
    console.error('Invite email failed, rolled back client insert:', emailErr);
    return json({ error: 'Could not send invitation email. Please try again.' }, 500);
  }

  return json({ message: 'Client added and invitation sent' }, 201);
}

// ── Route: GET /coach/clients ─────────────────────────────────────────────────

export async function handleGetClients(request, env) {
  let coach;
  try {
    coach = await requireCoach(request, env);
  } catch (errResponse) {
    return errResponse;
  }

  const { results } = await env.DB.prepare(`
    SELECT email, fname, lname, emailConfirmed, unitDefault
    FROM clients
    WHERE coachedBy = ?
    ORDER BY lname ASC, fname ASC
  `).bind(coach.email).all();

  return json({ clients: results });
}