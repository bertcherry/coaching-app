import * as React from 'react';
import { Text, ScrollView } from 'react-native';

export default function WelcomeScreen() {
    return (
        <ScrollView indicatorStyle={'white'} style={{ flex: 1}}>
            <Text style={{ padding: 40, fontSize: 80, fontWeight: 600, color: '#fae9e9', textAlign: 'center' }}>
                Welcome to your Cherry Coaching Program
            </Text>    
            <Text style={{ padding: 20, fontSize: 50, color: '#fae9e9', textAlign: 'center', flexWrap: 'wrap' }}>
                This is your portal to access your personalized coaching plan, record your workouts, and send and receive feedback with your coach.
            </Text>
        </ScrollView>
    );
}