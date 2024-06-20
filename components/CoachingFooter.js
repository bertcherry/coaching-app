import * as React from 'react';
import { View, Text } from 'react-native';

export default function CoachingFooter() {
    return (
        <View style={{ width: '100%', backgroundColor: '#fba8a0' }}>
            <Text style={{ padding: 10, fontSize: 10, color: 'black', textAlign: 'center' }}>
                All rights reserved by Cherry Coaching, 2024
            </Text>
        </View>
    );
}