import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
  Image,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import logoImg from '@/assets/images/logo-pill.png';

// Derived from the brand teal so the gradient feels intentional, not a random accent.
const TEAL_DARK = '#0F5D5A';
const TEAL = '#0D9488';
const TEAL_SOFT = '#F0FDFA';
const INK = '#0B1220';
const SLATE = '#64748B';
const SLATE_LIGHT = '#94A3B8';
const FIELD_BG = '#F8FAFC';
const FIELD_BORDER = '#E2E8F0';
const DANGER = '#DC2626';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const { login, isLoading } = useAuth();
  const router = useRouter();

  const primaryColor = Colors.light.primary ?? TEAL;

  const handleLogin = async () => {
    setError('');
    if (!email || !password) {
      setError('Please enter email and password');
      return;
    }

    const success = await login(email, password);
    if (success) {
      router.replace('/(tabs)');
    } else {
      setError('Invalid credentials');
    }
  };

  return (
    <View style={styles.container}>
      {/* Ambient background: gradient wash + soft decorative blobs */}
      <LinearGradient
        colors={[TEAL_SOFT, '#FFFFFF']}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={[styles.blob, styles.blobTop]} />
      <View style={[styles.blob, styles.blobBottom]} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.headerSection}>
            <View style={styles.logoRing}>
              <View style={styles.logoCircle}>
                <Image source={logoImg} style={styles.logoImage} />
              </View>
            </View>
            <Text style={styles.appName}>
              iCARE<Text style={{ color: TEAL }}>++</Text>
            </Text>
            <Text style={styles.tagline}>CLINICAL COMPETENCY ASSESSMENT</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.welcomeText}>Welcome back</Text>
            <Text style={styles.subtitleText}>Sign in to continue your rotation</Text>

            <View style={styles.formSection}>
              <View
                style={[
                  styles.inputWrapper,
                  focusedField === 'email' && styles.inputWrapperFocused,
                ]}
              >
                <Ionicons
                  name="mail-outline"
                  size={19}
                  color={focusedField === 'email' ? TEAL : SLATE_LIGHT}
                  style={styles.inputIcon}
                />
                <View style={styles.inputTextArea}>
                  <Text style={styles.inputLabel}>Email</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="email@example.com"
                    placeholderTextColor={SLATE_LIGHT}
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    onFocus={() => setFocusedField('email')}
                    onBlur={() => setFocusedField(null)}
                  />
                </View>
              </View>

              <View
                style={[
                  styles.inputWrapper,
                  focusedField === 'password' && styles.inputWrapperFocused,
                ]}
              >
                <Ionicons
                  name="lock-closed-outline"
                  size={19}
                  color={focusedField === 'password' ? TEAL : SLATE_LIGHT}
                  style={styles.inputIcon}
                />
                <View style={styles.inputTextArea}>
                  <Text style={styles.inputLabel}>Password</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="••••••••"
                    placeholderTextColor={SLATE_LIGHT}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    onFocus={() => setFocusedField('password')}
                    onBlur={() => setFocusedField(null)}
                  />
                </View>
                <TouchableOpacity
                  onPress={() => setShowPassword((v) => !v)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={19}
                    color={SLATE_LIGHT}
                  />
                </TouchableOpacity>
              </View>

              {error ? (
                <View style={styles.errorRow}>
                  <Ionicons name="alert-circle" size={15} color={DANGER} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              <TouchableOpacity
                activeOpacity={0.9}
                onPress={handleLogin}
                disabled={isLoading}
                style={styles.buttonShadow}
              >
                <LinearGradient
                  colors={[TEAL, TEAL_DARK]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.button}
                >
                  <Text style={styles.buttonText}>
                    {isLoading ? 'Signing in...' : 'Sign In'}
                  </Text>
                  {!isLoading && (
                    <Ionicons name="arrow-forward" size={18} color="#fff" />
                  )}
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity style={styles.forgotButton}>
                <Text style={styles.forgotText}>Forgot Password?</Text>
              </TouchableOpacity>

              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or</Text>
                <View style={styles.dividerLine} />
              </View>

              <TouchableOpacity style={styles.biometricButton} activeOpacity={0.85}>
                <Ionicons name="finger-print-outline" size={20} color={TEAL_DARK} />
                <Text style={styles.biometricText}>Sign in with biometrics</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.footer}>
            <Ionicons name="shield-checkmark-outline" size={13} color={SLATE_LIGHT} />
            <Text style={styles.footerText}>
              Protected by the Philippine Data Privacy Act of 2012
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  blob: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: TEAL,
    opacity: 0.07,
  },
  blobTop: {
    width: 260,
    height: 260,
    top: -100,
    right: -80,
  },
  blobBottom: {
    width: 320,
    height: 320,
    bottom: -140,
    left: -120,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 28,
    paddingTop: 64,
    paddingBottom: 40,
  },
  headerSection: {
    alignItems: 'center',
    marginBottom: 28,
  },
  logoRing: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(13,148,136,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: TEAL_DARK,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 6,
  },
  logoImage: {
    width: 56,
    height: 56,
    resizeMode: 'contain',
  },
  appName: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 0.5,
    color: INK,
    marginBottom: 4,
  },
  tagline: {
    fontSize: 11,
    fontWeight: '600',
    color: SLATE,
    letterSpacing: 1.2,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 8,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.06,
    shadowRadius: 24,
    elevation: 3,
  },
  welcomeText: {
    fontSize: 26,
    fontWeight: '800',
    color: INK,
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  subtitleText: {
    fontSize: 14,
    color: SLATE,
    marginBottom: 28,
  },
  formSection: {
    gap: 14,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: FIELD_BG,
    borderWidth: 1.5,
    borderColor: FIELD_BORDER,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
  },
  inputWrapperFocused: {
    borderColor: TEAL,
    backgroundColor: '#fff',
  },
  inputIcon: {
    marginTop: 12,
  },
  inputTextArea: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    color: SLATE,
    marginBottom: 2,
  },
  input: {
    fontSize: 16,
    color: INK,
    paddingVertical: 2,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 2,
  },
  errorText: {
    color: DANGER,
    fontSize: 13,
    fontWeight: '600',
  },
  buttonShadow: {
    borderRadius: 16,
    shadowColor: TEAL_DARK,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 5,
    marginTop: 6,
  },
  button: {
    borderRadius: 16,
    paddingVertical: 17,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  forgotButton: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  forgotText: {
    fontSize: 14,
    fontWeight: '600',
    color: TEAL_DARK,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
    marginBottom: 4,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: FIELD_BORDER,
  },
  dividerText: {
    fontSize: 12,
    color: SLATE_LIGHT,
    fontWeight: '600',
  },
  biometricButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: FIELD_BORDER,
    borderRadius: 16,
    paddingVertical: 14,
    marginBottom: 8,
  },
  biometricText: {
    fontSize: 14,
    fontWeight: '600',
    color: TEAL_DARK,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 32,
  },
  footerText: {
    fontSize: 11,
    color: SLATE_LIGHT,
    letterSpacing: 0.2,
  },
});