/**
 * tests/utils/WorkoutSync.test.js
 *
 * Tests for the WorkoutSync offline-queue utility:
 *   enqueueRecord   — adds a record to AsyncStorage queue
 *   getPendingCount — returns count of pending records
 *   getSyncErrors   — returns records in syncError state
 *   syncQueue       — sends pending records to server, handles successes/failures/retries
 *   startNetInfoSync / stopNetInfoSync — NetInfo listener lifecycle
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import {
    enqueueRecord, getPendingCount, getSyncErrors, syncQueue,
    startNetInfoSync, stopNetInfoSync,
} from '../../utils/WorkoutSync';

// ─── Mocks ────────────────────────────────────────────────────────────────────

// AsyncStorage is mocked globally via moduleNameMapper.
// Provide an in-memory store so reads reflect prior writes.
let memStore = {};

beforeEach(() => {
    memStore = {};
    jest.clearAllMocks();

    AsyncStorage.getItem.mockImplementation(async (key) => memStore[key] ?? null);
    AsyncStorage.setItem.mockImplementation(async (key, value) => { memStore[key] = value; });

    global.fetch = jest.fn();
});

// Mock uuid to return predictable values
jest.mock('react-native-uuid', () => ({ v4: jest.fn(() => 'test-uuid') }));
// uuid package (used by WorkoutSync via uuidv4)
jest.mock('uuid', () => ({ v4: jest.fn(() => 'test-uuid') }));

// NetInfo mock
let netInfoCallback = null;
jest.mock('@react-native-community/netinfo', () => ({
    addEventListener: jest.fn((cb) => {
        netInfoCallback = cb;
        return jest.fn(); // unsubscribe function
    }),
}));

// WorkoutSync uses module-level `isSyncing` and `netInfoUnsubscribe`.
// Re-import a fresh module state between tests by resetting modules.
// (Jest module isolation via jest.isolateModules is used for the sync tests
//  that care about the isSyncing guard.)

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BASE_RECORD = {
    clientEmail: 'client@example.com',
    workoutId: 'w-1',
    exerciseName: 'Squat',
    setNumber: 1,
    reps: 10,
    weight: 100,
    scheduledWorkoutId: 'sw-1',
    completedAt: '2025-06-10T12:00:00.000Z',
};

function mockSyncSuccess(succeeded = [], failed = []) {
    global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ succeeded, failed }),
    });
}

// ─── enqueueRecord ────────────────────────────────────────────────────────────

describe('enqueueRecord', () => {
    it('adds a record to the queue with pending status', async () => {
        await enqueueRecord(BASE_RECORD);
        const stored = JSON.parse(memStore['workout_sync_queue']);
        expect(stored).toHaveLength(1);
        expect(stored[0].syncStatus).toBe('pending');
        expect(stored[0].failCount).toBe(0);
    });

    it('assigns a uuid id if none provided', async () => {
        await enqueueRecord(BASE_RECORD);
        const stored = JSON.parse(memStore['workout_sync_queue']);
        expect(stored[0].id).toBeDefined();
        expect(typeof stored[0].id).toBe('string');
    });

    it('preserves an id if one is provided', async () => {
        await enqueueRecord({ ...BASE_RECORD, id: 'custom-id' });
        const stored = JSON.parse(memStore['workout_sync_queue']);
        expect(stored[0].id).toBe('custom-id');
    });

    it('stamps enqueuedAt as an ISO date string', async () => {
        await enqueueRecord(BASE_RECORD);
        const stored = JSON.parse(memStore['workout_sync_queue']);
        expect(() => new Date(stored[0].enqueuedAt).toISOString()).not.toThrow();
    });

    it('appends to existing queue entries', async () => {
        await enqueueRecord({ ...BASE_RECORD, id: 'r-1' });
        await enqueueRecord({ ...BASE_RECORD, id: 'r-2' });
        const stored = JSON.parse(memStore['workout_sync_queue']);
        expect(stored).toHaveLength(2);
    });

    it('preserves all original record fields', async () => {
        await enqueueRecord(BASE_RECORD);
        const stored = JSON.parse(memStore['workout_sync_queue']);
        expect(stored[0].exerciseName).toBe('Squat');
        expect(stored[0].reps).toBe(10);
    });
});

// ─── getPendingCount ──────────────────────────────────────────────────────────

describe('getPendingCount', () => {
    it('returns 0 when queue is empty', async () => {
        expect(await getPendingCount()).toBe(0);
    });

    it('counts only pending records', async () => {
        await enqueueRecord({ ...BASE_RECORD, id: 'r-1' });
        await enqueueRecord({ ...BASE_RECORD, id: 'r-2' });

        // Manually mark one as synced
        const queue = JSON.parse(memStore['workout_sync_queue']);
        queue[0].syncStatus = 'synced';
        memStore['workout_sync_queue'] = JSON.stringify(queue);

        expect(await getPendingCount()).toBe(1);
    });

    it('returns 0 when all records are synced', async () => {
        await enqueueRecord({ ...BASE_RECORD, id: 'r-1' });
        const queue = JSON.parse(memStore['workout_sync_queue']);
        queue[0].syncStatus = 'synced';
        memStore['workout_sync_queue'] = JSON.stringify(queue);

        expect(await getPendingCount()).toBe(0);
    });
});

// ─── getSyncErrors ────────────────────────────────────────────────────────────

describe('getSyncErrors', () => {
    it('returns empty array when no errors', async () => {
        expect(await getSyncErrors()).toHaveLength(0);
    });

    it('returns only syncError records', async () => {
        await enqueueRecord({ ...BASE_RECORD, id: 'r-1' });
        await enqueueRecord({ ...BASE_RECORD, id: 'r-2' });

        const queue = JSON.parse(memStore['workout_sync_queue']);
        queue[0].syncStatus = 'syncError';
        memStore['workout_sync_queue'] = JSON.stringify(queue);

        const errors = await getSyncErrors();
        expect(errors).toHaveLength(1);
        expect(errors[0].id).toBe('r-1');
    });
});

// ─── syncQueue ────────────────────────────────────────────────────────────────

describe('syncQueue', () => {
    it('does nothing when queue is empty', async () => {
        await syncQueue('token-abc');
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('sends pending records to the server as a batch', async () => {
        await enqueueRecord({ ...BASE_RECORD, id: 'r-1' });
        mockSyncSuccess(['r-1']);

        await syncQueue('token-abc');

        const [url, opts] = global.fetch.mock.calls[0];
        expect(url).toContain('/history/batch');
        expect(opts.method).toBe('POST');
        expect(opts.headers.Authorization).toBe('Bearer token-abc');
        const body = JSON.parse(opts.body);
        expect(body.records).toHaveLength(1);
        expect(body.records[0].id).toBe('r-1');
    });

    it('marks succeeded records as synced', async () => {
        await enqueueRecord({ ...BASE_RECORD, id: 'r-1' });
        mockSyncSuccess(['r-1']);

        await syncQueue('token-abc');

        const queue = JSON.parse(memStore['workout_sync_queue']);
        expect(queue.find(r => r.id === 'r-1').syncStatus).toBe('synced');
    });

    it('increments failCount for server-reported failed records', async () => {
        await enqueueRecord({ ...BASE_RECORD, id: 'r-1' });
        mockSyncSuccess([], ['r-1']); // server says r-1 failed

        await syncQueue('token-abc');

        const queue = JSON.parse(memStore['workout_sync_queue']);
        expect(queue.find(r => r.id === 'r-1').failCount).toBe(1);
        expect(queue.find(r => r.id === 'r-1').syncStatus).toBe('pending');
    });

    it('sets syncError after MAX_FAIL_COUNT (3) failures', async () => {
        await enqueueRecord({ ...BASE_RECORD, id: 'r-1' });

        // Fail 3 times
        for (let i = 0; i < 3; i++) {
            mockSyncSuccess([], ['r-1']);
            await syncQueue('token-abc');
        }

        const queue = JSON.parse(memStore['workout_sync_queue']);
        expect(queue.find(r => r.id === 'r-1').syncStatus).toBe('syncError');
    });

    it('increments all pending failCounts when server returns non-ok', async () => {
        await enqueueRecord({ ...BASE_RECORD, id: 'r-1' });
        await enqueueRecord({ ...BASE_RECORD, id: 'r-2' });

        global.fetch.mockResolvedValueOnce({ ok: false, status: 500 });

        await syncQueue('token-abc');

        const queue = JSON.parse(memStore['workout_sync_queue']);
        expect(queue.find(r => r.id === 'r-1').failCount).toBe(1);
        expect(queue.find(r => r.id === 'r-2').failCount).toBe(1);
    });

    it('does not update failCounts when a network error occurs', async () => {
        await enqueueRecord({ ...BASE_RECORD, id: 'r-1' });
        global.fetch.mockRejectedValueOnce(new Error('Network error'));

        await syncQueue('token-abc');

        const queue = JSON.parse(memStore['workout_sync_queue']);
        expect(queue.find(r => r.id === 'r-1').failCount).toBe(0);
        expect(queue.find(r => r.id === 'r-1').syncStatus).toBe('pending');
    });

    it('does not send already-synced records', async () => {
        await enqueueRecord({ ...BASE_RECORD, id: 'r-synced' });
        const queue = JSON.parse(memStore['workout_sync_queue']);
        queue[0].syncStatus = 'synced';
        memStore['workout_sync_queue'] = JSON.stringify(queue);

        await syncQueue('token-abc');

        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('does not send syncError records', async () => {
        await enqueueRecord({ ...BASE_RECORD, id: 'r-err' });
        const queue = JSON.parse(memStore['workout_sync_queue']);
        queue[0].syncStatus = 'syncError';
        memStore['workout_sync_queue'] = JSON.stringify(queue);

        await syncQueue('token-abc');

        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('prunes synced records older than 30 days', async () => {
        // Enqueue a record, mark it synced with an old date
        await enqueueRecord({ ...BASE_RECORD, id: 'r-old' });
        const queue = JSON.parse(memStore['workout_sync_queue']);
        queue[0].syncStatus = 'synced';
        queue[0].enqueuedAt = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
        memStore['workout_sync_queue'] = JSON.stringify(queue);

        // Enqueue a fresh pending record and sync it
        await enqueueRecord({ ...BASE_RECORD, id: 'r-new' });
        mockSyncSuccess(['r-new']);

        await syncQueue('token-abc');

        // After sync+prune, the old synced record should be gone
        const after = JSON.parse(memStore['workout_sync_queue']);
        expect(after.find(r => r.id === 'r-old')).toBeUndefined();
    });
});

// ─── startNetInfoSync / stopNetInfoSync ───────────────────────────────────────

describe('startNetInfoSync / stopNetInfoSync', () => {
    beforeEach(() => {
        // Reset the module-level netInfoUnsubscribe between tests
        stopNetInfoSync();
        netInfoCallback = null;
    });

    it('subscribes to NetInfo on start', () => {
        startNetInfoSync(() => 'token-abc');
        expect(NetInfo.addEventListener).toHaveBeenCalled();
    });

    it('does not subscribe twice if called again', () => {
        startNetInfoSync(() => 'token-abc');
        startNetInfoSync(() => 'token-abc');
        expect(NetInfo.addEventListener).toHaveBeenCalledTimes(1);
    });

    it('calls syncQueue when connection is restored (offline → online)', async () => {
        await enqueueRecord({ ...BASE_RECORD, id: 'r-1' });
        mockSyncSuccess(['r-1']);

        startNetInfoSync(() => 'token-abc');

        // Simulate going offline then online
        netInfoCallback?.({ isConnected: false, isInternetReachable: false });
        netInfoCallback?.({ isConnected: true, isInternetReachable: true });

        await new Promise(r => setTimeout(r, 10)); // let async sync run

        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining('/history/batch'),
            expect.any(Object),
        );
    });

    it('does not sync on first-online event (wasOffline starts false)', async () => {
        await enqueueRecord({ ...BASE_RECORD, id: 'r-1' });

        startNetInfoSync(() => 'token-abc');

        // First event is online (wasOffline is false by default)
        netInfoCallback?.({ isConnected: true, isInternetReachable: true });

        await new Promise(r => setTimeout(r, 10));

        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('unsubscribes on stop', () => {
        const mockUnsubscribe = jest.fn();
        NetInfo.addEventListener.mockReturnValueOnce(mockUnsubscribe);

        startNetInfoSync(() => 'token-abc');
        stopNetInfoSync();

        expect(mockUnsubscribe).toHaveBeenCalled();
    });

    it('does not sync when token is null', async () => {
        await enqueueRecord({ ...BASE_RECORD, id: 'r-1' });

        startNetInfoSync(() => null);

        netInfoCallback?.({ isConnected: false, isInternetReachable: false });
        netInfoCallback?.({ isConnected: true, isInternetReachable: true });

        await new Promise(r => setTimeout(r, 10));

        expect(global.fetch).not.toHaveBeenCalled();
    });
});
