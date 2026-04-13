import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useAuth } from './AuthContext';

const NotificationsContext = createContext(null);

const WORKER_URL = 'https://coaching-app.bert-m-cherry.workers.dev';

// Show banners even when app is in foreground
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: true,
    }),
});

async function registerPushToken(authFetch) {
    try {
        const { status: existing } = await Notifications.getPermissionsAsync();
        let finalStatus = existing;

        if (existing !== 'granted') {
            const { status } = await Notifications.requestPermissionsAsync();
            finalStatus = status;
        }

        if (finalStatus !== 'granted') return;

        const tokenData = await Notifications.getExpoPushTokenAsync();
        const token = tokenData.data;

        await authFetch(`${WORKER_URL}/notifications/push-token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, platform: Platform.OS }),
        });
    } catch {}
}

export function NotificationsProvider({ children }) {
    const { user, authFetch } = useAuth();

    const [unreadWorkoutIds, setUnreadWorkoutIds] = useState(new Set());
    const [unreadClientEmails, setUnreadClientEmails] = useState(new Set());
    const [totalUnread, setTotalUnread] = useState(0);

    const fetchUnread = useCallback(async () => {
        if (!user) return;
        try {
            const res = await authFetch(`${WORKER_URL}/notifications/unread`);
            if (res.ok) {
                const data = await res.json();
                setTotalUnread(data.totalUnread);
                setUnreadWorkoutIds(new Set(data.unreadWorkoutIds));
                setUnreadClientEmails(new Set(data.unreadClientEmails ?? []));
            }
        } catch {}
    }, [user, authFetch]);

    // Fetch on sign-in / sign-out
    useEffect(() => {
        if (user) {
            fetchUnread();
        } else {
            setTotalUnread(0);
            setUnreadWorkoutIds(new Set());
            setUnreadClientEmails(new Set());
        }
    }, [user]);

    // Refresh when app comes back to foreground
    useEffect(() => {
        const sub = AppState.addEventListener('change', state => {
            if (state === 'active' && user) fetchUnread();
        });
        return () => sub.remove();
    }, [user, fetchUnread]);

    // Register push token after sign-in
    useEffect(() => {
        if (user) registerPushToken(authFetch);
    }, [user]);

    // Refresh unread state when a push arrives in the foreground
    useEffect(() => {
        const sub = Notifications.addNotificationReceivedListener(() => {
            fetchUnread();
        });
        return () => sub.remove();
    }, [fetchUnread]);

    const markRead = useCallback(async (scheduledWorkoutId) => {
        if (!scheduledWorkoutId) return;

        // Optimistic update
        setUnreadWorkoutIds(prev => {
            const next = new Set(prev);
            next.delete(scheduledWorkoutId);
            return next;
        });

        try {
            await authFetch(`${WORKER_URL}/notifications/read`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ scheduledWorkoutId }),
            });
            // Refetch to sync totalUnread and unreadClientEmails accurately
            fetchUnread();
        } catch {}
    }, [authFetch, fetchUnread]);

    return (
        <NotificationsContext.Provider value={{
            totalUnread,
            unreadWorkoutIds,
            unreadClientEmails,
            markRead,
            fetchUnread,
        }}>
            {children}
        </NotificationsContext.Provider>
    );
}

export const useNotifications = () => useContext(NotificationsContext);
