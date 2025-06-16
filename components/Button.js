import * as React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';

const CustomButton = ({ onPress, text, type="PRIMARY", bgColor, fgColor}) => {
    return (
        <Pressable style={[
            styles.container, 
            styles[`container_${type}`],
            bgColor ? {backgroundColor: bgColor} : {}
        ]} onPress={onPress}>
            <Text style={[
                styles.text, 
                styles[`text_${type}`],
                fgColor ? {color: fgColor} : {}
            ]}>{text}</Text>
        </Pressable>
    )
}

const styles = StyleSheet.create({
    container: {
        paddingHorizontal: 20,
        paddingVertical: 10,
        marginVertical: 8,
        borderRadius: 8,
    },
    container_PRIMARY: {
        backgroundColor: '#fba8a0',
    },
    container_TERTIARY: {

    },
    text: {
        fontSize: 18,
        color: 'black',
        textAlign: 'center',
    },
    text_TERTIARY: {
        color: 'grey',
    }
})

export default CustomButton;