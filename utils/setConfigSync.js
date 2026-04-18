/**
 * setConfigSync.js
 *
 * Pure functions for updating per-set coach targets (setConfigs) when
 * exercise-level recommendations change. Extracted so they can be unit-tested
 * independently of the React component.
 *
 * Rules:
 *   - Single value above  → fill any empty per-set cell with that value
 *   - Range above         → clear any per-set cell that is empty OR outside the range;
 *                           keep cells that are already filled AND within the range
 *   - Value cleared above → leave per-set cells untouched
 *   - countMax removed    → restore exercise countMin into any empty per-set cell
 */

/** Parse "135–155" or "135-155" → { lo: 135, hi: 155 }, else null. */
export function parseRangeStr(s) {
    if (s == null) return null;
    const m = String(s).trim().match(/^([\d.]+)\s*[–-]\s*([\d.]+)$/);
    return m ? { lo: parseFloat(m[1]), hi: parseFloat(m[2]) } : null;
}

/** True only when s is a bare non-negative number (no dashes, no spaces). */
export function isSingleNum(s) {
    return s != null && /^[\d.]+$/.test(String(s).trim());
}

export function inRange(val, lo, hi) {
    return val != null && val >= lo && val <= hi;
}

/**
 * Update per-set RPE when the exercise-level recommendedRpe changes.
 *
 * @param {Array}       setConfigs  Current array of { weight, rpe, countMin }
 * @param {string|null} raw         The new committed recommendedRpe value
 * @returns {Array}                 Updated setConfigs (new array, new objects where changed)
 */
export function syncRpe(setConfigs, raw) {
    const range  = parseRangeStr(raw);
    const single = isSingleNum(raw) ? parseFloat(raw) : null;

    return setConfigs.map(cfg => {
        const v = cfg.rpe != null ? parseFloat(cfg.rpe) : null;

        if (range) {
            // Keep only if already filled and within range
            if (v != null && inRange(v, range.lo, range.hi)) return cfg;
            return { ...cfg, rpe: null };
        }

        if (single != null) {
            // Fill empty cells only
            if (v == null) return { ...cfg, rpe: single };
            return cfg;
        }

        // Cleared — leave as-is
        return cfg;
    });
}

/**
 * Update per-set weight when the exercise-level recommendedWeight changes.
 *
 * @param {Array}       setConfigs  Current array of { weight, rpe, countMin }
 * @param {string|null} raw         The new committed recommendedWeight value
 * @returns {Array}                 Updated setConfigs
 */
export function syncWeight(setConfigs, raw) {
    const range  = parseRangeStr(raw);
    const single = isSingleNum(raw) ? String(raw).trim() : null;

    return setConfigs.map(cfg => {
        const v    = cfg.weight;
        const numV = v != null && v !== '' ? parseFloat(v) : null;

        if (range) {
            // Keep only if already filled and within range
            if (numV != null && inRange(numV, range.lo, range.hi)) return cfg;
            return { ...cfg, weight: null };
        }

        if (single != null) {
            // Fill empty cells only
            if (v == null || v === '') return { ...cfg, weight: single };
            return cfg;
        }

        return cfg;
    });
}

/**
 * Update per-set countMin when the exercise-level countMax changes.
 *
 * @param {Array}       setConfigs   Current array of { weight, rpe, countMin }
 * @param {number|null} countMax     New countMax value (null = no range)
 * @param {number|null} countMin     Exercise-level countMin (the lower bound / default)
 * @returns {Array}                  Updated setConfigs
 */
export function syncCountMax(setConfigs, countMax, countMin) {
    const hasRange = countMax != null && countMax !== '';
    const lo = countMin != null ? parseFloat(countMin) : null;
    const hi = countMax != null ? parseFloat(countMax) : null;

    return setConfigs.map(cfg => {
        const v = cfg.countMin != null ? parseFloat(cfg.countMin) : null;

        if (hasRange) {
            // Keep only if already filled and within range
            if (v != null && inRange(v, lo, hi)) return cfg;
            return { ...cfg, countMin: null };
        }

        // Range removed: restore default into empty cells
        if (v == null && lo != null) return { ...cfg, countMin: lo };
        return cfg;
    });
}
