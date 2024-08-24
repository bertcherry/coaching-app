import * as React from 'react';
import { FieldArray, Formik } from 'formik';
import uuid from 'react-native-uuid';
import { View, Switch, Text, TextInput, Pressable, StyleSheet, ScrollView, KeyboardAvoidingView, Modal, Platform } from 'react-native';
import RNPickerSelect from 'react-native-picker-select';
import Feather from '@expo/vector-icons/Feather';

const initialValues = {
    id: uuid.v4(),
    data: [
        {
            timed: false,
            circuit: true,
            exercises: [
                {
                    id: null,
                    name: null,
                    sets: null,
                    countType: null,
                    count: '',
                },
            ],
        },
    ],
};  

const Search = (exercise) => {
    const [showInput, setShowInput] = React.useState(true);
    const [showOptions, setShowOptions] = React.useState(false);
    const [searchValue, setSearchValue] = React.useState('');
    const [results, setResults] = React.useState([]);

    React.useEffect(() => {
        const timeoutId = setTimeout(async () => {
            if (searchValue.length !== 0) {
                try {
                    const searchParams = searchValue.replace(/ /g, '%20');
                    const resp = await fetch(new URL(`https://exercise-search.bert-m-cherry.workers.dev/?name=${searchParams}`));
                    const results = await resp.json();
                    setResults(results);
                    setShowOptions(true);
                } catch (error) {
                    console.error(error);
                }
            } else if (searchValue.length === 0) {
                setResults([]);
            }
        }, 750);

        return () => clearTimeout(timeoutId);
    }, [searchValue]);

    const onSelectExercise = (id, name) => {
        exercise.id = id;
        exercise.name = name;
        setShowInput(false);
        setShowOptions(false);
    }

    const handlePressSelected = () => {
        setShowInput(true);
        setShowOptions(true);
    }

    return (
        <KeyboardAvoidingView style={styles.inputContainer} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <Text style={{...styles.regularText, ...styles.labelText}}>Exercise Name</Text>
            {!showInput && (
                <Pressable onPress={handlePressSelected}>
                    <Text styles={styles.regularText}>{exercise.name}</Text>
                </Pressable>
            )}
            {showInput &&
               <TextInput style={styles.input} onChangeText={setSearchValue} placeholder='Search exercises...'></TextInput>
            }
            {showOptions && results.length > 0 && results.map((result, index) => (
                <Pressable onPress={() => onSelectExercise(result.id, result.name)}>
                    <Text style={styles.regularText} key={index}>{result.name}</Text>
                </Pressable>
            ))}
        </KeyboardAvoidingView>
    )
}

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
                                        <View style={{...styles.container, ...styles.sectionContainer}} key={index}>
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
                                                                <View style={styles.exerciseContainer} key={i}>
                                                                    {/* Need to change prop for exercise to store data properly, use Formik handlechange */}
                                                                    <Search exercise={exercise} />
                                                                    {/* Name search API call needed here from textinput, select and set the exercise id */}
                                                                    <View style={styles.rowContainer}>
                                                                        <View style={styles.inputContainer}>
                                                                            <Text style={{...styles.regularText, ...styles.labelText}}>Sets</Text>
                                                                            <TextInput style={styles.input} keyboardType='numeric' onChangeText={handleChange(`data.${index}.exercises.${i}.sets`)} onBlur={handleBlur(`data.${index}.exercises.${i}.sets`)} value={exercise.sets} />
                                                                        </View>
                                                                        <View style={{...styles.inputContainer, flex: 4}}>
                                                                            <Text style={{...styles.regularText, ...styles.labelText}}>Reps or Time</Text>
                                                                            <View style={styles.rowContainer}>
                                                                                {exercise.countType != 'AMRAP' &&
                                                                                        <TextInput style={{...styles.input, flex: .3}} keyboardType='numeric' onChangeText={handleChange(`data.${index}.exercises.${i}.count`)} onBlur={handleBlur(`data.${index}.exercises.${i}.count`)} value={exercise.count} editable={exercise.countType!='AMRAP'} />
                                                                                    }
                                                                                <View style={{flex: 1}}>
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
                                                                                            return <Feather name="chevron-down" size={20} color="#fae9e9" />;
                                                                                        }}
                                                                                        // Add a placeholder object to render() {const placeholder = {label, value, color}}
                                                                                    />
                                                                                </View>
                                                                            </View>
                                                                        </View>
                                                                        <View style={{alignSelf: 'center'}}>
                                                                            <Pressable style={{...styles.button, ...styles.iconButton}} onPress={() => remove(i)}>
                                                                                <Feather name="trash-2" size={20} color="black" />
                                                                            </Pressable>
                                                                        </View>
                                                                    </View>
                                                                </View>
                                                            ))}
                                                            <Pressable
                                                                style={styles.button}
                                                                onPress={() => push(
                                                                        {
                                                                            id: null,
                                                                            name: null,
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
                                                    name: null,
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
      fontSize: 16,
      padding: 8,
      marginVertical: 5,
      color: '#fae9e9',
    },
    labelText: {
        fontWeight: 'bold',
    },
    sectionContainer: {
        marginBottom: 10,
        borderBottomColor: 'grey',
        borderBottomWidth: 2,
        paddingBottom: 10,
    },
    exerciseContainer: {
        marginTop: 10,
        borderTopColor: 'grey',
        borderStyle: 'dotted',
        borderTopWidth: 1,
    },
    inputContainer: {
        flex: 1,
        margin: 10,
    },
    rowContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 20,
    },
    input: {
      flex: 0,
      height: 40,
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
    iconButton: {
        paddingHorizontal: 10,
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
        paddingRight: 20, // to ensure the text is never behind the icon
      },
      inputAndroid: {
        fontSize: 16,
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderWidth: 0.5,
        borderColor: 'purple',
        borderRadius: 8,
        color: '#fae9e9',
        paddingRight: 20, // to ensure the text is never behind the icon
      },
});