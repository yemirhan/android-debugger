export interface TabGuide {
  title: string;
  description: string;
  features?: string[];
  tips?: string[];
}

export const tabGuides: Record<string, TabGuide> = {
  dashboard: {
    title: 'Dashboard',
    description: "Your app's command center - see everything at a glance.",
    features: [
      'Quick view of your app\'s health (memory, speed, battery)',
      'Recent activity and events',
      'One-click access to common actions',
    ],
  },

  memory: {
    title: 'Memory Usage',
    description: "Shows how much of your phone's memory your app is using.",
    features: [
      'Live chart tracking memory over time',
      'Alerts when memory gets too high',
      'Breakdown of where memory is being used',
    ],
    tips: [
      'High memory can cause your app to slow down or crash',
      'Use "Clear" to reset the chart and start fresh',
    ],
  },

  'cpu-fps': {
    title: 'CPU / FPS',
    description: 'Measures how hard your app is working and how smooth it feels.',
    features: [
      'CPU shows how much processing power your app needs',
      'FPS (frames per second) shows animation smoothness',
      'Detects "janky" frames that cause stuttering',
    ],
    tips: [
      '60 FPS = smooth experience',
      'High CPU can drain battery faster',
    ],
  },

  battery: {
    title: 'Battery',
    description: "Shows your device's battery status while testing.",
    features: [
      'Current charge level and charging status',
      'Battery health and temperature',
      'Voltage information',
    ],
  },

  'network-stats': {
    title: 'Network Stats',
    description: 'Tracks how much internet data your app sends and receives.',
    features: [
      'Data uploaded and downloaded',
      'Stats for specific apps',
    ],
    tips: [
      'Useful for checking if your app uses too much mobile data',
    ],
  },

  logs: {
    title: 'Logs',
    description: "A live feed of messages from your app - like a diary of what's happening.",
    features: [
      'See messages in real-time as they happen',
      'Filter by importance (errors, warnings, info)',
      'Search to find specific messages',
      'Save logs to a file',
    ],
    tips: [
      'Red messages usually mean something went wrong',
      "Use search to quickly find what you're looking for",
    ],
  },

  crashes: {
    title: 'Crashes',
    description: 'Catches and records when your app crashes.',
    features: [
      'Automatic crash detection',
      'Detailed crash reports',
      'History of all crashes',
    ],
    tips: [
      'Share crash reports with developers to help fix issues',
    ],
  },

  network: {
    title: 'Network',
    description: 'See every internet request your app makes.',
    features: [
      'List of all web requests (API calls)',
      'Filter by type (GET, POST, etc.)',
      'View request and response details',
      'Copy as curl command for sharing',
    ],
    tips: [
      'Green status codes (200s) = success',
      'Red status codes (400s, 500s) = errors',
    ],
  },

  websocket: {
    title: 'WebSocket',
    description: 'Monitor real-time connections (like chat or live updates).',
    features: [
      'See active WebSocket connections',
      'View messages being sent and received',
    ],
    tips: [
      'WebSockets are used for features that update instantly',
    ],
  },

  sdk: {
    title: 'SDK',
    description: 'Shows information about Android development tools.',
    features: [
      'Bundletool version and status',
      'SDK configuration',
    ],
  },

  'activity-stack': {
    title: 'Activity Stack',
    description: 'Shows which screens in your app are currently open.',
    features: [
      'See the "stack" of screens (newest on top)',
      'Track screen states (active, paused, etc.)',
      'Auto-refresh option',
    ],
    tips: [
      'Helps understand how users navigate through your app',
    ],
  },

  jobs: {
    title: 'Jobs',
    description: 'Lists background tasks your app has scheduled.',
    features: [
      'See all scheduled jobs',
      'View job details and timing',
    ],
    tips: [
      'Jobs run in the background even when the app is closed',
    ],
  },

  alarms: {
    title: 'Alarms',
    description: 'Shows timers and alarms set by your app.',
    features: [
      'List of all scheduled alarms',
      "When they'll trigger",
    ],
    tips: [
      'Alarms are used for reminders and scheduled tasks',
    ],
  },

  services: {
    title: 'Services',
    description: 'Shows background processes running for your app.',
    features: [
      'List of active services',
      'Service status and details',
    ],
    tips: [
      'Services do work in the background (like playing music)',
    ],
  },

  'file-inspector': {
    title: 'File Inspector',
    description: "Browse and inspect your app's stored data.",
    features: [
      'View files and folders',
      'See saved preferences (app settings)',
      'Browse databases',
    ],
    tips: [
      'Great for checking if data is saved correctly',
    ],
  },

  'app-installer': {
    title: 'Install App',
    description: 'Install apps onto your connected device.',
    features: [
      'Drag and drop APK files',
      'Installation progress tracking',
      'Error messages if something goes wrong',
    ],
    tips: [
      'Make sure your device allows app installation from unknown sources',
    ],
  },

  'intent-tester': {
    title: 'Intent Tester',
    description: 'Send commands to your app to trigger specific actions.',
    features: [
      'Configure and send intents',
      'Test deep links and app actions',
    ],
    tips: [
      'Useful for testing how your app responds to external triggers',
    ],
  },

  'screen-capture': {
    title: 'Screen Capture',
    description: 'Take screenshots from your connected device.',
    features: [
      'Capture current screen',
      'Save screenshots to your computer',
    ],
    tips: [
      'Great for documentation or bug reports',
    ],
  },

  'dev-options': {
    title: 'Dev Options',
    description: 'Quick access to Android developer settings.',
    features: [
      'Toggle common developer options',
      'Change device settings for testing',
    ],
  },

  'app-metadata': {
    title: 'App Info',
    description: 'View detailed information about your app.',
    features: [
      'App version and package name',
      'Permissions your app uses',
      'Other app metadata',
    ],
  },

  settings: {
    title: 'Settings',
    description: 'Configure Android Debugger preferences.',
    features: [
      'Check for app updates',
      'View bundletool configuration',
      'General app settings',
    ],
  },
};
