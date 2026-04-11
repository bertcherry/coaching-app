import * as React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';

export default function CoachingFooter() {
    const { theme } = useTheme();
    return (
        <View style={[styles.container, { backgroundColor: theme.accent }]}>
            <Text style={styles.text}>
                All rights reserved by Cherry Coaching, 2024
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        width: '100%',
    },
    text: {
        padding: 10,
        fontSize: 10,
        color: '#000',
        textAlign: 'center',
    }
})
