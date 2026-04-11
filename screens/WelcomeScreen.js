import * as React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';

export default function WelcomeScreen() {
    const { theme } = useTheme();
    return (
        <View style={[styles.container, { backgroundColor: theme.background }]}>
            <ScrollView indicatorStyle={theme.mode === 'dark' ? 'white' : 'black'} style={styles.scrollContainer}>
                <Text style={[styles.headingText, { color: theme.textPrimary }]}>
                    Welcome to your Cherry Coaching Program
                </Text>
                <Text style={[styles.bodyText, { color: theme.textPrimary }]}>
                    This is your portal to access your personalized coaching plan, record your workouts, and send and receive feedback with your coach.
                </Text>
            </ScrollView>
        </View>

    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    scrollContainer: {
        flex: 1
    },
    headingText: {
        padding: 40,
        fontSize: 30,
        fontWeight: 'bold',
        textAlign: 'center',
    },
    bodyText: {
        padding: 20,
        fontSize: 20,
        textAlign: 'center',
        flexWrap: 'wrap'
    }
})