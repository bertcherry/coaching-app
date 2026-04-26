import { jwtVerify } from 'jose';

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

async function requireAuth(request, env) {
    const token = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
    if (!token) throw json({ error: 'Unauthorized' }, 401);
    try {
        const secret = new TextEncoder().encode(env.JWT_SECRET);
        const { payload } = await jwtVerify(token, secret);
        return payload;
    } catch {
        throw json({ error: 'Unauthorized' }, 401);
    }
}

const VALID_EXPERIENCE = ['beginner', 'intermediate', 'advanced', 'elite'];
const VALID_FOCUS = [
    'general', 'strength', 'hypertrophy', 'conditioning',
    'sport', 'rehab', 'menopause_management', 'healthy_aging',
];
const VALID_RPE_DISPLAY = ['numeric', 'descriptive'];

async function assertCoachOwnsClient(coachEmail, clientEmail, env) {
    const client = await env.DB.prepare(
        'SELECT coachedBy FROM clients WHERE email = ?'
    ).bind(clientEmail).first();
    if (!client) return json({ error: 'Client not found' }, 404);
    if (client.coachedBy !== coachEmail) return json({ error: 'Forbidden' }, 403);
    return null;
}

// GET /clients/:email/profile
export async function handleGetClientProfile(clientEmail, request, env) {
    let caller;
    try { caller = await requireAuth(request, env); } catch (e) { return e; }
    if (!caller.isCoach) return json({ error: 'Forbidden: coaches only' }, 403);

    const guard = await assertCoachOwnsClient(caller.email, clientEmail, env);
    if (guard) return guard;

    const [profile, clientRow] = await Promise.all([
        env.DB.prepare('SELECT * FROM athlete_profiles WHERE clientEmail = ?').bind(clientEmail).first(),
        env.DB.prepare('SELECT rpe_display FROM clients WHERE email = ?').bind(clientEmail).first(),
    ]);

    return json({
        athleteProfile: profile ?? null,
        rpeDisplay: clientRow?.rpe_display ?? 'numeric',
        connectedDevices: [],
    });
}

// PATCH /clients/:email/profile
export async function handlePatchClientProfile(clientEmail, request, env) {
    let caller;
    try { caller = await requireAuth(request, env); } catch (e) { return e; }
    if (!caller.isCoach) return json({ error: 'Forbidden: coaches only' }, 403);

    const guard = await assertCoachOwnsClient(caller.email, clientEmail, env);
    if (guard) return guard;

    const body = await request.json();
    const {
        rpe_display,
        experience_level,
        training_focus,
        sport,
        competition_date,
        limitations,
        private_notes,
    } = body;

    if (rpe_display !== undefined) {
        if (!VALID_RPE_DISPLAY.includes(rpe_display)) {
            return json({ error: `rpe_display must be one of: ${VALID_RPE_DISPLAY.join(', ')}` }, 400);
        }
        await env.DB.prepare('UPDATE clients SET rpe_display = ? WHERE email = ?')
            .bind(rpe_display, clientEmail).run();
    }

    if (experience_level !== undefined && !VALID_EXPERIENCE.includes(experience_level)) {
        return json({ error: `experience_level must be one of: ${VALID_EXPERIENCE.join(', ')}` }, 400);
    }
    if (training_focus !== undefined) {
        const foci = Array.isArray(training_focus) ? training_focus : [training_focus].filter(Boolean);
        if (foci.some(f => !VALID_FOCUS.includes(f))) {
            return json({ error: `training_focus values must be from: ${VALID_FOCUS.join(', ')}` }, 400);
        }
    }
    if (limitations !== undefined && !Array.isArray(limitations)) {
        return json({ error: 'limitations must be an array' }, 400);
    }

    const hasProfileFields = [experience_level, training_focus, sport, competition_date, limitations, private_notes]
        .some(v => v !== undefined);

    if (hasProfileFields) {
        const now = new Date().toISOString();
        const existing = await env.DB.prepare(
            'SELECT * FROM athlete_profiles WHERE clientEmail = ?'
        ).bind(clientEmail).first();

        if (existing) {
            await env.DB.prepare(`
                UPDATE athlete_profiles SET
                    experience_level = COALESCE(?, experience_level),
                    training_focus   = COALESCE(?, training_focus),
                    sport            = COALESCE(?, sport),
                    competition_date = COALESCE(?, competition_date),
                    limitations      = COALESCE(?, limitations),
                    private_notes    = COALESCE(?, private_notes),
                    updated_at       = ?,
                    updated_by       = ?
                WHERE clientEmail = ?
            `).bind(
                experience_level ?? null,
                training_focus !== undefined ? JSON.stringify(Array.isArray(training_focus) ? training_focus : [training_focus].filter(Boolean)) : null,
                sport ?? null,
                competition_date ?? null,
                limitations !== undefined ? JSON.stringify(limitations) : null,
                private_notes ?? null,
                now, caller.email, clientEmail
            ).run();
        } else {
            await env.DB.prepare(`
                INSERT INTO athlete_profiles
                    (clientEmail, experience_level, training_focus, sport, competition_date, limitations, private_notes, updated_at, updated_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).bind(
                clientEmail,
                experience_level ?? null,
                training_focus !== undefined ? JSON.stringify(Array.isArray(training_focus) ? training_focus : [training_focus].filter(Boolean)) : null,
                sport ?? null,
                competition_date ?? null,
                limitations !== undefined ? JSON.stringify(limitations) : '[]',
                private_notes ?? null,
                now, caller.email
            ).run();
        }
    }

    const [updatedProfile, updatedClient] = await Promise.all([
        env.DB.prepare('SELECT * FROM athlete_profiles WHERE clientEmail = ?').bind(clientEmail).first(),
        env.DB.prepare('SELECT rpe_display FROM clients WHERE email = ?').bind(clientEmail).first(),
    ]);

    return json({
        athleteProfile: updatedProfile ?? null,
        rpeDisplay: updatedClient?.rpe_display ?? 'numeric',
    });
}

// GET /movement-patterns
export async function handleGetMovementPatterns(request, env) {
    let caller;
    try { caller = await requireAuth(request, env); } catch (e) { return e; }
    if (!caller.isCoach) return json({ error: 'Forbidden: coaches only' }, 403);

    const result = await env.DB.prepare(
        'SELECT * FROM movement_patterns ORDER BY display_order ASC'
    ).all();

    return json(result.results);
}
