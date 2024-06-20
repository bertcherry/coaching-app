import * as React from 'react';
import { View, Text, ScrollView } from 'react-native';

export default function WelcomeScreen() {
    return (
        <ScrollView style={{ flex: 1, padding: 20 }} indicatorStyle='white'>
            <Text style={{ padding: 40, fontSize: 40, fontWeight: 600, color: '#fae9e9', textAlign: 'center' }}>
                Welcome to your Cherry Coaching Program
            </Text>    
            <Text style={{ padding: 20, fontSize: 30, color: '#fae9e9', textAlign: 'center', flexWrap: 'wrap' }}>
                This is your portal to access your personalized coaching plan, record your workouts, and send and receive feedback with your coach.
            </Text>
        </ScrollView>
    );
}