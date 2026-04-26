import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';

// Colors progress red → green across the 5-point scale
const SCALE_COLORS = ['#d9534f', '#e8924a', '#e8c44a', '#9ec45a', '#7bb533'];

export default function ReadinessScale({ value, onChange, lowLabel, highLabel, question, testID }) {
    const { theme } = useTheme();

    return (
        <View style={styles.wrapper} testID={testID}>
            <Text style={[styles.question, { color: theme.textPrimary }]}>{question}</Text>
            <View style={styles.anchorRow}>
                <Text style={[styles.anchor, { color: theme.textSecondary }]} numberOfLines={1}>{lowLabel}</Text>
                <Text style={[styles.anchor, styles.anchorRight, { color: theme.textSecondary }]} numberOfLines={1}>{highLabel}</Text>
            </View>
            <View style={styles.trackRow} accessibilityRole="radiogroup" accessibilityLabel={question}>
                <View style={[styles.track, { backgroundColor: theme.surfaceBorder }]} />
                {SCALE_COLORS.map((color, i) => {
                    const selected = value === i + 1;
                    return (
                        <Pressable
                            key={i}
                            onPress={() => onChange(i + 1)}
                            style={[styles.nodeHitArea, { left: `${i * 20}%` }]}
                            accessibilityRole="radio"
                            accessibilityState={{ checked: selected }}
                            accessibilityLabel={`${i + 1} of 5`}
                        >
                            <View style={[
                                styles.node,
                                { borderColor: color },
                                selected && { backgroundColor: color, width: 34, height: 34, borderRadius: 17 },
                            ]}>
                                {selected && <View style={styles.nodeDot} />}
                            </View>
                        </Pressable>
                    );
                })}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    wrapper: {
        marginBottom: 20,
    },
    question: {
        fontSize: 15,
        fontWeight: '600',
        marginBottom: 8,
    },
    anchorRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 4,
        paddingHorizontal: 2,
    },
    anchor: {
        fontSize: 11,
        maxWidth: '45%',
    },
    anchorRight: {
        textAlign: 'right',
    },
    trackRow: {
        height: 44,
        flexDirection: 'row',
        alignItems: 'center',
        position: 'relative',
    },
    track: {
        position: 'absolute',
        left: '10%',
        right: '10%',
        height: 3,
        borderRadius: 2,
    },
    nodeHitArea: {
        position: 'absolute',
        width: '20%',
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
    },
    node: {
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 2,
        alignItems: 'center',
        justifyContent: 'center',
    },
    nodeDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: 'rgba(255,255,255,0.85)',
    },
});
