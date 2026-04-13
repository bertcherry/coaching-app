import React from 'react';
import { View, StyleSheet } from 'react-native';

/**
 * A small dot indicator for unread notifications.
 *
 * Usage:
 *   <View style={{ position: 'relative' }}>
 *     <SomeComponent />
 *     <NotificationDot visible={hasUnread} />
 *   </View>
 *
 * Props:
 *   visible  — render the dot at all (default true)
 *   size     — diameter in points (default 8)
 *   color    — fill color (default '#e05050')
 *   style    — extra style overrides for position
 */
export default function NotificationDot({ visible = true, size = 8, color = '#e05050', style }) {
    if (!visible) return null;
    return (
        <View
            style={[
                styles.dot,
                { width: size, height: size, borderRadius: size / 2, backgroundColor: color },
                style,
            ]}
            accessible={false}
        />
    );
}

const styles = StyleSheet.create({
    dot: {
        position: 'absolute',
        top: 0,
        right: 0,
    },
});
