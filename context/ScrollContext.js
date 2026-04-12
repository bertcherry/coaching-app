import React, { createContext, useContext, useRef } from 'react';
import { Animated } from 'react-native';

const ScrollContext = createContext(null);

export function ScrollProvider({ children }) {
    const scrollY = useRef(new Animated.Value(0)).current;
    return (
        <ScrollContext.Provider value={scrollY}>
            {children}
        </ScrollContext.Provider>
    );
}

export function useScrollY() {
    const ctx = useContext(ScrollContext);
    if (!ctx) throw new Error('useScrollY must be used inside ScrollProvider');
    return ctx;
}
