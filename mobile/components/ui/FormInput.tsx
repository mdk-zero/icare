import React from 'react';
import { View, Text, TextInput, StyleSheet, TextInputProps, Image } from 'react-native';
import { Colors } from '@/constants/theme';

interface FormInputProps extends TextInputProps {
  label?: string;
  error?: string;
  leftIcon?: string;
  rightIcon?: string;
  leftIconImage?: number;
  rightIconImage?: number;
}

export function FormInput({
  label,
  error,
  leftIcon,
  rightIcon,
  leftIconImage,
  rightIconImage,
  style,
  ...props
}: FormInputProps) {
  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={[styles.inputContainer, error ? styles.inputError : null]}>
        {leftIcon && <Text style={styles.leftIcon}>{leftIcon}</Text>}
        {leftIconImage && <Image source={leftIconImage} style={styles.leftIconImage} />}
        <TextInput
          style={[styles.input, style]}
          placeholderTextColor="#9ca3af"
          {...props}
        />
        {rightIcon && <Text style={styles.rightIcon}>{rightIcon}</Text>}
        {rightIconImage && <Image source={rightIconImage} style={styles.rightIconImage} />}
      </View>
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    backgroundColor: '#fff',
  },
  inputError: {
    borderColor: '#dc2626',
  },
  input: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#11181c',
  },
  leftIcon: {
    paddingLeft: 12,
    fontSize: 18,
  },
  leftIconImage: {
    width: 20,
    height: 20,
    marginLeft: 12,
    resizeMode: 'contain',
  },
  rightIcon: {
    paddingRight: 12,
    fontSize: 18,
  },
  rightIconImage: {
    width: 20,
    height: 20,
    marginRight: 12,
    resizeMode: 'contain',
  },
  errorText: {
    fontSize: 12,
    color: '#dc2626',
    marginTop: 4,
  },
});