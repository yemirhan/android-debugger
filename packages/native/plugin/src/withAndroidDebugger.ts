import { ConfigPlugin, withAndroidManifest, AndroidConfig } from '@expo/config-plugins';

export interface AndroidDebuggerPluginProps {
  /** Port for the debug server (default: 8765) */
  port?: number;
  /** Only include in debug builds (default: true) */
  debugOnly?: boolean;
}

/**
 * Config plugin that modifies the Android project for the debugger:
 * 1. Ensures INTERNET permission is present
 * 2. Adds metadata for port configuration
 */
export const withAndroidDebugger: ConfigPlugin<AndroidDebuggerPluginProps | void> = (
  config,
  props = {}
) => {
  const { port = 8765, debugOnly = true } = props ?? {};

  // Modify AndroidManifest.xml
  config = withAndroidManifest(config, (config) => {
    const androidManifest = config.modResults;

    // Ensure INTERNET permission is present
    const permissions = androidManifest.manifest['uses-permission'] ?? [];
    const hasInternetPermission = permissions.some(
      (perm) => perm.$?.['android:name'] === 'android.permission.INTERNET'
    );

    if (!hasInternetPermission) {
      permissions.push({
        $: {
          'android:name': 'android.permission.INTERNET',
        },
      });
      androidManifest.manifest['uses-permission'] = permissions;
    }

    // Add metadata for port configuration
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(androidManifest);

    // Ensure meta-data array exists
    if (!application['meta-data']) {
      application['meta-data'] = [];
    }

    // Remove existing debugger metadata if present
    application['meta-data'] = application['meta-data'].filter(
      (meta) =>
        meta.$?.['android:name'] !== 'com.yemirhan.androiddebugger.PORT' &&
        meta.$?.['android:name'] !== 'com.yemirhan.androiddebugger.DEBUG_ONLY'
    );

    // Add port metadata
    application['meta-data'].push({
      $: {
        'android:name': 'com.yemirhan.androiddebugger.PORT',
        'android:value': String(port),
      },
    });

    // Add debug only metadata
    application['meta-data'].push({
      $: {
        'android:name': 'com.yemirhan.androiddebugger.DEBUG_ONLY',
        'android:value': String(debugOnly),
      },
    });

    return config;
  });

  return config;
};
