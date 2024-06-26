import * as React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function CoachingFooter() {
    return (
        <View style={styles.container}>
            <Text style={styles.text}>
                All rights reserved by Cherry Coaching, 2024
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        width: '100%',
        backgroundColor: '#fba8a0',
    },
    text: {
        padding: 10, 
        fontSize: 10, 
        color: 'black', 
        textAlign: 'center',
    }
})