import * as React from 'react';
import { ErrorMessage, FieldArray, Formik } from 'formik';
import uuid from 'react-native-uuid';
import {
    View, Text, TextInput, Pressable, StyleSheet,
    ScrollView, KeyboardAvoidingView, FlatList, Modal,
    Platform, Animated, Alert, ActivityIndicator,
    UIManager,
} from 'react-native';
import ExerciseCountInput from '../components/ExerciseCountInput';
import Feather from '@expo/vector-icons/Feather';
import * as Yup from 'yup';
import { useAuth } from '../context/AuthContext';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../context/ThemeContext';
import { useScrollY } from '../context/ScrollContext';
import ExerciseSearch from '../components/ExerciseSearch';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

const WORKER_URL = 'https://coaching-app.bert-m-cherry.workers.dev';

// ─── Schemas ──────────────────────────────────────────────────────────────────

const exerciseSchema = Yup.object().shape({
    id: Yup.string().nullable(),
    name: Yup.string().required('Select an exercise from the library'),
    setsMin: Yup.number()
        .typeError('Sets must be a number')
        .required('Number of sets is required')
        .positive('Must be at least 1')
        .integer('Whole sets only')
        .truncate(),
    setsMax: Yup.number()
        .typeError('Must be a whole number')
        .nullable()
        .integer('Whole sets only')
        .when('setsMin', {
            is: (v) => v != null,
            then: (schema) => schema.min(Yup.ref('setsMin'), 'Max sets must be >= min sets'),
            otherwise: (schema) => schema.notRequired(),
        }),
    countType: Yup.string().oneOf(['Reps', 'Timed', 'AMRAP']).nullable(),
    countMin: Yup.number()
        .typeError('Must be a number')
        .nullable()
        .positive('Must be positive')
        .when('countType', {
            is: (v) => v === 'Reps' || v === 'Timed',
            then: (schema) => schema.required('Enter a rep or time value'),
            otherwise: (schema) => schema.notRequired(),
        }),
    countMax: Yup.number()
        .typeError('Must be a number')
        .nullable()
        .positive('Must be positive')
        .when('countMin', {
            is: (v) => v != null,
            then: (schema) => schema.min(Yup.ref('countMin'), 'Max must be > min'),
            otherwise: (schema) => schema.notRequired(),
        }),
    timeCapSeconds: Yup.number().typeError('Must be a number').nullable().positive('Must be positive').notRequired(),
    recommendedRpe: Yup.number()
        .typeError('RPE must be a number (e.g. 7 or 7.5)')
        .nullable()
        .min(1, 'RPE must be between 1 and 10')
        .max(10, 'RPE must be between 1 and 10')
        .notRequired(),
    recommendedWeight: Yup.string().nullable().notRequired(),
    coachNotes: Yup.string().nullable().notRequired(),
});

const sectionSchema = Yup.object().shape({
    timed: Yup.boolean(),
    circuit: Yup.boolean(),
    data: Yup.array().min(1, 'Each section needs at least 1 exercise').of(exerciseSchema),
    repRest: Yup.number().typeError('Must be a number').positive('Must be positive').truncate()
        .when('timed', { is: true, then: (s) => s.required('Required for timed sections'), otherwise: (s) => s.notRequired() }),
    setRest: Yup.number().typeError('Must be a number').positive('Must be positive').truncate()
        .when('timed', { is: true, then: (s) => s.required('Required for timed sections'), otherwise: (s) => s.notRequired() }),
});

const workoutSchema = Yup.object().shape({
    id: Yup.string(),
    workoutName: Yup.string().required('Workout name is required'),
    clientEmail: Yup.string().nullable(),
    clientName: Yup.string().nullable(),
    scheduledDate: Yup.string().nullable()
        .matches(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
        .when('clientEmail', {
            is: (v) => !v,
            then: (s) => s.test('no-date-without-client', 'Select a client before adding a date', (v) => !v),
        }),
    data: Yup.array().min(1, 'Your workout must have at least one section').of(sectionSchema),
});

const emptyExercise = () => ({
    id: null, name: null,
    setsMin: null, setsMax: null,
    countType: null, countMin: null, countMax: null, timeCapSeconds: null,
    recommendedRpe: null, recommendedWeight: null, coachNotes: null,
});


// ─── Confirmation dialog ──────────────────────────────────────────────────────

const ConfirmDialog = ({ visible, title, message, onConfirm, onCancel, confirmLabel = 'Remove' }) => {
    const { theme } = useTheme();
    const styles = makeStyles(theme);
    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
            <View style={styles.confirmOverlay}>
                <View style={styles.confirmCard}>
                    <Text style={styles.confirmTitle}>{title}</Text>
                    {message ? <Text style={styles.confirmMessage}>{message}</Text> : null}
                    <View style={styles.confirmActions}>
                        <Pressable style={styles.confirmCancel} onPress={onCancel}>
                            <Text style={styles.confirmCancelText}>Cancel</Text>
                        </Pressable>
                        <Pressable style={styles.confirmConfirm} onPress={onConfirm}>
                            <Text style={styles.confirmConfirmText}>{confirmLabel}</Text>
                        </Pressable>
                    </View>
                </View>
            </View>
        </Modal>
    );
};

// ─── Save toast ───────────────────────────────────────────────────────────────

const TOAST_DURATION = 5000;
const SaveToast = ({ onDismiss }) => {
    const { theme } = useTheme();
    const styles = makeStyles(theme);
    const progress = React.useRef(new Animated.Value(1)).current;
    const opacity  = React.useRef(new Animated.Value(0)).current;
    React.useEffect(() => {
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
        Animated.timing(progress, { toValue: 0, duration: TOAST_DURATION, useNativeDriver: false }).start();
        const t = setTimeout(onDismiss, TOAST_DURATION);
        return () => clearTimeout(t);
    }, []);
    const barWidth = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
    return (
        <Animated.View style={[styles.toast, { opacity }]}>
            <View style={styles.toastContent}>
                <View style={styles.toastCheck}><Feather name="check" size={16} color="#000" /></View>
                <Text style={styles.toastText}>Workout Saved</Text>
                <Pressable onPress={onDismiss} style={styles.toastClose}><Feather name="x" size={16} color={theme.textPrimary} /></Pressable>
            </View>
            <Animated.View style={[styles.toastBar, { width: barWidth }]} />
        </Animated.View>
    );
};

// ─── Client search ────────────────────────────────────────────────────────────

const ClientSearch = ({ selectedEmail, selectedName, onSelect, coachEmail, authFetch }) => {
    const { theme } = useTheme();
    const styles = makeStyles(theme);
    const [showModal, setShowModal]     = React.useState(false);
    const [searchValue, setSearchValue] = React.useState('');
    const [allClients, setAllClients]   = React.useState([]);
    const [filtered, setFiltered]       = React.useState([]);

    React.useEffect(() => {
        (async () => {
            try {
                const res = await authFetch(`${WORKER_URL}/coach/clients`);
                const body = await res.json();
                setAllClients(body.clients ?? []);
                setFiltered((body.clients ?? []).slice(0, 5));
            } catch {}
        })();
    }, [coachEmail]);

    React.useEffect(() => {
        if (!searchValue.trim()) { setFiltered(allClients.slice(0, 5)); return; }
        const q = searchValue.toLowerCase();
        setFiltered(allClients.filter(c =>
            `${c.fname} ${c.lname}`.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)
        ).slice(0, 10));
    }, [searchValue, allClients]);

    const onSelectClient = (client) => {
        onSelect(client.email, `${client.fname} ${client.lname}`);
        setShowModal(false); setSearchValue('');
    };

    return (
        <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>Client <Text style={styles.optionalLabel}>(optional)</Text></Text>
            {selectedEmail ? (
                <Pressable style={styles.selectButton} onPress={() => setShowModal(true)}>
                    <Feather name="user" size={15} color={theme.accent} />
                    <Text style={styles.selectButtonText}>{selectedName}</Text>
                    <Feather name="chevron-down" size={16} color={theme.textTertiary} />
                </Pressable>
            ) : (
                <Pressable style={styles.selectButtonEmpty} onPress={() => setShowModal(true)}>
                    <Feather name="user" size={15} color={theme.textTertiary} />
                    <Text style={styles.selectButtonEmptyText}>Search clients...</Text>
                </Pressable>
            )}
            {showModal && (
                <Modal transparent animationType="slide" onRequestClose={() => setShowModal(false)}>
                    <KeyboardAvoidingView style={styles.bottomSheet} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                        <View style={styles.sheetCard}>
                            <View style={styles.sheetHandle} />
                            <View style={styles.sheetSearchRow}>
                                <Feather name="search" size={16} color={theme.textTertiary} style={{ marginRight: 8 }} />
                                <TextInput style={styles.sheetSearchInput} onChangeText={setSearchValue} value={searchValue} placeholder="Search clients..." placeholderTextColor={theme.inputPlaceholder} autoFocus />
                                <Pressable onPress={() => setShowModal(false)} hitSlop={10}><Feather name="x" size={18} color={theme.textTertiary} /></Pressable>
                            </View>
                            <FlatList data={filtered} keyExtractor={item => item.email} keyboardShouldPersistTaps="handled"
                                renderItem={({ item }) => (
                                    <Pressable style={styles.clientRow} onPress={() => onSelectClient(item)}>
                                        <Text style={styles.clientName}>{item.fname} {item.lname}</Text>
                                        <Text style={styles.clientEmail}>{item.email}</Text>
                                    </Pressable>
                                )}
                                ListEmptyComponent={<Text style={styles.emptyListText}>No clients found</Text>}
                            />
                        </View>
                    </KeyboardAvoidingView>
                </Modal>
            )}
        </View>
    );
};


// ─── Date picker ──────────────────────────────────────────────────────────────

const DateField = ({ value, onChange, onBlur, fieldName }) => {
    const { theme } = useTheme();
    const styles = makeStyles(theme);
    const [showPicker, setShowPicker]   = React.useState(false);
    const now = new Date();
    const [pYear, setPYear] = React.useState(now.getFullYear());
    const [pMonth, setPMonth] = React.useState(now.getMonth());
    const DAYS = ['Su','Mo','Tu','We','Th','Fr','Sa'];
    const toISO = (d) => d.toISOString().split('T')[0];
    const todayStr = toISO(now);
    const getGrid = (y,m) => {
        const first=new Date(y,m,1), last=new Date(y,m+1,0), grid=[];
        for(let i=0;i<first.getDay();i++) grid.push({dateStr:toISO(new Date(y,m,1-(first.getDay()-i))),current:false});
        for(let d=1;d<=last.getDate();d++) grid.push({dateStr:toISO(new Date(y,m,d)),current:true});
        const rem=7-(grid.length%7); if(rem<7) for(let i=1;i<=rem;i++) grid.push({dateStr:toISO(new Date(y,m+1,i)),current:false});
        return grid;
    };
    const monthLabel=(y,m)=>new Date(y,m,1).toLocaleString('default',{month:'long',year:'numeric'});
    const prevM=()=>pMonth===0?(setPMonth(11),setPYear(y=>y-1)):setPMonth(m=>m-1);
    const nextM=()=>pMonth===11?(setPMonth(0),setPYear(y=>y+1)):setPMonth(m=>m+1);
    const grid=getGrid(pYear,pMonth);
    return (
        <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>Scheduled Date <Text style={styles.optionalLabel}>(optional)</Text></Text>
            {value ? (
                <Pressable style={styles.selectButton} onPress={()=>setShowPicker(true)}>
                    <Feather name="calendar" size={15} color={theme.accent} />
                    <Text style={styles.selectButtonText}>{value}</Text>
                    <Feather name="chevron-down" size={16} color={theme.textTertiary} />
                </Pressable>
            ) : (
                <Pressable style={styles.selectButtonEmpty} onPress={()=>setShowPicker(true)}>
                    <Feather name="calendar" size={15} color={theme.textTertiary} />
                    <Text style={styles.selectButtonEmptyText}>Pick a date...</Text>
                </Pressable>
            )}
            <ErrorMessage render={msg=><Text style={styles.errorText}>{msg}</Text>} name={fieldName} />
            {showPicker && (
                <Modal transparent animationType="fade" onRequestClose={()=>setShowPicker(false)}>
                    <View style={styles.dateModalOverlay}>
                        <View style={styles.dateModalCard}>
                            <View style={styles.dateModalHeader}>
                                <Pressable onPress={prevM} style={styles.dateNavButton}><Feather name="chevron-left" size={22} color={theme.textPrimary} /></Pressable>
                                <Text style={styles.dateModalMonth}>{monthLabel(pYear,pMonth)}</Text>
                                <Pressable onPress={nextM} style={styles.dateNavButton}><Feather name="chevron-right" size={22} color={theme.textPrimary} /></Pressable>
                            </View>
                            <View style={styles.dateGrid}>
                                {DAYS.map(d=><Text key={d} style={styles.dateDayLabel}>{d}</Text>)}
                                {grid.map(({dateStr,current})=>{
                                    const isPast=dateStr<todayStr, isSel=dateStr===value;
                                    return (
                                        <Pressable key={dateStr} style={[styles.dateCell,isSel&&styles.dateCellSelected,isPast&&styles.dateCellPast,!current&&styles.dateCellOther]}
                                            onPress={()=>{if(!isPast){onChange(dateStr);setShowPicker(false);onBlur(fieldName);}}} disabled={isPast}>
                                            <Text style={[styles.dateCellText,isSel&&styles.dateCellSelectedText,isPast&&styles.dateCellPastText,dateStr===todayStr&&styles.dateCellToday,!current&&styles.dateCellOtherText]}>
                                                {parseInt(dateStr.split('-')[2])}
                                            </Text>
                                        </Pressable>
                                    );
                                })}
                            </View>
                            {value&&<Pressable style={styles.dateClearButton} onPress={()=>{onChange(null);setShowPicker(false);}}><Text style={styles.dateClearText}>Clear date</Text></Pressable>}
                            <Pressable style={styles.dateCloseButton} onPress={()=>setShowPicker(false)}><Text style={styles.dateCloseText}>Close</Text></Pressable>
                        </View>
                    </View>
                </Modal>
            )}
        </View>
    );
};


// ─── Exercise history banner ──────────────────────────────────────────────────

const HistoryBanner = ({ history }) => {
    const { theme } = useTheme();
    const styles = makeStyles(theme);
    if (!history) return null;
    const parts=[];
    if(history.weight) parts.push(`${history.weight} ${history.weightUnit??'lbs'}`);
    if(history.reps)   parts.push(`${history.reps} reps`);
    if(history.rpe)    parts.push(`RPE ${history.rpe}`);
    if(!parts.length)  return null;
    return (
        <View style={styles.historyBanner}>
            <Feather name="clock" size={12} color={theme.accent} style={{marginRight:6}} />
            <Text style={styles.historyBannerText}>Last logged: {parts.join(' · ')}</Text>
        </View>
    );
};

// ─── Drop zone indicator ──────────────────────────────────────────────────────

const DropZone = ({ active }) => {
    const { theme } = useTheme();
    const styles = makeStyles(theme);
    return active ? <View style={styles.dropZone} /> : null;
};

// ─── Exercise card ────────────────────────────────────────────────────────────

const ExerciseCard = React.memo(({
    exercise, index, sectionIndex,
    handleChange, handleBlur, setFieldValue,
    onRemove, onDragStart, isDragging,
    clientEmail, unitDefault, authFetch, isTimed, isOnlyExercise,
}) => {
    const { theme } = useTheme();
    const styles = makeStyles(theme);
    const fieldBase = `data.${sectionIndex}.data.${index}`;
    const [history, setHistory]           = React.useState(null);
    const [loadingHistory, setLoadingHist]= React.useState(false);
    const [showAdvanced, setShowAdvanced] = React.useState(false);
    const [confirmRemove, setConfirmRemove] = React.useState(false);

    React.useEffect(() => {
        if(!exercise?.id || !clientEmail){setHistory(null);return;}
        let active=true;
        setLoadingHist(true);
        (async()=>{
            try{
                const res=await authFetch(`${WORKER_URL}/history/exercise-summary?clientEmail=${encodeURIComponent(clientEmail)}&exerciseId=${encodeURIComponent(exercise.id)}`);
                if(!res.ok) throw new Error();
                const body=await res.json();
                if(!active) return;
                setHistory(body.lastSet??null);
                if(body.lastCoachNote && !exercise.coachNotes) setFieldValue(`${fieldBase}.coachNotes`, body.lastCoachNote);
            } catch { if(active) setHistory(null); }
            finally  { if(active) setLoadingHist(false); }
        })();
        return ()=>{active=false;};
    }, [exercise?.id, clientEmail]);

    // Auto-expand if prefilled advanced data
    React.useEffect(() => {
        if(exercise.coachNotes || exercise.recommendedRpe != null || exercise.recommendedWeight) setShowAdvanced(true);
    }, []);

    const hasAdvData = !!(exercise.recommendedRpe || exercise.recommendedWeight || exercise.coachNotes);

    return (
        <>
            <View style={[styles.exerciseCard, isDragging && styles.exerciseCardDragging]}>
                <View style={styles.exerciseCardHeader}>
                    <Pressable style={styles.dragHandle} onLongPress={()=>onDragStart(sectionIndex,index)} delayLongPress={250} hitSlop={8}>
                        <Feather name="menu" size={16} color={theme.textTertiary} />
                    </Pressable>
                    <View style={styles.exerciseIndexBadge}>
                        <Text style={styles.exerciseIndexText}>{index+1}</Text>
                    </View>
                    <View style={{flex:1, transform: [{ translateY: -15 }]}}>
                        <ExerciseSearch exercise={exercise} exerciseNameField={`${fieldBase}.name`} exerciseIdField={`${fieldBase}.id`}
                            setFieldValue={setFieldValue} handleBlur={handleBlur} isCoach={true} authFetch={authFetch} />
                    </View>
                    <Pressable style={[styles.removeButton, isOnlyExercise && styles.removeButtonDisabled]} onPress={isOnlyExercise ? undefined : ()=>setConfirmRemove(true)} hitSlop={8} disabled={isOnlyExercise}>
                        <Feather name="x" size={16} color={theme.textTertiary} />
                    </Pressable>
                </View>

                <ErrorMessage render={msg=><Text style={styles.errorText}>{msg}</Text>} name={`${fieldBase}.name`} />

                {loadingHistory && <View style={styles.histLoadRow}><ActivityIndicator size="small" color={theme.accent} /><Text style={styles.histLoadText}>Loading history...</Text></View>}
                {history && <HistoryBanner history={history} />}

                {/* Sets */}
                <View style={styles.setsRow}>
                    <View style={styles.setsField}>
                        <Text style={styles.inputLabel}>Min sets <Text style={styles.req}>*</Text></Text>
                        <TextInput style={styles.setsInput} keyboardType="numeric" placeholder="3" placeholderTextColor={theme.inputPlaceholder}
                            onChangeText={handleChange(`${fieldBase}.setsMin`)} onBlur={handleBlur(`${fieldBase}.setsMin`)}
                            value={exercise.setsMin!=null?String(exercise.setsMin):''} />
                    </View>
                    <Text style={styles.setsDash}>–</Text>
                    <View style={styles.setsField}>
                        <Text style={styles.inputLabel}>Max sets</Text>
                        <TextInput style={[styles.setsInput,styles.setsInputOptional]} keyboardType="numeric" placeholder="opt." placeholderTextColor={theme.inputPlaceholder}
                            onChangeText={handleChange(`${fieldBase}.setsMax`)} onBlur={handleBlur(`${fieldBase}.setsMax`)}
                            value={exercise.setsMax!=null?String(exercise.setsMax):''} />
                    </View>
                </View>
                <ErrorMessage render={msg=><Text style={styles.errorText}>{msg}</Text>} name={`${fieldBase}.setsMin`} />
                <ErrorMessage render={msg=><Text style={styles.errorText}>{msg}</Text>} name={`${fieldBase}.setsMax`} />

                {/* Count type / inputs */}
                <View style={styles.countSection}>
                    <ExerciseCountInput exercise={exercise} fieldBase={fieldBase}
                        handleChange={handleChange} handleBlur={handleBlur} setFieldValue={setFieldValue}
                        forceTimed={isTimed} />
                </View>

                {/* Advanced toggle */}
                <Pressable style={styles.advancedToggle} onPress={()=>setShowAdvanced(v=>!v)}>
                    <Feather name={showAdvanced?'chevron-up':'chevron-down'} size={14} color={theme.textTertiary} />
                    <Text style={styles.advancedToggleText}>{showAdvanced?'Hide recommendations & notes':'Add recommendations & notes'}</Text>
                    {hasAdvData && <View style={styles.advancedDot} />}
                </Pressable>

                {showAdvanced && (
                    <View style={styles.advancedContainer}>
                        <View style={styles.advancedRow}>
                            <View style={styles.advancedField}>
                                <Text style={styles.inputLabel}>Rec. RPE <Text style={styles.inputLabelSub}>(1–10)</Text></Text>
                                <TextInput style={styles.advancedInput} keyboardType="decimal-pad" placeholder="e.g. 7" placeholderTextColor={theme.inputPlaceholder}
                                    onChangeText={handleChange(`${fieldBase}.recommendedRpe`)} onBlur={handleBlur(`${fieldBase}.recommendedRpe`)}
                                    value={exercise.recommendedRpe!=null?String(exercise.recommendedRpe):''} />
                                <ErrorMessage render={msg=><Text style={styles.errorText}>{msg}</Text>} name={`${fieldBase}.recommendedRpe`} />
                            </View>
                            <View style={styles.advancedField}>
                                <Text style={styles.inputLabel}>
                                    Rec. weight{clientEmail?` (${unitDefault??'lbs'})`:''}
                                    <Text style={styles.inputLabelSub}> — range ok</Text>
                                </Text>
                                <TextInput style={styles.advancedInput} placeholder={history?.weight?`Last: ${history.weight}`:'e.g. 135 or 135–155'} placeholderTextColor={theme.inputPlaceholder}
                                    onChangeText={handleChange(`${fieldBase}.recommendedWeight`)} onBlur={handleBlur(`${fieldBase}.recommendedWeight`)}
                                    value={exercise.recommendedWeight??''} />
                            </View>
                        </View>
                        <View style={styles.advancedNotesBlock}>
                            <Text style={styles.inputLabel}>Coach notes <Text style={styles.inputLabelSub}>(shown to client as guidance)</Text></Text>
                            <TextInput style={styles.notesInput} multiline
                                placeholder="E.g. Focus on bracing. Drive through heels. Stop if bar speed drops."
                                placeholderTextColor={theme.inputPlaceholder}
                                onChangeText={handleChange(`${fieldBase}.coachNotes`)} onBlur={handleBlur(`${fieldBase}.coachNotes`)}
                                value={exercise.coachNotes??''} />
                        </View>
                    </View>
                )}
            </View>

            <ConfirmDialog visible={confirmRemove} title="Remove exercise?"
                message={exercise.name?`Remove "${exercise.name}" from this section?`:'Remove this exercise?'}
                confirmLabel="Remove" onCancel={()=>setConfirmRemove(false)}
                onConfirm={()=>{setConfirmRemove(false);onRemove();}} />
        </>
    );
});


// ─── Section card ─────────────────────────────────────────────────────────────

const SectionCard = ({
    section, sectionIndex,
    handleChange, handleBlur, setFieldValue, values,
    onRemoveSection, clientEmail, unitDefault, authFetch,
    dragState, onDragStart, dropTargetSection, dropTargetIndex, isOnlySection,
}) => {
    const { theme } = useTheme();
    const styles = makeStyles(theme);
    const fieldBase = `data.${sectionIndex}`;
    const [confirmRemove, setConfirmRemove] = React.useState(false);

    return (
        <>
            <View style={styles.sectionCard}>
                <View style={styles.sectionCardHeader}>
                    <View style={styles.sectionBadge}><Text style={styles.sectionBadgeText}>Section {sectionIndex+1}</Text></View>
                    <View style={styles.sectionToggles}>
                        <Pressable style={[styles.toggleChip,section.timed&&styles.toggleChipActive]}
                            onPress={()=>{
                                const next=!section.timed;
                                setFieldValue(`${fieldBase}.timed`,next);
                                if(next) section.data.forEach((_,i)=>setFieldValue(`${fieldBase}.data.${i}.countType`,'Timed'));
                            }}>
                            <Feather name="clock" size={12} color={section.timed?theme.success:theme.textTertiary} />
                            <Text style={[styles.toggleChipText,section.timed&&styles.toggleChipTextActive]}>Timed</Text>
                        </Pressable>
                        <Pressable style={[styles.toggleChip,section.circuit&&styles.toggleChipActive]}
                            onPress={()=>setFieldValue(`${fieldBase}.circuit`,!section.circuit)}>
                            <Feather name="repeat" size={12} color={section.circuit?theme.success:theme.textTertiary} />
                            <Text style={[styles.toggleChipText,section.circuit&&styles.toggleChipTextActive]}>Circuit</Text>
                        </Pressable>
                    </View>
                    <Pressable style={[styles.removeButton, isOnlySection && styles.removeButtonDisabled]} onPress={isOnlySection ? undefined : ()=>setConfirmRemove(true)} hitSlop={8} disabled={isOnlySection}>
                        <Feather name="x" size={18} color={theme.textTertiary} />
                    </Pressable>
                </View>

                {section.timed && (
                    <View style={styles.timedRestRow}>
                        <View style={styles.timedRestField}>
                            <Text style={styles.inputLabel}>Rep rest (sec) <Text style={styles.req}>*</Text></Text>
                            <TextInput style={styles.timedRestInput} keyboardType="numeric" placeholder="e.g. 30" placeholderTextColor={theme.inputPlaceholder}
                                onChangeText={handleChange(`${fieldBase}.repRest`)} onBlur={handleBlur(`${fieldBase}.repRest`)}
                                value={section.repRest!=null?String(section.repRest):''} />
                            <ErrorMessage render={msg=><Text style={styles.errorText}>{msg}</Text>} name={`${fieldBase}.repRest`} />
                        </View>
                        <View style={styles.timedRestField}>
                            <Text style={styles.inputLabel}>Set rest (sec) <Text style={styles.req}>*</Text></Text>
                            <TextInput style={styles.timedRestInput} keyboardType="numeric" placeholder="e.g. 90" placeholderTextColor={theme.inputPlaceholder}
                                onChangeText={handleChange(`${fieldBase}.setRest`)} onBlur={handleBlur(`${fieldBase}.setRest`)}
                                value={section.setRest!=null?String(section.setRest):''} />
                            <ErrorMessage render={msg=><Text style={styles.errorText}>{msg}</Text>} name={`${fieldBase}.setRest`} />
                        </View>
                    </View>
                )}

                <FieldArray name={`${fieldBase}.data`}>
                    {({ remove: removeEx, push: pushEx }) => (
                        <View>
                            <DropZone active={dropTargetSection===sectionIndex && dropTargetIndex===0} />
                            {section.data.map((exercise,i) => (
                                <View key={i}>
                                    <ExerciseCard
                                        exercise={exercise} index={i} sectionIndex={sectionIndex}
                                        handleChange={handleChange} handleBlur={handleBlur} setFieldValue={setFieldValue}
                                        onRemove={()=>removeEx(i)}
                                        isOnlyExercise={section.data.length===1}
                                        onDragStart={onDragStart}
                                        isDragging={dragState?.fromSection===sectionIndex && dragState?.fromIndex===i}
                                        clientEmail={clientEmail} unitDefault={unitDefault} authFetch={authFetch}
                                        isTimed={section.timed}
                                    />
                                    <DropZone active={dropTargetSection===sectionIndex && dropTargetIndex===i+1} />
                                </View>
                            ))}
                            <Pressable style={styles.addExerciseButton} onPress={()=>pushEx(emptyExercise())}>
                                <Feather name="plus" size={15} color={theme.accent} />
                                <Text style={styles.addExerciseButtonText}>Add Exercise</Text>
                            </Pressable>
                        </View>
                    )}
                </FieldArray>
            </View>

            <ConfirmDialog visible={confirmRemove} title="Remove section?"
                message="All exercises in this section will be removed."
                confirmLabel="Remove section" onCancel={()=>setConfirmRemove(false)}
                onConfirm={()=>{setConfirmRemove(false);onRemoveSection();}} />
        </>
    );
};


// ─── CreateWorkout ────────────────────────────────────────────────────────────

export default function CreateWorkout({ navigation, route }) {
    const { user, authFetch } = useAuth();
    const { theme } = useTheme();
    const styles = makeStyles(theme);
    const scrollY = useScrollY();
    useFocusEffect(React.useCallback(() => { scrollY.setValue(0); }, [scrollY]));
    const prefillClient     = route?.params?.clientEmail ?? null;
    const prefillClientName = route?.params?.clientName ?? null;
    const prefillDate       = route?.params?.scheduledDate ?? null;
    const prefillWorkout    = route?.params?.workoutData ?? null;

    const [showToast, setShowToast] = React.useState(false);

    // ── Drag state ────────────────────────────────────────────────────────
    const [dragState,         setDragState]         = React.useState(null);
    const [dropTargetSection, setDropTargetSection] = React.useState(null);
    const [dropTargetIndex,   setDropTargetIndex]   = React.useState(null);
    const [undoState,         setUndoState]         = React.useState(null);
    const [showUndo,          setShowUndo]          = React.useState(false);
    const undoTimerRef = React.useRef(null);
    const formikRef    = React.useRef(null);  // { values, setValues }

    const startDrag = (sectionIndex, exerciseIndex) => {
        if (!formikRef.current) return;
        const exercise = formikRef.current.values.data[sectionIndex]?.data[exerciseIndex];
        if (!exercise) return;
        setDragState({ fromSection: sectionIndex, fromIndex: exerciseIndex, exercise });
        setDropTargetSection(sectionIndex);
        setDropTargetIndex(exerciseIndex);
    };

    const commitDrop = (toSection, toIndex) => {
        if (!dragState || !formikRef.current) { cancelDrag(); return; }
        const { fromSection, fromIndex, exercise } = dragState;
        const { values, setValues } = formikRef.current;
        if (fromSection === toSection && fromIndex === toIndex) { cancelDrag(); return; }

        const targetTimed = values.data[toSection]?.timed ?? false;
        const newData = values.data.map(s => ({ ...s, data: [...s.data] }));
        const movingEx = { ...newData[fromSection].data[fromIndex] };

        // Remove from source
        newData[fromSection].data.splice(fromIndex, 1);
        if (newData[fromSection].data.length === 0) newData[fromSection].data.push(emptyExercise());

        // Adjust for same-section shift
        let adjIndex = toIndex;
        if (fromSection === toSection && fromIndex < toIndex) adjIndex--;
        const insertAt = Math.max(0, Math.min(adjIndex, newData[toSection].data.length));

        if (targetTimed && movingEx.countType !== 'Timed') {
            const prevValues = JSON.parse(JSON.stringify(values));
            movingEx.countType = 'Timed';
            movingEx.countMin  = null;
            movingEx.countMax  = null;
            newData[toSection].data.splice(insertAt, 0, movingEx);
            setValues({ ...values, data: newData });
            cancelDrag();

            clearTimeout(undoTimerRef.current);
            setUndoState({ prevValues, message: `Moved into timed circuit. Fill in the time value. Undo?` });
            setShowUndo(true);
            undoTimerRef.current = setTimeout(() => setShowUndo(false), 7000);

            Alert.alert(
                'Moved into timed circuit',
                'This exercise now needs a time value instead of reps. Fill it in below.',
                [{ text: 'OK' }]
            );
        } else {
            newData[toSection].data.splice(insertAt, 0, movingEx);
            setValues({ ...values, data: newData });
            cancelDrag();
        }
    };

    const cancelDrag = () => { setDragState(null); setDropTargetSection(null); setDropTargetIndex(null); };
    const handleUndo = () => {
        if (!undoState || !formikRef.current) return;
        formikRef.current.setValues(undoState.prevValues);
        setShowUndo(false); clearTimeout(undoTimerRef.current);
    };

    // Allow tapping a drop zone while drag is active
    const onDropZoneTap = (toSection, toIndex) => {
        if (dragState) commitDrop(toSection, toIndex);
    };

    // ── Migration ─────────────────────────────────────────────────────────
    const migrateEx = (ex) => ({ ...emptyExercise(), ...ex, setsMin: ex.setsMin??ex.sets??null, setsMax: ex.setsMax??null, sets: undefined });
    const makeInitialValues = () => ({
        id: uuid.v4(),
        workoutName: prefillWorkout?.workoutName ?? '',
        clientEmail: prefillClient, clientName: prefillClientName,
        scheduledDate: prefillDate ?? null,
        data: prefillWorkout?.data
            ? prefillWorkout.data.map(s => ({ ...s, data: s.data.map(migrateEx) }))
            : [{ timed: false, circuit: true, data: [emptyExercise()] }],
    });

    const handleSave = async (values) => {
        try {
            const cleanData = values.data.map(s => ({ ...s, data: s.data.map(ex => { const { sets, ...rest } = ex; return rest; }) }));
            const res = await authFetch(`${WORKER_URL}/workouts/save`, {
                method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: values.id, workoutName: values.workoutName, createdBy: user.email, data: cleanData }),
            });
            if (!res.ok) { Alert.alert('Error', 'Problem saving workout.'); return; }

            if (values.clientEmail) {
                for (const section of cleanData) {
                    for (const ex of section.data) {
                        if (ex.id && ex.coachNotes) {
                            try {
                                await authFetch(`${WORKER_URL}/coach/exercise-notes`, {
                                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ clientEmail: values.clientEmail, exerciseId: ex.id, note: ex.coachNotes }),
                                });
                            } catch {}
                        }
                    }
                }
                const schedRes = await authFetch(`${WORKER_URL}/schedule/assign`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ clientEmail: values.clientEmail, workoutId: values.id, workoutName: values.workoutName, scheduledDate: values.scheduledDate ?? null }),
                });
                if (!schedRes.ok) { Alert.alert('Error', 'Workout saved but could not schedule.'); return; }
            }

            setShowToast(true);
            if (values.clientEmail) {
                navigation.navigate('Calendar', { clientEmail: values.clientEmail, month: values.scheduledDate?.substring(0,7) ?? null });
            } else {
                navigation.navigate('Template Workouts');
            }
        } catch (e) { Alert.alert('Error', 'Network error.'); console.error(e); }
    };

    return (
        <View style={{ flex: 1, backgroundColor: theme.background }}>
            <ScrollView style={styles.container} keyboardShouldPersistTaps="handled" onScroll={(e) => scrollY.setValue(e.nativeEvent.contentOffset.y)} scrollEventThrottle={16}>
                <Formik initialValues={makeInitialValues()} onSubmit={handleSave} validationSchema={workoutSchema}>
                    {({ handleChange, handleBlur, handleSubmit, setFieldValue, values, errors, setValues }) => {
                        formikRef.current = { values, setValues };
                        return (
                            <View style={styles.formContainer}>

                                {/* Workout name */}
                                <View style={styles.fieldBlock}>
                                    <Text style={styles.fieldLabel}>Workout Name <Text style={styles.req}>*</Text></Text>
                                    <TextInput style={styles.textInput} placeholder="e.g. Upper Body Strength" placeholderTextColor={theme.inputPlaceholder}
                                        onChangeText={handleChange('workoutName')} onBlur={handleBlur('workoutName')} value={values.workoutName} />
                                    <ErrorMessage render={msg=><Text style={styles.errorText}>{msg}</Text>} name="workoutName" />
                                </View>

                                <ClientSearch selectedEmail={values.clientEmail} selectedName={values.clientName}
                                    coachEmail={user.email} authFetch={authFetch}
                                    onSelect={(email, name) => {
                                        setFieldValue('clientEmail', email);
                                        setFieldValue('clientName', name);
                                        if (!email) setFieldValue('scheduledDate', null);
                                    }} />

                                {values.clientEmail && (
                                    <DateField value={values.scheduledDate} onChange={(v)=>setFieldValue('scheduledDate',v)}
                                        onBlur={handleBlur} fieldName="scheduledDate" />
                                )}

                                <FieldArray name="data">
                                    {({ remove, push }) => (
                                        <View>
                                            {values.data.map((section, si) => (
                                                <SectionCard key={si}
                                                    section={section} sectionIndex={si}
                                                    handleChange={handleChange} handleBlur={handleBlur}
                                                    setFieldValue={setFieldValue} values={values}
                                                    onRemoveSection={()=>remove(si)}
                                                    isOnlySection={values.data.length===1}
                                                    clientEmail={values.clientEmail}
                                                    unitDefault={user?.unitDefault??'lbs'}
                                                    authFetch={authFetch}
                                                    dragState={dragState}
                                                    onDragStart={startDrag}
                                                    dropTargetSection={dropTargetSection}
                                                    dropTargetIndex={dropTargetIndex}
                                                />
                                            ))}
                                            <Pressable style={styles.addSectionButton} onPress={()=>push({timed:false,circuit:true,data:[emptyExercise()]})}>
                                                <Feather name="plus-circle" size={18} color={theme.accent} />
                                                <Text style={styles.addSectionButtonText}>Add Section</Text>
                                            </Pressable>
                                        </View>
                                    )}
                                </FieldArray>

                                {Object.keys(errors).length > 0 && (
                                    <View style={styles.validationSummary}>
                                        <Feather name="alert-circle" size={14} color={theme.accent} style={{marginRight:8}} />
                                        <Text style={styles.validationSummaryText}>Please fix the highlighted fields above before saving.</Text>
                                    </View>
                                )}

                                <Pressable style={styles.saveButton} onPress={handleSubmit}>
                                    <Feather name="check" size={20} color="#000" />
                                    <Text style={styles.saveButtonText}>Save Workout</Text>
                                </Pressable>

                                <View style={{height:80}} />
                            </View>
                        );
                    }}
                </Formik>
            </ScrollView>

            {/* Drag active bar */}
            {dragState && (
                <View style={styles.dragActiveBar}>
                    <Feather name="move" size={14} color="#000" style={{marginRight:8}} />
                    <Text style={styles.dragActiveBarText} numberOfLines={1}>
                        Moving: {dragState.exercise?.name??'exercise'} — long-press another drag handle to place
                    </Text>
                    <Pressable onPress={cancelDrag} style={styles.dragCancelButton}>
                        <Text style={styles.dragCancelButtonText}>Cancel</Text>
                    </Pressable>
                </View>
            )}

            {/* Undo bar */}
            {showUndo && undoState && (
                <View style={styles.undoBar}>
                    <Text style={styles.undoBarText} numberOfLines={2}>{undoState.message}</Text>
                    <Pressable onPress={handleUndo} style={styles.undoButton}>
                        <Text style={styles.undoButtonText}>Undo</Text>
                    </Pressable>
                </View>
            )}

            {showToast && <SaveToast onDismiss={()=>setShowToast(false)} />}
        </View>
    );
}


// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(theme) { return StyleSheet.create({
    container:     { flex: 1, backgroundColor: theme.background },
    formContainer: { padding: 16, gap: 4 },

    // All label text theme.textSecondary or above for WCAG AA contrast
    fieldBlock:    { marginBottom: 16 },
    fieldLabel:    { fontSize: 13, fontWeight: '600', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 },
    req:           { color: theme.accent },
    optionalLabel: { color: theme.textSecondary, fontWeight: 'normal', textTransform: 'none', letterSpacing: 0, fontSize: 12 },
    inputLabel:    { fontSize: 11, fontWeight: '600', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 },
    inputLabelSub: { textTransform: 'none', fontWeight: 'normal', color: theme.textSecondary, letterSpacing: 0, fontSize: 10 },
    errorText:     { fontSize: 12, fontStyle: 'italic', color: theme.accent, marginTop: 4, paddingHorizontal: 2 },

    textInput: { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.surfaceBorder, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: theme.textPrimary },

    selectButton:      { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.accent, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12 },
    selectButtonText:  { flex: 1, fontSize: 15, color: theme.textPrimary },
    selectButtonEmpty: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.surfaceBorder, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12 },
    selectButtonEmptyText: { fontSize: 15, color: theme.textSecondary },

    bottomSheet:     { flex: 1, justifyContent: 'flex-end', backgroundColor: theme.overlay },
    sheetCard:       { backgroundColor: theme.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '70%', paddingBottom: 40 },
    sheetHandle:     { width: 36, height: 4, backgroundColor: theme.surfaceBorder, borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 8 },
    sheetSearchRow:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: theme.divider },
    sheetSearchInput:{ flex: 1, color: theme.textPrimary, fontSize: 15 },
    clientRow:       { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: theme.surfaceElevated },
    clientName:      { fontSize: 15, color: theme.textPrimary, fontWeight: '500' },
    clientEmail:     { fontSize: 12, color: theme.textSecondary, marginTop: 2 },
    emptyListText:   { color: theme.textSecondary, textAlign: 'center', padding: 30 },

    dateModalOverlay: { flex: 1, backgroundColor: theme.overlay, justifyContent: 'center', alignItems: 'center', padding: 16 },
    dateModalCard:    { backgroundColor: theme.surface, borderRadius: 12, width: '100%', borderWidth: 1, borderColor: theme.divider },
    dateModalHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
    dateNavButton:    { padding: 4 },
    dateModalMonth:   { color: theme.textPrimary, fontWeight: '600', fontSize: 16 },
    dateGrid:         { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8 },
    dateDayLabel:     { width: `${100/7}%`, textAlign: 'center', color: theme.textSecondary, fontSize: 11, marginBottom: 4 },
    dateCell:         { width: `${100/7}%`, aspectRatio: 1, justifyContent: 'center', alignItems: 'center', borderRadius: 100 },
    dateCellSelected: { backgroundColor: theme.accent },
    dateCellPast:     { opacity: 0.3 },
    dateCellOther:    { opacity: 0.35 },
    dateCellText:     { color: theme.textPrimary, fontSize: 13 },
    dateCellSelectedText: { color: '#000', fontWeight: 'bold' },
    dateCellPastText: { color: theme.textTertiary },
    dateCellToday:    { color: theme.accent, fontWeight: 'bold' },
    dateCellOtherText:{ color: theme.textSecondary },
    dateClearButton:  { alignItems: 'center', paddingVertical: 8 },
    dateClearText:    { color: theme.textSecondary, fontSize: 14 },
    dateCloseButton:  { margin: 16, backgroundColor: theme.surfaceElevated, borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
    dateCloseText:    { color: theme.textPrimary, fontSize: 15 },

    confirmOverlay:   { flex: 1, backgroundColor: theme.overlay, justifyContent: 'center', alignItems: 'center', padding: 32 },
    confirmCard:      { backgroundColor: theme.surface, borderRadius: 12, padding: 24, width: '100%', borderWidth: 1, borderColor: theme.divider },
    confirmTitle:     { fontSize: 17, fontWeight: '700', color: theme.textPrimary, marginBottom: 8 },
    confirmMessage:   { fontSize: 14, color: theme.textSecondary, marginBottom: 20, lineHeight: 20 },
    confirmActions:   { flexDirection: 'row', gap: 12 },
    confirmCancel:    { flex: 1, borderWidth: 1, borderColor: theme.surfaceBorder, borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
    confirmCancelText:{ color: theme.textSecondary, fontSize: 15 },
    confirmConfirm:   { flex: 1, backgroundColor: theme.accentSubtle, borderWidth: 1, borderColor: theme.accent, borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
    confirmConfirmText:{ color: theme.accent, fontSize: 15, fontWeight: '600' },

    sectionCard:      { backgroundColor: theme.surface, borderRadius: 12, borderWidth: 1, borderColor: theme.divider, marginBottom: 16, overflow: 'hidden' },
    sectionCardHeader:{ flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 0.5, borderBottomColor: theme.divider, gap: 8 },
    sectionBadge:     { backgroundColor: theme.surfaceElevated, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
    sectionBadgeText: { color: theme.textSecondary, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
    sectionToggles:   { flexDirection: 'row', gap: 6, flex: 1 },
    toggleChip:       { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: theme.surfaceBorder },
    toggleChipActive: { borderColor: theme.success, backgroundColor: 'rgba(123,181,51,0.1)' },
    toggleChipText:   { fontSize: 12, color: theme.textSecondary },
    toggleChipTextActive: { color: theme.success },

    timedRestRow:   { flexDirection: 'row', gap: 12, padding: 14, borderBottomWidth: 0.5, borderBottomColor: theme.divider },
    timedRestField: { flex: 1 },
    timedRestInput: { backgroundColor: theme.surfaceElevated, borderWidth: 1, borderColor: theme.surfaceBorder, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 15, color: theme.textPrimary, textAlign: 'center' },

    exerciseCard:        { borderTopWidth: 0.5, borderTopColor: theme.divider, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8 },
    exerciseCardDragging:{ opacity: 0.35 },
    exerciseCardHeader:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    dragHandle:          { padding: 6 },
    exerciseIndexBadge:  { width: 22, height: 22, borderRadius: 11, backgroundColor: theme.surfaceElevated, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
    exerciseIndexText:   { fontSize: 11, color: theme.textSecondary, fontWeight: '700' },
    removeButton:        { padding: 6, borderRadius: 6, backgroundColor: theme.surfaceElevated, borderWidth: 1, borderColor: theme.surfaceBorder },
    removeButtonDisabled:{ opacity: 0.35 },

    historyBanner:    { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.accentSubtle, borderWidth: 0.5, borderColor: theme.accentSubtle, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 10 },
    historyBannerText:{ fontSize: 12, color: theme.accent, flex: 1 },
    histLoadRow:      { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
    histLoadText:     { fontSize: 12, color: theme.textSecondary },

    setsRow:         { flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginBottom: 4 },
    setsField:       { width: 80 },
    setsInput:       { height: 40, backgroundColor: theme.surfaceElevated, borderWidth: 1, borderColor: theme.surfaceBorder, borderRadius: 8, textAlign: 'center', fontSize: 15, color: theme.textPrimary },
    setsInputOptional:{ borderStyle: 'dashed', borderColor: theme.surfaceBorder, color: theme.textSecondary },
    setsDash:        { color: theme.textTertiary, fontSize: 20, paddingBottom: 8, width: 16, textAlign: 'center' },
    countSection:    { marginTop: 4, marginBottom: 4 },

    advancedToggle:     { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 },
    advancedToggleText: { fontSize: 12, color: theme.textSecondary },
    advancedDot:        { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.accent },
    advancedContainer:  { backgroundColor: theme.surface, borderRadius: 8, padding: 12, gap: 10, marginBottom: 8, borderWidth: 0.5, borderColor: theme.divider },
    advancedRow:        { flexDirection: 'row', gap: 12 },
    advancedField:      { flex: 1 },
    advancedInput:      { backgroundColor: theme.surfaceElevated, borderWidth: 1, borderColor: theme.surfaceBorder, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 15, color: theme.textPrimary, textAlign: 'center' },
    advancedNotesBlock: { gap: 6 },
    notesInput:         { backgroundColor: theme.surfaceElevated, borderWidth: 1, borderColor: theme.surfaceBorder, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: theme.textPrimary, minHeight: 72, textAlignVertical: 'top' },

    addExerciseButton:     { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 12, marginHorizontal: 14, borderTopWidth: 0.5, borderTopColor: theme.divider },
    addExerciseButtonText: { fontSize: 14, color: theme.accent, fontWeight: '600' },
    addSectionButton:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: theme.accent, borderStyle: 'dashed', borderRadius: 10, paddingVertical: 14, marginBottom: 12 },
    addSectionButtonText:  { fontSize: 15, color: theme.accent, fontWeight: '600' },

    dropZone:    { height: 3, backgroundColor: theme.accent, borderRadius: 2, marginHorizontal: 14, marginVertical: 2 },

    dragActiveBar:       { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', backgroundColor: theme.accent, paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
    dragActiveBarText:   { flex: 1, fontSize: 13, color: '#000' },
    dragCancelButton:    { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 6 },
    dragCancelButtonText:{ fontSize: 13, color: '#000', fontWeight: '700' },

    undoBar:        { position: 'absolute', bottom: 56, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', backgroundColor: theme.surfaceElevated, borderWidth: 1, borderColor: theme.accent, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, gap: 10 },
    undoBarText:    { flex: 1, fontSize: 13, color: theme.textPrimary, lineHeight: 18 },
    undoButton:     { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: theme.accent, borderRadius: 6 },
    undoButtonText: { fontSize: 13, color: '#000', fontWeight: '700' },

    validationSummary:     { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.accentSubtle, borderWidth: 1, borderColor: theme.accentSubtle, borderRadius: 8, padding: 12, marginBottom: 12 },
    validationSummaryText: { fontSize: 13, color: theme.accent, flex: 1 },

    saveButton:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: theme.success, borderRadius: 12, paddingVertical: 16, marginTop: 8 },
    saveButtonText: { fontSize: 18, fontWeight: '700', color: '#000' },

    toast:        { position: 'absolute', top: 12, left: 16, right: 16, backgroundColor: theme.surfaceElevated, borderRadius: 10, borderWidth: 1, borderColor: theme.success, overflow: 'hidden', zIndex: 999, elevation: 10 },
    toastContent: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10 },
    toastCheck:   { width: 24, height: 24, borderRadius: 12, backgroundColor: theme.success, justifyContent: 'center', alignItems: 'center' },
    toastText:    { flex: 1, color: theme.textPrimary, fontSize: 15, fontWeight: '600' },
    toastClose:   { padding: 4 },
    toastBar:     { height: 3, backgroundColor: theme.success },
}); }