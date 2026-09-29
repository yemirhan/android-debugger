/**
 * Contract between the main process and the renderer for in-app screen
 * mirroring. Type-only so main, preload and renderer can all import it.
 *
 * Video packets and control input flow over a dedicated MessagePort per
 * session (binary payloads are structured-cloned, never JSON encoded).
 */

export interface MirrorQualityPreset {
  id: string;
  label: string;
  description: string;
  /** Longest side of the video in pixels, 0 = native resolution. */
  maxSize: number;
  videoBitRate: number;
  maxFps: number;
}

export interface MirrorStartOptions {
  maxSize: number;
  videoBitRate: number;
  maxFps: number;
  stayAwake: boolean;
  showTouches: boolean;
  turnScreenOff: boolean;
}

export interface MirrorStartResult {
  success: boolean;
  sessionId?: string;
  error?: string;
  /** 'server-missing' means scrcpy (and its server) must be installed first. */
  code?: 'server-missing' | 'failed';
}

export interface MirrorServerStatus {
  /** A server the in-app mirror can use is installed. */
  available: boolean;
  /** A server is installed but too old for the in-app mirror (scrcpy < 4). */
  outdated?: boolean;
  version: string | null;
  path: string | null;
}

/** Control requests the renderer may send; validated and serialized in main. */
export type MirrorControlRequest =
  | { type: 'key'; action: number; keycode: number; repeat?: number; metaState?: number }
  | { type: 'text'; text: string }
  | {
      type: 'touch';
      action: number;
      x: number;
      y: number;
      width: number;
      height: number;
      pressure?: number;
      actionButton?: number;
      buttons?: number;
      pointer?: 'mouse' | 'finger';
    }
  | { type: 'scroll'; x: number; y: number; width: number; height: number; hScroll: number; vScroll: number; buttons?: number }
  | { type: 'back-or-screen-on'; action: number }
  | { type: 'display-power'; on: boolean }
  | { type: 'rotate' }
  | { type: 'expand-notifications' }
  | { type: 'expand-settings' }
  | { type: 'collapse-panels' }
  | { type: 'reset-video' }
  | { type: 'get-clipboard'; copyKey: number };

/** Renderer -> main, over the session port. */
export type MirrorPortRequest =
  | { type: 'control'; request: MirrorControlRequest }
  /** Paste the host clipboard into the focused device field. */
  | { type: 'paste' };

/** Main -> renderer, over the session port. */
export type MirrorPortMessage =
  | { type: 'device-meta'; deviceName: string }
  | { type: 'codec'; codec: string | null }
  | { type: 'session'; width: number; height: number }
  | { type: 'packet'; config: boolean; keyFrame: boolean; pts: number | null; data: Uint8Array }
  /** Device clipboard text was copied to the host clipboard. */
  | { type: 'clipboard'; length: number }
  | { type: 'closed'; error: string | null };
