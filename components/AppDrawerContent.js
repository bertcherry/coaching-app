import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { DrawerContentScrollView, DrawerItemList } from '@react-navigation/drawer';
import Feather from '@expo/vector-icons/Feather';
import SignOutModal from './SignOutModal';
import { useTheme } from '../context/ThemeContext';

export default function AppDrawerContent(props) {
  const [modalVisible, setModalVisible] = useState(false);
  const { theme } = useTheme();

  return (
    <DrawerContentScrollView
      {...props}
      contentContainerStyle={[styles.container, { backgroundColor: theme.surfaceElevated }]}
    >
      <DrawerItemList {...props} />

      <View style={[styles.divider, { backgroundColor: theme.divider }]} />

      {/* Settings */}
      <Pressable
        style={styles.item}
        onPress={() => props.navigation.navigate('Settings')}
      >
        <Feather name="settings" size={18} color={theme.textSecondary} style={styles.itemIcon} />
        <Text style={[styles.itemText, { color: theme.textSecondary }]}>Settings</Text>
      </Pressable>

      {/* Sign Out */}
      <Pressable style={styles.item} onPress={() => setModalVisible(true)}>
        <Feather name="log-out" size={18} color={theme.accent} style={styles.itemIcon} />
        <Text style={[styles.itemText, { color: theme.accent }]}>Sign Out</Text>
      </Pressable>

      <SignOutModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
      />
    </DrawerContentScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  divider: {
    height: 1,
    marginVertical: 8,
    marginHorizontal: 16,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  itemIcon: {
    marginRight: 14,
  },
  itemText: {
    fontSize: 16,
  },
});