import 'react-native-get-random-values';
import 'react-native-gesture-handler';
import React from 'react';
import { View, StyleSheet, SafeAreaView, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import CoachingHeader from './components/CoachingHeader';
import CoachingFooter from './components/CoachingFooter';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import SignInNavigation from './screens/navigation/SignInNavigation';
import CoachNavigation from './screens/navigation/CoachNavigation';
import ClientNavigation from './screens/navigation/ClientNavigation';
import { startNetInfoSync, stopNetInfoSync } from './utils/WorkoutSync';

function RootNavigator() {
  const { user, loading, accessToken } = useAuth();

  React.useEffect(() => {
    startNetInfoSync(() => accessToken);
    return () => stopNetInfoSync();
  }, [accessToken]);

  const { theme } = useTheme();
  if (loading) return <ActivityIndicator style={{ flex: 1 }} color={theme.accent} />;
  if (!user) return <SignInNavigation />;
  if (user.isCoach) return <CoachNavigation />;
  return <ClientNavigation />;
}

function ThemedApp() {
  const { theme } = useTheme();

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.headerBackground }]}>
      <NavigationContainer>
        <View style={[styles.container, { backgroundColor: theme.background }]}>
          <CoachingHeader />
          <RootNavigator />
          <CoachingFooter />
        </View>
      </NavigationContainer>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ThemedApp />
      </AuthProvider>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
    justifyContent: 'space-between',
  },
});