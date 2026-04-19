import * as React from 'react';
import {
    View, Text, StyleSheet, FlatList, TextInput,
    Pressable, ActivityIndicator,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useAuth } from '../context/AuthContext';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../context/ThemeContext';
import { useScrollY } from '../context/ScrollContext';

const WORKER_URL = 'https://coaching-app.bert-m-cherry.workers.dev';
const PAGE_SIZE  = 10;

const TABS = ['All', 'To Be Filmed'];

// ─── Exercise row ─────────────────────────────────────────────────────────────

const ExerciseRow = ({ exercise, onPress }) => {
    const { theme } = useTheme();
    const styles = makeStyles(theme);
    return (
        <Pressable
            style={styles.row}
            onPress={() => onPress(exercise)}
            accessibilityRole="button"
            accessibilityLabel={`View ${exercise.name}`}
        >
            <View style={styles.rowContent}>
                <Text style={styles.rowName}>{exercise.name}</Text>
                {exercise.description ? (
                    <Text style={styles.rowDesc} numberOfLines={2}>
                        {exercise.description}
                    </Text>
                ) : null}
            </View>
            <View style={styles.rowMeta}>
                <Feather
                    name={exercise.hasVideo ? 'video' : 'video-off'}
                    size={15}
                    color={exercise.hasVideo ? '#22c55e' : '#ef4444'}
                />
                <Feather name="chevron-right" size={16} color={theme.textTertiary} />
            </View>
        </Pressable>
    );
};

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ExerciseLibraryScreen({ navigation }) {
    const { authFetch } = useAuth();
    const { theme }     = useTheme();
    const styles        = makeStyles(theme);
    const scrollY       = useScrollY();

    const [activeTab, setActiveTab]     = React.useState(0); // 0=All, 1=To Be Filmed
    const [searchInput, setSearchInput] = React.useState('');
    const [search, setSearch]           = React.useState('');

    // All tab state
    const [allExercises, setAllExercises]     = React.useState([]);
    const [allLoading, setAllLoading]         = React.useState(true);
    const [allLoadingMore, setAllLoadingMore] = React.useState(false);
    const [allPage, setAllPage]               = React.useState(1);
    const [allTotal, setAllTotal]             = React.useState(0);

    // To Be Filmed tab state
    const [unfilmedExercises, setUnfilmedExercises]     = React.useState([]);
    const [unfilmedLoading, setUnfilmedLoading]         = React.useState(true);
    const [unfilmedLoadingMore, setUnfilmedLoadingMore] = React.useState(false);
    const [unfilmedPage, setUnfilmedPage]               = React.useState(1);
    const [unfilmedTotal, setUnfilmedTotal]             = React.useState(0);

    // Reset scroll on focus
    useFocusEffect(React.useCallback(() => { scrollY.setValue(0); }, [scrollY]));

    // Debounce search
    React.useEffect(() => {
        const t = setTimeout(() => setSearch(searchInput), 350);
        return () => clearTimeout(t);
    }, [searchInput]);

    // ── Fetch all exercises ───────────────────────────────────────────────────
    const fetchAll = React.useCallback(async (opts = {}) => {
        const targetPage   = opts.page   ?? 1;
        const targetSearch = opts.search ?? search;
        const append       = opts.append ?? false;

        if (append) setAllLoadingMore(true);
        else        setAllLoading(true);

        try {
            const params = new URLSearchParams({
                page:     targetPage,
                pageSize: PAGE_SIZE,
                ...(targetSearch ? { search: targetSearch } : {}),
            });
            const res  = await authFetch(`${WORKER_URL}/demos?${params}`);
            const body = await res.json();
            setAllTotal(body.total ?? 0);
            setAllExercises(prev =>
                append ? [...prev, ...(body.exercises ?? [])] : (body.exercises ?? [])
            );
            setAllPage(targetPage);
        } catch {
            // silent — network errors shown via empty state
        } finally {
            setAllLoading(false);
            setAllLoadingMore(false);
        }
    }, [search]);

    // ── Fetch unfilmed exercises ──────────────────────────────────────────────
    const fetchUnfilmed = React.useCallback(async (opts = {}) => {
        const targetPage   = opts.page   ?? 1;
        const targetSearch = opts.search ?? search;
        const append       = opts.append ?? false;

        if (append) setUnfilmedLoadingMore(true);
        else        setUnfilmedLoading(true);

        try {
            const params = new URLSearchParams({
                page:     targetPage,
                pageSize: PAGE_SIZE,
                ...(targetSearch ? { search: targetSearch } : {}),
            });
            const res  = await authFetch(`${WORKER_URL}/demos/unfilmed?${params}`);
            const body = await res.json();
            setUnfilmedTotal(body.total ?? 0);
            setUnfilmedExercises(prev =>
                append ? [...prev, ...(body.exercises ?? [])] : (body.exercises ?? [])
            );
            setUnfilmedPage(targetPage);
        } catch {
            // silent
        } finally {
            setUnfilmedLoading(false);
            setUnfilmedLoadingMore(false);
        }
    }, [search]);

    // Refetch both tabs on search change
    React.useEffect(() => {
        fetchAll({ page: 1 });
        fetchUnfilmed({ page: 1 });
    }, [search]);

    // Refetch active tab when screen is focused (e.g. returning from detail)
    useFocusEffect(React.useCallback(() => {
        if (activeTab === 0) fetchAll({ page: 1 });
        else                 fetchUnfilmed({ page: 1 });
    }, [activeTab]));

    const handleExercisePress = (exercise) => {
        navigation.navigate('ExerciseDetail', { exercise });
    };

    // ── Derived state for active tab ──────────────────────────────────────────
    const isAll       = activeTab === 0;
    const exercises   = isAll ? allExercises   : unfilmedExercises;
    const loading     = isAll ? allLoading     : unfilmedLoading;
    const loadingMore = isAll ? allLoadingMore : unfilmedLoadingMore;
    const total       = isAll ? allTotal       : unfilmedTotal;
    const page        = isAll ? allPage        : unfilmedPage;
    const hasMore     = exercises.length < total;

    const loadMore = () => {
        if (loadingMore || !hasMore) return;
        if (isAll) fetchAll({ page: page + 1, append: true });
        else       fetchUnfilmed({ page: page + 1, append: true });
    };

    const renderItem = ({ item }) => (
        <ExerciseRow exercise={item} onPress={handleExercisePress} />
    );

    const renderFooter = () =>
        loadingMore ? (
            <View style={styles.footerLoader}>
                <ActivityIndicator size="small" color={theme.accent} />
            </View>
        ) : null;

    const renderEmpty = () => {
        if (loading) return null;
        return (
            <View style={styles.emptyContainer}>
                <Feather
                    name={isAll ? 'book-open' : 'video-off'}
                    size={40}
                    color={theme.surfaceBorder}
                />
                <Text style={styles.emptyTitle}>
                    {search
                        ? `No exercises matching "${search}"`
                        : isAll ? 'No exercises yet' : 'All caught up!'}
                </Text>
                <Text style={styles.emptySubtitle}>
                    {search
                        ? 'Try a different search term'
                        : isAll
                            ? 'Create exercises in a workout to populate the library.'
                            : 'Every exercise has a video linked.'}
                </Text>
            </View>
        );
    };

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <View style={styles.headerTitleRow}>
                    <Feather name="book-open" size={20} color={theme.textPrimary} />
                    <Text style={styles.headerTitle}>Exercise Library</Text>
                </View>
                <Text style={styles.headerSubtitle}>
                    {total} exercise{total !== 1 ? 's' : ''}
                    {!isAll ? ' without a video' : ''}
                </Text>
            </View>

            {/* Search */}
            <View style={styles.searchBox}>
                <Feather
                    name="search"
                    size={15}
                    color={theme.textSecondary}
                    style={{ marginRight: 8 }}
                />
                <TextInput
                    style={styles.searchInput}
                    value={searchInput}
                    onChangeText={setSearchInput}
                    placeholder="Search exercises..."
                    placeholderTextColor={theme.textSecondary}
                    clearButtonMode="while-editing"
                    accessibilityLabel="Search exercises"
                />
            </View>

            {/* Tabs */}
            <View style={styles.tabBar}>
                {TABS.map((tab, i) => (
                    <Pressable
                        key={tab}
                        style={[styles.tab, activeTab === i && styles.tabActive]}
                        onPress={() => setActiveTab(i)}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: activeTab === i }}
                    >
                        <Text style={[styles.tabText, activeTab === i && styles.tabTextActive]}>
                            {tab}
                        </Text>
                    </Pressable>
                ))}
            </View>

            {loading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={theme.accent} />
                </View>
            ) : (
                <FlatList
                    data={exercises}
                    renderItem={renderItem}
                    keyExtractor={item => item.id}
                    onScroll={(e) => scrollY.setValue(e.nativeEvent.contentOffset.y)}
                    scrollEventThrottle={16}
                    ListEmptyComponent={renderEmpty}
                    ListFooterComponent={renderFooter}
                    onEndReached={loadMore}
                    onEndReachedThreshold={0.3}
                    contentContainerStyle={styles.listContent}
                    indicatorStyle={theme.mode === 'dark' ? 'white' : 'black'}
                />
            )}
        </View>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(theme) {
    return StyleSheet.create({
        container:      { flex: 1, backgroundColor: theme.background },

        header:         { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 8 },
        headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
        headerTitle:    { fontSize: 24, fontWeight: 'bold', color: theme.textPrimary },
        headerSubtitle: { fontSize: 13, color: theme.textSecondary, marginTop: 4 },

        searchBox:      { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.surfaceElevated, borderRadius: 8, paddingHorizontal: 12, height: 38, marginHorizontal: 16, marginBottom: 10 },
        searchInput:    { flex: 1, color: theme.textPrimary, fontSize: 15 },

        tabBar:         { flexDirection: 'row', marginHorizontal: 16, marginBottom: 12, backgroundColor: theme.surfaceElevated, borderRadius: 8, padding: 3 },
        tab:            { flex: 1, paddingVertical: 7, alignItems: 'center', borderRadius: 6 },
        tabActive:      { backgroundColor: theme.surface, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
        tabText:        { fontSize: 13, fontWeight: '600', color: theme.textSecondary },
        tabTextActive:  { color: theme.textPrimary },

        listContent:    { paddingHorizontal: 16, paddingBottom: 40 },

        row:            { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: theme.surfaceElevated, gap: 12 },
        rowContent:     { flex: 1 },
        rowName:        { fontSize: 16, color: theme.textPrimary, fontWeight: '600' },
        rowDesc:        { fontSize: 12, color: theme.textTertiary, marginTop: 4, lineHeight: 16 },
        rowMeta:        { flexDirection: 'row', alignItems: 'center', gap: 8 },

        footerLoader:      { paddingVertical: 20, alignItems: 'center' },
        loadingContainer:  { flex: 1, justifyContent: 'center', alignItems: 'center' },

        emptyContainer: { flex: 1, alignItems: 'center', paddingTop: 80, gap: 10 },
        emptyTitle:     { fontSize: 16, color: theme.textTertiary, textAlign: 'center', fontWeight: '600' },
        emptySubtitle:  { fontSize: 13, color: theme.surfaceBorder, textAlign: 'center', paddingHorizontal: 32 },
    });
}
