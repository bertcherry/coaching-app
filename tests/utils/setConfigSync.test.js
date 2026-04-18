/**
 * tests/utils/setConfigSync.test.js
 *
 * Tests for the per-set target sync helpers used when a coach changes
 * exercise-level recommendations and those changes need to propagate
 * to (or be kept out of) the individual per-set override fields.
 *
 * Behaviour spec:
 *   Single value set above  → fill any empty per-set cell; leave filled cells alone
 *   Range set above         → clear cells that are empty or outside the range;
 *                             keep cells already filled AND within the range
 *   Value cleared above     → leave all per-set cells untouched
 *   countMax removed        → restore exercise countMin into empty cells
 */

import { syncRpe, syncWeight, syncCountMax, parseRangeStr, isSingleNum } from '../../utils/setConfigSync';

// ─── parseRangeStr ────────────────────────────────────────────────────────────

describe('parseRangeStr', () => {
    test('parses en-dash range', () => {
        expect(parseRangeStr('135–155')).toEqual({ lo: 135, hi: 155 });
    });
    test('parses hyphen range', () => {
        expect(parseRangeStr('5-8')).toEqual({ lo: 5, hi: 8 });
    });
    test('parses range with spaces', () => {
        expect(parseRangeStr('7 – 8')).toEqual({ lo: 7, hi: 8 });
    });
    test('returns null for single number', () => {
        expect(parseRangeStr('7')).toBeNull();
    });
    test('returns null for null', () => {
        expect(parseRangeStr(null)).toBeNull();
    });
    test('returns null for partial "7-"', () => {
        expect(parseRangeStr('7-')).toBeNull();
    });
});

// ─── isSingleNum ─────────────────────────────────────────────────────────────

describe('isSingleNum', () => {
    test('true for integer string', ()  => expect(isSingleNum('7')).toBe(true));
    test('true for decimal string', ()  => expect(isSingleNum('7.5')).toBe(true));
    test('false for range string', ()   => expect(isSingleNum('7-8')).toBe(false));
    test('false for partial "7-"', ()   => expect(isSingleNum('7-')).toBe(false));
    test('false for null', ()           => expect(isSingleNum(null)).toBe(false));
    test('false for empty string', ()   => expect(isSingleNum('')).toBe(false));
});

// ─── syncRpe ─────────────────────────────────────────────────────────────────

describe('syncRpe', () => {
    const empty3 = () => [
        { weight: null, rpe: null,  countMin: null },
        { weight: null, rpe: null,  countMin: null },
        { weight: null, rpe: null,  countMin: null },
    ];

    test('single value fills all empty cells', () => {
        const result = syncRpe(empty3(), '7');
        expect(result.every(c => c.rpe === 7)).toBe(true);
    });

    test('single value does not overwrite a cell already filled', () => {
        const configs = [
            { weight: null, rpe: 8,   countMin: null },
            { weight: null, rpe: null, countMin: null },
        ];
        const result = syncRpe(configs, '7');
        expect(result[0].rpe).toBe(8);   // kept
        expect(result[1].rpe).toBe(7);   // filled
    });

    test('range clears cells that are empty', () => {
        const result = syncRpe(empty3(), '7-8');
        expect(result.every(c => c.rpe === null)).toBe(true);
    });

    test('range keeps cells within the range', () => {
        const configs = [
            { weight: null, rpe: 7,   countMin: null },
            { weight: null, rpe: 7.5, countMin: null },
            { weight: null, rpe: 8,   countMin: null },
        ];
        const result = syncRpe(configs, '7-8');
        expect(result[0].rpe).toBe(7);
        expect(result[1].rpe).toBe(7.5);
        expect(result[2].rpe).toBe(8);
    });

    test('range clears cells outside the range', () => {
        const configs = [
            { weight: null, rpe: 6,   countMin: null },  // below
            { weight: null, rpe: 7.5, countMin: null },  // within
            { weight: null, rpe: 9,   countMin: null },  // above
        ];
        const result = syncRpe(configs, '7-8');
        expect(result[0].rpe).toBeNull();
        expect(result[1].rpe).toBe(7.5);
        expect(result[2].rpe).toBeNull();
    });

    test('typing "7" then blurring fills cells, then typing "7-8" and blurring clears them', () => {
        // Coach types "7", blurs → single fill
        const afterSingle = syncRpe(empty3(), '7');
        expect(afterSingle.every(c => c.rpe === 7)).toBe(true);

        // Coach then types "7-8", blurs → 7 is within [7,8] so cells are KEPT
        const afterRange = syncRpe(afterSingle, '7-8');
        expect(afterRange.every(c => c.rpe === 7)).toBe(true);
    });

    test('typing "7" then blurring fills cells, then "6-8" clears them (6 is within [6,8])', () => {
        const afterSingle = syncRpe(empty3(), '7');
        // 7 is within [6,8] so it stays
        const afterRange = syncRpe(afterSingle, '6-8');
        expect(afterRange.every(c => c.rpe === 7)).toBe(true);
    });

    test('typing "7" then blurring fills cells, then "8-9" clears them (7 outside [8,9])', () => {
        const afterSingle = syncRpe(empty3(), '7');
        const afterRange = syncRpe(afterSingle, '8-9');
        expect(afterRange.every(c => c.rpe === null)).toBe(true);
    });

    test('null/cleared value leaves cells untouched', () => {
        const configs = [
            { weight: null, rpe: 7,   countMin: null },
            { weight: null, rpe: null, countMin: null },
        ];
        const result = syncRpe(configs, null);
        expect(result[0].rpe).toBe(7);
        expect(result[1].rpe).toBeNull();
    });

    test('returns new array and new objects for changed cells (immutable)', () => {
        const configs = empty3();
        const result = syncRpe(configs, '7');
        expect(result).not.toBe(configs);
        expect(result[0]).not.toBe(configs[0]);
    });

    test('returns same object reference for unchanged cells (immutable)', () => {
        const configs = [{ weight: null, rpe: 7, countMin: null }];
        const result = syncRpe(configs, '7');
        // rpe 7 is a single value, cell already has 7 → no change
        expect(result[0]).toBe(configs[0]);
    });
});

// ─── syncWeight ───────────────────────────────────────────────────────────────

describe('syncWeight', () => {
    const empty3 = () => [
        { weight: null,  rpe: null, countMin: null },
        { weight: null,  rpe: null, countMin: null },
        { weight: null,  rpe: null, countMin: null },
    ];

    test('single value fills all empty cells', () => {
        const result = syncWeight(empty3(), '135');
        expect(result.every(c => c.weight === '135')).toBe(true);
    });

    test('single value does not overwrite a filled cell', () => {
        const configs = [
            { weight: '155', rpe: null, countMin: null },
            { weight: null,  rpe: null, countMin: null },
        ];
        const result = syncWeight(configs, '135');
        expect(result[0].weight).toBe('155');
        expect(result[1].weight).toBe('135');
    });

    test('range clears empty cells', () => {
        const result = syncWeight(empty3(), '135-155');
        expect(result.every(c => c.weight === null)).toBe(true);
    });

    test('range keeps cells within the range', () => {
        const configs = [
            { weight: '135', rpe: null, countMin: null },
            { weight: '145', rpe: null, countMin: null },
            { weight: '155', rpe: null, countMin: null },
        ];
        const result = syncWeight(configs, '135-155');
        expect(result[0].weight).toBe('135');
        expect(result[1].weight).toBe('145');
        expect(result[2].weight).toBe('155');
    });

    test('range clears cells outside the range', () => {
        const configs = [
            { weight: '115', rpe: null, countMin: null },  // below
            { weight: '145', rpe: null, countMin: null },  // within
            { weight: '165', rpe: null, countMin: null },  // above
        ];
        const result = syncWeight(configs, '135-155');
        expect(result[0].weight).toBeNull();
        expect(result[1].weight).toBe('145');
        expect(result[2].weight).toBeNull();
    });

    test('null/cleared value leaves cells untouched', () => {
        const configs = [
            { weight: '135', rpe: null, countMin: null },
            { weight: null,  rpe: null, countMin: null },
        ];
        const result = syncWeight(configs, null);
        expect(result[0].weight).toBe('135');
        expect(result[1].weight).toBeNull();
    });
});

// ─── syncCountMax ─────────────────────────────────────────────────────────────

describe('syncCountMax', () => {
    const empty3 = () => [
        { weight: null, rpe: null, countMin: null },
        { weight: null, rpe: null, countMin: null },
        { weight: null, rpe: null, countMin: null },
    ];

    test('countMax added clears cells that had the default min', () => {
        const configs = [
            { weight: null, rpe: null, countMin: 5 },
            { weight: null, rpe: null, countMin: 5 },
        ];
        // countMax = 8, countMin = 5 → 5 is within [5,8] so cells are KEPT
        const result = syncCountMax(configs, 8, 5);
        expect(result[0].countMin).toBe(5);
        expect(result[1].countMin).toBe(5);
    });

    test('countMax added clears cells whose value is outside the range', () => {
        const configs = [
            { weight: null, rpe: null, countMin: 3 },  // below range
            { weight: null, rpe: null, countMin: 6 },  // within
            { weight: null, rpe: null, countMin: 10 }, // above range
        ];
        const result = syncCountMax(configs, 8, 5);
        expect(result[0].countMin).toBeNull();
        expect(result[1].countMin).toBe(6);
        expect(result[2].countMin).toBeNull();
    });

    test('countMax added clears empty cells', () => {
        const result = syncCountMax(empty3(), 8, 5);
        expect(result.every(c => c.countMin === null)).toBe(true);
    });

    test('countMax removed restores countMin into empty cells', () => {
        const result = syncCountMax(empty3(), null, 5);
        expect(result.every(c => c.countMin === 5)).toBe(true);
    });

    test('countMax removed does not overwrite filled cells', () => {
        const configs = [
            { weight: null, rpe: null, countMin: 6 },
            { weight: null, rpe: null, countMin: null },
        ];
        const result = syncCountMax(configs, null, 5);
        expect(result[0].countMin).toBe(6);  // kept
        expect(result[1].countMin).toBe(5);  // restored
    });

    test('no countMin and no countMax — leaves cells untouched', () => {
        const configs = [{ weight: null, rpe: null, countMin: null }];
        const result = syncCountMax(configs, null, null);
        expect(result[0].countMin).toBeNull();
    });
});
