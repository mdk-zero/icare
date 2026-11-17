import React, { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';

/** How far, after damping, a pull has to travel before letting go reloads. */
const TRIGGER = 70;
/** The furthest the indicator follows the finger. */
const MAX_PULL = 96;
/** Screens where a reload would throw away what the student is in the middle of: a quiz being taken. */
const NO_PULL = /\/quiz\/[^/]+\/?$/;

/** The nearest ancestor that scrolls, or null when nothing above the touch does. */
function scrollerOf(el: Element | null): Element | null {
  for (let node = el; node && node !== document.body; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) return node;
  }
  return null;
}

/**
 * Pull down to reload, for the student web app opened on a phone. A phone
 * browser does this itself only when the page scrolls, and here the page
 * never does (each screen scrolls inside its own view), so it is done by
 * hand: a pull that starts with the screen scrolled to the top shows a
 * spinner, and letting go past the mark reloads the page. Off inside a
 * window (a form being filled in) and while taking a quiz, where a reload
 * would lose answers. Renders nothing on the phone app, which has its own.
 */
export function WebPullToRefresh() {
  const { Palette, Shadow } = useTheme();
  const [pull, setPull] = useState(0);
  const [reloading, setReloading] = useState(false);
  const start = useRef<number | null>(null);
  const pulled = useRef(0);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const onStart = (e: TouchEvent) => {
      start.current = null;
      if (e.touches.length !== 1 || NO_PULL.test(window.location.pathname)) return;
      const target = e.target as Element | null;
      if (target?.closest('[aria-modal="true"], [role="dialog"], input, textarea, select')) return;
      const scroller = scrollerOf(target);
      if (scroller && scroller.scrollTop > 0) return;
      start.current = e.touches[0].clientY;
    };
    const onMove = (e: TouchEvent) => {
      if (start.current === null) return;
      const dy = e.touches[0].clientY - start.current;
      // Damped, so the indicator lags the finger the way a native pull does.
      pulled.current = dy > 0 ? Math.min(MAX_PULL, dy * 0.5) : 0;
      setPull(pulled.current);
      if (dy < 0) start.current = null;
    };
    const onEnd = () => {
      if (start.current === null) return;
      start.current = null;
      if (pulled.current >= TRIGGER) {
        setReloading(true);
        window.location.reload();
        return;
      }
      pulled.current = 0;
      setPull(0);
    };

    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', onEnd);
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };
  }, []);

  if (Platform.OS !== 'web' || (pull === 0 && !reloading)) return null;
  const ready = reloading || pull >= TRIGGER;
  return (
    <View pointerEvents="none" style={[styles.wrap, { transform: [{ translateY: (reloading ? TRIGGER : pull) - 44 }] }]}>
      <View
        style={[styles.bubble, Shadow.raised, { backgroundColor: Palette.surface, borderColor: Palette.border }]}
        accessibilityRole="progressbar"
        accessibilityLabel={ready ? 'Release to reload' : 'Pull down to reload'}
      >
        <Ionicons
          name={reloading ? 'sync' : ready ? 'refresh' : 'arrow-down'}
          size={20}
          color={Palette.primary}
          style={{ transform: [{ rotate: `${reloading ? 0 : Math.round((pull / TRIGGER) * 180)}deg` }] }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center', zIndex: 1000 },
  bubble: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
