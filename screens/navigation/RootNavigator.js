import React from 'react';
import { ActivityIndicator } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import SignInNavigation from './SignInNavigation';
import CoachNavigation from './CoachNavigation';
import ClientNavigation from './ClientNavigation';
import { startNetInfoSync, stopNetInfoSync } from '../../utils/WorkoutSync';

export default function RootNavigator() {
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
