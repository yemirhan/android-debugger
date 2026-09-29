import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  attachMirrorCanvas,
  getMirrorSnapshot,
  pasteHostClipboard,
  sendMirrorControl,
} from '../../lib/mirror/mirror-client';
import { ANDROID_KEYCODE, translateKeyEvent } from '../../lib/mirror/keymap';

// android.view.MotionEvent / KeyEvent constants used by the input mapping
const ACTION_DOWN = 0;
const ACTION_UP = 1;
const ACTION_MOVE = 2;
const BUTTON_PRIMARY = 1;
const COPY_KEY_COPY = 1;
const COPY_KEY_CUT = 2;

/** Pixels of wheel delta that make one Android scroll "notch". */
const WHEEL_PIXELS_PER_NOTCH = 50;

interface MirrorCanvasProps {
  videoWidth: number;
  videoHeight: number;
  /** Receive keyboard input when focused. */
  interactive?: boolean;
  className?: string;
  onFocusChange?: (focused: boolean) => void;
}

/**
 * The live device screen. Sized to fit its container while preserving the
 * video aspect ratio, and maps mouse, wheel and keyboard input to device
 * touch, scroll and key events (in video coordinates, which the server maps
 * back to the physical screen).
 */
export function MirrorCanvas({ videoWidth, videoHeight, interactive = true, className, onFocusChange }: MirrorCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);
  const activeButton = useRef<number | null>(null);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    return attachMirrorCanvas(canvas);
  }, []);

  // Fit the canvas inside the container (object-fit: contain, but with a
  // real box so pointer coordinates map 1:1 onto the video).
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || videoWidth <= 0 || videoHeight <= 0) {
      setBox(null);
      return;
    }
    const fit = () => {
      const { clientWidth, clientHeight } = container;
      const scale = Math.min(clientWidth / videoWidth, clientHeight / videoHeight);
      if (!Number.isFinite(scale) || scale <= 0) return;
      setBox({ width: Math.floor(videoWidth * scale), height: Math.floor(videoHeight * scale) });
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(container);
    return () => observer.disconnect();
  }, [videoWidth, videoHeight]);

  const toDevice = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    const { videoWidth: width, videoHeight: height } = getMirrorSnapshot();
    if (!canvas || width <= 0 || height <= 0) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: ((clientX - rect.left) / rect.width) * width,
      y: ((clientY - rect.top) / rect.height) * height,
      width,
      height,
    };
  };

  // Wheel needs a non-passive listener to stop the page from scrolling.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !interactive) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const position = toDevice(event.clientX, event.clientY);
      if (!position) return;
      const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? 400 : 1;
      const clampNotches = (value: number) => Math.max(-16, Math.min(16, value));
      const hScroll = clampNotches((-event.deltaX * unit) / WHEEL_PIXELS_PER_NOTCH);
      const vScroll = clampNotches((-event.deltaY * unit) / WHEEL_PIXELS_PER_NOTCH);
      if (hScroll === 0 && vScroll === 0) return;
      sendMirrorControl({ type: 'scroll', ...position, hScroll, vScroll, buttons: 0 });
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [interactive]);

  const pressKey = (keycode: number, action: number) => sendMirrorControl({ type: 'key', action, keycode });

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!interactive || activeButton.current !== null) return;
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    const position = toDevice(event.clientX, event.clientY);
    if (!position) return;
    activeButton.current = event.button;
    event.currentTarget.setPointerCapture(event.pointerId);
    if (event.button === 0) {
      sendMirrorControl({
        type: 'touch',
        action: ACTION_DOWN,
        ...position,
        pressure: 1,
        actionButton: BUTTON_PRIMARY,
        buttons: BUTTON_PRIMARY,
      });
    } else if (event.button === 2) {
      // Right click: back (or wake the screen), like scrcpy.
      sendMirrorControl({ type: 'back-or-screen-on', action: ACTION_DOWN });
    } else if (event.button === 1) {
      pressKey(ANDROID_KEYCODE.HOME, ACTION_DOWN);
    }
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (activeButton.current !== 0) return;
    const position = toDevice(event.clientX, event.clientY);
    if (!position) return;
    sendMirrorControl({ type: 'touch', action: ACTION_MOVE, ...position, pressure: 1, actionButton: 0, buttons: BUTTON_PRIMARY });
  };

  const endPointer = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const button = activeButton.current;
    if (button === null) return;
    activeButton.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (button === 0) {
      const position = toDevice(event.clientX, event.clientY);
      if (!position) return;
      sendMirrorControl({ type: 'touch', action: ACTION_UP, ...position, pressure: 0, actionButton: BUTTON_PRIMARY, buttons: 0 });
    } else if (button === 2) {
      sendMirrorControl({ type: 'back-or-screen-on', action: ACTION_UP });
    } else if (button === 1) {
      pressKey(ANDROID_KEYCODE.HOME, ACTION_UP);
    }
  };

  const onKey = (event: React.KeyboardEvent<HTMLCanvasElement>, phase: 'down' | 'up') => {
    if (!interactive) return;
    const translation = translateKeyEvent(event.nativeEvent, phase);
    if (translation.kind === 'ignore') return;
    event.preventDefault();
    event.stopPropagation();
    if (translation.kind === 'text') {
      sendMirrorControl({ type: 'text', text: translation.text });
    } else if (translation.kind === 'key') {
      sendMirrorControl({
        type: 'key',
        action: phase === 'down' ? ACTION_DOWN : ACTION_UP,
        keycode: translation.keycode,
        metaState: translation.metaState,
        repeat: translation.repeat,
      });
    } else if (translation.kind === 'clipboard') {
      if (translation.action === 'paste') pasteHostClipboard();
      else sendMirrorControl({ type: 'get-clipboard', copyKey: translation.action === 'copy' ? COPY_KEY_COPY : COPY_KEY_CUT });
    }
  };

  return (
    <div ref={containerRef} className={`relative flex items-center justify-center min-w-0 min-h-0 ${className ?? ''}`}>
      <canvas
        ref={canvasRef}
        tabIndex={interactive ? 0 : -1}
        aria-label="Device screen. Click to tap, drag to swipe, scroll to scroll; type while focused."
        data-mirror-canvas
        className={`block bg-black rounded-md outline-none select-none touch-none ${
          interactive ? 'cursor-pointer focus-visible:ring-2 focus-visible:ring-accent focus:ring-2 focus:ring-accent/70' : ''
        } ${box ? '' : 'invisible'}`}
        style={box ? { width: box.width, height: box.height } : { width: 0, height: 0 }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onLostPointerCapture={endPointer}
        onContextMenu={(event) => event.preventDefault()}
        onKeyDown={(event) => onKey(event, 'down')}
        onKeyUp={(event) => onKey(event, 'up')}
        onFocus={() => onFocusChange?.(true)}
        onBlur={() => onFocusChange?.(false)}
      />
    </div>
  );
}
