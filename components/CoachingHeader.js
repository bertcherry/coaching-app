import * as React from 'react';
import { View, Text } from 'react-native';

export default function CoachingHeader() {
    return (
    <View style={{ flex: 0.2, alignItems: 'center', backgroundColor: '#8ed9f4' }}>
        <Text style={{ padding: 40, fontSize: 30, color: 'black' }}>
            Strive & Uplift
            </Text>
    </View>
    );
}