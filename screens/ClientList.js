import * as React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import CustomButton from '../components/Button';

export default function ClientList() {
    const navigation = useNavigation();
    // query database for a list of clients that have coachedBy equal to logged in user's email

    return (
        <View style={styles.container}>
            <ScrollView indicatorStyle={'white'} style={styles.scrollContainer}>
                <Text style={styles.headingText} // build a flatlist of clients that link to each client schedule (coach view)
                >
                    **build client list**
                </Text>    
                <CustomButton onPress={()=>{navigation.navigate('Add Client')}} text="Add Client" type="PRIMARY" />
            </ScrollView>
        </View>
        
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'black',
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