import * as React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function CoachingHeader() {
    return (
        <View style={styles.container}>
            <Text style={styles.text}>
                Cherry Coaching
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        backgroundColor: '#fba8a0',
    },
    text: {
        padding: 30, 
        fontSize: 26, 
        fontWeight: 'bold', 
        color: 'black', 
        textAlign: 'center',
    }
})