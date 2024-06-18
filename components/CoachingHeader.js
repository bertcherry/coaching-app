import * as React from 'react';
import { View, Text } from 'react-native';

export default function CoachingHeader() {
    return (
        <View style={{ flex: 0.16, backgroundColor: 'white' }}>
            <Text style={{ padding: 40, fontSize: 26, color: 'd34f4f' }}>
                Cherry Coaching Program
            </Text>
        </View>
    );
}