import * as React from 'react';
import { ErrorMessage, FieldArray, Formik } from 'formik';
import uuid from 'react-native-uuid';
import {
    View, Switch, Text, TextInput, Pressable, StyleSheet,
    ScrollView, KeyboardAvoidingView, FlatList, Modal,
    Platform, Animated, Alert,
} from 'react-native';
import ExerciseCountInput from '../components/ExerciseCountInput';
import Feather from '@expo/vector-icons/Feather';
import * as Yup from 'yup';
import { useAuth } from '../context/AuthContext';
import ExerciseSearch from '../components/ExerciseSearch';

// ─── Schemas ──────────────────────────────────────────────────────────────────

const exerciseSchema = Yup.object().shape({
    id: Yup.string().nullable(),
    name: Yup.string().required('Select an exercise from the library'),
    sets: Yup.number()
        .required('Designate number of sets')
        .positive('Sets must be a positive number')
        .truncate(),
    countType: Yup.string().oneOf(['Reps', 'Timed', 'AMRAP']).nullable(),
 
    // countMin: required for Reps and Timed, not required for AMRAP
    countMin: Yup.number()
        .nullable()
        .positive('Must be a positive number')
        .when('countType', {
            is: (v) => v === 'Reps' || v === 'Timed',
            then: (schema) => schema.required('Enter a rep or time value'),
            otherwise: (schema) => schema.notRequired(),
        }),
 
    // countMax: always optional, but must be greater than countMin if provided
    countMax: Yup.number()
        .nullable()
        .positive('Must be a positive number')
        .when('countMin', {
            is: (v) => v != null,
            then: (schema) => schema.min(
                Yup.ref('countMin'),
                'Max must be greater than min'
            ),
            otherwise: (schema) => schema.notRequired(),
        }),
 
    // timeCapSeconds: optional, AMRAP only
    timeCapSeconds: Yup.number()
        .nullable()
        .positive('Time cap must be positive')
        .notRequired(),
});

const sectionSchema = Yup.object().shape({
    timed: Yup.boolean(),
    circuit: Yup.boolean(),
    data: Yup.array().min(1, 'Each section needs at least 1 exercise').of(exerciseSchema),
    repRest: Yup.number().positive('Must be a positive number').truncate().when('timed', {
        is: true,
        then: (schema) => schema.required('Required for timed sections'),
        otherwise: (schema) => schema.notRequired(),
    }),
    setRest: Yup.number().positive('Must be a positive number').truncate().when('timed', {
        is: true,
        then: (schema) => schema.required('Required for timed sections'),
        otherwise: (schema) => schema.notRequired(),
    }),
});

const workoutSchema = Yup.object().shape({
    id: Yup.string(),
    workoutName: Yup.string().required('Workout name is required'),
    // clientEmail optional — but if scheduledDate is set, clientEmail must also be set
    clientEmail: Yup.string().nullable(),
    clientName: Yup.string().nullable(),
    scheduledDate: Yup.string()
        .nullable()
        .matches(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
        .when('clientEmail', {
            is: (v) => !v,
            then: (schema) => schema.test(
                'no-date-without-client',
                'Select a client before adding a date',
                (v) => !v,
            ),
        }),
    data: Yup.array().min(1, 'Your workout must have at least one section').of(sectionSchema),
});

// ─── Success toast ────────────────────────────────────────────────────────────

const TOAST_DURATION = 5000;

const SaveToast = ({ onDismiss }) => {
    const progress = React.useRef(new Animated.Value(1)).current;
    const opacity = React.useRef(new Animated.Value(0)).current;

    React.useEffect(() => {
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
        Animated.timing(progress, {
            toValue: 0,
            duration: TOAST_DURATION,
            useNativeDriver: false,
        }).start();
        const timer = setTimeout(onDismiss, TOAST_DURATION);
        return () => clearTimeout(timer);
    }, []);

    const barWidth = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

    return (
        <Animated.View style={[styles.toast, { opacity }]}>
            <View style={styles.toastContent}>
                <View style={styles.toastCheck}>
                    <Feather name="check" size={16} color="#000" />
                </View>
                <Text style={styles.toastText}>Workout Saved</Text>
                <Pressable onPress={onDismiss} style={styles.toastClose}>
                    <Feather name="x" size={16} color="#fae9e9" />
                </Pressable>
            </View>
            <Animated.View style={[styles.toastBar, { width: barWidth }]} />
        </Animated.View>
    );
};

// ─── Client search picker ─────────────────────────────────────────────────────

const ClientSearch = ({ selectedEmail, selectedName, onSelect, coachEmail, authFetch }) => {
    const [showModal, setShowModal] = React.useState(false);
    const [searchValue, setSearchValue] = React.useState('');
    const [allClients, setAllClients] = React.useState([]);
    const [filtered, setFiltered] = React.useState([]);

    // Load coach's client roster once
    React.useEffect(() => {
        const load = async () => {
            try {
                const res = await authFetch('https://coaching-app.bert.m.cherry.workers.dev/coach/clients');
                const body = await res.json();
                setAllClients(body.clients ?? []);
                setFiltered((body.clients ?? []).slice(0, 5));
            } catch (e) {
                console.error('Could not load clients', e);
            }
        };
        load();
    }, [coachEmail]);

    React.useEffect(() => {
        if (searchValue.trim().length === 0) {
            setFiltered(allClients.slice(0, 5));
        } else {
            const q = searchValue.toLowerCase();
            setFiltered(
                allClients.filter(c =>
                    `${c.fname} ${c.lname}`.toLowerCase().includes(q) ||
                    c.email.toLowerCase().includes(q)
                ).slice(0, 10)
            );
        }
    }, [searchValue, allClients]);

    const onSelectClient = (client) => {
        onSelect(client.email, `${client.fname} ${client.lname}`);
        setShowModal(false);
        setSearchValue('');
    };

    const renderClient = ({ item }) => (
        <Pressable style={styles.clientRow} onPress={() => onSelectClient(item)}>
            <Text style={styles.regularText}>{item.fname} {item.lname}</Text>
            <Text style={styles.clientEmail}>{item.email}</Text>
        </Pressable>
    );

    return (
        <View style={styles.inputContainer}>
            <Text style={{ ...styles.regularText, ...styles.labelText }}>
                Client <Text style={styles.optionalLabel}>(optional)</Text>
            </Text>

            {selectedEmail ? (
                <Pressable style={styles.rowContainer} onPress={() => setShowModal(true)}>
                    <Text style={styles.regularText}>{selectedName}</Text>
                    <Feather name="chevron-down" size={20} color="#fae9e9" style={{ flex: 0 }} />
                </Pressable>
            ) : (
                <Pressable style={styles.input} onPress={() => setShowModal(true)}>
                    <Text style={{ color: 'grey' }}>Search clients...</Text>
                </Pressable>
            )}

            {showModal && (
                <Modal transparent animationType="slide" onRequestClose={() => setShowModal(false)}>
                    <KeyboardAvoidingView
                        style={{ ...styles.modalView, ...styles.container }}
                        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    >
                        <View style={{ ...styles.rowContainer, alignItems: 'center' }}>
                            <TextInput
                                style={{ ...styles.input, flex: 1 }}
                                onChangeText={setSearchValue}
                                value={searchValue}
                                placeholder="Search clients..."
                                autoFocus={true}
                            />
                            <Pressable
                                style={{ ...styles.button, ...styles.iconButton }}
                                onPress={() => setShowModal(false)}
                            >
                                <Feather name="x" size={20} color="black" />
                            </Pressable>
                        </View>
                        <FlatList
                            data={filtered}
                            renderItem={renderClient}
                            keyExtractor={item => item.email}
                            persistentScrollbar
                            indicatorStyle="white"
                            ListEmptyComponent={
                                <Text style={[styles.regularText, { padding: 20, color: '#888' }]}>
                                    No clients found
                                </Text>
                            }
                        />
                    </KeyboardAvoidingView>
                </Modal>
            )}
        </View>
    );
};

// ─── Date picker field ────────────────────────────────────────────────────────

const DateField = ({ value, onChange, onBlur, fieldName }) => {
    const [showPicker, setShowPicker] = React.useState(false);
    const now = new Date();
    const [pickerYear, setPickerYear] = React.useState(now.getFullYear());
    const [pickerMonth, setPickerMonth] = React.useState(now.getMonth());
    const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

    const toISO = (d) => d.toISOString().split('T')[0];
    const todayStr = toISO(now);

    const getGrid = (y, m) => {
        const first = new Date(y, m, 1);
        const last = new Date(y, m + 1, 0);
        const grid = [];
        for (let i = 0; i < first.getDay(); i++) {
            grid.push({ dateStr: toISO(new Date(y, m, 1 - (first.getDay() - i))), current: false });
        }
        for (let d = 1; d <= last.getDate(); d++) {
            grid.push({ dateStr: toISO(new Date(y, m, d)), current: true });
        }
        const rem = 7 - (grid.length % 7);
        if (rem < 7) for (let i = 1; i <= rem; i++) {
            grid.push({ dateStr: toISO(new Date(y, m + 1, i)), current: false });
        }
        return grid;
    };

    const monthLabel = (y, m) =>
        new Date(y, m, 1).toLocaleString('default', { month: 'long', year: 'numeric' });

    const prevMonth = () => {
        if (pickerMonth === 0) { setPickerMonth(11); setPickerYear(y => y - 1); }
        else setPickerMonth(m => m - 1);
    };
    const nextMonth = () => {
        if (pickerMonth === 11) { setPickerMonth(0); setPickerYear(y => y + 1); }
        else setPickerMonth(m => m + 1);
    };

    const grid = getGrid(pickerYear, pickerMonth);

    return (
        <View style={styles.inputContainer}>
            <Text style={{ ...styles.regularText, ...styles.labelText }}>
                Scheduled Date <Text style={styles.optionalLabel}>(optional)</Text>
            </Text>

            {value ? (
                <Pressable style={styles.rowContainer} onPress={() => setShowPicker(true)}>
                    <Text style={styles.regularText}>{value}</Text>
                    <Feather name="chevron-down" size={20} color="#fae9e9" style={{ flex: 0 }} />
                </Pressable>
            ) : (
                <Pressable style={styles.input} onPress={() => setShowPicker(true)}>
                    <Text style={{ color: 'grey' }}>Pick a date...</Text>
                </Pressable>
            )}

            <ErrorMessage
                render={msg => <Text style={styles.errorText}>{msg}</Text>}
                name={fieldName}
            />

            {showPicker && (
                <Modal transparent animationType="fade" onRequestClose={() => setShowPicker(false)}>
                    <View style={styles.dateModalOverlay}>
                        <View style={styles.dateModalCard}>
                            <View style={styles.dateModalHeader}>
                                <Pressable onPress={prevMonth}>
                                    <Feather name="chevron-left" size={22} color="#fae9e9" />
                                </Pressable>
                                <Text style={styles.dateModalMonth}>{monthLabel(pickerYear, pickerMonth)}</Text>
                                <Pressable onPress={nextMonth}>
                                    <Feather name="chevron-right" size={22} color="#fae9e9" />
                                </Pressable>
                            </View>
                            <View style={styles.dateGrid}>
                                {DAYS.map(d => (
                                    <Text key={d} style={styles.dateDayLabel}>{d}</Text>
                                ))}
                                {grid.map(({ dateStr, current }) => {
                                    const isPast = dateStr < todayStr;
                                    const isSelected = dateStr === value;
                                    return (
                                        <Pressable
                                            key={dateStr}
                                            style={[
                                                styles.dateCell,
                                                isSelected && styles.dateCellSelected,
                                                isPast && styles.dateCellPast,
                                                !current && styles.dateCellOther,
                                            ]}
                                            onPress={() => {
                                                if (!isPast) {
                                                    onChange(dateStr);
                                                    setShowPicker(false);
                                                    onBlur(fieldName);
                                                }
                                            }}
                                            disabled={isPast}
                                        >
                                            <Text style={[
                                                styles.dateCellText,
                                                isSelected && styles.dateCellSelectedText,
                                                isPast && styles.dateCellPastText,
                                                dateStr === todayStr && styles.dateCellToday,
                                                !current && styles.dateCellOtherText,
                                            ]}>
                                                {parseInt(dateStr.split('-')[2])}
                                            </Text>
                                        </Pressable>
                                    );
                                })}
                            </View>
                            {value && (
                                <Pressable
                                    style={styles.dateClearButton}
                                    onPress={() => { onChange(null); setShowPicker(false); }}
                                >
                                    <Text style={styles.dateClearText}>Clear date</Text>
                                </Pressable>
                            )}
                            <Pressable
                                style={[styles.button, { margin: 16 }]}
                                onPress={() => setShowPicker(false)}
                            >
                                <Text style={styles.buttonText}>Close</Text>
                            </Pressable>
                        </View>
                    </View>
                </Modal>
            )}
        </View>
    );
};

// ─── CreateWorkout ────────────────────────────────────────────────────────────

export default function CreateWorkout({ navigation, route }) {
    const { user, authFetch } = useAuth();

    // Route params from calendar day press or template copy
    const prefillClient = route?.params?.clientEmail ?? null;
    const prefillClientName = route?.params?.clientName ?? null;
    const prefillDate = route?.params?.scheduledDate ?? null;
    const prefillWorkout = route?.params?.workoutData ?? null; // for template copy

    const [showToast, setShowToast] = React.useState(false);

    const makeInitialValues = () => ({
        id: uuid.v4(),
        workoutName: prefillWorkout?.workoutName ?? '',
        clientEmail: prefillClient,
        clientName: prefillClientName,
        scheduledDate: prefillDate ?? null,
        data: prefillWorkout?.data ?? [
            {
                timed: false,
                circuit: true,
                data: [{
                    id: null,
                    name: null,
                    sets: null,
                    countType: null,
                    countMin: null,
                    countMax: null,
                    timeCapSeconds: null,
                }],
            },
        ],
    });

    const handleSave = async (values) => {
        try {
            // 1. Save workout to workouts table
            const response = await authFetch('https://coaching-app.bert-m-cherry.workers.dev/workouts/save', {
                method: 'POST',
                headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: values.id,
                    workoutName: values.workoutName,
                    createdBy: user.email,
                    data: values.data,
                }),
            });

            if (!response.ok) {
                Alert.alert('Error', 'Problem saving workout. Try again later.');
                return;
            }

            // 2. If client selected, create scheduled_workouts row
            if (values.clientEmail) {
                const schedRes = await authFetch('https://coaching-app.bert-m-cherry.workers.dev/schedule/assign', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        clientEmail: values.clientEmail,
                        workoutId: values.id,
                        workoutName: values.workoutName,
                        scheduledDate: values.scheduledDate ?? null,
                    }),
                });
                if (!schedRes.ok) {
                    Alert.alert('Error', 'Workout saved but could not schedule it. Try again.');
                    return;
                }
            }

            // 3. Show toast then navigate
            setShowToast(true);

            if (values.clientEmail) {
                // Navigate to client calendar — go to the month of the scheduled date if provided
                const targetMonth = values.scheduledDate
                    ? values.scheduledDate.substring(0, 7)
                    : null;
                navigation.navigate('Calendar', {
                    clientEmail: values.clientEmail,
                    month: targetMonth,
                });
            } else {
                // No client — go to unscheduled (template) workouts screen
                navigation.navigate('Unscheduled Workouts');
            }
        } catch (error) {
            Alert.alert('Error', 'Network error. Please try again.');
            console.error(error);
        }
    };

    return (
        <View style={{ flex: 1 }}>
            <ScrollView style={styles.container}>
                <Formik
                    initialValues={makeInitialValues()}
                    onSubmit={handleSave}
                    validationSchema={workoutSchema}
                >
                    {({ handleChange, handleBlur, handleSubmit, setFieldValue, values }) => (
                        <View style={styles.container}>

                            {/* ── Workout name ── */}
                            <View style={styles.inputContainer}>
                                <Text style={{ ...styles.regularText, ...styles.labelText }}>
                                    Workout Name <Text style={styles.requiredLabel}>*</Text>
                                </Text>
                                <TextInput
                                    style={styles.input}
                                    placeholder="e.g. Upper Body Strength"
                                    onChangeText={handleChange('workoutName')}
                                    onBlur={handleBlur('workoutName')}
                                    value={values.workoutName}
                                />
                                <ErrorMessage
                                    render={msg => <Text style={styles.errorText}>{msg}</Text>}
                                    name="workoutName"
                                />
                            </View>

                            {/* ── Client search ── */}
                            <ClientSearch
                                selectedEmail={values.clientEmail}
                                selectedName={values.clientName}
                                coachEmail={user.email}
                                authFetch={authFetch}
                                onSelect={(email, name) => {
                                    setFieldValue('clientEmail', email);
                                    setFieldValue('clientName', name);
                                    // Clear date if client is cleared
                                    if (!email) setFieldValue('scheduledDate', null);
                                }}
                            />

                            {/* ── Date — only shown once client is selected ── */}
                            {values.clientEmail && (
                                <DateField
                                    value={values.scheduledDate}
                                    onChange={(v) => setFieldValue('scheduledDate', v)}
                                    onBlur={handleBlur}
                                    fieldName="scheduledDate"
                                />
                            )}

                            {/* ── Sections / exercises (unchanged) ── */}
                            <FieldArray name="data" style={styles.container}>
                                {({ remove, push }) => (
                                    <View style={styles.container}>
                                        {values.data.length > 0 && values.data.map((section, index) => (
                                            <View style={{ ...styles.container, ...styles.sectionContainer }} key={index}>
                                                <Text style={styles.headerText}>Section {index + 1}</Text>
                                                <View style={styles.switch}>
                                                    <Switch
                                                        trackColor={{ false: '#767577', true: '#e7f6d0' }}
                                                        thumbColor={section.timed ? '#7bb533' : '#f4f3f4'}
                                                        onValueChange={(value) => setFieldValue(`data.${index}.timed`, value)}
                                                        value={section.timed}
                                                    />
                                                    <Text style={styles.regularText}>Section is timed</Text>
                                                </View>
                                                {section.timed && (
                                                    <View style={{ ...styles.rowContainer, justifyContent: 'space-around', marginBottom: 15 }}>
                                                        <View style={styles.container}>
                                                            <Text style={{ ...styles.regularText, ...styles.labelText }}>Rest Between Reps</Text>
                                                            <TextInput style={styles.input} keyboardType="numeric" onChangeText={handleChange(`data.${index}.repRest`)} onBlur={handleBlur(`data.${index}.repRest`)} value={section.repRest} placeholder="Enter in seconds" />
                                                            <ErrorMessage render={msg => <Text style={styles.errorText}>{msg}</Text>} name={`data.${index}.repRest`} />
                                                        </View>
                                                        <View style={styles.container}>
                                                            <Text style={{ ...styles.regularText, ...styles.labelText }}>Rest Between Sets</Text>
                                                            <TextInput style={styles.input} keyboardType="numeric" onChangeText={handleChange(`data.${index}.setRest`)} onBlur={handleBlur(`data.${index}.setRest`)} value={section.setRest} placeholder="Enter in seconds" />
                                                            <ErrorMessage render={msg => <Text style={styles.errorText}>{msg}</Text>} name={`data.${index}.setRest`} />
                                                        </View>
                                                    </View>
                                                )}
                                                <View style={styles.switch}>
                                                    <Switch
                                                        trackColor={{ false: '#767577', true: '#e7f6d0' }}
                                                        thumbColor={section.circuit ? '#7bb533' : '#f4f3f4'}
                                                        onValueChange={(value) => setFieldValue(`data.${index}.circuit`, value)}
                                                        value={section.circuit}
                                                    />
                                                    <Text style={styles.regularText}>Section is a circuit</Text>
                                                </View>
                                                <FieldArray name={`data.${index}.data`}>
                                                    {({ remove: removeEx, push: pushEx }) => (
                                                        <View style={styles.container}>
                                                            {section.data.length > 0 && section.data.map((exercise, i) => (
                                                                <View style={styles.exerciseContainer} key={i}>
                                                                    <ExerciseSearch
                                                                        exercise={exercise}
                                                                        exerciseNameField={`data.${index}.data.${i}.name`}
                                                                        exerciseIdField={`data.${index}.data.${i}.id`}
                                                                        setFieldValue={setFieldValue}
                                                                        handleBlur={handleBlur}
                                                                        isCoach={user?.isCoach}
                                                                        authFetch={authFetch}
                                                                    />
                                                                    <View style={styles.rowContainer}>
                                                                        <View style={styles.inputContainer}>
                                                                            <Text style={{ ...styles.regularText, ...styles.labelText }}>Sets</Text>
                                                                            <TextInput style={styles.input} keyboardType="numeric" onChangeText={handleChange(`data.${index}.data.${i}.sets`)} onBlur={handleBlur(`data.${index}.data.${i}.sets`)} value={exercise.sets} />
                                                                        </View>
                                                                        <ExerciseCountInput
                                                                            exercise={exercise}
                                                                            fieldBase={`data.${index}.data.${i}`}
                                                                            handleChange={handleChange}
                                                                            handleBlur={handleBlur}
                                                                            setFieldValue={setFieldValue}
                                                                        />
                                                                        <View style={{ alignSelf: 'center' }}>
                                                                            <Pressable
                                                                                style={{ ...styles.button, ...styles.iconButton }}
                                                                                onPress={() => {
                                                                                    section.data[1]
                                                                                        ? removeEx(i)
                                                                                        : alert('Section must have at least one exercise');
                                                                                }}
                                                                            >
                                                                                <Feather name="trash-2" size={20} color="black" />
                                                                            </Pressable>
                                                                        </View>
                                                                    </View>
                                                                    <View>
                                                                        <ErrorMessage render={msg => <Text style={styles.errorText}>{msg}</Text>} name={`data.${index}.data.${i}.sets`} />
                                                                    </View>
                                                                </View>
                                                            ))}
                                                            <Pressable
                                                                style={styles.button}
                                                                onPress={() => pushEx({
                                                                    id: null,
                                                                    name: null,
                                                                    sets: null,
                                                                    countType: null,
                                                                    countMin: null,
                                                                    countMax: null,
                                                                    timeCapSeconds: null,
                                                                })}
                                                            >
                                                                <Text style={styles.buttonText}>Add Exercise</Text>
                                                            </Pressable>
                                                        </View>
                                                    )}
                                                </FieldArray>
                                                <View style={{ marginTop: 10 }}>
                                                    <Pressable
                                                        style={styles.button}
                                                        onPress={() => {
                                                            values.data[1]
                                                                ? remove(index)
                                                                : alert('Workouts must have at least one section');
                                                        }}
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
                                                data: [{
                                                    id: null,
                                                    name: null,
                                                    sets: null,
                                                    countType: null,
                                                    countMin: null,
                                                    countMax: null,
                                                    timeCapSeconds: null,
                                                }],
                                            })}
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

            {/* Toast — rendered outside ScrollView so it floats above everything */}
            {showToast && <SaveToast onDismiss={() => setShowToast(false)} />}
        </View>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: 'black' },
    headerText: { padding: 10, fontSize: 24, color: '#fae9e9', textAlign: 'center' },
    regularText: { fontSize: 16, padding: 8, marginVertical: 5, color: '#fae9e9' },
    labelText: { fontWeight: 'bold' },
    requiredLabel: { color: '#fba8a0', fontWeight: 'bold' },
    optionalLabel: { color: '#888', fontWeight: 'normal', fontSize: 13 },
    errorText: { fontSize: 12, fontStyle: 'italic', padding: 8, marginVertical: 3, color: '#fba8a0', flexWrap: 'wrap' },
    sectionContainer: { flex: 1, marginBottom: 10, borderBottomColor: 'grey', borderBottomWidth: 2, paddingBottom: 10 },
    exerciseContainer: { flex: 1, marginTop: 10, borderTopColor: 'grey', borderStyle: 'dotted', borderTopWidth: 1 },
    inputContainer: { flex: 1, margin: 10 },
    rowContainer: { flexDirection: 'row', justifyContent: 'space-between', gap: 20, alignItems: 'center' },
    modalView: { marginTop: 50 },
    input: { flex: 0, height: 40, borderWidth: 1, padding: 10, fontSize: 16, borderColor: '#fba8a0', backgroundColor: '#fae9e9' },
    switch: { flex: 1, flexDirection: 'row' },
    button: { paddingHorizontal: 20, paddingVertical: 10, marginVertical: 8, backgroundColor: '#fba8a0', borderRadius: 8 },
    iconButton: { paddingHorizontal: 10 },
    buttonText: { fontSize: 24, color: 'black', textAlign: 'center' },
    clientRow: { borderBottomWidth: 0.5, borderBottomColor: '#333', paddingVertical: 4 },
    clientEmail: { fontSize: 12, color: '#888', paddingHorizontal: 8, paddingBottom: 4 },

    // Date picker
    dateModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 16 },
    dateModalCard: { backgroundColor: '#111', borderRadius: 12, width: '100%' },
    dateModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
    dateModalMonth: { color: '#fae9e9', fontWeight: '600', fontSize: 16 },
    dateGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8 },
    dateDayLabel: { width: `${100 / 7}%`, textAlign: 'center', color: '#555', fontSize: 11, marginBottom: 4 },
    dateCell: { width: `${100 / 7}%`, aspectRatio: 1, justifyContent: 'center', alignItems: 'center', borderRadius: 100 },
    dateCellSelected: { backgroundColor: '#fba8a0' },
    dateCellPast: { opacity: 0.25 },
    dateCellOther: { opacity: 0.3 },
    dateCellText: { color: '#fae9e9', fontSize: 13 },
    dateCellSelectedText: { color: '#000', fontWeight: 'bold' },
    dateCellPastText: { color: '#555' },
    dateCellToday: { color: '#fba8a0', fontWeight: 'bold' },
    dateCellOtherText: { color: '#888' },
    dateClearButton: { alignItems: 'center', paddingVertical: 8 },
    dateClearText: { color: '#888', fontSize: 14 },

    // Toast
    toast: {
        position: 'absolute',
        top: 12,
        left: 16,
        right: 16,
        backgroundColor: '#1a1a1a',
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#7bb533',
        overflow: 'hidden',
        zIndex: 999,
        elevation: 10,
    },
    toastContent: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10 },
    toastCheck: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#7bb533', justifyContent: 'center', alignItems: 'center' },
    toastText: { flex: 1, color: '#fae9e9', fontSize: 15, fontWeight: '600' },
    toastClose: { padding: 4 },
    toastBar: { height: 3, backgroundColor: '#7bb533' },
});

const pickerSelectStyles = StyleSheet.create({
    inputIOS: { fontSize: 16, paddingVertical: 12, paddingHorizontal: 10, borderWidth: 1, borderColor: 'gray', borderRadius: 4, color: '#fae9e9', paddingRight: 20 },
    inputAndroid: { fontSize: 16, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 0.5, borderColor: 'purple', borderRadius: 8, color: '#fae9e9', paddingRight: 20 },
});