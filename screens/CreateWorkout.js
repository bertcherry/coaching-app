import * as React from 'react';
import { FieldArray, Formik } from 'formik';
import uuid from 'react-native-uuid';
import { View, Switch, Text, TextInput, Pressable, StyleSheet, ScrollView } from 'react-native';
import RNPickerSelect from 'react-native-picker-select';
import AntDesign from '@expo/vector-icons/AntDesign';

const initialValues = {
    id: uuid.v4(),
    data: [
        {
            timed: false,
            circuit: true,
            exercises: [
                {
                    id: null,
                    sets: null,
                    countType: null,
                    count: '',
                },
            ],
        },
    ],
};  

export default function CreateWorkout() {
    return (
        <ScrollView style={styles.container}>
            <Formik
                initialValues={initialValues}
                onSubmit={async (values) => {
                    await new Promise((r) => setTimeout(r, 500));
                    alert(JSON.stringify(values, null, 2));
                }}
            >
                {({ handleChange, handleBlur, handleSubmit, setFieldValue, values }) => (
                    <View>
                        <FieldArray name="data">
                            {({ insert, remove, push }) => (
                                <View>
                                    {values.data.length > 0 && values.data.map((section, index) => (
                                        <View key={index}>
                                            <View style={styles.switch}>
                                                <Switch 
                                                    trackColor={{false: '#767577', true: '#e7f6d0'}}
                                                    thumbColor={section.timed ? '#7bb533': '#f4f3f4'}
                                                    onValueChange={(value) => setFieldValue(`data.${index}.timed`, value)}
                                                    value={section.timed}
                                                />
                                                <Text style={styles.regularText}>Section is timed</Text>
                                            </View>
                                            <View style={styles.switch}>
                                                <Switch 
                                                    trackColor={{false: '#767577', true: '#e7f6d0'}}
                                                    thumbColor={section.circuit ? '#7bb533': '#f4f3f4'}
                                                    onValueChange={(value) => setFieldValue(`data.${index}.circuit`, value)}
                                                    value={section.circuit}
                                                />
                                                <Text style={styles.regularText}>Section is a circuit</Text>
                                            </View>
                                            <View>
                                                <FieldArray name={`data.${index}.exercises`}>
                                                    {({insert, remove, push}) => (
                                                        <View>
                                                            {section.exercises.length > 0 && section.exercises.map((exercise, i) => (
                                                                <View key={i}>
                                                                    <View>
                                                                        <Text style={styles.regularText}>Sets</Text>
                                                                        <TextInput style={styles.input} keyboardType='numeric' onChangeText={handleChange(`data.${index}.exercises.${i}.sets`)} onBlur={handleBlur(`data.${index}.exercises.${i}.sets`)} value={exercise.sets} />
                                                                    </View>
                                                                    <View>
                                                                        <Text style={styles.regularText}>Reps or Time</Text>
                                                                        {exercise.countType != 'AMRAP' &&
                                                                            <TextInput style={styles.input} keyboardType='numeric' onChangeText={handleChange(`data.${index}.exercises.${i}.count`)} onBlur={handleBlur(`data.${index}.exercises.${i}.count`)} value={exercise.count} editable={exercise.countType!='AMRAP'} />
                                                                        }
                                                                        <RNPickerSelect 
                                                                            items={[
                                                                                { label: 'Reps', value: 'Reps', key: 'reps' },
                                                                                { label: 'Timed', value: 'Timed', key: 'timed' },
                                                                                { label: 'AMRAP', value: 'AMRAP', key: 'amrap' },
                                                                            ]}
                                                                            onValueChange={(value) => setFieldValue(`data.${index}.exercises.${i}.countType`, value)}
                                                                            onBlur={handleBlur(`data.${index}.exercises.${i}.countType`)}
                                                                            value={exercise.countType}
                                                                            style={pickerSelectStyles}
                                                                            Icon={() => {
                                                                                return <AntDesign name="down" size={20} color="#fae9e9" />;
                                                                            }}
                                                                            // Add a placeholder object to render() {const placeholder = {label, value, color}}
                                                                        />
                                                                    </View>
                                                                    <View>
                                                                        <Pressable style={styles.button} onPress={() => remove(i)}>
                                                                            <Text style={styles.buttonText}>Remove Exercise</Text>
                                                                        </Pressable>
                                                                    </View>
                                                                </View>
                                                            ))}
                                                            <Pressable
                                                                style={styles.button}
                                                                onPress={() => push(
                                                                        {
                                                                            id: null,
                                                                            sets: null,
                                                                            countType: null,
                                                                            count: '',
                                                                        },
                                                                )}
                                                            >
                                                                <Text style={styles.buttonText}>Add Exercise</Text>
                                                            </Pressable>
                                                        </View>
                                                    )}
                                                </FieldArray>
                                            </View>
                                            <View>
                                                <Pressable style={styles.button} onPress={() => remove(index)}>
                                                    <Text style={styles.buttonText}>Remove Section</Text>
                                                </Pressable>
                                            </View>
                                        </View>
                                    ))}
                                    <Pressable
                                        style={styles.button}
                                        onPress={() => push({ 
                                            timed: false, 
                                            circuit: true, 
                                            exercises: [
                                                {
                                                    id: null,
                                                    sets: null,
                                                    countType: null,
                                                    count: '',
                                                },
                                        ],})}
                                    >
                                        <Text style={styles.buttonText}>Add Section</Text>
                                    </Pressable>
                                </View>
                            )}
                        </FieldArray>
                        <Pressable style={styles.button} onPress={handleSubmit}>
                            <Text style={styles.buttonText}>Save Workout</Text>
                        </Pressable>
                    </View>
                )}

            </Formik>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: 'black',
    },
    headerText: {
      padding: 40,
      fontSize: 30,
      color: '#fae9e9',
      textAlign: 'center',
    },
    regularText: {
      fontSize: 24,
      padding: 20,
      marginVertical: 8,
      color: '#fae9e9',
      textAlign: 'center',
    },
    input: {
      flex: 1,
      height: 40,
      margin: 12,
      borderWidth: 1,
      padding: 10,
      fontSize: 16,
      borderColor: '#fba8a0',
      backgroundColor: '#fae9e9'
    },
    switch: {
      flex: 1,
      flexDirection: 'row',
    },
    button: {
      paddingHorizontal: 20,
      paddingVertical: 10,
      marginVertical: 8,
      backgroundColor: '#fba8a0',
      borderRadius: 8,
    },
    buttonText: {
      fontSize: 24,
      color: 'black',
      textAlign: 'center',
    },
  });

const pickerSelectStyles = StyleSheet.create({
    inputIOS: {
        fontSize: 16,
        paddingVertical: 12,
        paddingHorizontal: 10,
        borderWidth: 1,
        borderColor: 'gray',
        borderRadius: 4,
        color: '#fae9e9',
        paddingRight: 30, // to ensure the text is never behind the icon
      },
      inputAndroid: {
        fontSize: 16,
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderWidth: 0.5,
        borderColor: 'purple',
        borderRadius: 8,
        color: '#fae9e9',
        paddingRight: 30, // to ensure the text is never behind the icon
      },
});