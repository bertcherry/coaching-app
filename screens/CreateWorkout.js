import * as React from 'react';
import { View, Switch, Text, TextInput, KeyboardAvoidingView, Platform, Pressable, FlatList, StyleSheet, ScrollView } from 'react-native';


//breaking change: pushing blank exercise and section data does not cause a re-render of the screen
//push is not recognized on all, could be flatlist rendering issue
const blankExercise = {
    id: null,
    sets: null, 
}

const blankSection = {
    timed: false,
    circuit: true,
    exercises: [{blankExercise}],
}

const sectionData = [
    {blankSection},
];

const Exercise = (id, sets) => {
    const [nameSearch, onChangeSearch] = React.useState('');
    //make onChangeSearch have a timeout for onChangeText
    //the onChangeSearch should also trigger a worker after timeout to search the video database and offer dropdown of options to select
    const [setDisplay, onChangeSets] = React.useState(sets);
    
    return (
        <>
            <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                <Text style={styles.regularText}>Name:</Text>
                <TextInput 
                    value={nameSearch}
                    onChangeText={onChangeSearch(nameSearch)}
                    placeholder='exercise name'
                    keyboardType='default'
                    style={styles.input}
                />
            </KeyboardAvoidingView>
            <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                <Text style={styles.regularText}>Sets:</Text>
                <TextInput 
                    value={setDisplay}
                    onChangeText={onChangeSets(setDisplay)}
                    //check that this onBlur method works
                    onBlur={() => {sets = setDisplay}}
                    keyboardType='numeric'
                    style={styles.input}
                />
            </KeyboardAvoidingView>
        </>
    );
}

const Section = (timed, circuit, exercises) => {
    const [isTimed, onSelectTimed] = React.useState(timed);
    const [isCircuit, onSelectCircuit] = React.useState(circuit);

    const renderItem = ({ item }) => <Exercise id={item.id} sets={item.sets} />;

    return (
        <>
            <View style={styles.switch}>
                <Switch 
                    trackColor={{false: '#767577', true: '#7bb533'}}
                    onValueChange={() => {onSelectTimed(!isTimed)}}
                    value={isTimed}
                />
                <Text style={styles.regularText}>Section is timed</Text>
            </View>
            <View style={styles.switch}>
                <Switch 
                    trackColor={{false: '#767577', true: '#7bb533'}}
                    onValueChange={() => {onSelectCircuit(!isCircuit)}}
                    value={isCircuit}
                />
                <Text style={styles.regularText}>Section is a circuit</Text>
            </View>
            <View>
                <FlatList 
                    data={exercises}
                    //keyExtractor={(item) => item.id}
                    renderItem={renderItem}
                    keyboardDismissMode='on-drag'
                />
            </View>
            <Pressable style={styles.button} onPress={() => {exercises.push(blankExercise)}}>
                <Text style={styles.buttonText}>Add Exercise</Text>
            </Pressable>
        </>
    )
}

export default function CreateWorkout() {
    const [isSaved, onSave] = React.useState(false);

    const renderItem = ({item}) => <Section timed={item.timed} circuit={item.circuit} exercises={item.exercises} />;

    return (
        <ScrollView style={styles.container}>
            {isSaved && (
                <Text style={styles.regularText}>Workout has been saved</Text>
            )}
            {!isSaved && (
                <View style={styles.container}>
                    <FlatList 
                        data={sectionData}
                        //keyExtractor={(item) => item.id}
                        renderItem={renderItem}
                        keyboardDismissMode='on-drag'
                    />
                    <Pressable style={styles.button} onPress={() => sectionData.push(blankSection)}>
                        <Text style={styles.buttonText}>Add Section</Text>
                    </Pressable>
                    <Pressable style={styles.button} onPress={() => {onSave(!isSaved)}}>
                        <Text style={styles.buttonText}>Save</Text>
                    </Pressable>
                </View>
            )}
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
