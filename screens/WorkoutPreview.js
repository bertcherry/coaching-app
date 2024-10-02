import * as React from 'react';
import { View, Text, SectionList, TextInput, KeyboardAvoidingView, StyleSheet, Platform, Pressable, Button } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { Video, ResizeMode } from 'expo-av';

const Item = ({ ...item }) => {
    const [video, setVideo] = React.useState({});
    const [weight, onChangeWeight] = React.useState('');
    const [rpe, onChangeRpe] = React.useState('');
    const [notes, onChangeNotes] = React.useState('');
    const [showNotes, setShowNotes] = React.useState(false);
    const [showVideo, setShowVideo] = React.useState(false);
    
    React.useEffect(() => {
        const getVideo = async () => {
            try {
                const resp = await fetch(new URL(`https://videos.bert-m-cherry.workers.dev/${item.id}`));
                const videoResp = await resp.json();
                setVideo(videoResp);
            } catch (error) {
                console.error(error);
            }
        };

        getVideo();
    }, [item.id]);

    if (!Object.keys(video).length) return (
        <>
            <View style={styles.itemContainer}>
                <Text style={styles.bodyText}>Loading...</Text>
                <Text style={styles.bodyText}>Reps or Time: {item.count}</Text>
            </View>
        </>
        
    );

    const VideoPlayer = () => {
        const video = React.useRef(null);
        const [status, setStatus] = React.useState({});
        return (
            <View style={styles.videoContainer}>
                <Video
                    ref={video}
                    style={styles.video}
                    source={{
                    uri: `https://customer-fp1q3oe31pc8sz6g.cloudflarestream.com/${item.id}/manifest/video.m3u8`,
                    }}
                    useNativeControls
                    resizeMode={ResizeMode.CONTAIN}
                    isLooping
                    isMuted
                    onPlaybackStatusUpdate={status => setStatus(() => status)}
                />
                <View style={styles.buttons}>
                    <Button
                    title={status.isPlaying ? 'Pause' : 'Play'}
                    onPress={() =>
                        status.isPlaying ? video.current.pauseAsync() : video.current.playAsync()
                    }
                    />
                </View>
            </View>
        );
    }

    return (
        <>
            <View style={styles.itemContainer}>
                <Text style={styles.exerciseText}>{video.name}</Text>
                {(item.countType === 'AMRAP') && (
                    <Text style={styles.bodyText}>AMRAP</Text>
                )}
                {(item.countType != 'AMRAP') && (
                    <Text style={styles.bodyText}>{item.countType}: {item.count}</Text>
                )}
                <Pressable style={styles.button} onPress={() => {setShowVideo(!showVideo)}}>
                    <Feather name="film" size={16} color={showVideo ? '#fba8a0' : '#fae9e9'} />
                </Pressable>
                <Pressable style={styles.button} onPress={() => {setShowNotes(!showNotes)}}>
                    <Feather name="clipboard" size={16} color={showNotes ? '#fba8a0' : '#fae9e9'} />
                </Pressable>
            </View>
            {showVideo && (
                <View>
                    <VideoPlayer />
                </View>
            )}
            {showNotes && (
            <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                <View style={styles.itemContainer}>
                    <TextInput 
                        value={weight}
                        onChangeText={onChangeWeight}
                        placeholder={'Weight'}
                        style={styles.input}
                        keyboardType={'numeric'}
                        clearButtonMode='while-editing'
                        //use onBlur to store the data to the user
                    />
                    <TextInput 
                        value={rpe}
                        onChangeText={onChangeRpe}
                        placeholder={'RPE'}
                        style={styles.input}
                        keyboardType={'numeric'}
                        clearButtonMode='while-editing'
                        //use onBlur to store the data to the user
                    />
                </View>
                <TextInput 
                    value={notes}
                    onChangeText={onChangeNotes}
                    placeholder={'Notes'}
                    style={styles.notesInput}
                    multiline={true}
                    //use onBlur to store the data to the user
                />
            </KeyboardAvoidingView>
            )}
        </> 
    );
}

export default function WorkoutPreview({ route }) {
    const id = route.params.id;
    const [workoutData, setWorkoutData] = React.useState(undefined);

    React.useEffect(() => {
        const getWorkout = async () => {
            try {
                const resp = await fetch(new URL(`https://cc-workouts.bert-m-cherry.workers.dev/${id}`));
                const workoutResp = await resp.json();
                let respData = [...workoutResp];
                respData.forEach((section, index) => {
                    section.title = `Section ${index + 1}`;
                });
                setWorkoutData(respData);
            } catch (error) {
                console.error(error);
            }
        };
        getWorkout();
    }, [id]);

    if (workoutData === undefined) {
        return (
            <View style={styles.container}>
                <Text style={styles.headingText}>Loading...</Text>
            </View>
        );
    } else {
        const renderItem = ({ item }) => <Item {...item} />;
    
        const renderSectionHeader = ({ section: { title } }) => (
            <View>
                <Text style={styles.headingText}>{title}</Text>
            </View>
        );

        return (
            <View style={styles.container}>
                <SectionList 
                    sections={workoutData}
                    keyExtractor={(item) => item.id}
                    renderItem={renderItem}
                    renderSectionHeader={renderSectionHeader}
                    keyboardDismissMode='on-drag'
                />
            </View>
        );
    }
    
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'black',
        justifyContent: 'space-between',
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
    exerciseText: {
        padding: 20, 
        fontSize: 16, 
        color: '#fae9e9', 
        flexWrap: 'wrap',
        flex: 1
    },
    button: {
        padding: 10,
        height: 40,
        alignSelf: 'center',
        borderColor: '#fae9e9',
        borderWidth: 1,
        borderRadius: 8,
    },
    buttonText: {
        color: '#fae9e9',
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
    },
    videoContainer: {
        flex: 1,
        justifyContent: 'center',
        backgroundColor: '#ecf0f1',
      },
    video: {
        alignSelf: 'center',
        width: 320,
        height: 200,
    },
    buttons: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
    },
})