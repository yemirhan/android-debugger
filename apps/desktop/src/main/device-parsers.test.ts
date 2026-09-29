import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseActivityStack,
  parseAppMetadata,
  parseBatteryInfo,
  parseDumpsysDuration,
  parseFpsInfo,
  parseLsEntries,
  parseNetworkStats,
  parsePackageUid,
  parseScheduledAlarms,
  parseScheduledJobs,
  parseServicesInfo,
  parseSharedPrefsXml,
  parseTopCpuUsage,
  shellQuote,
} from './device-parsers.ts';

// Fixtures below are trimmed captures from an Android 16 (API 36) emulator.

test('shellQuote protects arguments from the device shell', () => {
  assert.equal(shellQuote('com.example.app/.MainActivity'), 'com.example.app/.MainActivity');
  assert.equal(shellQuote('https://example.com/?a=1&b=2'), "'https://example.com/?a=1&b=2'");
  assert.equal(shellQuote("it's a file.txt"), "'it'\\''s a file.txt'");
  assert.equal(shellQuote(''), "''");
});

test('parseDumpsysDuration handles dumpsys duration strings', () => {
  assert.equal(parseDumpsysDuration('+1d0h0m0s0ms'), 86_400_000);
  assert.equal(parseDumpsysDuration('-11s661ms'), -11_661);
  assert.equal(parseDumpsysDuration('+21m1s936ms'), 1_261_936);
  assert.equal(parseDumpsysDuration('0'), 0);
  assert.equal(parseDumpsysDuration('none'), null);
});

test('top parser matches the exact process and normalises to device CPU', () => {
  const top = [
    'Tasks: 360 total,   1 running, 359 sleeping,   0 stopped,   0 zombie',
    '400%cpu   4%user   8%nice  24%sys 348%idle   8%iow   8%irq   0%sirq   0%host',
    '  PID USER         PR  NI VIRT  RES  SHR S[%CPU] %MEM     TIME+ ARGS',
    ' 4880 u0_a145      20   0  17G 115M  70M S 120.0   5.8   0:03.71 com.android.vending:background',
    ' 4796 u0_a145      20   0  18G  89M  56M S  40.0   4.5   0:02.48 com.android.vending',
    ' 5571 shell        20   0  10G 4.8M 3.8M R  0.0   0.2   0:00.01 top -n 1 -b',
  ].join('\n');
  assert.equal(parseTopCpuUsage(top, 'com.android.vending'), 10);
  assert.equal(parseTopCpuUsage(top, 'com.example.missing'), null);
});

test('gfxinfo parser uses process totals and orders vsyncs across windows', () => {
  const header = 'Flags,FrameTimelineVsyncId,IntendedVsync,Vsync,InputEventId,HandleInputStart,AnimationStart,PerformTraversalsStart,DrawStart,FrameDeadline,FrameStartTime,FrameInterval,WorkloadTarget,SyncQueued,SyncStart,IssueDrawCommandsStart,SwapBuffers,FrameCompleted,DequeueBufferDuration,QueueBufferDuration,GpuCompleted,SwapBuffersCompleted,DisplayPresentTime,CommandSubmissionCompleted,';
  const frame = (vsync: number) => {
    const values = new Array(24).fill(0);
    values[2] = vsync;
    values[17] = vsync + 8_000_000;
    return `${values.join(',')},`;
  };
  const output = [
    '** Graphics info for pid 1049 [com.android.systemui] **',
    'Total frames rendered: 48',
    'Janky frames: 36 (75.00%)',
    'Janky frames (legacy): 34 (70.83%)',
    '\tStatusBar/android.view.ViewRootImpl@75a5257 (visibility=0)',
    'Window: StatusBar',
    'Total frames rendered: 3',
    'Janky frames: 1 (33.33%)',
    '---PROFILEDATA---', header,
    frame(1_050_000_000), frame(1_016_666_667),
    '---PROFILEDATA---',
    'Window: NotificationShade',
    'Total frames rendered: 1',
    'Janky frames: 0 (0.00%)',
    '---PROFILEDATA---', header,
    frame(1_000_000_000), frame(1_033_333_333),
    '---PROFILEDATA---',
  ].join('\n');

  const info = parseFpsInfo(output, 1);
  assert.ok(info);
  assert.equal(info.totalFrames, 48);
  assert.equal(info.jankyFrames, 36);
  assert.equal(info.fps, 60);
  assert.equal(info.percentile90, 8);
});

test('battery parser reads exact keys and derives plugged state from power sources', () => {
  const output = [
    'Current Battery Service state:',
    '  AC powered: false',
    '  USB powered: true',
    '  Wireless powered: false',
    '  Dock powered: false',
    '  Max charging current: 5000000',
    '  Max charging voltage: 5000000',
    '  status: 2',
    '  health: 2',
    '  present: true',
    '  level: 87',
    '  scale: 100',
    '  voltage: 4012',
    '  temperature: 312',
    '  Capacity level: -1',
  ].join('\n');
  assert.deepEqual(parseBatteryInfo(output, 1), {
    timestamp: 1,
    level: 87,
    temperature: 31.2,
    health: 'good',
    status: 'charging',
    plugged: 'usb',
    voltage: 4012,
  });
});

test('services parser derives bound/started state from modern records', () => {
  const output = [
    'ACTIVITY MANAGER SERVICES (dumpsys activity services)',
    '  User 0 active services:',
    '  * ServiceRecord{ef2b30a u0 com.android.systemui/.keyguard.KeyguardService c:android}',
    '    app=ProcessRecord{3ddaa61 1049:com.android.systemui/u0a187}',
    '    Bindings:',
    '    * IntentBindRecord{a528876 CREATE}:',
    '      * Client AppBindRecord{c790ae4 ProcessRecord{29adba4 664:system/1000}}',
    '  * ServiceRecord{100f598 u0 com.android.settings/.SettingsDumpService c:com.android.settings}',
    '    app=ProcessRecord{3e672c 6958:com.android.settings/1000}',
    '    isForeground=true foregroundId=1 types=0x00000001',
    '    startRequested=true delayedStop=false stopIfKilled=true callStart=true lastStartId=9',
    '',
    'Connection bindings to services:',
    '  * ConnectionRecord{acc7775 u0 CR com.android.settings/.SettingsDumpService:@a582eac flags=0x1}',
  ].join('\n');
  assert.deepEqual(parseServicesInfo(output), [
    { packageName: 'com.android.systemui', name: '.keyguard.KeyguardService', pid: 1049, state: 'bound', foreground: false, clientCount: 1 },
    { packageName: 'com.android.settings', name: '.SettingsDumpService', pid: 6958, state: 'started', foreground: true, clientCount: 0 },
  ]);
});

test('activity stack parser ignores task/activity references and reads lifecycle state', () => {
  const output = [
    'Display #0 (activities from top to bottom):',
    '  * Task{cfe2f39 #9 type=standard A=1000:com.android.settings.root U=0 visible=true visibleRequested=true mode=fullscreen translucent=false sz=2}',
    '    topResumedActivity=ActivityRecord{4889344 u0 com.android.settings/.SubSettings t9}',
    '    * Hist  #1: ActivityRecord{4889344 u0 com.android.settings/.SubSettings t9}',
    '      rootOfTask=false task=Task{cfe2f39 #9 type=standard A=1000:com.android.settings.root}',
    '      state=RESUMED delayedResume=false finishing=false',
    '    * Hist  #0: ActivityRecord{1234567 u0 com.android.settings/.Settings t9}',
    '      rootOfTask=true task=Task{cfe2f39 #9 type=standard A=1000:com.android.settings.root}',
    '      state=STOPPED delayedResume=false finishing=false',
    '  * Task{1c9b1e1 #1 type=home U=0 visible=false visibleRequested=false mode=fullscreen translucent=true sz=1}',
    '    * Task{758b0fd #6 type=home I=com.google.android.apps.nexuslauncher/.NexusLauncherActivity U=0 rootTaskId=1 visible=false sz=2}',
    '      * Hist  #0: ActivityRecord{26824380 u0 com.google.android.apps.nexuslauncher/.NexusLauncherActivity t6}',
    '        state=STOPPED delayedResume=false finishing=false',
    '  ResumedActivity: ActivityRecord{4889344 u0 com.android.settings/.SubSettings t9}',
    '  mFocusedApp=ActivityRecord{4889344 u0 com.android.settings/.SubSettings t9}',
    '      * Task{cfe2f39 #9 type=standard A=1000:com.android.settings.root U=0 visible=true sz=2}',
    '        * ActivityRecord{4889344 u0 com.android.settings/.SubSettings t9}',
  ].join('\n');

  const info = parseActivityStack('com.android.settings', output, 1);
  assert.equal(info.focusedActivity, 'com.android.settings/.SubSettings');
  assert.equal(info.tasks.length, 1);
  const [task] = info.tasks;
  assert.equal(task.taskId, 9);
  assert.equal(task.isVisible, true);
  assert.equal(task.rootActivity, 'com.android.settings/.Settings');
  assert.deepEqual(task.activities.map((activity) => [activity.shortName, activity.state, activity.isTop]), [
    ['SubSettings', 'resumed', true],
    ['Settings', 'stopped', false],
  ]);
});

test('job parser handles namespaced and negative job IDs, constraints and durations', () => {
  const output = [
    'Registered 3 jobs:',
    '  JOB usagestats_mapping:1000/0: 6f23485 @usagestats_mapping@android/com.android.server.usage.UsageStatsIdleService',
    '    JobInfo:',
    '      Service: android/com.android.server.usage.UsageStatsIdleService',
    '      PERSISTED',
    '      Requires: charging=false batteryNotLow=true deviceIdle=true',
    '      Minimum latency: +1d0h0m0s0ms',
    '    Run time: earliest=+23h56m28s220ms, latest=+1d23h56m28s220ms, original latest=+1d23h56m28s220ms',
    '    Ready: false (job=false user=true !restricted=true !pending=true !active=true !backingup=true comp=true)',
    '  JOB #u0a149/-353: d18826d com.google.android.googlequicksearchbox/com.google.android.apps.gsa.tasks.BackgroundTasksJobService',
    '    JobInfo:',
    '      Service: com.google.android.googlequicksearchbox/com.google.android.apps.gsa.tasks.BackgroundTasksJobService',
    '      PERIODIC: interval=+12h0m0s0ms flex=+12h0m0s0ms',
    '      Requires: charging=true batteryNotLow=false deviceIdle=false',
    '      Network type: NetworkRequest [ NONE id=0, [ Capabilities: NOT_METERED&INTERNET&TRUSTED&VALIDATED Uid: 10149] ]',
    '    Ready: true (job=true user=true)',
    '  JOB #1000/808: cb165d8 android/com.android.server.MountServiceIdler',
    '    JobInfo:',
    '      Service: android/com.android.server.MountServiceIdler',
    '      Network type: NetworkRequest [ NONE id=0, [ Capabilities: INTERNET&NOT_RESTRICTED Uid: 1000] ]',
    '',
    'PrefetchController:',
    '  Service: not/a.Job',
  ].join('\n');

  const info = parseScheduledJobs(output, undefined, 1_000);
  assert.deepEqual(info.jobs.map((job) => [job.jobId, job.packageName, job.state]), [
    [0, 'android', 'waiting'],
    [-353, 'com.google.android.googlequicksearchbox', 'ready'],
    [808, 'android', 'pending'],
  ]);
  const [idle, periodic, idler] = info.jobs;
  assert.equal(idle.isPersisted, true);
  assert.equal(idle.constraints.requiresDeviceIdle, true);
  assert.equal(idle.constraints.requiresBatteryNotLow, true);
  assert.equal(idle.timing.minLatency, 86_400_000);
  assert.equal(idle.timing.nextRunTime, 1_000 + 86_188_220);
  assert.equal(periodic.timing.periodicInterval, 43_200_000);
  assert.equal(periodic.constraints.requiresCharging, true);
  assert.equal(periodic.constraints.requiresNetwork, 'unmetered');
  assert.equal(idler.constraints.requiresNetwork, 'any');
  assert.equal(parseScheduledJobs(output, 'com.google.android.googlequicksearchbox').jobs.length, 1);
});

test('alarm parser keeps one entry per alarm with type, trigger time and tag', () => {
  const output = [
    'Current Alarm Manager state:',
    '  Next kernel wakeup alarm: +1m10s943ms',
    '  44 pending alarms: ',
    '    ELAPSED #1: Alarm{d8aa488 type 3 origWhen 253945 whenElapsed 253945 com.google.android.gms}',
    '      tag=*alarm*:com.google.android.gms.gcm.ACTION_CHECK_QUEUE',
    '      type=ELAPSED origWhen=-11s661ms window=+45s645ms repeatInterval=0 count=0 flags=0x0',
    '      whenElapsed=-11s661ms maxWhenElapsed=+33s984ms',
    '      operation=PendingIntent{b59ae21: PendingIntentRecord{6c36246 com.google.android.gms/com.google.android.gms.scheduler broadcastIntent}}',
    '    RTC_WAKEUP #10: Alarm{b734dd0 type 0 origWhen 1790668800000 whenElapsed 1527542 com.android.settings}',
    '      tag=*walarm*:com.android.settings.battery.action.PERIODIC_JOB_UPDATE',
    '      type=RTC_WAKEUP origWhen=2026-09-29 11:00:00.000 window=0 exactAllowReason=policy_permission repeatInterval=0 count=0 flags=0x9',
    '      whenElapsed=+21m1s936ms maxWhenElapsed=+21m1s936ms',
    '      operation=PendingIntent{adb1c9: PendingIntentRecord{9620ce com.android.settings broadcastIntent}}',
    '    ELAPSED #12: Alarm{5d6a185 type 3 origWhen 1800000 whenElapsed 1800000 android}',
    '      tag=*alarm*:com.android.server.action.NETWORK_STATS_POLL',
    '      type=ELAPSED origWhen=+16m window=+22m30s0ms repeatInterval=1800000 count=0 flags=0x0',
    '      whenElapsed=+16m0s0ms maxWhenElapsed=+38m30s0ms',
    '      listener=com.android.server.alarm.AlarmManagerService$2@f698134',
  ].join('\n');

  const now = 1_000_000;
  const info = parseScheduledAlarms(output, undefined, now);
  assert.equal(info.nextAlarmTime, now + 70_943);
  assert.deepEqual(info.alarms.map((alarm) => [alarm.packageName, alarm.type, alarm.triggerTime, alarm.isExact, alarm.isRepeating]), [
    ['com.google.android.gms', 'ELAPSED_REALTIME', now - 11_661, false, false],
    ['com.android.settings', 'RTC_WAKEUP', 1_790_668_800_000, true, false],
    ['android', 'ELAPSED_REALTIME', now + 960_000, false, true],
  ]);
  assert.equal(info.alarms[1].tag, '*walarm*:com.android.settings.battery.action.PERIODIC_JOB_UPDATE');
  assert.equal(info.alarms[2].repeatInterval, 1_800_000);
  assert.equal(parseScheduledAlarms(output, 'com.android.settings').alarms.length, 1);
});

test('network stats parser sums untagged UID buckets per transport', () => {
  const output = [
    'Xt stats:',
    '  Pending bytes: 0',
    '  History since boot:',
    '  ident=[{type=1, ratType=COMBINED, wifiNetworkKey="AndroidWifi"open, metered=false, defaultNetwork=true, subId=-1}] uid=-1 set=ALL tag=0x0',
    '    NetworkStatsHistory: bucketDuration=3600',
    '      st=1790665200 rb=397520517 rp=303482 tb=4680000 tp=61542 op=0',
    'UID stats:',
    '  Pending bytes: 5029025',
    '  History since boot:',
    '  ident=[{type=0, ratType=13, subscriberId=310260..., metered=true, defaultNetwork=false, subId=1}] uid=10147 set=DEFAULT tag=0x0',
    '    NetworkStatsHistory: bucketDuration=7200',
    '      st=1790661600 rb=100 rp=1 tb=50 tp=1 op=0',
    '  ident=[{type=1, ratType=COMBINED, wifiNetworkKey="AndroidWifi"open, metered=false, defaultNetwork=true, subId=-1}] uid=10147 set=DEFAULT tag=0x0',
    '    NetworkStatsHistory: bucketDuration=7200',
    '      st=1790661600 rb=1000 rp=10 tb=500 tp=5 op=0',
    '      st=1790668800 rb=2000 rp=20 tb=700 tp=7 op=0',
    '  ident=[{type=1, ratType=COMBINED, wifiNetworkKey="AndroidWifi"open, metered=false, defaultNetwork=true, subId=-1}] uid=10147 set=FOREGROUND tag=0x0',
    '    NetworkStatsHistory: bucketDuration=7200',
    '      st=1790661600 rb=10 rp=1 tb=10 tp=1 op=0',
    '  ident=[{type=1, ratType=COMBINED, wifiNetworkKey="AndroidWifi"open, metered=false, defaultNetwork=true, subId=-1}] uid=101470 set=DEFAULT tag=0x0',
    '    NetworkStatsHistory: bucketDuration=7200',
    '      st=1790661600 rb=99999 rp=99 tb=99999 tp=99 op=0',
    'UID tag stats:',
    '  ident=[{type=1, ratType=COMBINED, wifiNetworkKey="AndroidWifi"open, metered=false, defaultNetwork=true, subId=-1}] uid=10147 set=DEFAULT tag=0xff',
    '    NetworkStatsHistory: bucketDuration=7200',
    '      st=1790661600 rb=5000 rp=50 tb=5000 tp=50 op=0',
  ].join('\n');

  assert.equal(parsePackageUid('Packages:\n  Package [com.google.android.gms] (5d8b2a5):\n    appId=10147\n'), 10147);
  assert.equal(parsePackageUid('  Package [com.example] (1):\n    userId=10123\n'), 10123);

  const app = parseNetworkStats(output, 'com.google.android.gms', 10147, 1);
  assert.deepEqual(app.wifi, { timestamp: 1, rxBytes: 3010, txBytes: 1210, rxPackets: 31, txPackets: 13 });
  assert.deepEqual(app.mobile, { timestamp: 1, rxBytes: 100, txBytes: 50, rxPackets: 1, txPackets: 1 });

  const all = parseNetworkStats(output, undefined, null, 1);
  assert.equal(all.wifi.rxBytes, 397520517);
  assert.equal(all.mobile.rxBytes, 0);
});

test('ls parser keeps setgid directories and symlinks', () => {
  const output = [
    'total 40',
    'drwx------   6 u0_a214 u0_a214       3452 2026-09-29 10:40 .',
    'drwxrwx--x 198 system  system       12288 2026-09-29 10:40 ..',
    'drwxrws--x   2 u0_a214 u0_a214_cache 3452 2026-09-29 10:40 cache',
    'drwxrws--x   2 u0_a214 u0_a214_cache 3452 2026-09-29 10:40 code_cache',
    'drwxrwx--x   2 u0_a214 u0_a214       3452 2026-09-29 10:40 shared_prefs',
    'lrwxrwxrwx   1 root    root            64 2026-09-29 10:40 lib -> /data/app/~~abc==/com.example-1/lib/arm64',
    '-rw-------   1 u0_a214 u0_a214         12 2026-09-29 10:41 my notes.txt',
  ].join('\n');
  assert.deepEqual(parseLsEntries(output, 'files').map((entry) => [entry.name, entry.type, entry.path]), [
    ['cache', 'directory', 'files/cache'],
    ['code_cache', 'directory', 'files/code_cache'],
    ['shared_prefs', 'directory', 'files/shared_prefs'],
    ['lib', 'file', 'files/lib'],
    ['my notes.txt', 'file', 'files/my notes.txt'],
  ]);
});

test('shared prefs parser decodes XML entities and empty strings', () => {
  const xml = [
    "<?xml version='1.0' encoding='utf-8' standalone='yes' ?>",
    '<map>',
    '    <string name="url">https://example.com/?a=1&amp;b=&quot;2&quot;</string>',
    '    <string name="empty"></string>',
    '    <int name="count" value="3" />',
    '    <boolean name="enabled" value="true" />',
    '</map>',
  ].join('\n');
  assert.deepEqual(parseSharedPrefsXml(xml), {
    url: { type: 'string', value: 'https://example.com/?a=1&b="2"' },
    empty: { type: 'string', value: '' },
    count: { type: 'int', value: 3 },
    enabled: { type: 'boolean', value: true },
  });
});

test('app metadata parser reads flags only from package flag lists', () => {
  const output = [
    'Activity Resolver Table:',
    '      android.settings.SYSTEM_UPDATE_SETTINGS:',
    'Packages:',
    '  Package [com.example.app] (5d8b2a5):',
    '    appId=10214',
    '    versionCode=42 minSdk=24 targetSdk=36',
    '    versionName=2.1.0',
    '    flags=[ DEBUGGABLE HAS_CODE ALLOW_CLEAR_USER_DATA ]',
    '    lastUpdateTime=2026-09-29 10:40:00',
    '    runtime permissions:',
    '        android.permission.ACCESS_FINE_LOCATION: granted=true, flags=[ SYSTEM_FIXED|GRANTED_BY_DEFAULT]',
    '      firstInstallTime=2026-09-29 10:39:00',
    'Hidden system packages:',
    '  Package [com.example.app] (1234):',
    '    versionCode=1 minSdk=24 targetSdk=33',
    '    versionName=1.0.0',
    '    flags=[ SYSTEM HAS_CODE ]',
  ].join('\n');
  const metadata = parseAppMetadata('com.example.app', output);
  assert.equal(metadata.versionName, '2.1.0');
  assert.equal(metadata.versionCode, 42);
  assert.equal(metadata.targetSdk, 36);
  assert.equal(metadata.isDebuggable, true);
  assert.equal(metadata.isSystem, false);
  assert.equal(metadata.firstInstallTime, '2026-09-29 10:39:00');
  assert.deepEqual(metadata.permissions, ['android.permission.ACCESS_FINE_LOCATION']);
});
