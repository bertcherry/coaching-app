import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { DrawerContentScrollView, DrawerItemList } from '@react-navigation/drawer';
import SignOutModal from './SignOutModal';

export default function AppDrawerContent(props) {
  const [modalVisible, setModalVisible] = useState(false);

  return (
    <DrawerContentScrollView {...props} contentContainerStyle={styles.container}>
      <DrawerItemList {...props} />
      <View style={styles.divider} />
      <Pressable style={styles.signOutItem} onPress={() => setModalVisible(true)}>
        <Text style={styles.signOutText}>Sign Out</Text>
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
    backgroundColor: '#1a1a1a',
  },
  divider: {
    height: 1,
    backgroundColor: '#333',
    marginVertical: 8,
    marginHorizontal: 16,
  },
  signOutItem: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  signOutText: {
    color: '#fba8a0',
    fontSize: 16,
  },
});