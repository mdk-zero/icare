import React, { useEffect, useSyncExternalStore } from 'react';
import { Alert, Pressable, StyleSheet, Text, View, type AlertButton, type AlertOptions } from 'react-native';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

/**
 * Alert.alert for the student web app. In a browser react-native-web's
 * Alert.alert does nothing at all, so every "Submit quiz?", "Sign out?" and
 * error message in the app would vanish. This replaces it, once, with a queue
 * this host draws as a dialog in the app's own style. Mounted at the root
 * layout; WebAlertHost.tsx is the phone build's empty stand-in.
 */

interface QueuedAlert {
  id: number;
  title: string;
  message?: string;
  buttons: AlertButton[];
  options?: AlertOptions;
}

let queue: QueuedAlert[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

Alert.alert = (title, message, buttons, options) => {
  queue = [
    ...queue,
    {
      id: nextId++,
      title: title ?? '',
      message: message ?? undefined,
      buttons: buttons && buttons.length > 0 ? buttons : [{ text: 'OK' }],
      options,
    },
  ];
  emit();
};

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const current = () => queue[0] ?? null;

/** Closes the dialog on screen and runs what the pressed button asked for. */
function close(alert: QueuedAlert, button: AlertButton | null) {
  queue = queue.filter((a) => a.id !== alert.id);
  emit();
  if (button) button.onPress?.();
  else alert.options?.onDismiss?.();
}

/** What Escape or a tap outside means: the cancel button, if the alert has one. */
function dismiss(alert: QueuedAlert) {
  const cancel = alert.buttons.find((b) => b.style === 'cancel');
  if (cancel) close(alert, cancel);
  else if (alert.buttons.length === 1) close(alert, alert.buttons[0]);
  else if (alert.options?.cancelable) close(alert, null);
}

export function WebAlertHost() {
  const alert = useSyncExternalStore(subscribe, current, current);
  const { Palette, Accent } = useTheme();

  useEffect(() => {
    if (!alert) return;
    // Escape backs out. Enter takes the last button, the one the app means,
    // unless it destroys something: that takes a deliberate click.
    const onKey = (event: KeyboardEvent) => {
      const last = alert.buttons[alert.buttons.length - 1];
      if (event.key === 'Escape') dismiss(alert);
      else if (event.key === 'Enter' && last.style !== 'destructive') close(alert, last);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [alert]);

  if (!alert) return null;
  // Two buttons sit side by side, cancel first; three or more stack.
  const stacked = alert.buttons.length > 2;

  return (
    <View style={styles.overlay} accessibilityViewIsModal>
      <Pressable style={styles.backdrop} onPress={() => dismiss(alert)} accessibilityLabel="Close" />
      <View
        role="alertdialog"
        aria-label={alert.title}
        style={[styles.card, { backgroundColor: Palette.surface, borderColor: Palette.border }]}
      >
        {alert.title ? <Text style={[styles.title, { color: Palette.ink }]}>{alert.title}</Text> : null}
        {alert.message ? (
          <Text style={[styles.message, { color: Palette.textSecondary }]}>{alert.message}</Text>
        ) : null}
        <View style={[styles.buttons, stacked ? styles.buttonsStacked : null]}>
          {alert.buttons.map((button, index) => {
            const destructive = button.style === 'destructive';
            const cancel = button.style === 'cancel';
            const primary = !cancel && index === alert.buttons.length - 1;
            const color = destructive ? Accent.red.fg : primary ? Palette.white : Palette.text;
            return (
              <Pressable
                key={`${button.text}-${index}`}
                onPress={() => close(alert, button)}
                style={({ pressed }) => [
                  styles.button,
                  stacked ? null : styles.buttonInline,
                  {
                    backgroundColor: primary && !destructive ? Palette.primary : Palette.surfaceMuted,
                    borderColor: destructive ? Accent.red.border : Palette.border,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
              >
                <Text style={[styles.buttonText, { color }]}>{button.text ?? 'OK'}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'fixed' as 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  card: {
    width: '100%',
    maxWidth: 400,
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.xl,
    gap: Spacing.sm,
    boxShadow: '0 12px 32px rgba(15, 23, 42, 0.18)',
  },
  title: { fontSize: 17, fontWeight: '700', lineHeight: 23 },
  message: { fontSize: 15, lineHeight: 22 },
  buttons: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  buttonsStacked: { flexDirection: 'column-reverse' },
  button: {
    minHeight: 44,
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  buttonInline: { flex: 1 },
  buttonText: { fontSize: 15, fontWeight: '600' },
});
