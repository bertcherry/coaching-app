import * as React from 'react';
import { View, Text, SectionList, TextInput, KeyboardAvoidingView, StyleSheet, Platform } from 'react-native';

const sampleWorkoutData = [
    {
        title: 'Warm Up - perform 1 set', 
        data: [
            { id: '2b8accccef2ba6b84b5b1bdb67847a41', reps: '8' },
            { id: '30c1f03c1e37b5d24d57c053f309f8d1', reps: '30s' },
            { id: 'eca8a60497694f00cbb9b6693adc1482', reps: '45s' },
        ],
    },
    {
        title: 'Main Complex - perform 3 sets',
        data: [
            { id: 'a04370d88397782be99660362dbf6453', reps: '8' },
            { id: '19442f9af359e332597f84d5ea22b029', reps: '5' },
            { id: 'f89f90f6867ab0bf765b71c9d21d38f5', reps: '20' },
        ],
    },
    {
        title: 'Accessories - perform 2-3 sets',
        data: [
            { id: 'ef5d55304abe5e19f5496df3c3de24e1', reps: '8/si' },
            { id: '3fe104578f0dc8a81866065a2ce8256f', reps: '8/si' },
            { id: '858b62e3ee6374ab983174f957eb623f', reps: '6/si' },
        ],
    },
    {
        title: 'Conditioning - perform 3 sets',
        data: [
            { id: '989e8773851fb8b721f3fe43443958cd', reps: '8/si' },
            { id: 'cf074993064e693dcd17ab832eca125f', reps: '5/si' },
            { id: '3a97e5fa9aae87b782ea3147a971306d', reps: '5/si' },
        ],
    },
];

const Item = ({ id, reps }) => {
    const [video, setVideo] = React.useState({});
    const [weight, onChangeWeight] = React.useState('');
    const [rpe, onChangeRpe] = React.useState('');
    const [notes, onChangeNotes] = React.useState('');
    
    React.useEffect(() => {
        const getVideo = async () => {
            const resp = await fetch(new URL(`https://videos.bert-m-cherry.workers.dev/${id}`));
            const videoResp = await resp.json();
            setVideo(videoResp);
        };

        getVideo();
    }, [id]);

    if (!Object.keys(video).length) return (
        <>
            <View style={styles.itemContainer}>
                <Text style={styles.bodyText}>Oops</Text>
                <Text style={styles.bodyText}>Reps or Time: {reps}</Text>
            </View>
        </>
        
    );

    return (
        <>
            <View style={styles.itemContainer}>
                <Text style={styles.bodyText}>{video.name}</Text>
                <Text style={styles.bodyText}>Reps or Time: {reps}</Text>
            </View>
            <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                <View style={styles.itemContainer}>
                    <TextInput 
                        value={weight}
                        onChangeText={onChangeWeight}
                        placeholder={'Weight'}
                        style={styles.input}
                        keyboardType={'numeric'}
                        clearButtonMode='while-editing'
                    />
                    <TextInput 
                        value={rpe}
                        onChangeText={onChangeRpe}
                        placeholder={'RPE'}
                        style={styles.input}
                        keyboardType={'numeric'}
                        clearButtonMode='while-editing'
                    />
                </View>
                <TextInput 
                    value={notes}
                    onChangeText={onChangeNotes}
                    placeholder={'Notes'}
                    style={styles.notesInput}
                    multiline={true}
                />
            </KeyboardAvoidingView>
        </> 
    );
}

export default function SampleWorkout() {
    const renderItem = ({ item }) => <Item id={item.id} reps={item.reps} />;

    const renderSectionHeader = ({ section: { title } }) => (
        <View>
            <Text style={styles.headingText}>{title}</Text>
        </View>
    )

    return (
        <View style={styles.container}>
            <SectionList 
                sections={sampleWorkoutData}
                keyExtractor={(item) => item.id}
                renderItem={renderItem}
                renderSectionHeader={renderSectionHeader}
                keyboardDismissMode='on-drag'
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1
    },
    itemContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between'
    },
    headingText: {
        padding: 40, 
        fontSize: 20, 
        fontWeight: 'bold', 
        color: '#fae9e9', 
        textAlign: 'center',
    },
    bodyText: {
        padding: 20, 
        fontSize: 16, 
        color: '#fae9e9', 
        flexWrap: 'wrap'
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
    notesInput: {
        height: 100,
        margin: 12,
        borderWidth: 1, 
        padding: 10, 
        fontSize: 16, 
        borderColor: '#fba8a0',
        backgroundColor: '#fae9e9'
    }
})