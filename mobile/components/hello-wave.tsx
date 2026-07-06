import Animated from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

export function HelloWave() {
  return (
    <Animated.View
      style={{
        animationName: {
          '50%': { transform: [{ rotate: '15deg' }] },
        },
        animationIterationCount: 4,
        animationDuration: '300ms',
      }}
    >
      <Ionicons name="hand-right" size={28} color="#64748b" />
    </Animated.View>
  );
}