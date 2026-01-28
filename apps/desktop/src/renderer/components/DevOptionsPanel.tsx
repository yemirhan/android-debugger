import React from 'react';
import type { Device, DeveloperOptions } from '@android-debugger/shared';
import { useDeveloperOptions } from '../hooks/useDeveloperOptions';

interface DevOptionsPanelProps {
  device: Device;
}

export function DevOptionsPanel({ device }: DevOptionsPanelProps) {
  const {
    options,
    loading,
    updating,
    error,
    refresh,
    setLayoutBounds,
    setGpuOverdraw,
    setAnimationScale,
    setShowTouches,
    setPointerLocation,
  } = useDeveloperOptions(device);

  const animationScales = [0, 0.5, 1.0, 1.5, 2.0, 5.0, 10.0];

  return (
    <div className="flex-1 flex flex-col overflow-hidden p-4 gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Developer Options</h2>
        <button
          onClick={refresh}
          disabled={loading}
          className="px-3 py-1.5 text-xs font-medium text-text-secondary bg-surface rounded-md border border-border-muted hover:bg-surface-hover hover:text-text-primary transition-all duration-150 btn-press disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-2.5 rounded-lg text-sm font-medium bg-red-500/15 border border-red-500/25 text-red-400 animate-fade-in">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && !options && (
        <div className="flex-1 flex items-center justify-center text-text-muted">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
            <span className="text-sm">Loading options...</span>
          </div>
        </div>
      )}

      {/* Options content */}
      {options && (
        <div className="flex-1 overflow-auto space-y-4">
          {/* Drawing Section */}
          <div className="bg-surface rounded-lg p-4 border border-border-muted">
            <h3 className="text-xs font-medium text-text-muted uppercase tracking-wider mb-4">
              Drawing
            </h3>
            <div className="space-y-4">
              {/* Layout Bounds */}
              <ToggleOption
                label="Show Layout Bounds"
                description="Show clip bounds, margins, etc."
                enabled={options.layoutBounds}
                onChange={() => setLayoutBounds(!options.layoutBounds)}
                disabled={updating}
              />

              {/* GPU Overdraw */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-text-primary">Debug GPU Overdraw</p>
                  <p className="text-xs text-text-muted mt-0.5">Show overdraw areas on screen</p>
                </div>
                <select
                  value={options.gpuOverdraw}
                  onChange={(e) => setGpuOverdraw(e.target.value as DeveloperOptions['gpuOverdraw'])}
                  disabled={updating}
                  className="px-3 py-1.5 text-sm bg-surface-hover border border-border-muted rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/50 disabled:opacity-50"
                >
                  <option value="off">Off</option>
                  <option value="show">Show overdraw areas</option>
                  <option value="show_deuteranomaly">Show for deuteranomaly</option>
                </select>
              </div>
            </div>
          </div>

          {/* Input Section */}
          <div className="bg-surface rounded-lg p-4 border border-border-muted">
            <h3 className="text-xs font-medium text-text-muted uppercase tracking-wider mb-4">
              Input
            </h3>
            <div className="space-y-4">
              {/* Show Touches */}
              <ToggleOption
                label="Show Touches"
                description="Visual feedback for screen touches"
                enabled={options.showTouches}
                onChange={() => setShowTouches(!options.showTouches)}
                disabled={updating}
              />

              {/* Pointer Location */}
              <ToggleOption
                label="Pointer Location"
                description="Screen overlay showing current touch data"
                enabled={options.pointerLocation}
                onChange={() => setPointerLocation(!options.pointerLocation)}
                disabled={updating}
              />
            </div>
          </div>

          {/* Animation Section */}
          <div className="bg-surface rounded-lg p-4 border border-border-muted">
            <h3 className="text-xs font-medium text-text-muted uppercase tracking-wider mb-4">
              Animation Scales
            </h3>
            <div className="space-y-4">
              {/* Window Animation */}
              <ScaleOption
                label="Window Animation Scale"
                value={options.windowAnimationScale}
                options={animationScales}
                onChange={(v) => setAnimationScale(v, 'window')}
                disabled={updating}
              />

              {/* Transition Animation */}
              <ScaleOption
                label="Transition Animation Scale"
                value={options.transitionAnimationScale}
                options={animationScales}
                onChange={(v) => setAnimationScale(v, 'transition')}
                disabled={updating}
              />

              {/* Animator Duration */}
              <ScaleOption
                label="Animator Duration Scale"
                value={options.animatorDurationScale}
                options={animationScales}
                onChange={(v) => setAnimationScale(v, 'animator')}
                disabled={updating}
              />
            </div>

            {/* Quick Actions */}
            <div className="mt-4 pt-4 border-t border-border-muted">
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    await setAnimationScale(0, 'window');
                    await setAnimationScale(0, 'transition');
                    await setAnimationScale(0, 'animator');
                  }}
                  disabled={updating}
                  className="px-3 py-1.5 text-xs font-medium text-text-secondary bg-surface-hover rounded-md border border-border-muted hover:bg-surface-elevated hover:text-text-primary transition-all duration-150 btn-press disabled:opacity-50"
                >
                  Disable All
                </button>
                <button
                  onClick={async () => {
                    await setAnimationScale(1.0, 'window');
                    await setAnimationScale(1.0, 'transition');
                    await setAnimationScale(1.0, 'animator');
                  }}
                  disabled={updating}
                  className="px-3 py-1.5 text-xs font-medium text-text-secondary bg-surface-hover rounded-md border border-border-muted hover:bg-surface-elevated hover:text-text-primary transition-all duration-150 btn-press disabled:opacity-50"
                >
                  Reset to 1x
                </button>
              </div>
            </div>
          </div>

          {/* Info */}
          <div className="bg-surface rounded-lg p-4 border border-border-muted">
            <h3 className="text-xs font-medium text-text-muted uppercase tracking-wider mb-3">
              Note
            </h3>
            <p className="text-sm text-text-secondary">
              Some options may require the screen to refresh or the app to restart to take effect.
              Layout bounds and GPU overdraw will trigger a UI refresh automatically.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

interface ToggleOptionProps {
  label: string;
  description: string;
  enabled: boolean;
  onChange: () => void;
  disabled?: boolean;
}

function ToggleOption({ label, description, enabled, onChange, disabled }: ToggleOptionProps) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-text-primary">{label}</p>
        <p className="text-xs text-text-muted mt-0.5">{description}</p>
      </div>
      <button
        onClick={onChange}
        disabled={disabled}
        className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${
          enabled ? 'bg-accent' : 'bg-surface-hover border border-border-muted'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <div
          className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
            enabled ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
}

interface ScaleOptionProps {
  label: string;
  value: number;
  options: number[];
  onChange: (value: number) => void;
  disabled?: boolean;
}

function ScaleOption({ label, value, options, onChange, disabled }: ScaleOptionProps) {
  return (
    <div className="flex items-center justify-between">
      <p className="text-sm font-medium text-text-primary">{label}</p>
      <select
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        disabled={disabled}
        className="px-3 py-1.5 text-sm bg-surface-hover border border-border-muted rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/50 disabled:opacity-50"
      >
        {options.map((scale) => (
          <option key={scale} value={scale}>
            {scale === 0 ? 'Animation off' : `${scale}x`}
          </option>
        ))}
      </select>
    </div>
  );
}
