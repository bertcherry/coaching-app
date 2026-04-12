/**
 * ThemeContext.js
 * Location: context/ThemeContext.js
 *
 * Provides light and dark themes derived from the Cherry Coaching brand palette.
 * Dark:  black backgrounds, rose/cream accents (current look)
 * Light: warm cream/white backgrounds, same rose accents
 *
 * Theme preference is persisted in AsyncStorage.
 * 'system' (default) follows the device setting; 'light' / 'dark' override it.
 */

import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PREF_KEY = 'theme_preference'; // 'system' | 'light' | 'dark'

// ─── Brand tokens ─────────────────────────────────────────────────────────────

const brand = {
    rose:       '#fba8a0', // primary accent — buttons, highlights
    roseLight:  '#fae9e9', // pale rose — light mode background, dark mode text
    roseDark:   '#e8746a', // deeper rose — pressed states, dark mode accent
    green:      '#7bb533', // success / completed
    // Neutrals derived from the pale-rose brand tone
};

// ─── Dark theme (current look) ────────────────────────────────────────────────

export const dark = {
    mode: 'dark',
    // Surfaces
    background:         '#000000',
    surface:            '#0d0d0d',
    surfaceElevated:    '#1a1a1a',
    surfaceBorder:      '#222222',
    // Text
    textPrimary:        '#fae9e9',
    textSecondary:      '#aaaaaa',
    textTertiary:       '#666666',
    textInverse:        '#000000',
    // Brand
    accent:             brand.rose,
    accentPressed:      brand.roseDark,
    accentSubtle:       'rgba(251,168,160,0.12)',
    success:            brand.green,
    // Inputs
    inputBackground:    '#fae9e9',
    inputText:          '#000000',
    inputBorder:        brand.rose,
    inputPlaceholder:   '#888888',
    // Navigation / header
    headerBackground:   '#1a1a1a',
    // Misc
    divider:            '#222222',
    overlay:            'rgba(0,0,0,0.75)',
    pillText:           '#000000',
};

// ─── Light theme ──────────────────────────────────────────────────────────────

export const light = {
    mode: 'light',
    // Surfaces
    background:         '#faf5f5',  // warm off-white with a hint of rose
    surface:            '#ffffff',
    surfaceElevated:    '#fff0ef',  // very pale rose
    surfaceBorder:      '#f0d8d6',  // soft rose border
    // Text
    textPrimary:        '#1a0e0e',  // near-black with warm undertone
    textSecondary:      '#6b4e4d',  // muted rose-brown
    textTertiary:       '#b89a99',
    textInverse:        '#ffffff',
    // Brand
    accent:             brand.rose,
    accentPressed:      brand.roseDark,
    accentSubtle:       'rgba(251,168,160,0.15)',
    success:            brand.green,
    // Inputs
    inputBackground:    '#ffffff',
    inputText:          '#1a0e0e',
    inputBorder:        brand.rose,
    inputPlaceholder:   '#b89a99',
    // Navigation / header
    headerBackground:   '#fae9e9',
    // Misc
    divider:            '#f0d8d6',
    overlay:            'rgba(50,20,20,0.55)',
    pillText:           '#000000',
};

// ─── Context ──────────────────────────────────────────────────────────────────

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
    const deviceScheme = useColorScheme(); // 'light' | 'dark' | null
    const [preference, setPreference] = useState('system'); // persisted
    const [hydrated, setHydrated] = useState(false);

    // Load saved preference on mount
    useEffect(() => {
        (async () => {
            try {
                const saved = await AsyncStorage.getItem(PREF_KEY);
                if (saved === 'light' || saved === 'dark' || saved === 'system') {
                    setPreference(saved);
                }
            } catch { /* ignore */ }
            setHydrated(true);
        })();
    }, []);

    const savePreference = async (value) => {
        setPreference(value);
        try { await AsyncStorage.setItem(PREF_KEY, value); } catch { /* ignore */ }
    };

    // Resolve which theme to use
    const theme = useMemo(() => {
        const resolved = preference === 'system'
            ? (deviceScheme === 'light' ? 'light' : 'dark')
            : preference;
        return resolved === 'light' ? light : dark;
    }, [preference, deviceScheme]);

    return (
        <ThemeContext.Provider value={{ theme, preference, setPreference: savePreference, hydrated }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const ctx = useContext(ThemeContext);
    if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
    return ctx;
}