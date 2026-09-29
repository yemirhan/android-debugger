import React from 'react';

/** Outline icons for command panel entries (sized by the panel). */
function Icon({ d, children }: { d?: string; children?: React.ReactNode }) {
  return (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      {d && <path d={d} />}
      {children}
    </svg>
  );
}

export const PhoneIcon = () => <Icon d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />;
export const RefreshIcon = () => (
  <Icon d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
);
export const CopyIcon = () => (
  <Icon d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
);
export const PackageIcon = () => (
  <Icon d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
);
export const PlayIcon = () => <Icon d="M6.5 5.2v13.6a.8.8 0 001.2.7l11-6.8a.8.8 0 000-1.4l-11-6.8a.8.8 0 00-1.2.7z" />;
export const StopIcon = () => (
  <Icon>
    <rect x="6" y="6" width="12" height="12" rx="1.5" />
  </Icon>
);
export const RestartIcon = () => <Icon d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4.5v4h4" />;
export const EraseIcon = () => <Icon d="M20 20H9.5M4.7 15.3l9.9-9.9a2 2 0 012.8 0l2.2 2.2a2 2 0 010 2.8L11 19H7.4l-2.7-2.7a.7.7 0 010-1z" />;
export const TrashIcon = () => (
  <Icon d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
);
export const CameraIcon = () => (
  <Icon>
    <path d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
    <path d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
  </Icon>
);
export const VideoIcon = () => (
  <Icon d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
);
export const MirrorIcon = () => (
  <Icon d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
);
export const FolderIcon = () => <Icon d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />;
export const LinkIcon = () => (
  <Icon d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
);
export const BoltIcon = () => <Icon d="M13 3L4 14h7l-1 7 9-11h-7l1-7z" />;
export const MenuIcon = () => <Icon d="M4 6h16M4 12h16M4 18h10" />;
export const LayoutIcon = () => (
  <Icon>
    <rect x="3.5" y="3.5" width="17" height="17" rx="1.5" strokeDasharray="2.5 2" />
    <rect x="7.5" y="7.5" width="9" height="5" rx="0.5" />
  </Icon>
);
export const TouchIcon = () => (
  <Icon d="M9 11.5V5.75a1.75 1.75 0 013.5 0V11m0-1.5a1.75 1.75 0 013.5 0V12m0-1a1.75 1.75 0 013.5 0v3.5a6.5 6.5 0 01-6.5 6.5h-.8a6 6 0 01-4.6-2.15L4.2 14.6a1.6 1.6 0 012.4-2.1L9 15" />
);
export const CrosshairIcon = () => <Icon d="M12 3v4m0 10v4M3 12h4m10 0h4M12 12h.01M19 12a7 7 0 11-14 0 7 7 0 0114 0z" />;
export const AnimationIcon = () => (
  <Icon d="M13 12a4 4 0 11-8 0 4 4 0 018 0zM15.5 8.5a4 4 0 010 7M18.5 6.5a7 7 0 010 11" />
);
export const SidebarIcon = () => (
  <Icon>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M9 4v16" />
  </Icon>
);
export const SettingsIcon = () => (
  <Icon>
    <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </Icon>
);
export const DownloadIcon = () => <Icon d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />;
export const LogsIcon = () => <Icon d="M4 6h16M4 10h16M4 14h10M4 18h7" />;
export const PauseIcon = () => <Icon d="M9 5v14M15 5v14" />;
export const FilterIcon = () => <Icon d="M3 5h18l-7 8.5V19l-4 2v-7.5L3 5z" />;
export const XCircleIcon = () => <Icon d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />;
export const SparkleIcon = () => (
  <Icon d="M12 3l1.8 4.9L18.7 9.7l-4.9 1.8L12 16.4l-1.8-4.9L5.3 9.7l4.9-1.8L12 3zM18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2z" />
);
export const EmulatorIcon = () => (
  <Icon>
    <rect x="6" y="2.75" width="12" height="18.5" rx="2.25" />
    <path d="M10.5 9.25v5.5l4.25-2.75-4.25-2.75z" />
  </Icon>
);
export const PlusIcon = () => <Icon d="M12 5v14M5 12h14" />;
