import React from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

export default function SignOutModal({ visible, onClose }) {
  const { signOut } = useAuth();
  const { theme } = useTheme();

  const handleSignOut = async () => {
    onClose();
    await signOut();
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={[styles.overlay, { backgroundColor: theme.overlay }]}>
        <View style={[styles.dialog, { backgroundColor: theme.surfaceElevated, borderColor: theme.accentText }]}>
          <Text style={[styles.title, { color: theme.textPrimary }]}>Sign Out</Text>
          <Text style={[styles.message, { color: theme.textSecondary }]}>Are you sure you want to sign out?</Text>
          <View style={styles.buttons}>
            <Pressable style={[styles.button, styles.cancelButton, { borderColor: theme.surfaceBorder }]} onPress={onClose}>
              <Text style={[styles.cancelText, { color: theme.textPrimary }]}>Cancel</Text>
            </Pressable>
            <Pressable style={[styles.button, styles.signOutButton, { backgroundColor: theme.accent }]} onPress={handleSignOut}>
              <Text style={styles.signOutText}>Sign Out</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dialog: {
    borderRadius: 12,
    padding: 24,
    width: '80%',
    borderWidth: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  message: {
    fontSize: 16,
    marginBottom: 24,
  },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  button: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  cancelButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
  },
  cancelText: {
    fontSize: 16,
  },
  signOutButton: {},
  signOutText: {
    color: '#000',
    fontSize: 16,
  },
});
