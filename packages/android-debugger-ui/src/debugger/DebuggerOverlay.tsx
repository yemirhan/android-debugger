import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Modal, PanResponder, Platform, StatusBar, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { isFailedRequest } from '../format';
import { useDebuggerConnection, useDebuggerData } from '../hooks';
import { theme } from '../theme';
import { DebuggerPanel, type DebuggerTab } from './DebuggerPanel';

declare const __DEV__: boolean | undefined;

const BUBBLE_SIZE = 52;
const EDGE_MARGIN = 12;
// Keeps the bubble clear of the status bar and navigation bar.
const VERTICAL_MARGIN = 64;
const TAP_SLOP = 6;

export interface DebuggerOverlayProps {
  /** Default: true in development builds (`__DEV__`), false otherwise. */
  enabled?: boolean;
  initialTab?: DebuggerTab;
}

/**
 * A draggable floating button that opens the in-app debugger. Render it once,
 * next to your root navigator. It shows whether the desktop app is connected
 * and counts errors (console.error and failed requests) you haven't seen yet.
 */
export function DebuggerOverlay({ enabled = typeof __DEV__ === 'undefined' || __DEV__, initialTab }: DebuggerOverlayProps) {
  const [open, setOpen] = useState(false);
  const data = useDebuggerData();
  const connected = useDebuggerConnection();

  const errorCount = useMemo(
    () => data.console.filter((entry) => entry.level === 'error').length + data.network.filter(isFailedRequest).length,
    [data.console, data.network]
  );
  const [seenErrors, setSeenErrors] = useState(0);
  // Clearing data drops the count below what was seen; start over from there.
  useEffect(() => {
    if (errorCount < seenErrors) setSeenErrors(errorCount);
  }, [errorCount, seenErrors]);
  const unseenErrors = open ? 0 : Math.max(0, errorCount - seenErrors);

  if (!enabled) return null;

  const close = () => {
    setSeenErrors(errorCount);
    setOpen(false);
  };

  return (
    <>
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        {open ? null : (
          <FloatingBubble connected={connected} badge={unseenErrors} onPress={() => setOpen(true)} />
        )}
      </View>
      <Modal visible={open} animationType="slide" onRequestClose={close} statusBarTranslucent presentationStyle="fullScreen">
        <DebuggerPanel
          onClose={close}
          initialTab={initialTab}
          insetTop={Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 48}
        />
      </Modal>
    </>
  );
}

interface FloatingBubbleProps {
  connected: boolean;
  badge: number;
  onPress: () => void;
}

function FloatingBubble({ connected, badge, onPress }: FloatingBubbleProps) {
  const { width, height } = useWindowDimensions();
  const bounds = useRef({ width, height });
  bounds.current = { width, height };
  const onPressRef = useRef(onPress);
  onPressRef.current = onPress;

  const resting = useRef({ x: width - BUBBLE_SIZE - EDGE_MARGIN, y: Math.round(height * 0.6) });
  const position = useRef(new Animated.ValueXY(resting.current)).current;

  const settle = (x: number, y: number) => {
    const { width: w, height: h } = bounds.current;
    const target = {
      x: x + BUBBLE_SIZE / 2 < w / 2 ? EDGE_MARGIN : w - BUBBLE_SIZE - EDGE_MARGIN,
      y: Math.min(Math.max(y, VERTICAL_MARGIN), h - BUBBLE_SIZE - VERTICAL_MARGIN),
    };
    resting.current = target;
    Animated.spring(position, { toValue: target, useNativeDriver: false, friction: 7 }).start();
  };
  const settleRef = useRef(settle);
  settleRef.current = settle;

  // Stay on screen after rotation or a window resize.
  useEffect(() => {
    settleRef.current(resting.current.x, resting.current.y);
  }, [width, height]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        position.stopAnimation();
        position.setOffset(resting.current);
        position.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event([null, { dx: position.x, dy: position.y }], { useNativeDriver: false }),
      onPanResponderRelease: (_, gesture) => {
        position.flattenOffset();
        if (Math.abs(gesture.dx) < TAP_SLOP && Math.abs(gesture.dy) < TAP_SLOP) {
          position.setValue(resting.current);
          onPressRef.current();
          return;
        }
        settleRef.current(resting.current.x + gesture.dx, resting.current.y + gesture.dy);
      },
      onPanResponderTerminate: () => {
        position.flattenOffset();
        settleRef.current(resting.current.x, resting.current.y);
      },
    })
  ).current;

  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={[styles.bubble, { transform: position.getTranslateTransform() }]}
      accessibilityRole="button"
      accessibilityLabel={`Open Android Debugger${badge > 0 ? `, ${badge} new errors` : ''}`}
    >
      <Ionicons name="bug" size={24} color="#ffffff" />
      <View style={[styles.statusDot, { backgroundColor: connected ? theme.colors.success : theme.colors.warning }]} />
      {badge > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: BUBBLE_SIZE,
    height: BUBBLE_SIZE,
    borderRadius: BUBBLE_SIZE / 2,
    backgroundColor: theme.colors.accentStrong,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  statusDot: {
    position: 'absolute',
    top: 3,
    right: 3,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: theme.colors.accentStrong,
  },
  badge: {
    position: 'absolute',
    bottom: -4,
    left: -4,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    backgroundColor: theme.colors.dangerStrong,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: theme.colors.background,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#ffffff',
  },
});
