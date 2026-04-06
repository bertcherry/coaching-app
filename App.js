import 'react-native-get-random-values';
import 'react-native-gesture-handler';
import React from 'react';
import { View, StyleSheet, SafeAreaView, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import CoachingHeader from './components/CoachingHeader';
import CoachingFooter from './components/CoachingFooter';
import { AuthProvider, useAuth } from './context/AuthContext';
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

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color="#fba8a0" />;
  if (!user) return <SignInNavigation />;
  if (user.isCoach) return <CoachNavigation />;
  return <ClientNavigation />;
}

export default function App() {
  return (
    <AuthProvider>
      <SafeAreaView style={styles.container}>
        <NavigationContainer>
          <View style={styles.container}>
            <CoachingHeader />
            <RootNavigator />
            <CoachingFooter />
          </View>
        </NavigationContainer>
      </SafeAreaView>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
    justifyContent: 'space-between',
  },
});