/**
 * WorkoutSync.js
 * Location: utils/WorkoutSync.js
 *
 * Manages offline-first logging for workout history.
 *
 * Flow:
 *   1. Every set entry is written to AsyncStorage immediately (fast, local)
 *   2. Sync attempts push pending records to the server
 *   3. Failed records are retried up to MAX_FAIL_COUNT times, then flagged syncError
 *   4. Sync is triggered on: app open, calendar navigation, and NetInfo reconnect
 *
 * Install deps:
 *   npx expo install @react-native-async-storage/async-storage
 *   npx expo install @react-native-community/netinfo
 *
 * Worker endpoint needed:
 *   POST /history/batch
 *   Body: { records: [HistoryRecord] }
 *   Response: { succeeded: [id], failed: [id] }
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import 'react-native-get-random-values'; // needed for uuid in RN
import { v4 as uuidv4 } from 'uuid';

const QUEUE_KEY = 'workout_sync_queue';
const MAX_FAIL_COUNT = 3;
const WORKER_URL = 'https://cc-workouts.bert-m-cherry.workers.dev';

// ─── Queue helpers ────────────────────────────────────────────────────────────

/** Read the full queue from AsyncStorage. Returns [] if empty or unreadable. */
async function readQueue() {
    try {
        const raw = await AsyncStorage.getItem(QUEUE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

/** Overwrite the queue in AsyncStorage. */
async function writeQueue(queue) {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

/** Add a new history record to the local queue. */
export async function enqueueRecord(record) {
    const queue = await readQueue();
    queue.push({
        ...record,
        id: record.id ?? uuidv4(),
        syncStatus: 'pending',   // 'pending' | 'synced' | 'syncError'
        failCount: 0,
        enqueuedAt: new Date().toISOString(),
    });
    await writeQueue(queue);
}

/**
 * Update a set of records in the queue by id.
 * Used to mark successes, increment failCounts, or flag syncError.
 */
async function updateQueueRecords(updates) {
    // updates: { [id]: { syncStatus, failCount, ... } }
    const queue = await readQueue();
    const updated = queue.map(r => {
        if (updates[r.id]) return { ...r, ...updates[r.id] };
        return r;
    });
    await writeQueue(updated);
}

/** Remove synced records older than 30 days to keep storage lean. */
async function pruneQueue() {
    const queue = await readQueue();
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const pruned = queue.filter(r => {
        if (r.syncStatus !== 'synced') return true; // keep unsynced always
        return new Date(r.enqueuedAt).getTime() > cutoff;
    });
    await writeQueue(pruned);
}

/** Returns count of records still pending or in error state. */
export async function getPendingCount() {
    const queue = await readQueue();
    return queue.filter(r => r.syncStatus === 'pending').length;
}

/** Returns records flagged as syncError (exceeded retry limit). */
export async function getSyncErrors() {
    const queue = await readQueue();
    return queue.filter(r => r.syncStatus === 'syncError');
}

// ─── Sync ─────────────────────────────────────────────────────────────────────

let isSyncing = false;

/**
 * Attempt to sync all pending records to the server.
 * Safe to call multiple times — will no-op if already running.
 * Pass the current auth token from AuthContext.
 */
export async function syncQueue(accessToken) {
    if (isSyncing) return;
    isSyncing = true;

    try {
        const queue = await readQueue();
        const pending = queue.filter(r => r.syncStatus === 'pending');
        if (pending.length === 0) return;

        // Send as a batch — server returns which ids succeeded and which failed
        const response = await fetch(`${WORKER_URL}/history/batch`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ records: pending }),
        });

        if (!response.ok) {
            // Whole request failed (auth error, server down etc) — increment all
            const updates = {};
            for (const r of pending) {
                const newFailCount = r.failCount + 1;
                updates[r.id] = {
                    failCount: newFailCount,
                    syncStatus: newFailCount >= MAX_FAIL_COUNT ? 'syncError' : 'pending',
                };
            }
            await updateQueueRecords(updates);
            return;
        }

        const { succeeded = [], failed = [] } = await response.json();

        const updates = {};

        for (const id of succeeded) {
            updates[id] = { syncStatus: 'synced', syncedAt: new Date().toISOString() };
        }

        // For each failed id, find the record to get current failCount
        const pendingMap = Object.fromEntries(pending.map(r => [r.id, r]));
        for (const id of failed) {
            const rec = pendingMap[id];
            if (!rec) continue;
            const newFailCount = rec.failCount + 1;
            updates[id] = {
                failCount: newFailCount,
                syncStatus: newFailCount >= MAX_FAIL_COUNT ? 'syncError' : 'pending',
            };
        }

        await updateQueueRecords(updates);
        await pruneQueue();
    } catch (err) {
        // Network error — don't update failCounts, just wait for next sync attempt
        console.warn('Sync failed (network):', err.message);
    } finally {
        isSyncing = false;
    }
}

// ─── NetInfo listener ─────────────────────────────────────────────────────────

let netInfoUnsubscribe = null;

/**
 * Call once when the app starts (e.g. in App.js useEffect).
 * Subscribes to network state changes and syncs when connection is restored.
 * getToken is a function that returns the current accessToken from AuthContext.
 */
export function startNetInfoSync(getToken) {
    if (netInfoUnsubscribe) return; // already listening

    let wasOffline = false;

    netInfoUnsubscribe = NetInfo.addEventListener(state => {
        const isOnline = state.isConnected && state.isInternetReachable;
        if (isOnline && wasOffline) {
            // Just came back online — attempt sync
            const token = getToken();
            if (token) syncQueue(token);
        }
        wasOffline = !isOnline;
    });
}

/** Call on app unmount / cleanup if needed. */
export function stopNetInfoSync() {
    if (netInfoUnsubscribe) {
        netInfoUnsubscribe();
        netInfoUnsubscribe = null;
    }
}