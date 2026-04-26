import * as React from 'react';
import {
    View, Text, FlatList, Pressable, TextInput, Image,
    StyleSheet, ActivityIndicator, ScrollView,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationsContext';
import VideoAnnotationCard from '../components/VideoAnnotationCard';

const WORKER_URL = 'https://coaching-app.bert-m-cherry.workers.dev';

function timeAgo(iso) {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
}

function setContextLabel(snap, countType) {
    if (!snap) return '';
    const parts = [];
    if (snap.weight != null) parts.push(`${snap.weight} ${snap.weightUnit ?? ''}`.trim());
    if (snap.reps    != null) parts.push(`${snap.reps} ${countType === 'Timed' ? 'sec' : 'reps'}`);
    if (snap.rpe     != null) parts.push(`RPE ${snap.rpe}`);
    return parts.join('  ·  ');
}

// ─── Chip ─────────────────────────────────────────────────────────────────────

function Chip({ label, onDismiss }) {
    const { theme } = useTheme();
    const s = chipStyles(theme);
    return (
        <View style={s.chip}>
            <Text style={s.label}>{label}</Text>
            <Pressable
                onPress={onDismiss}
                style={s.dismiss}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${label} filter`}
                hitSlop={8}
            >
                <Feather name="x" size={11} color={theme.accentText} />
            </Pressable>
        </View>
    );
}

function chipStyles(theme) {
    return StyleSheet.create({
        chip:    { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.accentSubtle, borderWidth: 1, borderColor: theme.accentText, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4, gap: 4 },
        label:   { fontSize: 12, color: theme.accentText, fontWeight: '500' },
        dismiss: { padding: 2 },
    });
}

// ─── Unreviewed tab ───────────────────────────────────────────────────────────

function UnreviewedTab() {
    const { theme } = useTheme();
    const styles = makeStyles(theme);
    const { authFetch } = useAuth();
    const { markRead } = useNotifications();

    const [videos,     setVideos]     = React.useState([]);
    const [loading,    setLoading]    = React.useState(true);
    const [expandedId, setExpandedId] = React.useState(null);

    const fetchQueue = React.useCallback(async () => {
        setLoading(true);
        try {
            const res = await authFetch(`${WORKER_URL}/videos/review-queue`);
            if (res.ok) {
                const data = await res.json();
                setVideos(data.videos ?? []);
            }
        } catch {}
        setLoading(false);
    }, [authFetch]);

    useFocusEffect(React.useCallback(() => { fetchQueue(); }, [fetchQueue]));

    const handleExpand = (video) => {
        const opening = expandedId !== video.id;
        setExpandedId(opening ? video.id : null);
        if (opening) markRead(video.scheduledWorkoutId);
    };

    if (loading) return <ActivityIndicator style={styles.loader} color={theme.accent} />;

    if (videos.length === 0) return (
        <View style={styles.empty}>
            <Feather name="check-circle" size={40} color={theme.success} style={{ marginBottom: 12 }} />
            <Text style={styles.emptyTitle}>All caught up</Text>
            <Text style={styles.emptySubtitle}>No form videos waiting for review</Text>
        </View>
    );

    return (
        <FlatList
            data={videos}
            keyExtractor={v => v.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item: video }) => {
                const snap = video.setSnapshot ?? {};
                const expanded = expandedId === video.id;
                const ctx = setContextLabel(snap);
                return (
                    <View style={styles.queueCard}>
                        <Pressable
                            style={styles.queueCardHeader}
                            onPress={() => handleExpand(video)}
                            accessibilityRole="button"
                            accessibilityLabel={`${video.clientName}, ${snap.exerciseName ?? 'exercise'}, set ${video.setNumber}. ${expanded ? 'Collapse' : 'Expand to annotate'}`}
                            accessibilityState={{ expanded }}
                        >
                            <View style={styles.thumbWrap}>
                                {video.thumbnailUrl ? (
                                    <Image
                                        source={{ uri: video.thumbnailUrl }}
                                        style={styles.thumb}
                                        accessibilityLabel="Video thumbnail"
                                    />
                                ) : (
                                    <View style={[styles.thumb, styles.thumbPlaceholder]}>
                                        <Feather name="video" size={20} color={theme.textSecondary} />
                                    </View>
                                )}
                            </View>
                            <View style={styles.queueInfo}>
                                <Text style={styles.clientName}>{video.clientName}</Text>
                                <Text style={styles.exerciseName}>{snap.exerciseName ?? 'Exercise'}</Text>
                                <Text style={styles.setContext}>
                                    {'Set ' + video.setNumber + (ctx ? '  ·  ' + ctx : '')}
                                </Text>
                                <Text style={styles.timeAgo}>{timeAgo(video.createdAt)}</Text>
                            </View>
                            <Feather
                                name={expanded ? 'chevron-up' : 'chevron-down'}
                                size={18}
                                color={theme.textSecondary}
                            />
                        </Pressable>
                        {expanded && (
                            <View style={styles.queueCardBody}>
                                <VideoAnnotationCard video={video} authFetch={authFetch} />
                            </View>
                        )}
                    </View>
                );
            }}
        />
    );
}

// ─── Reviewed tab ─────────────────────────────────────────────────────────────

const DATE_PRESETS = [
    { label: 'Last 30 days', days: 30 },
    { label: 'Last 3 months', days: 90 },
];

function ReviewedTab() {
    const { theme } = useTheme();
    const styles = makeStyles(theme);
    const { authFetch } = useAuth();

    const [clients,      setClients]      = React.useState([]);
    const [videos,       setVideos]       = React.useState([]);
    const [loading,      setLoading]      = React.useState(true);
    const [filtersOpen,  setFiltersOpen]  = React.useState(false);
    const [applied,      setApplied]      = React.useState({});

    // Filter form state
    const [clientEmail,       setClientEmail]       = React.useState(null);
    const [exerciseSearch,    setExerciseSearch]    = React.useState('');
    const [datePreset,        setDatePreset]        = React.useState(null);
    const [dateFrom,          setDateFrom]          = React.useState('');
    const [dateTo,            setDateTo]            = React.useState('');
    const [rpeMin,            setRpeMin]            = React.useState('');
    const [rpeMax,            setRpeMax]            = React.useState('');
    const [annotationSearch,  setAnnotationSearch]  = React.useState('');
    const [hasNoAnnotation,   setHasNoAnnotation]   = React.useState(false);

    const fetchReviewed = React.useCallback(async (filters) => {
        setLoading(true);
        try {
            const p = new URLSearchParams();
            if (filters.clientEmail)       p.set('clientEmail',       filters.clientEmail);
            if (filters.exerciseSearch)    p.set('exerciseSearch',    filters.exerciseSearch);
            if (filters.dateFrom)          p.set('dateFrom',          filters.dateFrom);
            if (filters.dateTo)            p.set('dateTo',            filters.dateTo);
            if (filters.rpeMin != null)    p.set('rpeMin',            String(filters.rpeMin));
            if (filters.rpeMax != null)    p.set('rpeMax',            String(filters.rpeMax));
            if (filters.annotationSearch)  p.set('annotationSearch',  filters.annotationSearch);
            if (filters.hasNoAnnotation)   p.set('hasNoAnnotation',   'true');
            const res = await authFetch(`${WORKER_URL}/videos/reviewed?${p.toString()}`);
            if (res.ok) {
                const data = await res.json();
                setVideos(data.videos ?? []);
            }
        } catch {}
        setLoading(false);
    }, [authFetch]);

    React.useEffect(() => {
        fetchReviewed({});
        (async () => {
            try {
                const res = await authFetch(`${WORKER_URL}/coach/clients`);
                if (res.ok) {
                    const data = await res.json();
                    setClients(data.clients ?? []);
                }
            } catch {}
        })();
    }, []);

    const removeFilter = (key, sideEffect) => {
        sideEffect?.();
        const next = { ...applied };
        delete next[key];
        setApplied(next);
        fetchReviewed(next);
    };

    const handleApply = () => {
        const resolvedFrom = datePreset
            ? new Date(Date.now() - datePreset * 86400000).toISOString().slice(0, 10)
            : dateFrom.trim() || undefined;
        const resolvedTo = datePreset
            ? new Date().toISOString().slice(0, 10)
            : dateTo.trim() || undefined;

        const next = {
            ...(clientEmail      && { clientEmail }),
            ...(exerciseSearch.trim() && { exerciseSearch: exerciseSearch.trim() }),
            ...(resolvedFrom     && { dateFrom: resolvedFrom }),
            ...(resolvedTo       && { dateTo: resolvedTo }),
            ...(rpeMin           && { rpeMin: parseFloat(rpeMin) }),
            ...(rpeMax           && { rpeMax: parseFloat(rpeMax) }),
            ...(annotationSearch.trim() && { annotationSearch: annotationSearch.trim() }),
            ...(hasNoAnnotation  && { hasNoAnnotation: true }),
        };
        setApplied(next);
        fetchReviewed(next);
        setFiltersOpen(false);
    };

    const handleClearAll = () => {
        setClientEmail(null); setExerciseSearch(''); setDatePreset(null);
        setDateFrom(''); setDateTo(''); setRpeMin(''); setRpeMax('');
        setAnnotationSearch(''); setHasNoAnnotation(false);
        setApplied({});
        fetchReviewed({});
        setFiltersOpen(false);
    };

    const hasActiveFilters = Object.keys(applied).length > 0;

    return (
        <View style={{ flex: 1 }}>
            {/* Filter bar — active filter chips + toggle */}
            <View style={styles.filterBar}>
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={{ flex: 1 }}
                    contentContainerStyle={{ gap: 6, paddingVertical: 4, paddingRight: 8 }}
                >
                    {applied.clientEmail && (
                        <Chip
                            label={clients.find(c => c.email === applied.clientEmail)?.fname ?? applied.clientEmail}
                            onDismiss={() => removeFilter('clientEmail', () => setClientEmail(null))}
                        />
                    )}
                    {applied.exerciseSearch && (
                        <Chip
                            label={`"${applied.exerciseSearch}"`}
                            onDismiss={() => removeFilter('exerciseSearch', () => setExerciseSearch(''))}
                        />
                    )}
                    {(applied.dateFrom || applied.dateTo) && (
                        <Chip
                            label={datePreset ? (DATE_PRESETS.find(p => p.days === datePreset)?.label ?? 'Date range') : 'Date range'}
                            onDismiss={() => removeFilter('dateFrom', () => { setDatePreset(null); setDateFrom(''); setDateTo(''); delete applied.dateTo; })}
                        />
                    )}
                    {(applied.rpeMin != null || applied.rpeMax != null) && (
                        <Chip
                            label={`RPE ${applied.rpeMin ?? '?'}–${applied.rpeMax ?? '?'}`}
                            onDismiss={() => removeFilter('rpeMin', () => { setRpeMin(''); setRpeMax(''); delete applied.rpeMax; })}
                        />
                    )}
                    {applied.annotationSearch && (
                        <Chip
                            label={`"${applied.annotationSearch}"`}
                            onDismiss={() => removeFilter('annotationSearch', () => setAnnotationSearch(''))}
                        />
                    )}
                    {applied.hasNoAnnotation && (
                        <Chip
                            label="No annotation"
                            onDismiss={() => removeFilter('hasNoAnnotation', () => setHasNoAnnotation(false))}
                        />
                    )}
                </ScrollView>
                <Pressable
                    style={[styles.filterToggle, filtersOpen && styles.filterToggleActive, hasActiveFilters && styles.filterToggleBadged]}
                    onPress={() => setFiltersOpen(v => !v)}
                    accessibilityRole="button"
                    accessibilityLabel={`Filters${hasActiveFilters ? ', ' + Object.keys(applied).length + ' active' : ''}`}
                >
                    <Feather name="sliders" size={15} color={filtersOpen || hasActiveFilters ? theme.accentText : theme.textSecondary} />
                    {hasActiveFilters && (
                        <View style={styles.filterBadge}>
                            <Text style={styles.filterBadgeText}>{Object.keys(applied).length}</Text>
                        </View>
                    )}
                </Pressable>
            </View>

            {/* Filter panel */}
            {filtersOpen && (
                <ScrollView style={styles.filterPanel} keyboardShouldPersistTaps="handled">
                    {/* Client */}
                    {clients.length > 0 && (
                        <View style={styles.filterSection}>
                            <Text style={styles.filterSectionLabel}>Client</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                                {clients.map(c => (
                                    <Pressable
                                        key={c.email}
                                        style={[styles.filterChip, clientEmail === c.email && styles.filterChipActive]}
                                        onPress={() => setClientEmail(prev => prev === c.email ? null : c.email)}
                                        accessibilityRole="checkbox"
                                        accessibilityLabel={`${c.fname} ${c.lname}`}
                                        accessibilityState={{ checked: clientEmail === c.email }}
                                    >
                                        <Text style={[styles.filterChipText, clientEmail === c.email && styles.filterChipTextActive]}>
                                            {c.fname} {c.lname}
                                        </Text>
                                    </Pressable>
                                ))}
                            </ScrollView>
                        </View>
                    )}

                    {/* Exercise */}
                    <View style={styles.filterSection}>
                        <Text style={styles.filterSectionLabel}>Exercise</Text>
                        <TextInput
                            style={styles.filterInput}
                            value={exerciseSearch}
                            onChangeText={setExerciseSearch}
                            placeholder="e.g. Back Squat"
                            placeholderTextColor={theme.textSecondary}
                            autoCapitalize="words"
                            accessibilityLabel="Exercise search"
                        />
                    </View>

                    {/* Date range */}
                    <View style={styles.filterSection}>
                        <Text style={styles.filterSectionLabel}>Date range</Text>
                        <View style={styles.filterRow}>
                            {DATE_PRESETS.map(p => (
                                <Pressable
                                    key={p.days}
                                    style={[styles.filterChip, datePreset === p.days && styles.filterChipActive]}
                                    onPress={() => { setDatePreset(prev => prev === p.days ? null : p.days); setDateFrom(''); setDateTo(''); }}
                                    accessibilityRole="radio"
                                    accessibilityLabel={p.label}
                                    accessibilityState={{ selected: datePreset === p.days }}
                                >
                                    <Text style={[styles.filterChipText, datePreset === p.days && styles.filterChipTextActive]}>
                                        {p.label}
                                    </Text>
                                </Pressable>
                            ))}
                        </View>
                        {!datePreset && (
                            <View style={[styles.filterRow, { marginTop: 8 }]}>
                                <TextInput
                                    style={[styles.filterInput, { flex: 1 }]}
                                    value={dateFrom}
                                    onChangeText={setDateFrom}
                                    placeholder="From (YYYY-MM-DD)"
                                    placeholderTextColor={theme.textSecondary}
                                    accessibilityLabel="Date from"
                                />
                                <TextInput
                                    style={[styles.filterInput, { flex: 1 }]}
                                    value={dateTo}
                                    onChangeText={setDateTo}
                                    placeholder="To (YYYY-MM-DD)"
                                    placeholderTextColor={theme.textSecondary}
                                    accessibilityLabel="Date to"
                                />
                            </View>
                        )}
                    </View>

                    {/* RPE range */}
                    <View style={styles.filterSection}>
                        <Text style={styles.filterSectionLabel}>RPE range</Text>
                        <View style={styles.filterRow}>
                            <TextInput
                                style={[styles.filterInput, { flex: 1 }]}
                                value={rpeMin}
                                onChangeText={setRpeMin}
                                placeholder="Min"
                                placeholderTextColor={theme.textSecondary}
                                keyboardType="decimal-pad"
                                accessibilityLabel="RPE minimum"
                            />
                            <Text style={[styles.filterSectionLabel, { paddingHorizontal: 6, paddingTop: 10 }]}>–</Text>
                            <TextInput
                                style={[styles.filterInput, { flex: 1 }]}
                                value={rpeMax}
                                onChangeText={setRpeMax}
                                placeholder="Max"
                                placeholderTextColor={theme.textSecondary}
                                keyboardType="decimal-pad"
                                accessibilityLabel="RPE maximum"
                            />
                        </View>
                    </View>

                    {/* Annotation content */}
                    <View style={styles.filterSection}>
                        <Text style={styles.filterSectionLabel}>Annotation content</Text>
                        <TextInput
                            style={styles.filterInput}
                            value={annotationSearch}
                            onChangeText={setAnnotationSearch}
                            placeholder="Search observations, cues, programming…"
                            placeholderTextColor={theme.textSecondary}
                            autoCapitalize="none"
                            accessibilityLabel="Annotation content search"
                        />
                    </View>

                    {/* No annotation toggle */}
                    <View style={styles.filterSection}>
                        <Pressable
                            style={[styles.filterChip, hasNoAnnotation && styles.filterChipActive]}
                            onPress={() => setHasNoAnnotation(v => !v)}
                            accessibilityRole="checkbox"
                            accessibilityLabel="No annotation only"
                            accessibilityState={{ checked: hasNoAnnotation }}
                        >
                            <Text style={[styles.filterChipText, hasNoAnnotation && styles.filterChipTextActive]}>
                                No annotation only
                            </Text>
                        </Pressable>
                    </View>

                    {/* Apply / Clear */}
                    <View style={[styles.filterRow, { paddingBottom: 16 }]}>
                        <Pressable
                            style={styles.clearButton}
                            onPress={handleClearAll}
                            accessibilityRole="button"
                            accessibilityLabel="Clear all filters"
                        >
                            <Text style={styles.clearButtonText}>Clear all</Text>
                        </Pressable>
                        <Pressable
                            style={styles.applyButton}
                            onPress={handleApply}
                            accessibilityRole="button"
                            accessibilityLabel="Apply filters"
                        >
                            <Text style={styles.applyButtonText}>Apply</Text>
                        </Pressable>
                    </View>
                </ScrollView>
            )}

            {/* Results */}
            {loading ? (
                <ActivityIndicator style={styles.loader} color={theme.accent} />
            ) : videos.length === 0 ? (
                <View style={styles.empty}>
                    <Feather name="video" size={40} color={theme.textTertiary} style={{ marginBottom: 12 }} />
                    <Text style={styles.emptyTitle}>No reviewed videos</Text>
                    <Text style={styles.emptySubtitle}>
                        {hasActiveFilters ? 'Try adjusting your filters' : 'Annotated videos will appear here'}
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={videos}
                    keyExtractor={v => v.id}
                    contentContainerStyle={styles.listContent}
                    renderItem={({ item: video }) => {
                        const snap = video.setSnapshot ?? {};
                        const ctx = setContextLabel(snap);
                        return (
                            <View style={styles.reviewedCard}>
                                <View style={styles.reviewedCardMeta}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.clientName}>{video.clientName}</Text>
                                        <Text style={styles.exerciseName}>{snap.exerciseName ?? 'Exercise'}</Text>
                                        <Text style={styles.setContext}>
                                            {'Set ' + video.setNumber + (ctx ? '  ·  ' + ctx : '')}
                                        </Text>
                                    </View>
                                    <Text style={styles.timeAgo}>{timeAgo(video.createdAt)}</Text>
                                </View>
                                <VideoAnnotationCard video={video} authFetch={authFetch} />
                            </View>
                        );
                    }}
                />
            )}
        </View>
    );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function VideoReviewQueueScreen() {
    const { theme } = useTheme();
    const styles = makeStyles(theme);
    const [tab, setTab] = React.useState('unreviewed');
    const { totalUnread } = useNotifications();

    return (
        <View style={styles.screen}>
            {/* Tab bar */}
            <View style={styles.tabBar}>
                {['unreviewed', 'reviewed'].map(t => (
                    <Pressable
                        key={t}
                        style={[styles.tab, tab === t && styles.tabActive]}
                        onPress={() => setTab(t)}
                        accessibilityRole="tab"
                        accessibilityLabel={t === 'unreviewed' ? 'Unreviewed' : 'Reviewed'}
                        accessibilityState={{ selected: tab === t }}
                    >
                        <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
                            {t === 'unreviewed' ? 'Unreviewed' : 'Reviewed'}
                        </Text>
                        {t === 'unreviewed' && totalUnread > 0 && tab !== 'unreviewed' && (
                            <View style={styles.tabBadge}>
                                <Text style={styles.tabBadgeText}>{totalUnread}</Text>
                            </View>
                        )}
                    </Pressable>
                ))}
            </View>

            <View style={{ flex: 1 }}>
                {tab === 'unreviewed' ? <UnreviewedTab /> : <ReviewedTab />}
            </View>
        </View>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(theme) {
    return StyleSheet.create({
        screen:  { flex: 1, backgroundColor: theme.background },
        loader:  { flex: 1, marginTop: 60 },

        // Tabs
        tabBar:         { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: theme.surfaceBorder, backgroundColor: theme.surface },
        tab:            { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 13, gap: 6 },
        tabActive:      { borderBottomWidth: 2, borderBottomColor: theme.accentText },
        tabText:        { fontSize: 14, color: theme.textSecondary, fontWeight: '500' },
        tabTextActive:  { color: theme.accentText, fontWeight: '700' },
        tabBadge:       { backgroundColor: theme.accentText, borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1, minWidth: 18, alignItems: 'center' },
        tabBadgeText:   { fontSize: 11, color: theme.textInverse, fontWeight: '700' },

        // Empty state
        empty:          { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
        emptyTitle:     { fontSize: 17, fontWeight: '600', color: theme.textPrimary, marginBottom: 6 },
        emptySubtitle:  { fontSize: 14, color: theme.textSecondary, textAlign: 'center', lineHeight: 20 },

        listContent: { padding: 12, gap: 10 },

        // Unreviewed queue card
        queueCard:       { backgroundColor: theme.surface, borderRadius: 10, borderWidth: 0.5, borderColor: theme.surfaceBorder, overflow: 'hidden' },
        queueCardHeader: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10 },
        queueCardBody:   { borderTopWidth: 0.5, borderTopColor: theme.surfaceBorder },
        thumbWrap:       { width: 64, height: 64, borderRadius: 6, overflow: 'hidden', flexShrink: 0 },
        thumb:           { width: 64, height: 64 },
        thumbPlaceholder:{ backgroundColor: theme.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
        queueInfo:       { flex: 1 },

        // Reviewed card
        reviewedCard:     { backgroundColor: theme.surface, borderRadius: 10, borderWidth: 0.5, borderColor: theme.surfaceBorder, overflow: 'hidden', padding: 12 },
        reviewedCardMeta: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4 },

        // Shared text
        clientName:  { fontSize: 14, fontWeight: '700', color: theme.textPrimary, marginBottom: 2 },
        exerciseName:{ fontSize: 14, color: theme.accentText, fontWeight: '500', marginBottom: 2 },
        setContext:  { fontSize: 12, color: theme.textSecondary },
        timeAgo:     { fontSize: 11, color: theme.textTertiary },

        // Filter bar
        filterBar:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: theme.surfaceBorder, backgroundColor: theme.surface },
        filterToggle:      { width: 36, height: 36, borderRadius: 8, borderWidth: 1, borderColor: theme.surfaceBorder, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 3 },
        filterToggleActive:{ borderColor: theme.accentText, backgroundColor: theme.accentSubtle },
        filterToggleBadged:{ borderColor: theme.accentText },
        filterBadge:       { backgroundColor: theme.accentText, borderRadius: 6, paddingHorizontal: 4, paddingVertical: 1, minWidth: 16, alignItems: 'center' },
        filterBadgeText:   { fontSize: 10, color: theme.textInverse, fontWeight: '700' },

        // Filter panel
        filterPanel:       { backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.surfaceBorder, maxHeight: 380 },
        filterSection:     { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
        filterSectionLabel:{ fontSize: 11, color: theme.textSecondary, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 },
        filterRow:         { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
        filterInput:       { borderWidth: 1, borderColor: theme.surfaceBorder, borderRadius: 7, backgroundColor: theme.surfaceElevated, color: theme.textPrimary, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14 },
        filterChip:        { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: theme.surfaceBorder, backgroundColor: theme.surfaceElevated },
        filterChipActive:  { borderColor: theme.accentText, backgroundColor: theme.accentSubtle },
        filterChipText:    { fontSize: 13, color: theme.textSecondary },
        filterChipTextActive: { color: theme.accentText, fontWeight: '600' },

        clearButton: { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: theme.surfaceBorder, alignItems: 'center' },
        clearButtonText: { fontSize: 14, color: theme.textSecondary, fontWeight: '500' },
        applyButton: { flex: 2, paddingVertical: 10, borderRadius: 8, backgroundColor: theme.accentText, alignItems: 'center' },
        applyButtonText: { fontSize: 14, color: theme.textInverse, fontWeight: '600' },
    });
}
