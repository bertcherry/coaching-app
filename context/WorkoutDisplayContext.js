import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const PREVIEW_DETAILS_KEY  = 'workout_preview_details_default';
export const ACTIVE_DETAILS_KEY   = 'workout_active_details_default';
export const ACTIVE_AUTOPLAY_KEY  = 'workout_active_autoplay_default';

const WorkoutDisplayContext = createContext(null);

export function WorkoutDisplayProvider({ children }) {
    const [previewDetailsDefault,  setPreviewDetailsDefault]  = useState(false);
    const [activeDetailsDefault,   setActiveDetailsDefault]   = useState(false);
    const [activeAutoplaysDefault, setActiveAutoplaysDefault] = useState(true);
    const [hydrated, setHydrated] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const [preview, active, autoplay] = await Promise.all([
                    AsyncStorage.getItem(PREVIEW_DETAILS_KEY),
                    AsyncStorage.getItem(ACTIVE_DETAILS_KEY),
                    AsyncStorage.getItem(ACTIVE_AUTOPLAY_KEY),
                ]);
                if (preview   !== null) setPreviewDetailsDefault(preview   === 'true');
                if (active    !== null) setActiveDetailsDefault(active     === 'true');
                if (autoplay  !== null) setActiveAutoplaysDefault(autoplay === 'true');
            } catch { /* ignore */ }
            setHydrated(true);
        })();
    }, []);

    const savePreviewDefault = async (value) => {
        setPreviewDetailsDefault(value);
        try { await AsyncStorage.setItem(PREVIEW_DETAILS_KEY, String(value)); } catch { /* ignore */ }
    };

    const saveActiveDefault = async (value) => {
        setActiveDetailsDefault(value);
        try { await AsyncStorage.setItem(ACTIVE_DETAILS_KEY, String(value)); } catch { /* ignore */ }
    };

    const saveActiveAutoplay = async (value) => {
        setActiveAutoplaysDefault(value);
        try { await AsyncStorage.setItem(ACTIVE_AUTOPLAY_KEY, String(value)); } catch { /* ignore */ }
    };

    return (
        <WorkoutDisplayContext.Provider value={{
            previewDetailsDefault,
            activeDetailsDefault,
            activeAutoplaysDefault,
            setPreviewDetailsDefault:  savePreviewDefault,
            setActiveDetailsDefault:   saveActiveDefault,
            setActiveAutoplaysDefault: saveActiveAutoplay,
            hydrated,
        }}>
            {children}
        </WorkoutDisplayContext.Provider>
    );
}

export function useWorkoutDisplay() {
    const ctx = useContext(WorkoutDisplayContext);
    if (!ctx) throw new Error('useWorkoutDisplay must be used inside WorkoutDisplayProvider');
    return ctx;
}
