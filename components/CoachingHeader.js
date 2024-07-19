import * as React from 'react';
import { View, Image, StyleSheet } from 'react-native';

export default function CoachingHeader() {
    return (
        <View style={styles.container}>
            <Image 
                style={styles.logo}
                source={require('../img/CherryCoachingLogo.png')}
                accessible={true}
                accessibilityLabel='Cherry Coaching Logo'
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        backgroundColor: '#fae9e9',
        flex: .15,
        alignItems: 'center', 
        padding: 10
    },
    logo: {
        height: '100%',
        resizeMode: 'contain',
    }
})