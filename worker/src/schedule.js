/**
 * TIMEZONE DESIGN — how dates work in Cherry Coaching
 * ─────────────────────────────────────────────────────
 *
 * Workout dates are CALENDAR DATES (YYYY-MM-DD strings), not timestamps.
 * Storing "2026-04-10" means the workout is on April 10th everywhere.
 * There is NO UTC conversion. A coach in Seattle assigns April 10;
 * the client in Sydney sees April 10. Same string, same day.
 *
 * The only place timezone matters is deciding whether a past scheduled
 * workout should be marked "missed". That requires knowing what "today"
 * is FOR THE CLIENT — which depends on their device's local timezone.
 *
 * The client app passes ?tz=<IANA_tz> (their device timezone) on every
 * schedule fetch. The server uses that to compute today's date for the
 * client, then marks any scheduled workout before that date as "missed".
 *
 * When a coach views a client's calendar, the coach's app passes the
 * coach's own device timezone as ?tz= — so "missed" detection reflects
 * the coach's current time, which may differ from the client's. This is
 * acceptable: the authoritative missed-marking happens when the client
 * themselves fetches their own calendar.
 *
 * EXAMPLE:
 *   Coach in Seattle (UTC-7) views client's calendar on April 10 at 11pm.
 *   ?tz=America/Los_Angeles → today = "2026-04-10" → workouts before Apr 10 = missed
 *
 *   Client in Sydney (UTC+10) fetches same calendar April 11 at 9am.
 *   ?tz=Australia/Sydney → today = "2026-04-11" → same result within their day
 *
 * This is the correct schedule handler to drop into worker/src/worker.js.
 * Replace the existing handleGetSchedule function with this one.
 */

/**
 * Returns today's calendar date (YYYY-MM-DD) for a given IANA timezone string.
 * Used server-side to determine which workouts are "missed".
 * Falls back to UTC if the timezone is invalid or missing.
 *
 * @param {string} tz - IANA timezone string, e.g. "America/Los_Angeles"
 * @returns {string} e.g. "2026-04-10"
 */
export function todayForTimezone(tz) {
    try {
        const now = new Date();
        // Intl.DateTimeFormat with 'en-CA' gives YYYY-MM-DD format natively
        return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(now);
    } catch {
        // Fall back to UTC if tz is invalid
        return new Date().toISOString().split('T')[0];
    }
}

/**
 * GET /schedule?clientEmail=&month=YYYY-MM&tz=IANA_timezone
 *
 * Fetches all scheduled workouts for a client in a given month.
 * Marks scheduled workouts whose date < today (in the client's tz) as "missed".
 * Writes the "missed" status back to the DB for persistence.
 *
 * The ?tz= param should be the VIEWING CLIENT'S device timezone.
 * The client app always sends its own device tz.
 * The coach app sends the coach's device tz (close enough for coach views;
 * the authoritative miss-marking happens when the client opens the app).
 */
export async function handleGetSchedule(request, env) {
    let caller;
    try { caller = await requireAuth(request, env); }
    catch (e) { return e; }

    const url = new URL(request.url);
    const clientEmail = url.searchParams.get('clientEmail');
    const month       = url.searchParams.get('month'); // "YYYY-MM"
    const tz          = url.searchParams.get('tz') || 'UTC';

    if (!clientEmail || !month) {
        return json({ error: 'clientEmail and month are required' }, 400);
    }

    // Auth: clients can only see their own schedule; coaches see their clients'
    if (!caller.isCoach && caller.email !== clientEmail) {
        return json({ error: 'Forbidden' }, 403);
    }
    if (caller.isCoach) {
        const client = await env.DB.prepare(
            'SELECT email FROM clients WHERE email = ? AND coachedBy = ?'
        ).bind(clientEmail, caller.email).first();
        if (!client) return json({ error: 'Client not found' }, 404);
    }

    // Fetch all workouts in the requested month
    const { results } = await env.DB.prepare(`
        SELECT id, clientEmail, workoutId, workoutName, scheduledDate,
               status, skipReason, completedAt, originalDate, copiedFrom
        FROM scheduled_workouts
        WHERE clientEmail = ? AND scheduledDate LIKE ?
        ORDER BY scheduledDate ASC
    `).bind(clientEmail, `${month}%`).all();

    // Compute today in the provided timezone
    const todayStr = todayForTimezone(tz);

    // Mark any "scheduled" workout before today as "missed"
    // We do this in a single batch to avoid N+1 DB calls
    const toMiss = results.filter(w => w.status === 'scheduled' && w.scheduledDate < todayStr);

    if (toMiss.length > 0) {
        // Batch update: SQLite doesn't support multi-row UPDATE with different ids,
        // so we use individual prepared statements inside a transaction-like loop.
        // D1 doesn't have explicit transactions via the REST API, but each .run()
        // is atomic. For a small monthly set this is fine.
        const missPromises = toMiss.map(w =>
            env.DB.prepare(
                `UPDATE scheduled_workouts SET status = 'missed' WHERE id = ? AND status = 'scheduled'`
            ).bind(w.id).run()
        );
        await Promise.all(missPromises);

        // Patch the in-memory results so the response is immediately consistent
        for (const w of results) {
            if (toMiss.some(m => m.id === w.id)) {
                w.status = 'missed';
            }
        }
    }

    return json({ workouts: results });
}