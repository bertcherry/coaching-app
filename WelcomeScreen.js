import * as React from 'react';
import { View, Text } from 'react-native';

export default function WelcomeScreen() {
    return (
        <View  style={{ flex: 1 }}>
            <Text style={{ padding: 40, fontSize: 24, fontWeight: 600, color: '#fae9e9', textAlign: 'center' }}>
                Welcome to your Cherry Coaching Program
            </Text>    
            <Text style={{ padding: 20, fontSize: 20, color: '#fae9e9', textAlign: 'center' }}>
                This is your portal to access your personalized coaching plan, record your workouts, and send and receive feedback with your coach.
            </Text>
        </View>
    );
}