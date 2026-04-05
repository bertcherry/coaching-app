import { View, StyleSheet, SafeAreaView } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import CoachingHeader from './components/CoachingHeader';
import CoachingFooter from './components/CoachingFooter';
import { AuthProvider, useAuth } from './context/AuthContext';
import SignInNavigation from './screens/navigation/SignInNavigation';
import CoachNavigation from './screens/navigation/CoachNavigation';   // you'll create this
import ClientNavigation from './screens/navigation/ClientNavigation'; // you'll create this
import { startNetInfoSync } from './utils/WorkoutSync';

function RootNavigator() {
  const { user, loading } = useAuth();

  if (loading) return <LoadingScreen />;
  if (!user) return <SignInNavigation />;
  if (user.isCoach) return <CoachNavigation />;
  return <ClientNavigation />;
}

export default function App() {
  const { accessToken } = useAuth();
  React.useEffect(() => {
      startNetInfoSync(() => accessToken);
      return () => stopNetInfoSync();
  }, [accessToken]);

  return (
    <SafeAreaView style={styles.container}>
      <AuthProvider>
        <NavigationContainer>
          <View style={styles.container}>
            <CoachingHeader />
              <RootNavigator />
            <CoachingFooter />
          </View>
        </NavigationContainer>
      </AuthProvider>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
    justifyContent: 'space-between',
  },
});