import { View, StyleSheet, SafeAreaView } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import SignInNavigation from './components/SignInNavigation';
import CoachingHeader from './components/CoachingHeader';
import CoachingFooter from './components/CoachingFooter';
import { AuthProvider, useAuth } from './context/AuthContext';
import SignInNavigation from './navigation/SignInNavigation';
import CoachNavigation from './navigation/CoachNavigation';   // you'll create this
import ClientNavigation from './navigation/ClientNavigation'; // you'll create this

function RootNavigator() {
  const { user, loading } = useAuth();

  if (loading) return <LoadingScreen />;
  if (!user) return <SignInNavigation />;
  if (user.isCoach) return <CoachNavigation />;
  return <ClientNavigation />;
}

export default function App() {
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