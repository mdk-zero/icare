import React from 'react';
import { View, Text, TextInput, StyleSheet, TextInputProps, Image } from 'react-native';
import { useTheme } from '@/hooks/useTheme';

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
  const { Palette, Accent } = useTheme();
  const styles = React.useMemo(() => createStyles(Palette, Accent), [Palette, Accent]);
  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={[styles.inputContainer, error ? styles.inputError : null]}>
        {leftIcon && <Text style={styles.leftIcon}>{leftIcon}</Text>}
        {leftIconImage && <Image source={leftIconImage} style={styles.leftIconImage} />}
        <TextInput
          style={[styles.input, style]}
          placeholderTextColor={Palette.textFaint}
          {...props}
        />
        {rightIcon && <Text style={styles.rightIcon}>{rightIcon}</Text>}
        {rightIconImage && <Image source={rightIconImage} style={styles.rightIconImage} />}
      </View>
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

function createStyles(Palette: ReturnType<typeof useTheme>['Palette'], Accent: ReturnType<typeof useTheme>['Accent']) {
  return StyleSheet.create({
    container: {
      marginBottom: 16,
    },
    label: {
      fontSize: 14,
      fontWeight: '600',
      color: Palette.text,
      marginBottom: 8,
    },
    inputContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: Palette.border,
      borderRadius: 12,
      backgroundColor: Palette.surface,
    },
    inputError: {
      borderColor: Accent.red.fg,
    },
    input: {
      flex: 1,
      paddingVertical: 12,
      paddingHorizontal: 16,
      fontSize: 16,
      color: Palette.ink,
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
      color: Accent.red.fg,
      marginTop: 4,
    },
  });
}