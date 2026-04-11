import * as React from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';

export default function CoachingHeader() {
    const { theme } = useTheme();
    return (
        <View style={[styles.container, { backgroundColor: theme.headerBackground }]}>
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
        flex: .15,
        alignItems: 'center',
        padding: 10
    },
    logo: {
        height: '100%',
        resizeMode: 'contain',
    }
})
