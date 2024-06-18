import * as React from 'react';
import { View, Text } from 'react-native';

export default function CoachingHeader() {
    return (
        <View style={{ flex: 0.16, backgroundColor: '#fba8a0' }}>
            <Text style={{ padding: 40, fontSize: 26, fontWeight: 600, color: 'black' }}>
                Cherry Coaching Program
            </Text>
        </View>
    );
}