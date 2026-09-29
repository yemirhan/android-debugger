import assert from 'node:assert/strict';
import test from 'node:test';
import * as path from 'node:path';
import {
  SdkInstallOutputParser,
  androidVersionForApi,
  availableSystemImages,
  avdHomeFor,
  buildCreateAvdArgs,
  buildEmulatorArgs,
  categorizeDevice,
  createConfigPatch,
  defaultDeviceProfile,
  describeAvd,
  extractEmulatorErrors,
  emulatorBootWarning,
  formatBytes,
  javaMajorVersion,
  orderCmdlineToolsDirs,
  parseAdbDevices,
  parseDeviceProfiles,
  parseEmuAvdName,
  parseIni,
  parseJavaReleaseFile,
  parseJavaVersionOutput,
  parseListAvds,
  parseLockPid,
  parseRamMb,
  parseSdkmanagerList,
  parseSdkmanagerProgress,
  parseSizeToBytes,
  isPreviewApi,
  sortDeviceProfiles,
  profileCategoriesForTag,
  sdkCandidates,
  sdkmanagerFailure,
  suggestAvdName,
  systemImageFromSourceProperties,
  systemImageIdFromSysdir,
  updateIniText,
  validateAvdName,
  windowsBatchInvocation,
  wipeTargets,
} from './emulator-parsers.ts';

// ~/.android/avd/adbg_test.ini, written by avdmanager (emulator 36.3, macOS arm64).
const TOP_INI = `avd.ini.encoding=UTF-8
path=/Users/me/.android/avd/adbg_test.avd
path.rel=avd/adbg_test.avd
target=android-36
`;

// Excerpt of adbg_test.avd/config.ini after a few boots (the emulator rewrote avd.id/name as <build>).
const CONFIG_INI = `PlayStore.enabled = no
abi.type = arm64-v8a
avd.id = <build>
avd.ini.encoding = UTF-8
avd.name = <build>
disk.dataPartition.size = 6442450944
hw.cpu.arch = arm64
hw.device.manufacturer = Google
hw.device.name = pixel_6
hw.lcd.density = 420
hw.lcd.height = 2400
hw.lcd.width = 1080
hw.ramSize = 2G
image.sysdir.1 = system-images/android-36/google_apis_playstore/arm64-v8a/
sdcard.size = 512 MB
tag.display = Google Play
tag.id = google_apis_playstore
`;

// system-images/android-36/google_apis_playstore/arm64-v8a/source.properties
const SOURCE_PROPERTIES = `Pkg.Desc=System Image arm64-v8a with Google Play.
Pkg.Revision=7
Pkg.Dependencies=emulator#35.4.9
AndroidVersion.ApiLevel=36
AndroidVersion.ExtensionLevel=17
AndroidVersion.IsBaseSdk=true
SystemImage.Abi=arm64-v8a
SystemImage.TagId=google_apis_playstore
SystemImage.TagDisplay=Google Play
SystemImage.GpuSupport=true
Addon.VendorId=google
Addon.VendorDisplay=Google Inc.
`;

// `avdmanager list device` (cmdline-tools 19.0), trimmed.
const DEVICE_LIST = `Available devices definitions:
id: 0 or "automotive_1024p_landscape"
    Name: Automotive (1024p landscape)
    OEM : Google
    Tag : android-automotive-playstore
---------
id: 12 or "medium_phone"
    Name: Medium Phone
    OEM : Generic
---------
id: 21 or "Nexus 7"
    Name: Nexus 7 (2012)
    OEM : Google
---------
id: 36 or "pixel_6"
    Name: Pixel 6
    OEM : Google
---------
id: 51 or "pixel_tablet"
    Name: Pixel Tablet
    OEM : Google
---------
id: 56 or "tv_1080p"
    Name: Television (1080p)
    OEM : Google
    Tag : android-tv
---------
id: 59 or "wearos_large_round"
    Name: Wear OS Large Round
    OEM : Google
    Tag : android-wear
---------
id: 81 or "10.1in WXGA (Tablet)"
    Name: 10.1" WXGA (Tablet)
    OEM : Generic
`;

// `sdkmanager --list` (cmdline-tools 19.0), trimmed. Progress lines are \r-separated in the real output.
const SDK_LIST = `Loading package information...\r[=========                              ] 25% Loading local repository...\r[=======================================] 100% Computing updates...
Installed packages:
  Path                                                       | Version       | Description                             | Location
  -------                                                    | -------       | -------                                 | -------
  emulator                                                   | 36.3.10       | Android Emulator                        | emulator
  platform-tools                                             | 36.0.2        | Android SDK Platform-Tools              | platform-tools
  system-images;android-36;google_apis_playstore;arm64-v8a   | 7             | Google Play ARM 64 v8a System Image     | system-images/android-36/google_apis_playstore/arm64-v8a

Available Packages:
  Path                                                                            | Version           | Description
  -------                                                                         | -------           | -------
  build-tools;36.1.0                                                              | 36.1.0            | Android SDK Build-Tools 36.1
  system-images;android-34;google_apis;arm64-v8a                                  | 14                | Google APIs ARM 64 v8a System Image
  system-images;android-34;google_apis;x86_64                                     | 14                | Google APIs Intel x86_64 Atom System Image
  system-images;android-35-ext14;google_apis_playstore;arm64-v8a                  | 1                 | Google Play ARM 64 v8a System Image
  system-images;android-36;google_apis;arm64-v8a                                  | 7                 | Google APIs ARM 64 v8a System Image
  system-images;android-36;google_apis_playstore;arm64-v8a                        | 7                 | Google Play ARM 64 v8a System Image
  system-images;android-36.1;google_apis_playstore;arm64-v8a                      | 4                 | Google Play ARM 64 v8a System Image
  system-images;android-36;google_apis_playstore;x86_64                           | 7                 | Google Play Intel x86_64 Atom System Image

Available Updates:
  ID                   | Installed | Available
  -------              | -------   | -------
  emulator             | 36.3.10   | 37.1.11
`;

// Captured from `sdkmanager --sdk_root=<empty> --install "system-images;android-36;google_apis;arm64-v8a"`
// answering "n" (license text shortened). Two licenses are asked for in a row.
const INSTALL_LICENSE_OUTPUT = [
  'Loading package information...                                                  \r',
  '[                                       ] 3% Fetch remote repository...         \r',
  '[===                                    ] 10% Computing updates...              \n',
  'License android-sdk-arm-dbt-license:\n',
  '---------------------------------------\n',
  'Terms and Conditions\n\nThis is the Android Software Development Kit License Agreement\n\n',
  'January 16, 2019\n',
  '---------------------------------------\n',
  'Accept? (y/N): ',
];
const INSTALL_SECOND_LICENSE = 'License android-sdk-license:\n---------------------------------------\nSecond license\n---------------------------------------\nAccept? (y/N): ';
const INSTALL_DECLINED_TAIL = `Skipping following packages as the license is not accepted:
Android Emulator
Google APIs ARM 64 v8a System Image
The following packages can not be installed since their licenses or those of the packages they depend on were not accepted:
  emulator
  system-images;android-36;google_apis;arm64-v8a
[=======================================] 100% Computing updates...
`;

test('parseIni reads both spacing styles, skips comments and unescapes properties', () => {
  assert.deepEqual(parseIni(TOP_INI), {
    'avd.ini.encoding': 'UTF-8',
    path: '/Users/me/.android/avd/adbg_test.avd',
    'path.rel': 'avd/adbg_test.avd',
    target: 'android-36',
  });
  assert.equal(parseIni(CONFIG_INI)['hw.ramSize'], '2G');
  assert.deepEqual(parseIni('# c\nkey=C\\:\\\\sdk\n=bad\nnovalue\n'), { key: 'C:\\sdk' });
});

test('updateIniText replaces keys in place and appends new ones in the same style', () => {
  const updated = updateIniText('a = 1\nhw.ramSize = 2G\nb = 3\n\n', { 'hw.ramSize': '4096', 'hw.keyboard': 'yes' });
  assert.equal(updated, 'a = 1\nhw.ramSize = 4096\nb = 3\nhw.keyboard = yes\n');
  assert.equal(updateIniText('a=1', { b: '2' }), 'a=1\nb=2\n');
});

test('sizes and RAM', () => {
  assert.equal(parseSizeToBytes('6442450944'), 6442450944);
  assert.equal(parseSizeToBytes('6G'), 6 * 1024 ** 3);
  assert.equal(parseSizeToBytes('800MB'), 800 * 1024 ** 2);
  assert.equal(parseSizeToBytes('512 MB'), 512 * 1024 ** 2);
  assert.equal(parseSizeToBytes('lots'), null);
  assert.equal(parseRamMb('2G'), 2048);
  assert.equal(parseRamMb('2048'), 2048);
  assert.equal(parseRamMb('1536MB'), 1536);
  assert.equal(parseRamMb(''), null);
  assert.equal(formatBytes(2.5 * 1024 ** 3), '2.5 GB');
  assert.equal(formatBytes(512 * 1024 ** 2), '512 MB');
  assert.equal(formatBytes(null), null);
});

test('API levels map to Android versions', () => {
  assert.equal(androidVersionForApi('36'), '16');
  assert.equal(androidVersionForApi('36.1'), '16');
  assert.equal(androidVersionForApi('35-ext14'), '15');
  assert.equal(androidVersionForApi('32'), '12L');
  assert.equal(androidVersionForApi('CANARY'), null);
  assert.equal(systemImageIdFromSysdir('system-images/android-36/google_apis_playstore/arm64-v8a/'), 'system-images;android-36;google_apis_playstore;arm64-v8a');
  assert.equal(systemImageIdFromSysdir('system-images\\android-34\\google_apis\\x86_64\\'), 'system-images;android-34;google_apis;x86_64');
  assert.equal(systemImageIdFromSysdir('somewhere/else'), null);
});

test('describeAvd combines the AVD ini, config.ini and the installed image', () => {
  const image = systemImageFromSourceProperties(
    'android-36',
    parseIni(SOURCE_PROPERTIES),
    '/sdk/system-images/android-36/google_apis_playstore/arm64-v8a'
  );
  assert.ok(image);
  assert.equal(image.id, 'system-images;android-36;google_apis_playstore;arm64-v8a');
  assert.equal(image.apiLevel, '36');
  assert.equal(image.tagDisplay, 'Google Play');

  const avd = describeAvd({ name: 'adbg_test', topIni: parseIni(TOP_INI), config: parseIni(CONFIG_INI), path: '/p', image });
  assert.equal(avd.displayName, 'adbg test');
  assert.equal(avd.deviceProfile, 'pixel_6');
  assert.equal(avd.apiLevel, '36');
  assert.equal(avd.androidVersion, '16');
  assert.equal(avd.abi, 'arm64-v8a');
  // PlayStore.enabled says no, but the image is a Play Store image.
  assert.equal(avd.playStore, true);
  assert.equal(avd.ramMb, 2048);
  assert.equal(avd.storageBytes, 6442450944);
  assert.equal(avd.sdCard, '512 MB');
  assert.deepEqual(avd.screen, { width: 1080, height: 2400, density: 420 });
  assert.equal(avd.problem, null);

  const missing = describeAvd({ name: 'x', topIni: {}, config: parseIni(CONFIG_INI), path: '/p', image: null });
  assert.equal(missing.systemImageInstalled, false);
  assert.match(missing.problem ?? '', /not installed/);
  assert.equal(missing.tagDisplay, 'Google Play');

  const extension = systemImageFromSourceProperties(
    'android-35-ext14',
    { 'SystemImage.TagId': 'google_apis', 'SystemImage.Abi': 'arm64-v8a', 'AndroidVersion.ApiLevel': '35', 'AndroidVersion.ExtensionLevel': '14' },
    '/x'
  );
  assert.equal(extension?.apiLevel, '35-ext14');
  assert.equal(extension?.androidVersion, '15');
});

test('AVD names are validated and suggested', () => {
  assert.equal(validateAvdName('Pixel_8_API_36', []), null);
  assert.match(validateAvdName('', []) ?? '', /Enter a name/);
  assert.match(validateAvdName('my phone', []) ?? '', /letters, digits/);
  assert.match(validateAvdName('a;rm -rf', []) ?? '', /letters, digits/);
  assert.match(validateAvdName('.hidden', []) ?? '', /dot/);
  assert.match(validateAvdName('ADBG_TEST', ['adbg_test']) ?? '', /already exists/);
  assert.equal(suggestAvdName('Pixel 6', '36', []), 'Pixel_6_API_36');
  assert.equal(suggestAvdName('Pixel 6', '36', ['Pixel_6_API_36']), 'Pixel_6_API_36_2');
  assert.equal(suggestAvdName('10.1" WXGA (Tablet)', '34', []), '10.1_WXGA_Tablet_API_34');
});

test('device profiles are parsed and categorized', () => {
  const profiles = parseDeviceProfiles(DEVICE_LIST);
  assert.equal(profiles.length, 8);
  assert.deepEqual(profiles[0], {
    id: 'automotive_1024p_landscape',
    name: 'Automotive (1024p landscape)',
    oem: 'Google',
    tag: 'android-automotive-playstore',
    category: 'automotive',
  });
  const byId = Object.fromEntries(profiles.map((profile) => [profile.id, profile]));
  assert.equal(byId.pixel_6.category, 'phone');
  assert.equal(byId.pixel_6.tag, null);
  assert.equal(byId['Nexus 7'].category, 'tablet');
  assert.equal(byId.pixel_tablet.category, 'tablet');
  assert.equal(byId.tv_1080p.category, 'tv');
  assert.equal(byId.wearos_large_round.category, 'wear');
  assert.equal(byId['10.1in WXGA (Tablet)'].name, '10.1" WXGA (Tablet)');
  assert.equal(defaultDeviceProfile(profiles)?.id, 'pixel_6');
  const sorted = sortDeviceProfiles([
    ...profiles,
    { id: 'pixel_9', name: 'Pixel 9', oem: 'Google', tag: null, category: 'phone' },
    { id: 'pixel_10', name: 'Pixel 10', oem: 'Google', tag: null, category: 'phone' },
  ]).map((profile) => profile.id);
  assert.deepEqual(sorted.slice(0, 5), ['pixel_tablet', 'pixel_10', 'pixel_9', 'pixel_6', 'medium_phone']);
  assert.equal(categorizeDevice('x', 'Foldable', null), 'tablet');
  assert.deepEqual(profileCategoriesForTag('android-wear-signed'), ['wear']);
  assert.deepEqual(profileCategoriesForTag('google_apis_playstore'), ['phone', 'tablet', 'other']);
});

test('sdkmanager --list: installed and downloadable system images for the host', () => {
  const list = parseSdkmanagerList(SDK_LIST);
  assert.equal(list.installed.length, 3);
  assert.equal(list.installed[2].location, 'system-images/android-36/google_apis_playstore/arm64-v8a');
  assert.equal(list.available.length, 8);
  assert.ok(!list.available.some((row) => row.path === 'ID' || row.path === 'emulator'), 'updates table is ignored');

  assert.equal(isPreviewApi('CANARY'), true);
  assert.equal(isPreviewApi('canary-20260909'), true);
  assert.equal(isPreviewApi('37.2-beta1'), true);
  assert.equal(isPreviewApi('36.1'), false);
  assert.equal(isPreviewApi('35-ext14'), false);
  const withPreview = parseSdkmanagerList(
    SDK_LIST.replace('Available Packages:', 'Available Packages:\n  system-images;android-CANARY;google_apis_ps16k;arm64-v8a | 15 | Preview')
  );
  assert.equal(availableSystemImages(withPreview, 'arm64-v8a', new Set()).at(-1)?.apiLevel, 'CANARY', 'previews sort last');

  const installed = new Set(['system-images;android-36;google_apis_playstore;arm64-v8a']);
  const arm = availableSystemImages(list, 'arm64-v8a', installed);
  assert.deepEqual(
    arm.map((image) => image.id),
    [
      'system-images;android-36.1;google_apis_playstore;arm64-v8a',
      'system-images;android-36;google_apis;arm64-v8a',
      'system-images;android-35-ext14;google_apis_playstore;arm64-v8a',
      'system-images;android-34;google_apis;arm64-v8a',
    ]
  );
  assert.equal(arm[0].androidVersion, '16');
  assert.equal(arm[0].playStore, true);
  assert.equal(arm[1].revision, '7');
  const intel = availableSystemImages(list, 'x86_64', installed);
  assert.deepEqual(
    intel.map((image) => image.id),
    ['system-images;android-36;google_apis_playstore;x86_64', 'system-images;android-34;google_apis;x86_64']
  );
});

test('sdkmanager install progress', () => {
  assert.deepEqual(parseSdkmanagerProgress('[====      ] 12% Downloading android-36_r07.zip...\r[=======   ] 42% Downloading android-36_r07.zip...'), {
    percent: 42,
    message: 'Downloading android-36_r07.zip…',
  });
  assert.equal(parseSdkmanagerProgress('Loading package information...'), null);
});

test('sdkmanager license prompts are surfaced one at a time, even across chunks', () => {
  const parser = new SdkInstallOutputParser();
  const events = INSTALL_LICENSE_OUTPUT.slice(0, 4).flatMap((chunk) => parser.feed(chunk));
  assert.deepEqual(events.at(-1), { type: 'progress', percent: 10, message: 'Computing updates…' });
  assert.ok(!events.some((event) => event.type === 'license'), 'no prompt before "Accept?" arrives');

  const rest = INSTALL_LICENSE_OUTPUT.slice(4).flatMap((chunk) => parser.feed(chunk));
  const license = rest.find((event) => event.type === 'license');
  assert.ok(license && license.type === 'license');
  assert.equal(license.id, 'android-sdk-arm-dbt-license');
  assert.ok(license.text.startsWith('Terms and Conditions'));
  assert.ok(license.text.endsWith('January 16, 2019'));
  assert.ok(!license.text.includes('-----'));

  // After answering, the next license follows on the same line as the old prompt.
  const second = parser.feed(INSTALL_SECOND_LICENSE);
  assert.deepEqual(second, [{ type: 'license', id: 'android-sdk-license', text: 'Second license' }]);
  assert.deepEqual(parser.feed(INSTALL_DECLINED_TAIL), [{ type: 'progress', percent: 100, message: 'Computing updates…' }]);
  assert.match(sdkmanagerFailure(INSTALL_DECLINED_TAIL) ?? '', /license was not accepted/);
  assert.match(sdkmanagerFailure('Warning: Failed to find package \'system-images;android-99;x;y\'') ?? '', /Failed to find package/);
  assert.equal(sdkmanagerFailure('[====] 100% Unzipping... system.img'), null);
});

test('emulator and avdmanager command lines', () => {
  assert.deepEqual(buildEmulatorArgs('adbg_mgr_1'), ['-avd', 'adbg_mgr_1']);
  assert.deepEqual(buildEmulatorArgs('a', { coldBoot: true, headless: true, noAudio: true }), [
    '-avd',
    'a',
    '-no-snapshot-load',
    '-no-window',
    '-no-audio',
  ]);
  assert.deepEqual(buildEmulatorArgs('a', { wipeData: true, coldBoot: true }), ['-avd', 'a', '-wipe-data']);
  assert.throws(() => buildEmulatorArgs('a b'), /not a valid/);

  const request = {
    name: 'adbg_mgr_1',
    systemImage: 'system-images;android-36;google_apis_playstore;arm64-v8a',
    device: 'pixel_6',
    sdCardMb: 512,
    ramMb: 3072,
    storageGb: 8,
    displayName: 'Manager test',
  };
  assert.deepEqual(buildCreateAvdArgs(request), [
    'create',
    'avd',
    '--name',
    'adbg_mgr_1',
    '--package',
    'system-images;android-36;google_apis_playstore;arm64-v8a',
    '--device',
    'pixel_6',
    '--sdcard',
    '512M',
  ]);
  assert.deepEqual(buildCreateAvdArgs({ ...request, sdCardMb: 0, device: '10.1in WXGA (Tablet)' }).slice(-2), ['--device', '10.1in WXGA (Tablet)']);
  assert.throws(() => buildCreateAvdArgs({ ...request, systemImage: 'system-images;android-36;x' }), /system image/);
  assert.throws(() => buildCreateAvdArgs({ ...request, name: '../evil' }), /not a valid/);
  assert.deepEqual(createConfigPatch(request), {
    'hw.keyboard': 'yes',
    'avd.ini.displayname': 'Manager test',
    'hw.ramSize': '3072',
    'disk.dataPartition.size': String(8 * 1024 ** 3),
  });
});

test('Windows batch files run through cmd.exe with quoted arguments', () => {
  assert.deepEqual(windowsBatchInvocation('C:\\sdk\\avdmanager.bat', ['create', 'avd', '--device', '10.1in WXGA (Tablet)']), {
    command: 'cmd.exe',
    args: ['/d', '/s', '/c', '""C:\\sdk\\avdmanager.bat" "create" "avd" "--device" "10.1in WXGA (Tablet)""'],
  });
  assert.throws(() => windowsBatchInvocation('x.bat', ['a & calc']), /Unsupported/);
});

test('adb and emulator output', () => {
  assert.deepEqual(parseAdbDevices('List of devices attached\nemulator-5554\tdevice\nemulator-5556\toffline\n\n'), [
    { serial: 'emulator-5554', status: 'device' },
    { serial: 'emulator-5556', status: 'offline' },
  ]);
  assert.equal(parseEmuAvdName('adbg_test\r\nOK\r\n'), 'adbg_test');
  assert.equal(parseEmuAvdName('KO: unknown command\n'), null);
  assert.equal(parseEmuAvdName('OK\n'), null);
  assert.deepEqual(parseListAvds('INFO    | Storing crashdata in: /tmp/x\nadbg_test\nPixel_8_API_36\n'), ['adbg_test', 'Pixel_8_API_36']);
  assert.equal(parseLockPid('31449 '), 31449);
  assert.equal(parseLockPid(''), null);
  assert.deepEqual(
    extractEmulatorErrors(
      'INFO         | Android emulator version 36.3.10.0\nERROR        | Running multiple emulators with the same AVD is an experimental feature.\nPANIC: Missing emulator engine program for \'x86\' CPU.\n'
    ),
    ['Running multiple emulators with the same AVD is an experimental feature.', "Missing emulator engine program for 'x86' CPU."]
  );
  assert.match(emulatorBootWarning('WARNING      | hvf is not enabled on this aarch64 host.\n') ?? '', /Hardware acceleration/);
  assert.match(emulatorBootWarning('ERROR   | x86_64 emulation currently requires hardware acceleration!') ?? '', /Hardware acceleration/);
  assert.equal(emulatorBootWarning('INFO | Boot completed in 24329 ms'), null);
  assert.deepEqual(
    wipeTargets(['config.ini', 'userdata-qemu.img', 'userdata-qemu.img.qcow2', 'cache.img', 'encryptionkey.img', 'encryptionkey.img.qcow2', 'snapshots', 'sdcard.img']),
    ['userdata-qemu.img', 'userdata-qemu.img.qcow2', 'cache.img', 'encryptionkey.img.qcow2', 'snapshots']
  );
});

test('SDK, AVD home, cmdline-tools and Java discovery rules', () => {
  const join = path.posix.join;
  assert.deepEqual(sdkCandidates({ ANDROID_HOME: '/opt/sdk' }, '/Users/me', 'darwin', join), [
    { path: '/opt/sdk', source: 'ANDROID_HOME' },
    { path: '/Users/me/Library/Android/sdk', source: 'default' },
  ]);
  assert.deepEqual(
    sdkCandidates({}, '/home/me', 'linux', join).map((candidate) => candidate.path),
    ['/home/me/Android/Sdk', '/home/me/Android/sdk']
  );
  assert.equal(sdkCandidates({ LOCALAPPDATA: 'C:/Users/me/AppData/Local' }, 'C:/Users/me', 'win32', join)[0].path, 'C:/Users/me/AppData/Local/Android/Sdk');
  assert.deepEqual(
    sdkCandidates({ ANDROID_HOME: '/Users/me/Library/Android/sdk' }, '/Users/me', 'darwin', join),
    [{ path: '/Users/me/Library/Android/sdk', source: 'ANDROID_HOME' }],
    'no duplicates'
  );
  assert.equal(avdHomeFor({}, '/Users/me', join), '/Users/me/.android/avd');
  assert.equal(avdHomeFor({ ANDROID_USER_HOME: '/u' }, '/Users/me', join), '/u/avd');
  assert.equal(avdHomeFor({ ANDROID_AVD_HOME: '/avds', ANDROID_USER_HOME: '/u' }, '/Users/me', join), '/avds');
  assert.deepEqual(orderCmdlineToolsDirs(['9.0', 'latest-2', '19.0', 'latest', '.DS_Store', '16.0']), ['latest', '19.0', '16.0', '9.0', 'latest-2']);
  assert.equal(javaMajorVersion('21.0.8'), 21);
  assert.equal(javaMajorVersion('1.8.0_292'), 8);
  assert.equal(javaMajorVersion('17'), 17);
  assert.equal(parseJavaVersionOutput('openjdk version "21.0.8" 2025-07-15\nOpenJDK Runtime Environment'), '21.0.8');
  assert.equal(parseJavaVersionOutput('java version "20.0.2" 2023-07-18'), '20.0.2');
  assert.equal(parseJavaVersionOutput('The operation couldn’t be completed. Unable to locate a Java Runtime.'), null);
  assert.equal(parseJavaReleaseFile('IMPLEMENTOR="JetBrains s.r.o."\nJAVA_VERSION="21.0.8"\n'), '21.0.8');
});
