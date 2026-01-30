import React, { useState } from 'react';
import type { Device } from '@android-debugger/shared';
import { useScreenCapture } from '../hooks/useScreenCapture';
import { InfoIcon } from './icons';
import { InfoModal } from './shared/InfoModal';
import { tabGuides } from '../data/tabGuides';

interface ScreenCapturePanelProps {
  device: Device;
}

export function ScreenCapturePanel({ device }: ScreenCapturePanelProps) {
  const [showInfo, setShowInfo] = useState(false);
  const {
    isRecording,
    recordingPath,
    lastScreenshot,
    loading,
    error,
    takeScreenshot,
    startRecording,
    stopRecording,
  } = useScreenCapture(device);
  const guide = tabGuides['screen-capture'];

  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordingInterval, setRecordingInterval] = useState<NodeJS.Timeout | null>(null);

  const handleStartRecording = async () => {
    const success = await startRecording();
    if (success) {
      // Start duration counter
      setRecordingDuration(0);
      const interval = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
      setRecordingInterval(interval);
    }
  };

  const handleStopRecording = async () => {
    if (recordingInterval) {
      clearInterval(recordingInterval);
      setRecordingInterval(null);
    }
    await stopRecording();
    setRecordingDuration(0);
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden p-4 gap-4">
      <InfoModal
        isOpen={showInfo}
        onClose={() => setShowInfo(false)}
        title={guide.title}
        description={guide.description}
        features={guide.features}
        tips={guide.tips}
      />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold">Screen Capture</h2>
          <button
            onClick={() => setShowInfo(true)}
            className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
            title="Learn more about this feature"
          >
            <InfoIcon />
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-2.5 rounded-lg text-sm font-medium bg-red-500/15 border border-red-500/25 text-red-400 animate-fade-in">
          {error}
        </div>
      )}

      {/* Screenshot Section */}
      <div className="bg-surface rounded-lg p-4 border border-border-muted">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-medium text-text-primary">Screenshot</h3>
            <p className="text-xs text-text-muted mt-0.5">Capture the current screen</p>
          </div>
          <button
            onClick={takeScreenshot}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium bg-accent hover:bg-accent/90 text-white rounded-md transition-all duration-150 btn-press disabled:opacity-50 flex items-center gap-2"
          >
            <CameraIcon />
            {loading ? 'Capturing...' : 'Take Screenshot'}
          </button>
        </div>

        {lastScreenshot && (
          <div className="mt-4 p-3 bg-surface-hover rounded-lg border border-border-muted">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                <CheckIcon className="w-5 h-5 text-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-primary">Screenshot saved</p>
                <p className="text-xs text-text-muted font-mono truncate">{lastScreenshot.path}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Screen Recording Section */}
      <div className="bg-surface rounded-lg p-4 border border-border-muted">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-medium text-text-primary">Screen Recording</h3>
            <p className="text-xs text-text-muted mt-0.5">Record device screen (max 3 minutes)</p>
          </div>
          {!isRecording ? (
            <button
              onClick={handleStartRecording}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium bg-red-500 hover:bg-red-500/90 text-white rounded-md transition-all duration-150 btn-press disabled:opacity-50 flex items-center gap-2"
            >
              <RecordIcon />
              Start Recording
            </button>
          ) : (
            <button
              onClick={handleStopRecording}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium bg-surface-hover border border-red-500/50 text-red-400 hover:bg-red-500/15 rounded-md transition-all duration-150 btn-press disabled:opacity-50 flex items-center gap-2"
            >
              <StopIcon />
              Stop Recording
            </button>
          )}
        </div>

        {isRecording && (
          <div className="mt-4 p-4 bg-red-500/10 rounded-lg border border-red-500/25">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                <span className="text-sm font-medium text-red-400">Recording</span>
              </div>
              <span className="text-lg font-mono text-text-primary">{formatDuration(recordingDuration)}</span>
            </div>
            {recordingPath && (
              <p className="text-xs text-text-muted font-mono mt-2 truncate">Saving to: {recordingPath}</p>
            )}
          </div>
        )}
      </div>

      {/* Tips */}
      <div className="bg-surface rounded-lg p-4 border border-border-muted">
        <h3 className="text-xs font-medium text-text-muted uppercase tracking-wider mb-3">Tips</h3>
        <ul className="space-y-2 text-sm text-text-secondary">
          <li className="flex items-start gap-2">
            <span className="text-accent">•</span>
            Screenshots are saved as PNG files
          </li>
          <li className="flex items-start gap-2">
            <span className="text-accent">•</span>
            Screen recordings are limited to 3 minutes
          </li>
          <li className="flex items-start gap-2">
            <span className="text-accent">•</span>
            Recordings are saved as MP4 files
          </li>
          <li className="flex items-start gap-2">
            <span className="text-accent">•</span>
            A save dialog will appear for each capture
          </li>
        </ul>
      </div>
    </div>
  );
}

const CameraIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
    />
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
    />
  </svg>
);

const RecordIcon = () => (
  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="8" />
  </svg>
);

const StopIcon = () => (
  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
    <rect x="6" y="6" width="12" height="12" rx="1" />
  </svg>
);

const CheckIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);
