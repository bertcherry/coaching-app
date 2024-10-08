import * as React from 'react';
import { ErrorMessage, FieldArray, Formik } from 'formik';
import uuid from 'react-native-uuid';
import { View, Switch, Text, TextInput, Pressable, StyleSheet, ScrollView, KeyboardAvoidingView, FlatList, Modal, Platform, Keyboard } from 'react-native';
import RNPickerSelect from 'react-native-picker-select';
import Feather from '@expo/vector-icons/Feather';
import * as Yup from 'yup';

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
                    count: null,
                },
            ],
        },
    ],
};  

const exerciseSchema = Yup.object().shape({
    id: Yup.string(),
    name: Yup.string().required('Select an exercise from the library'),
    sets: Yup.number().required('Designate number of sets').positive('Sets must be a positive number').truncate(),
    countType: Yup.string().oneOf(['Reps', 'Timed', 'AMRAP']),
    count: Yup.number().when('countType', {
        is: 'AMRAP',
        then: (schema) => schema.notRequired(),
        otherwise: (schema) => schema.required('Reps or time required unless AMRAP selected').positive('Reps or time must be a positive number').truncate(),
    }),
});

const sectionSchema = Yup.object().shape({
    timed: Yup.boolean(),
    circuit: Yup.boolean(),
    exercises: Yup.array().min(1, 'Each section needs at least 1 exercise').of(exerciseSchema),
    repRest: Yup.number().positive('Must be a positive number').truncate().when('timed', {
        is: true,
        then: (schema) => schema.required('Required for timed sections'),
        otherwise: (schema) => schema.notRequired()
    }),
    setRest: Yup.number().positive('Must be a positive number').truncate().when('timed', {
        is: true,
        then: (schema) => schema.required('Required for timed sections'),
        otherwise: (schema) => schema.notRequired()
    }),
});

const workoutSchema = Yup.object().shape({
    id: Yup.string(),
    data: Yup.array().min(1, 'Your workout must have at least one section').of(sectionSchema),
});

const Search = ({exercise, exerciseName, exerciseId, setFieldValue, handleBlur}) => {
    const [showInput, setShowInput] = React.useState(true);
    const [showOptions, setShowOptions] = React.useState(false);
    const [showModal, setShowModal] = React.useState(false);
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
        setShowOptions(false);
        setFieldValue(exerciseId, id);
        setFieldValue(exerciseName, name);
        setShowModal(false);
        setShowInput(false);
    }

    const handlePressSelected = () => {
        setShowModal(true);
        setShowInput(true);
        setShowOptions(true);
    }

    const renderItem = ({item}) => (
        <Pressable onPress={() => onSelectExercise(item.id, item.name)}>
            <Text style={styles.regularText}>{item.name}</Text>
        </Pressable>
    );

    return (
        <KeyboardAvoidingView style={styles.inputContainer} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <Text style={{...styles.regularText, ...styles.labelText}}>Exercise Name</Text>
            {!showInput && (
                <View>
                    <Pressable style={styles.rowContainer} onPress={handlePressSelected}>
                        <Text style={styles.regularText}>{exercise.name}</Text>
                        <Feather name="chevron-down" size={20} color="#fae9e9" style={{flex: 0}} />
                    </Pressable>
                </View>
            )}
            {showInput &&
               <Pressable style={styles.input} onPress={() => setShowModal(true)}>
                    <Text style={{color: 'grey'}}>Search exercises...</Text>
                    {/* Need to get this error message to render, probably onBlur or visited? */}
                    <ErrorMessage render={msg => <Text style={styles.errorText}>{msg}</Text>} name={exerciseName} />
               </Pressable>
            } 
            {showModal &&
            <Modal onRequestClose={() => {setShowModal(false); handleBlur(exerciseName);}} transparent={true}>
                <KeyboardAvoidingView style={{...styles.modalView, ...styles.container}} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                    <View style={{...styles.rowContainer, alignItems: 'center'}}>
                        {/* needs fix: android autofocus doesn't work because component has to mount before calling focus */}
                        <TextInput style={{...styles.input, flex: 1}} onChangeText={setSearchValue} placeholder='Search exercises...' autoFocus={true} onBlur={handleBlur(exerciseName)}></TextInput>
                        <Pressable style={{...styles.button, ...styles.iconButton}} onPress={() => {setShowModal(false)}}>
                            <Feather name="x" size={20} color="black" style={{flex: 0}} />
                        </Pressable>
                    </View>
                    {showOptions && results.length > 0 && (
                        <FlatList 
                            data={results}                            
                            persistentScrollbar={true}
                            indicatorStyle='white'
                            renderItem={renderItem}
                            keyExtractor={item => item.id}
                        />   
                    )}
                </KeyboardAvoidingView>
            </Modal>
            }
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
                validationSchema={workoutSchema}
                style={styles.container}
            >
                {({ handleChange, handleBlur, handleSubmit, setFieldValue, values }) => (
                    <View style={styles.container}>
                        <FieldArray name="data" style={styles.container}>
                            {({ insert, remove, push }) => (
                                <View style={styles.container}>
                                    {values.data.length > 0 && values.data.map((section, index) => (
                                        <View style={{...styles.container, ...styles.sectionContainer}} key={index}>
                                            <Text style={styles.headerText}>Section {index + 1}</Text>
                                            <View style={styles.switch}>
                                                <Switch 
                                                    trackColor={{false: '#767577', true: '#e7f6d0'}}
                                                    thumbColor={section.timed ? '#7bb533': '#f4f3f4'}
                                                    onValueChange={(value) => setFieldValue(`data.${index}.timed`, value)}
                                                    value={section.timed}
                                                />
                                                <Text style={styles.regularText}>Section is timed</Text>
                                            </View>
                                            {section.timed && 
                                                <View style={{...styles.rowContainer, justifyContent: 'space-around', marginBottom: 15}}>
                                                    <View style={styles.container}>
                                                        <Text style={{...styles.regularText, ...styles.labelText}}>Rest Between Reps</Text>
                                                        <TextInput style={styles.input} keyboardType='numeric' onChangeText={handleChange(`data.${index}.repRest`)} onBlur={handleBlur(`data.${index}.repRest`)} value={section.repRest} placeholder='Enter in seconds' />
                                                        <ErrorMessage render={msg => <Text style={styles.errorText}>{msg}</Text>} name={`data.${index}.repRest`} />
                                                    </View>
                                                    <View style={styles.container}>
                                                        <Text style={{...styles.regularText, ...styles.labelText}}>Rest Between Sets</Text>
                                                        <TextInput style={styles.input} keyboardType='numeric' onChangeText={handleChange(`data.${index}.setRest`)} onBlur={handleBlur(`data.${index}.setRest`)} value={section.setRest} placeholder='Enter in seconds' />
                                                        <ErrorMessage render={msg => <Text style={styles.errorText}>{msg}</Text>} name={`data.${index}.setRest`} />
                                                    </View>
                                                </View>
                                            }
                                            <View style={styles.switch}>
                                                <Switch 
                                                    trackColor={{false: '#767577', true: '#e7f6d0'}}
                                                    thumbColor={section.circuit ? '#7bb533': '#f4f3f4'}
                                                    onValueChange={(value) => setFieldValue(`data.${index}.circuit`, value)}
                                                    value={section.circuit}
                                                />
                                                <Text style={styles.regularText}>Section is a circuit</Text>
                                            </View>
                                            <View style={styles.container}>
                                                <FieldArray name={`data.${index}.exercises`} style={styles.container}>
                                                    {({insert, remove, push}) => (
                                                        <View style={styles.container}>
                                                            {section.exercises.length > 0 && section.exercises.map((exercise, i) => (
                                                                <View style={styles.exerciseContainer} key={i}>
                                                                    <Search exercise={exercise} exerciseName={`data.${index}.exercises.${i}.name`} exerciseId={`data.${index}.exercises.${i}.id`} setFieldValue={setFieldValue} handleBlur={handleBlur} />
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
                                                                                    {/* redo picker to have clickable icon, better placeholder */}
                                                                                    <RNPickerSelect 
                                                                                        items={[
                                                                                            { label: 'Reps', value: 'Reps', key: 'reps' },
                                                                                            { label: 'Timed', value: 'Timed', key: 'timed' },
                                                                                            { label: 'AMRAP', value: 'AMRAP', key: 'amrap' },
                                                                                        ]}
                                                                                        onValueChange={(value) => setFieldValue(`data.${index}.exercises.${i}.countType`, value)}
                                                                                        onBlur={() => {
                                                                                            handleBlur(`data.${index}.exercises.${i}.countType`);
                                                                                            validateField(`data.${index}.exercises.${i}.count`);
                                                                                        }}
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
                                                                            <Pressable style={{...styles.button, ...styles.iconButton}} onPress={() => {
                                                                                const exerciseTest = [...section.exercises];
                                                                                exerciseTest.pop(i);
                                                                                exerciseTest[0] ? remove(i) : alert('Section must have at least one exercise')}
                                                                            }>
                                                                                <Feather name="trash-2" size={20} color="black" />
                                                                            </Pressable>
                                                                        </View>
                                                                    </View>
                                                                    <View>
                                                                        <ErrorMessage render={msg => <Text style={styles.errorText}>{msg}</Text>} name={`data.${index}.exercises.${i}.sets`} />
                                                                        <ErrorMessage render={msg => <Text style={styles.errorText}>{msg}</Text>} name={`data.${index}.exercises.${i}.count`} />
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
                                                                            count: null,
                                                                        },
                                                                )}
                                                            >
                                                                <Text style={styles.buttonText}>Add Exercise</Text>
                                                            </Pressable>
                                                        </View>
                                                    )}
                                                </FieldArray>
                                            </View>
                                            <View style={{marginTop: 10}}>
                                                <Pressable style={styles.button} onPress={() => {
                                                    const sectionTest = [...values.data];
                                                    sectionTest.pop(index);
                                                    sectionTest[0] ? remove(index) : alert('Workouts must have at least one section')}}
                                                >
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
                                                    count: null,
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
      padding: 10,
      fontSize: 24,
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
    errorText: {
      fontSize: 12,
      fontStyle: 'italic',
      padding: 8,
      marginVertical: 3,
      color: '#fba8a0',
      flexWrap: 'wrap',
    },
    sectionContainer: {
        flex: 1,
        marginBottom: 10,
        borderBottomColor: 'grey',
        borderBottomWidth: 2,
        paddingBottom: 10,
    },
    exerciseContainer: {
        flex: 1,
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
    modalView: {
        marginTop: 50,
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