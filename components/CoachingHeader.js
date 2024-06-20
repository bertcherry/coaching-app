import * as React from 'react';
import { View, Text } from 'react-native';

export default function CoachingHeader() {
    return (
        <View style={{ backgroundColor: '#fba8a0' }}>
            <Text style={{ padding: 30, fontSize: 26, fontWeight: 600, color: 'black', textAlign: 'center' }}>
                Cherry Coaching
            </Text>
        </View>
    );
}