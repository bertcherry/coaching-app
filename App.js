import 'react-native-get-random-values';
import 'react-native-gesture-handler';
import React from 'react';
import { View, StyleSheet, SafeAreaView } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import CoachingHeader from './components/CoachingHeader';
import CoachingFooter from './components/CoachingFooter';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { ScrollProvider } from './context/ScrollContext';
import { NotificationsProvider } from './context/NotificationsContext';
import RootNavigator from './screens/navigation/RootNavigator';

function ThemedApp() {
  const { theme } = useTheme();

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.headerBackground }]}>
      <ScrollProvider>
        <NavigationContainer>
          <View style={[styles.container, { backgroundColor: theme.background }]}>
            <CoachingHeader />
            <RootNavigator />
            <CoachingFooter />
          </View>
        </NavigationContainer>
      </ScrollProvider>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <NotificationsProvider>
          <ThemedApp />
        </NotificationsProvider>
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