import * as React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';

const CustomButton = ({ onPress, text, type="PRIMARY", bgColor, fgColor}) => {
    const { theme } = useTheme();

    return (
        <Pressable style={[
            styles.container,
            type === 'PRIMARY' && { backgroundColor: theme.accent },
            type === 'SECONDARY' && { borderColor: theme.accent, borderWidth: 2 },
            bgColor ? {backgroundColor: bgColor} : {}
        ]} onPress={onPress}>
            <Text style={[
                styles.text,
                type === 'PRIMARY' && { color: '#000' },
                type === 'SECONDARY' && { color: theme.accent },
                type === 'TERTIARY' && { color: theme.textSecondary },
                fgColor ? {color: fgColor} : {}
            ]}>{text}</Text>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    container: {
        paddingHorizontal: 20,
        paddingVertical: 10,
        marginVertical: 8,
        borderRadius: 8,
    },
    text: {
        fontSize: 18,
        textAlign: 'center',
    },
});

export default CustomButton;
