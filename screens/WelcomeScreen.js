import * as React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import CoachingHeader from '../components/CoachingHeader';
import CoachingFooter from '../components/CoachingFooter';

export default function WelcomeScreen() {
    return (
        <View style={styles.container}>
            <CoachingHeader />
            <ScrollView indicatorStyle={'white'} style={styles.scrollContainer}>
                <Text style={styles.headingText}>
                    Welcome to your Cherry Coaching Program
                </Text>    
                <Text style={styles.bodyText}>
                    This is your portal to access your personalized coaching plan, record your workouts, and send and receive feedback with your coach.
                </Text>
            </ScrollView>
            <CoachingFooter />
        </View>
        
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'black',
        justifyContent: 'space-between',
    },
    scrollContainer: {
        flex: 1
    },
    headingText: {
        padding: 40, 
        fontSize: 30, 
        fontWeight: 'bold', 
        color: '#fae9e9', 
        textAlign: 'center',
    },
    bodyText: {
        padding: 20, 
        fontSize: 20, 
        color: '#fae9e9', 
        textAlign: 'center', 
        flexWrap: 'wrap'
    }
})