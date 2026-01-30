import React, { useState } from 'react';
import type { Device, IntentExtra } from '@android-debugger/shared';
import { useIntentTester } from '../hooks/useIntentTester';
import { InfoIcon } from './icons';
import { InfoModal } from './shared/InfoModal';
import { tabGuides } from '../data/tabGuides';

interface IntentTesterPanelProps {
  device: Device;
}

type TabType = 'deeplink' | 'builder' | 'saved' | 'history';

export function IntentTesterPanel({ device }: IntentTesterPanelProps) {
  const [showInfo, setShowInfo] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('deeplink');
  const guide = tabGuides['intent-tester'];
  const {
    currentIntent,
    savedIntents,
    history,
    deepLinkUri,
    setDeepLinkUri,
    loading,
    error,
    lastResult,
    fireIntent,
    fireDeepLink,
    saveCurrentIntent,
    deleteSavedIntent,
    loadSavedIntent,
    clearHistory,
    resetIntent,
    updateIntent,
    addExtra,
    removeExtra,
    updateExtra,
  } = useIntentTester(device);

  const commonActions = [
    'android.intent.action.VIEW',
    'android.intent.action.SEND',
    'android.intent.action.MAIN',
    'android.intent.action.EDIT',
    'android.intent.action.PICK',
  ];

  const extraTypes: IntentExtra['type'][] = ['string', 'int', 'long', 'float', 'double', 'boolean', 'uri'];

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
          <h2 className="text-base font-semibold">Intent Tester</h2>
          <button
            onClick={() => setShowInfo(true)}
            className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
            title="Learn more about this feature"
          >
            <InfoIcon />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-surface rounded-lg p-1 border border-border-muted">
        {[
          { id: 'deeplink' as TabType, label: 'Deep Link' },
          { id: 'builder' as TabType, label: 'Intent Builder' },
          { id: 'saved' as TabType, label: 'Saved' },
          { id: 'history' as TabType, label: 'History' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-150 ${
              activeTab === tab.id
                ? 'bg-accent-muted text-accent'
                : 'text-text-muted hover:text-text-primary hover:bg-surface-hover'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Error / Result */}
      {error && (
        <div className="px-4 py-2.5 rounded-lg text-sm font-medium bg-red-500/15 border border-red-500/25 text-red-400 animate-fade-in">
          {error}
        </div>
      )}
      {lastResult?.success && (
        <div className="px-4 py-2.5 rounded-lg text-sm font-medium bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 animate-fade-in">
          Intent fired successfully
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'deeplink' && (
          <div className="space-y-4">
            <div className="bg-surface rounded-lg p-4 border border-border-muted">
              <h3 className="text-sm font-medium text-text-primary mb-3">Quick Deep Link</h3>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={deepLinkUri}
                  onChange={(e) => setDeepLinkUri(e.target.value)}
                  placeholder="myapp://path/to/screen or https://example.com"
                  className="flex-1 px-3 py-2 text-sm bg-surface-hover border border-border-muted rounded-md text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/50 font-mono"
                />
                <button
                  onClick={fireDeepLink}
                  disabled={loading || !deepLinkUri}
                  className="px-4 py-2 text-sm font-medium bg-accent hover:bg-accent/90 text-white rounded-md transition-all duration-150 btn-press disabled:opacity-50"
                >
                  {loading ? 'Firing...' : 'Fire'}
                </button>
              </div>
            </div>

            <div className="bg-surface rounded-lg p-4 border border-border-muted">
              <h3 className="text-xs font-medium text-text-muted uppercase tracking-wider mb-3">
                Common Deep Links
              </h3>
              <div className="flex flex-wrap gap-2">
                {['myapp://home', 'myapp://profile', 'myapp://settings', 'https://example.com'].map((uri) => (
                  <button
                    key={uri}
                    onClick={() => setDeepLinkUri(uri)}
                    className="px-2 py-1 text-xs font-mono bg-surface-hover rounded border border-border-muted text-text-secondary hover:text-text-primary hover:border-border transition-all duration-150"
                  >
                    {uri}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'builder' && (
          <div className="space-y-4">
            <div className="bg-surface rounded-lg p-4 border border-border-muted">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-text-primary">Intent Configuration</h3>
                <div className="flex gap-2">
                  <button
                    onClick={resetIntent}
                    className="px-3 py-1.5 text-xs font-medium text-text-secondary bg-surface-hover rounded-md border border-border-muted hover:bg-surface-elevated hover:text-text-primary transition-all duration-150 btn-press"
                  >
                    Reset
                  </button>
                  <button
                    onClick={saveCurrentIntent}
                    className="px-3 py-1.5 text-xs font-medium text-accent bg-accent-muted rounded-md border border-accent/25 hover:bg-accent/25 transition-all duration-150 btn-press"
                  >
                    Save
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                {/* Name */}
                <div>
                  <label className="block text-xs text-text-muted mb-1">Template Name</label>
                  <input
                    type="text"
                    value={currentIntent.name}
                    onChange={(e) => updateIntent({ name: e.target.value })}
                    placeholder="My Intent Template"
                    className="w-full px-3 py-2 text-sm bg-surface-hover border border-border-muted rounded-md text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/50"
                  />
                </div>

                {/* Action */}
                <div>
                  <label className="block text-xs text-text-muted mb-1">Action</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={currentIntent.action}
                      onChange={(e) => updateIntent({ action: e.target.value })}
                      placeholder="android.intent.action.VIEW"
                      className="flex-1 px-3 py-2 text-sm bg-surface-hover border border-border-muted rounded-md text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/50 font-mono"
                    />
                    <select
                      value=""
                      onChange={(e) => e.target.value && updateIntent({ action: e.target.value })}
                      className="px-3 py-2 text-sm bg-surface-hover border border-border-muted rounded-md text-text-secondary focus:outline-none focus:ring-2 focus:ring-accent/50"
                    >
                      <option value="">Common...</option>
                      {commonActions.map((action) => (
                        <option key={action} value={action}>
                          {action.replace('android.intent.action.', '')}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Data URI */}
                <div>
                  <label className="block text-xs text-text-muted mb-1">Data URI</label>
                  <input
                    type="text"
                    value={currentIntent.data || ''}
                    onChange={(e) => updateIntent({ data: e.target.value })}
                    placeholder="https://example.com or content://..."
                    className="w-full px-3 py-2 text-sm bg-surface-hover border border-border-muted rounded-md text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/50 font-mono"
                  />
                </div>

                {/* MIME Type */}
                <div>
                  <label className="block text-xs text-text-muted mb-1">MIME Type</label>
                  <input
                    type="text"
                    value={currentIntent.type || ''}
                    onChange={(e) => updateIntent({ type: e.target.value })}
                    placeholder="text/plain"
                    className="w-full px-3 py-2 text-sm bg-surface-hover border border-border-muted rounded-md text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/50 font-mono"
                  />
                </div>

                {/* Component */}
                <div>
                  <label className="block text-xs text-text-muted mb-1">Component (optional)</label>
                  <input
                    type="text"
                    value={currentIntent.component || ''}
                    onChange={(e) => updateIntent({ component: e.target.value })}
                    placeholder="com.example/.MainActivity"
                    className="w-full px-3 py-2 text-sm bg-surface-hover border border-border-muted rounded-md text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/50 font-mono"
                  />
                </div>

                {/* Extras */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs text-text-muted">Extras</label>
                    <button
                      onClick={() => addExtra({ key: '', type: 'string', value: '' })}
                      className="text-xs text-accent hover:text-accent/80 transition-colors"
                    >
                      + Add Extra
                    </button>
                  </div>
                  {currentIntent.extras.length === 0 ? (
                    <p className="text-sm text-text-muted">No extras added</p>
                  ) : (
                    <div className="space-y-2">
                      {currentIntent.extras.map((extra, index) => (
                        <div key={index} className="flex gap-2 items-center">
                          <input
                            type="text"
                            value={extra.key}
                            onChange={(e) => updateExtra(index, { ...extra, key: e.target.value })}
                            placeholder="key"
                            className="flex-1 px-2 py-1.5 text-xs bg-surface-hover border border-border-muted rounded text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent/50 font-mono"
                          />
                          <select
                            value={extra.type}
                            onChange={(e) => updateExtra(index, { ...extra, type: e.target.value as IntentExtra['type'] })}
                            className="px-2 py-1.5 text-xs bg-surface-hover border border-border-muted rounded text-text-primary focus:outline-none focus:ring-1 focus:ring-accent/50"
                          >
                            {extraTypes.map((type) => (
                              <option key={type} value={type}>
                                {type}
                              </option>
                            ))}
                          </select>
                          <input
                            type="text"
                            value={extra.value}
                            onChange={(e) => updateExtra(index, { ...extra, value: e.target.value })}
                            placeholder="value"
                            className="flex-1 px-2 py-1.5 text-xs bg-surface-hover border border-border-muted rounded text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent/50 font-mono"
                          />
                          <button
                            onClick={() => removeExtra(index)}
                            className="p-1.5 text-text-muted hover:text-red-400 transition-colors"
                          >
                            <TrashIcon className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Fire Button */}
            <button
              onClick={fireIntent}
              disabled={loading}
              className="w-full px-4 py-3 text-sm font-medium bg-accent hover:bg-accent/90 text-white rounded-md transition-all duration-150 btn-press disabled:opacity-50"
            >
              {loading ? 'Firing Intent...' : 'Fire Intent'}
            </button>
          </div>
        )}

        {activeTab === 'saved' && (
          <div className="space-y-2">
            {savedIntents.length === 0 ? (
              <div className="bg-surface rounded-lg p-8 border border-border-muted text-center">
                <p className="text-sm text-text-muted">No saved intents</p>
                <p className="text-xs text-text-muted mt-1">
                  Save an intent from the Builder tab to use it later
                </p>
              </div>
            ) : (
              savedIntents.map((intent) => (
                <div
                  key={intent.id}
                  className="bg-surface rounded-lg p-4 border border-border-muted"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text-primary">{intent.name || 'Unnamed Intent'}</p>
                      <p className="text-xs font-mono text-text-muted mt-1 truncate">{intent.action}</p>
                      {intent.data && (
                        <p className="text-xs font-mono text-text-muted truncate">{intent.data}</p>
                      )}
                    </div>
                    <div className="flex gap-2 ml-4">
                      <button
                        onClick={() => {
                          loadSavedIntent(intent);
                          setActiveTab('builder');
                        }}
                        className="px-3 py-1.5 text-xs font-medium text-text-secondary bg-surface-hover rounded border border-border-muted hover:bg-surface-elevated hover:text-text-primary transition-all duration-150 btn-press"
                      >
                        Edit
                      </button>
                      <button
                        onClick={async () => {
                          loadSavedIntent(intent);
                          await fireIntent();
                        }}
                        disabled={loading}
                        className="px-3 py-1.5 text-xs font-medium bg-accent hover:bg-accent/90 text-white rounded transition-all duration-150 btn-press disabled:opacity-50"
                      >
                        Fire
                      </button>
                      <button
                        onClick={() => deleteSavedIntent(intent.id)}
                        className="p-1.5 text-text-muted hover:text-red-400 transition-colors"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-2">
            <div className="flex justify-end mb-2">
              <button
                onClick={clearHistory}
                disabled={history.length === 0}
                className="px-3 py-1.5 text-xs font-medium text-text-secondary bg-surface rounded-md border border-border-muted hover:bg-surface-hover hover:text-text-primary transition-all duration-150 btn-press disabled:opacity-50"
              >
                Clear History
              </button>
            </div>
            {history.length === 0 ? (
              <div className="bg-surface rounded-lg p-8 border border-border-muted text-center">
                <p className="text-sm text-text-muted">No history yet</p>
                <p className="text-xs text-text-muted mt-1">
                  Fired intents will appear here
                </p>
              </div>
            ) : (
              [...history].reverse().map((entry) => (
                <div
                  key={entry.id}
                  className={`bg-surface rounded-lg p-4 border ${
                    entry.success ? 'border-border-muted' : 'border-red-500/25'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            entry.success ? 'bg-emerald-400' : 'bg-red-400'
                          }`}
                        />
                        <p className="text-sm font-medium text-text-primary">
                          {entry.intent.name || entry.intent.action.replace('android.intent.action.', '')}
                        </p>
                      </div>
                      <p className="text-xs font-mono text-text-muted mt-1 truncate">{entry.intent.action}</p>
                      {entry.intent.data && (
                        <p className="text-xs font-mono text-text-muted truncate">{entry.intent.data}</p>
                      )}
                      {entry.error && (
                        <p className="text-xs text-red-400 mt-1">{entry.error}</p>
                      )}
                    </div>
                    <p className="text-xs text-text-muted ml-4 whitespace-nowrap">
                      {new Date(entry.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const TrashIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
    />
  </svg>
);
