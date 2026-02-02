import { ConfigPlugin } from '@expo/config-plugins';
import { withAndroidDebugger, AndroidDebuggerPluginProps } from './withAndroidDebugger';

/**
 * Expo config plugin for @yemirhan/android-debugger-native
 *
 * This plugin:
 * 1. Ensures the INTERNET permission is present in AndroidManifest.xml
 * 2. Adds metadata for port configuration
 *
 * Usage in app.json:
 * ```json
 * {
 *   "plugins": [
 *     ["@yemirhan/android-debugger-native/plugin", { "port": 8765 }]
 *   ]
 * }
 * ```
 *
 * Or without options (uses defaults):
 * ```json
 * {
 *   "plugins": ["@yemirhan/android-debugger-native"]
 * }
 * ```
 */
const withAndroidDebuggerPlugin: ConfigPlugin<AndroidDebuggerPluginProps | void> = (
  config,
  props
) => {
  return withAndroidDebugger(config, props);
};

export default withAndroidDebuggerPlugin;
export { withAndroidDebugger, AndroidDebuggerPluginProps };
