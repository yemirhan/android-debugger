import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Device } from '@android-debugger/shared';
import type { TabId } from '../App';
import { registerCoreCommands } from '../commands/core';
import type { CommandContext } from '../commands/types';
import { useCrashContext, useLogsContext } from '../contexts';
import { CommandPalette } from './CommandPalette';
import { Toaster } from './Toaster';

interface CommandCenterProps {
  isOpen: boolean;
  onOpenChange: (open: boolean | ((open: boolean) => boolean)) => void;
  devices: Device[];
  selectedDevice: Device | null;
  packageName: string;
  activeTab: TabId;
  sidebarExpanded: boolean;
  onNavigate: (tab: TabId) => void;
  onSelectDevice: (device: Device) => void;
  onSelectPackage: (packageName: string) => void;
  onRefreshDevices: () => Promise<void>;
  onToggleSidebar: () => void;
}

/** Tracks screen recording and mirroring, which live in the main process. */
function useCaptureState() {
  const [isRecording, setIsRecording] = useState(false);
  const [isMirroring, setIsMirroring] = useState(false);

  useEffect(() => {
    let active = true;
    const api = window.electronAPI;
    api.getRecordingState().then((state) => active && setIsRecording(state.isRecording)).catch(() => {});
    api.getScrcpyState().then((state) => active && setIsMirroring(state.isRunning)).catch(() => {});
    const unsubscribers = [
      api.onRecordingUpdate((state) => setIsRecording(state.isRecording)),
      api.onMirrorStarted(() => setIsMirroring(true)),
      api.onMirrorStopped(() => setIsMirroring(false)),
    ];
    return () => {
      active = false;
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, []);

  return { isRecording, isMirroring };
}

/**
 * Hosts the command panel: registers the built-in commands, builds the live
 * command context, binds global shortcuts and renders the toast stack.
 * Must be rendered inside LogsProvider and CrashProvider.
 */
export function CommandCenter({
  isOpen,
  onOpenChange,
  devices,
  selectedDevice,
  packageName,
  activeTab,
  sidebarExpanded,
  onNavigate,
  onSelectDevice,
  onSelectPackage,
  onRefreshDevices,
  onToggleSidebar,
}: CommandCenterProps) {
  const { isPaused, logMode, clearLogs, togglePause, setLogMode } = useLogsContext();
  const { clearCrashes } = useCrashContext();
  const { isRecording, isMirroring } = useCaptureState();

  useEffect(() => registerCoreCommands(), []);

  const context = useMemo<CommandContext>(
    () => ({
      devices,
      selectedDevice,
      device: selectedDevice?.status === 'device' ? selectedDevice : null,
      packageName,
      activeTab,
      sidebarExpanded,
      isRecording,
      isMirroring,
      logs: { isPaused, logMode },
      navigate: onNavigate,
      selectDevice: onSelectDevice,
      selectPackage: onSelectPackage,
      refreshDevices: onRefreshDevices,
      toggleSidebar: onToggleSidebar,
      clearLogView: () => clearLogs(),
      toggleLogPause: togglePause,
      setLogMode,
      clearCrashes,
    }),
    [
      devices,
      selectedDevice,
      packageName,
      activeTab,
      sidebarExpanded,
      isRecording,
      isMirroring,
      isPaused,
      logMode,
      clearLogs,
      togglePause,
      setLogMode,
      onNavigate,
      onSelectDevice,
      onSelectPackage,
      onRefreshDevices,
      onToggleSidebar,
      clearCrashes,
    ]
  );

  const handlersRef = useRef({ onOpenChange, onNavigate, onToggleSidebar });
  handlersRef.current = { onOpenChange, onNavigate, onToggleSidebar };

  // ⌘K toggles the panel, ⌘⇧P opens it (VS Code habit); ⌘B and ⌘, match the
  // shortcut hints shown on "Toggle sidebar" and "Open settings".
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.repeat) return;
      const key = event.key.toLowerCase();
      const handlers = handlersRef.current;
      if (key === 'k' && !event.shiftKey) {
        event.preventDefault();
        handlers.onOpenChange((open) => !open);
      } else if (key === 'p' && event.shiftKey) {
        event.preventDefault();
        handlers.onOpenChange(true);
      } else if (key === 'b' && !event.shiftKey) {
        event.preventDefault();
        handlers.onToggleSidebar();
      } else if (key === ',' && !event.shiftKey) {
        event.preventDefault();
        handlers.onOpenChange(false);
        handlers.onNavigate('settings');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <>
      <CommandPalette isOpen={isOpen} onClose={() => onOpenChange(false)} context={context} />
      <Toaster />
    </>
  );
}
