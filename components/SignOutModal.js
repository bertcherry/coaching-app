import React from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { useAuth } from '../context/AuthContext';

export default function SignOutModal({ visible, onClose }) {
  const { signOut } = useAuth();

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
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          <Text style={styles.title}>Sign Out</Text>
          <Text style={styles.message}>Are you sure you want to sign out?</Text>
          <View style={styles.buttons}>
            <Pressable style={[styles.button, styles.cancelButton]} onPress={onClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable style={[styles.button, styles.signOutButton]} onPress={handleSignOut}>
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
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dialog: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 24,
    width: '80%',
    borderWidth: 1,
    borderColor: '#fba8a0',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fae9e9',
    marginBottom: 12,
  },
  message: {
    fontSize: 16,
    color: '#fae9e9',
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
    borderColor: '#fae9e9',
  },
  cancelText: {
    color: '#fae9e9',
    fontSize: 16,
  },
  signOutButton: {
    backgroundColor: '#fba8a0',
  },
  signOutText: {
    color: 'black',
    fontSize: 16,
  },
});