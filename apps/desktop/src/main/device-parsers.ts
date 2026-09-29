import type {
  ActivityInfo,
  ActivityStackInfo,
  AlarmMonitorInfo,
  AppMetadata,
  AppNetworkStats,
  BatteryInfo,
  FileEntry,
  FpsInfo,
  JobSchedulerInfo,
  ScheduledAlarm,
  ScheduledJob,
  ServiceInfo,
  TaskStack,
} from '@android-debugger/shared';

// Pure parsers for adb/dumpsys output. Kept free of runtime imports so they can
// be unit tested with `node --test` directly against captured device output.

/**
 * `adb shell a b c` joins its arguments with spaces and hands the result to the
 * device's /system/bin/sh, so any user-controlled argument must be quoted for
 * that remote shell (URLs with `&`, file names with spaces, etc.).
 */
export function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Parse Android dumpsys durations such as `+1d2h3m4s5ms`, `-49s313ms` or `0`. */
export function parseDumpsysDuration(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '0') return 0;
  const match = trimmed.match(/^([+-])?((?:\d+d)?(?:\d+h)?(?:\d+m(?!s))?(?:\d+s)?(?:\d+ms)?)$/);
  if (!match || !match[2]) return null;
  const units: Record<string, number> = { d: 86_400_000, h: 3_600_000, m: 60_000, s: 1_000, ms: 1 };
  let total = 0;
  for (const part of match[2].matchAll(/(\d+)(ms|d|h|m|s)/g)) {
    total += parseInt(part[1], 10) * units[part[2]];
  }
  return match[1] === '-' ? -total : total;
}

// ==================== CPU (top) ====================

/**
 * Extract a package's CPU usage from `top -b -n 1`. Columns are resolved from
 * the header (toybox prints the state and CPU headers as one `S[%CPU]` token)
 * and the process name must match exactly so `pkg:remote` style processes are
 * not mistaken for the main process. The result is normalised to 0-100% of the
 * whole device using toybox's `400%cpu` summary line when present.
 */
export function parseTopCpuUsage(output: string, packageName: string): number | null {
  let cpuIndex = -1;
  let nameIndex = -1;
  let totalCpu = 0;

  for (const rawLine of output.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    const total = line.match(/^(\d+)%cpu\b/);
    if (total) {
      totalCpu = parseInt(total[1], 10);
      continue;
    }

    if (cpuIndex < 0) {
      if (/\bPID\b/.test(line) && /%CPU|CPU%/.test(line)) {
        const headers = line.split(/\s+/).flatMap((header) => {
          const merged = header.match(/^([^[]*)\[([^\]]+)\]$/);
          if (!merged) return [header];
          return merged[1] ? [merged[1], merged[2]] : [merged[2]];
        });
        cpuIndex = headers.findIndex((header) => header === '%CPU' || header === 'CPU%');
        nameIndex = headers.findIndex((header) => ['ARGS', 'CMD', 'NAME', 'Name', 'COMMAND'].includes(header));
      }
      continue;
    }

    const parts = line.split(/\s+/);
    if (parts.length <= cpuIndex) continue;
    const name = nameIndex >= 0 ? parts.slice(nameIndex).join(' ') : parts[parts.length - 1];
    if (name !== packageName) continue;

    const value = parseFloat(parts[cpuIndex]);
    if (!Number.isFinite(value)) continue;
    return totalCpu > 0 ? Math.min(100, (value * 100) / totalCpu) : value;
  }

  return null;
}

// ==================== FPS (gfxinfo) ====================

export function parseFpsInfo(output: string, now = Date.now()): FpsInfo | null {
  try {
    let totalFrames: number | null = null;
    let jankyFrames: number | null = null;
    const frameTimes: number[] = [];
    const intendedVsyncTimes: number[] = [];
    let frameColumns: string[] | null = null;

    for (const line of output.split('\n')) {
      const trimmed = line.trim();

      // The process-wide totals come first; later per-window sections repeat
      // the same labels with per-window counts, so keep the first occurrence.
      const totalMatch = trimmed.match(/^Total frames rendered:\s*(\d+)/);
      if (totalMatch && totalFrames === null) {
        totalFrames = parseInt(totalMatch[1], 10);
      }

      const jankyMatch = trimmed.match(/^Janky frames:\s*(\d+)/);
      if (jankyMatch && jankyFrames === null) {
        jankyFrames = parseInt(jankyMatch[1], 10);
      }

      if (trimmed.startsWith('Flags,IntendedVsync,') || trimmed.startsWith('Flags,FrameTimelineVsyncId,')) {
        frameColumns = trimmed.split(',');
        continue;
      }

      // Parse frame times from the PROFILEDATA CSV. Column positions vary
      // between Android releases, so resolve them by header name.
      if (trimmed.match(/^\d+,\d+,/)) {
        const parts = trimmed.split(',');
        const columnIndex = (name: string, fallback: number): number => {
          const index = frameColumns?.indexOf(name) ?? -1;
          return index >= 0 ? index : fallback;
        };
        const flags = Number(parts[columnIndex('Flags', 0)]);
        const intendedVsync = Number(parts[columnIndex('IntendedVsync', 1)]);
        const frameCompleted = Number(parts[columnIndex('FrameCompleted', 13)]);

        // Non-zero flags indicate an invalid/incomplete frame sample.
        if (flags === 0 && Number.isFinite(intendedVsync) && Number.isFinite(frameCompleted)) {
          const frameTime = (frameCompleted - intendedVsync) / 1_000_000;
          if (!isNaN(frameTime) && frameTime > 0 && frameTime < 1000) {
            frameTimes.push(frameTime);
            intendedVsyncTimes.push(intendedVsync);
          }
        }
      }
    }

    frameTimes.sort((a, b) => a - b);
    const getPercentile = (arr: number[], p: number) => {
      if (arr.length === 0) return 0;
      const index = Math.ceil((p / 100) * arr.length) - 1;
      return arr[Math.max(0, index)] || 0;
    };

    // Frames from several windows are listed window by window, so order the
    // vsyncs and count a vsync drawn by multiple windows once.
    const vsyncs = [...new Set(intendedVsyncTimes)].sort((a, b) => a - b);
    const fps = vsyncs.length > 1
      ? ((vsyncs.length - 1) * 1_000_000_000) / (vsyncs[vsyncs.length - 1] - vsyncs[0])
      : frameTimes.length === 1
        ? 1000 / frameTimes[0]
        : 0;

    return {
      timestamp: now,
      fps: Number.isFinite(fps) ? Math.max(0, Math.round(fps)) : 0,
      jankyFrames: jankyFrames ?? 0,
      totalFrames: totalFrames ?? 0,
      percentile90: getPercentile(frameTimes, 90),
      percentile95: getPercentile(frameTimes, 95),
      percentile99: getPercentile(frameTimes, 99),
    };
  } catch {
    return null;
  }
}

// ==================== Battery ====================

export function parseBatteryInfo(output: string, now = Date.now()): BatteryInfo | null {
  // `dumpsys battery` prints `key: value` pairs; match exact keys so lines such
  // as `Max charging voltage:` or `Capacity level:` are not mistaken for them.
  const values = new Map<string, string>();
  for (const line of output.split('\n')) {
    const match = line.trim().match(/^([A-Za-z][A-Za-z ]*?):\s*(.*)$/);
    if (match && !values.has(match[1].toLowerCase())) {
      values.set(match[1].toLowerCase(), match[2].trim());
    }
  }

  const int = (key: string): number | undefined => {
    const value = values.get(key);
    if (value === undefined || !/^-?\d+$/.test(value)) return undefined;
    return parseInt(value, 10);
  };

  const level = int('level');
  if (level === undefined) return null;

  const scale = int('scale');
  const healthMap: Record<number, BatteryInfo['health']> = {
    1: 'unknown',
    2: 'good',
    3: 'overheat',
    4: 'dead',
    5: 'over_voltage',
    6: 'unknown', // unspecified failure
    7: 'cold',
  };
  const statusMap: Record<number, BatteryInfo['status']> = {
    1: 'unknown',
    2: 'charging',
    3: 'discharging',
    4: 'not_charging',
    5: 'full',
  };

  // Modern Android reports the power source as `AC powered: true` etc. rather
  // than a `plugged:` code.
  let plugged: BatteryInfo['plugged'] = 'none';
  const pluggedCode = int('plugged');
  if (pluggedCode !== undefined) {
    plugged = ({ 1: 'ac', 2: 'usb', 4: 'wireless', 8: 'ac' } as Record<number, BatteryInfo['plugged']>)[pluggedCode] || 'none';
  } else if (values.get('ac powered') === 'true' || values.get('dock powered') === 'true') {
    plugged = 'ac';
  } else if (values.get('usb powered') === 'true') {
    plugged = 'usb';
  } else if (values.get('wireless powered') === 'true') {
    plugged = 'wireless';
  }

  const temperature = int('temperature');
  return {
    timestamp: now,
    level: scale && scale > 0 && scale !== 100 ? Math.round((level * 100) / scale) : level,
    temperature: temperature !== undefined ? temperature / 10 : 0,
    health: healthMap[int('health') ?? 0] || 'unknown',
    status: statusMap[int('status') ?? 0] || 'unknown',
    plugged,
    voltage: int('voltage') || 0,
  };
}

// ==================== Running services ====================

export function parseServicesInfo(output: string, filterPackage?: string): ServiceInfo[] {
  const services: ServiceInfo[] = [];
  let current: (ServiceInfo & { startRequested: boolean }) | null = null;

  const finish = () => {
    if (!current) return;
    const { startRequested, ...service } = current;
    if (service.clientCount > 0) {
      service.state = startRequested ? 'started+bound' : 'bound';
    } else {
      service.state = 'started';
    }
    services.push(service);
    current = null;
  };

  for (const line of output.split('\n')) {
    const trimmed = line.trim();

    const serviceMatch = trimmed.match(/^\*?\s*ServiceRecord\{[^}]*?\s([^\s/]+)\/([^\s}]+)/);
    if (serviceMatch) {
      finish();
      current = {
        packageName: serviceMatch[1],
        name: serviceMatch[2],
        pid: 0,
        state: 'started',
        foreground: false,
        clientCount: 0,
        startRequested: false,
      };
      continue;
    }

    if (!current) continue;
    // Top-level sections (e.g. "Connection bindings to services:") end the record.
    if (/^\S/.test(line) && trimmed) {
      finish();
      continue;
    }

    const appMatch = trimmed.match(/^app=ProcessRecord\{\S+\s+(\d+):/);
    if (appMatch) current.pid = parseInt(appMatch[1], 10);

    if (/\bisForeground=true\b/.test(trimmed)) current.foreground = true;
    if (/\bstartRequested=true\b/.test(trimmed)) current.startRequested = true;

    // Modern dumps list each bound client as `* Client AppBindRecord{...}`;
    // older releases printed `bindings=... size=N`.
    if (/^\*?\s*Client AppBindRecord\{/.test(trimmed)) {
      current.clientCount += 1;
    } else {
      const bindingsMatch = trimmed.match(/bindings=.*size=(\d+)/);
      if (bindingsMatch) current.clientCount = Math.max(current.clientCount, parseInt(bindingsMatch[1], 10));
    }
  }
  finish();

  return filterPackage ? services.filter((service) => service.packageName === filterPackage) : services;
}

// ==================== Activity stack ====================

function activityStateFromDump(state: string): ActivityInfo['state'] {
  if (state === 'RESUMED') return 'resumed';
  if (state === 'PAUSING' || state === 'PAUSED' || state === 'STARTED') return 'paused';
  if (state === 'FINISHING' || state === 'DESTROYING' || state === 'DESTROYED') return 'destroyed';
  return 'stopped';
}

export function parseActivityStack(packageName: string, output: string, now = Date.now()): ActivityStackInfo {
  const info: ActivityStackInfo = { timestamp: now, packageName, tasks: [] };
  const tasks = new Map<number, TaskStack>();
  const seenRecords = new Set<string>();
  let currentTask: TaskStack | null = null;
  let lastActivity: ActivityInfo | null = null;

  for (const line of output.split('\n')) {
    const trimmed = line.trim();

    const focused = trimmed.match(
      /^(?:mFocusedActivity:|mResumedActivity:|ResumedActivity:|mFocusedApp=)\s*ActivityRecord\{\S+\s+(?:u\d+\s+)?(\S+)/
    );
    if (focused && !info.focusedActivity) info.focusedActivity = focused[1];

    // Only real task headers (`* Task{... #9 ...}` / `* TaskRecord{... #9 ...}`),
    // not references such as `task=Task{...}` inside an activity record.
    const taskMatch = trimmed.match(/^\*\s*Task(?:Record)?\{\S+\s+#(\d+)/);
    if (taskMatch) {
      const taskId = parseInt(taskMatch[1], 10);
      lastActivity = null;
      currentTask = tasks.get(taskId) ?? null;
      if (!currentTask) {
        currentTask = {
          taskId,
          rootActivity: '',
          activities: [],
          isVisible: /\b(?:visible|isVisible)=true\b/.test(trimmed),
        };
        tasks.set(taskId, currentTask);
      }
      continue;
    }

    // Activities are listed as `* Hist #N: ActivityRecord{...}`, top first.
    const hist = trimmed.match(/^\*?\s*Hist\s+#\d+:\s+ActivityRecord\{(\S+)\s+(?:u\d+\s+)?(\S+)\s+t(-?\d+)/);
    if (hist) {
      lastActivity = null;
      if (!currentTask || seenRecords.has(hist[1])) continue;
      seenRecords.add(hist[1]);
      const fullName = hist[2];
      let activityPackage = packageName;
      let shortName = fullName;
      if (fullName.includes('/')) {
        const [pkg, cls] = fullName.split('/');
        activityPackage = pkg;
        shortName = cls.startsWith('.') ? cls.substring(1) : cls;
      }
      lastActivity = {
        name: fullName,
        shortName,
        packageName: activityPackage,
        taskId: parseInt(hist[3], 10),
        state: 'stopped',
        isTop: currentTask.activities.length === 0,
      };
      currentTask.activities.push(lastActivity);
      continue;
    }

    // The lifecycle state is printed on a later line of the activity record.
    const stateMatch = trimmed.match(/^state=([A-Z_]+)/);
    if (stateMatch && lastActivity) {
      lastActivity.state = activityStateFromDump(stateMatch[1]);
    }
  }

  for (const task of tasks.values()) {
    // Newer releases ignore the package argument and dump every task.
    if (task.activities.length === 0 || !task.activities.some((activity) => activity.packageName === packageName)) {
      continue;
    }
    task.rootActivity = task.activities[task.activities.length - 1].name;
    info.tasks.push(task);
  }

  return info;
}

// ==================== Job scheduler ====================

export function parseScheduledJobs(output: string, filterPackage?: string, now = Date.now()): JobSchedulerInfo {
  const info: JobSchedulerInfo = { timestamp: now, packageName: filterPackage, jobs: [] };
  let current: ScheduledJob | null = null;

  const finish = () => {
    if (current) info.jobs.push(current);
    current = null;
  };

  for (const line of output.split('\n')) {
    const trimmed = line.trim();

    // `JOB #u0a147/2:`, `JOB #1000/-353:` or namespaced `JOB ns:1000/0:`.
    const jobMatch = trimmed.match(/^JOB\s+#?(?:[^\s:/]+:)?[^\s/]+\/(-?\d+)/);
    if (jobMatch) {
      finish();
      current = {
        jobId: parseInt(jobMatch[1], 10),
        packageName: 'Unknown',
        serviceName: 'Unknown',
        state: 'pending',
        constraints: {
          requiresCharging: false,
          requiresDeviceIdle: false,
          requiresNetwork: 'none',
          requiresBatteryNotLow: false,
          requiresStorageNotLow: false,
        },
        timing: {},
        isPersisted: false,
      };
      continue;
    }

    if (!current) continue;
    const job: ScheduledJob = current;
    // A new top-level section ends the registered job list.
    if (/^\S/.test(line) && trimmed) {
      finish();
      continue;
    }

    const serviceMatch = trimmed.match(/^Service:\s*(\S+)/);
    if (serviceMatch) {
      const fullService = serviceMatch[1];
      if (fullService.includes('/')) {
        const [pkg, cls] = fullService.split('/');
        job.packageName = pkg;
        job.serviceName = cls.startsWith('.') ? cls.substring(1) : cls;
      } else {
        job.serviceName = fullService;
      }
      continue;
    }

    if (trimmed.startsWith('Requires:')) {
      job.constraints.requiresCharging = /\bcharging=true\b/.test(trimmed);
      job.constraints.requiresDeviceIdle = /\b(?:deviceIdle|idle)=true\b/.test(trimmed);
      job.constraints.requiresBatteryNotLow = /\bbatteryNotLow=true\b/.test(trimmed);
      job.constraints.requiresStorageNotLow = /\bstorageNotLow=true\b/.test(trimmed);
      continue;
    }

    const networkMatch = trimmed.match(/^Network type:\s*(.*)$/);
    if (networkMatch) {
      const value = networkMatch[1];
      if (value.includes('NOT_METERED') || value === '2') job.constraints.requiresNetwork = 'unmetered';
      else if (value.includes('TRANSPORT_CELLULAR') || value === '4') job.constraints.requiresNetwork = 'cellular';
      else if (value && value !== '0') job.constraints.requiresNetwork = 'any';
      continue;
    }

    const periodicMatch = trimmed.match(/^PERIODIC:\s*interval=(\S+)/i);
    if (periodicMatch) {
      const interval = parseDumpsysDuration(periodicMatch[1]);
      if (interval !== null && interval > 0) job.timing.periodicInterval = interval;
      continue;
    }

    const latencyMatch = trimmed.match(/^(?:Minimum|Min) latency:\s*(\S+)/);
    if (latencyMatch) {
      const latency = parseDumpsysDuration(latencyMatch[1]);
      if (latency !== null && latency > 0) job.timing.minLatency = latency;
      continue;
    }

    const runTimeMatch = trimmed.match(/^Run time:\s*earliest=([^,\s]+)/);
    if (runTimeMatch) {
      const earliest = parseDumpsysDuration(runTimeMatch[1]);
      if (earliest !== null) job.timing.nextRunTime = now + earliest;
      continue;
    }

    if (trimmed === 'PERSISTED' || /\bpersisted=true\b/i.test(trimmed)) {
      job.isPersisted = true;
      continue;
    }

    const readyMatch = trimmed.match(/^Ready:\s*(true|false)\b/);
    if (readyMatch) {
      job.state = readyMatch[1] === 'true' ? 'ready' : 'waiting';
    }
  }
  finish();

  if (filterPackage) {
    info.jobs = info.jobs.filter((job) => job.packageName === filterPackage);
  }
  return info;
}

// ==================== Alarms ====================

const ALARM_TYPES: ScheduledAlarm['type'][] = ['RTC_WAKEUP', 'RTC', 'ELAPSED_REALTIME_WAKEUP', 'ELAPSED_REALTIME'];

export function parseScheduledAlarms(output: string, filterPackage?: string, now = Date.now()): AlarmMonitorInfo {
  const info: AlarmMonitorInfo = { timestamp: now, packageName: filterPackage, alarms: [] };
  let current: (ScheduledAlarm & { rtcWhen?: number; elapsedIn?: number }) | null = null;

  const finish = () => {
    if (!current) return;
    const { rtcWhen, elapsedIn, ...alarm } = current;
    if (rtcWhen !== undefined && rtcWhen > 0) alarm.triggerTime = rtcWhen;
    else if (elapsedIn !== undefined) alarm.triggerTime = now + elapsedIn;
    info.alarms.push(alarm);
    current = null;
  };

  for (const line of output.split('\n')) {
    const trimmed = line.trim();

    const nextMatch = trimmed.match(/^Next\b.*\balarm:\s*([+-][\ddhms]+)/);
    if (nextMatch && info.nextAlarmTime === undefined) {
      const next = parseDumpsysDuration(nextMatch[1]);
      if (next !== null) info.nextAlarmTime = now + next;
    }

    // e.g. `RTC_WAKEUP #10: Alarm{b734dd0 type 0 origWhen 1790668800000 whenElapsed 1527542 com.android.settings}`
    // (older releases print `when` instead of `origWhen`).
    const header = trimmed.match(
      /^(?:RTC_WAKEUP|RTC|ELAPSED_WAKEUP|ELAPSED|ELAPSED_REALTIME_WAKEUP|ELAPSED_REALTIME)\s+#\d+:\s+Alarm\{\S+\s+type\s+(\d+)\s+(?:origWhen|when)\s+(-?\d+)[^}]*?\s([^\s}]+)\}/
    );
    if (header) {
      finish();
      const typeCode = parseInt(header[1], 10);
      const type = ALARM_TYPES[typeCode] ?? 'RTC';
      current = {
        id: `alarm-${info.alarms.length}-${now}`,
        packageName: header[3],
        type,
        triggerTime: 0,
        operation: '',
        isExact: false,
        isRepeating: false,
        rtcWhen: typeCode === 0 || typeCode === 1 ? parseInt(header[2], 10) : undefined,
      };
      continue;
    }

    if (!current) continue;
    const alarm = current;
    if (/^\S/.test(line) && trimmed) {
      finish();
      continue;
    }

    const tagMatch = trimmed.match(/^tag=(\S+)/);
    if (tagMatch) alarm.tag = tagMatch[1];

    const elapsedMatch = trimmed.match(/(?:^|\s)whenElapsed=([+-]\S+)/);
    if (elapsedMatch) {
      const elapsed = parseDumpsysDuration(elapsedMatch[1]);
      if (elapsed !== null) alarm.elapsedIn = elapsed;
    }

    const windowMatch = trimmed.match(/(?:^|\s)window=(\S+)/);
    if (windowMatch) alarm.isExact = windowMatch[1] === '0';

    const repeatMatch = trimmed.match(/\brepeatInterval=(\d+)/);
    if (repeatMatch) {
      const interval = parseInt(repeatMatch[1], 10);
      if (interval > 0) {
        alarm.repeatInterval = interval;
        alarm.isRepeating = true;
      }
    }

    const operationMatch = trimmed.match(/^(?:operation|listener)=(.+)$/);
    if (operationMatch) alarm.operation = operationMatch[1];
  }
  finish();

  if (filterPackage) {
    info.alarms = info.alarms.filter((alarm) => alarm.packageName === filterPackage);
  }
  return info;
}

// ==================== Network stats ====================

/** Read the app UID from `dumpsys package` (`userId=` before Android 12, `appId=` after). */
export function parsePackageUid(output: string): number | null {
  const match = output.match(/^\s*(?:userId|appId)=(\d+)/m);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Sum `dumpsys netstats detail` history buckets. With a UID, only the untagged
 * rows of that UID in "UID stats" are counted; otherwise the device-wide "Xt
 * stats" are used. Network kind comes from the ident's legacy network type
 * (0/MOBILE, 1/WIFI).
 */
export function parseNetworkStats(
  output: string,
  packageName?: string,
  uid?: number | null,
  now = Date.now()
): AppNetworkStats {
  const empty = () => ({ timestamp: now, rxBytes: 0, txBytes: 0, rxPackets: 0, txPackets: 0 });
  const stats: AppNetworkStats = { packageName: packageName || 'all', wifi: empty(), mobile: empty() };

  let section = '';
  let target: 'wifi' | 'mobile' | null = null;

  for (const line of output.split('\n')) {
    if (/^\S.*:\s*$/.test(line)) {
      section = line.trim();
      target = null;
      continue;
    }

    const trimmed = line.trim();
    if (trimmed.startsWith('ident=')) {
      target = null;
      const typeMatch = trimmed.match(/^ident=\[\{type=(\w+)/);
      const type = typeMatch?.[1];
      const kind = type === '1' || type === 'WIFI'
        ? 'wifi'
        : type === '0' || type?.startsWith('MOBILE')
          ? 'mobile'
          : null;
      if (!kind) continue;

      if (uid !== null && uid !== undefined) {
        const rowUid = trimmed.match(/\buid=(-?\d+)/)?.[1];
        const tag = trimmed.match(/\btag=(0x[0-9a-fA-F]+)/)?.[1];
        if (section === 'UID stats:' && rowUid !== undefined && parseInt(rowUid, 10) === uid && (!tag || parseInt(tag, 16) === 0)) {
          target = kind;
        }
      } else if (section === 'Xt stats:') {
        target = kind;
      }
      continue;
    }

    if (!target) continue;
    const bucket = trimmed.match(/^st=\d+\s+rb=(\d+)\s+rp=(\d+)\s+tb=(\d+)\s+tp=(\d+)/);
    if (bucket) {
      const totals = stats[target];
      totals.rxBytes += parseInt(bucket[1], 10);
      totals.rxPackets += parseInt(bucket[2], 10);
      totals.txBytes += parseInt(bucket[3], 10);
      totals.txPackets += parseInt(bucket[4], 10);
    }
  }

  return stats;
}

// ==================== File inspector ====================

/** Parse toybox `ls -la` output (including setgid dirs like `drwxrws--x` and symlinks). */
export function parseLsEntries(output: string, relativePath: string): FileEntry[] {
  const entries: FileEntry[] = [];
  for (const line of output.split('\n')) {
    const match = line.trim().match(
      /^([-dlbcps][-rwxsStT]{9})[.+@]?\s+\d+\s+\S+\s+\S+\s+(\d+)\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})\s+(.+)$/
    );
    if (!match) continue;
    const [, permissions, size, modified, rawName] = match;
    const name = permissions.startsWith('l') ? rawName.split(' -> ')[0] : rawName;
    if (name === '.' || name === '..') continue;
    entries.push({
      name,
      path: relativePath ? `${relativePath}/${name}` : name,
      type: permissions.startsWith('d') ? 'directory' : 'file',
      size: parseInt(size, 10),
      modified,
      permissions,
    });
  }
  return entries;
}

function decodeXmlEntities(value: string): string {
  return value.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (entity, code: string) => {
    if (code === 'amp') return '&';
    if (code === 'lt') return '<';
    if (code === 'gt') return '>';
    if (code === 'quot') return '"';
    if (code === 'apos') return "'";
    const point = code.startsWith('#x') ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
    return Number.isFinite(point) ? String.fromCodePoint(point) : entity;
  });
}

export function parseSharedPrefsXml(xml: string): Record<string, { type: string; value: unknown }> {
  const entries: Record<string, { type: string; value: unknown }> = {};

  for (const match of xml.matchAll(/<string name="([^"]+)"[^>]*?(?:\/>|>([^<]*)<\/string>)/g)) {
    entries[decodeXmlEntities(match[1])] = { type: 'string', value: decodeXmlEntities(match[2] ?? '') };
  }

  const scalar = (tag: string, parse: (value: string) => unknown) => {
    for (const match of xml.matchAll(new RegExp(`<${tag} name="([^"]+)" value="([^"]*)"[^/]*/>`, 'g'))) {
      entries[decodeXmlEntities(match[1])] = { type: tag, value: parse(decodeXmlEntities(match[2])) };
    }
  };
  scalar('int', (value) => parseInt(value, 10));
  scalar('long', (value) => parseInt(value, 10));
  scalar('float', (value) => parseFloat(value));
  scalar('boolean', (value) => value === 'true');

  return entries;
}

// ==================== App metadata ====================

export function parseAppMetadata(packageName: string, output: string): AppMetadata {
  const metadata: AppMetadata = {
    packageName,
    versionName: 'Unknown',
    versionCode: 0,
    targetSdk: 0,
    minSdk: 0,
    firstInstallTime: 'Unknown',
    lastUpdateTime: 'Unknown',
    apkSize: 0,
    dataSize: 0,
    cacheSize: 0,
    permissions: [],
    isDebuggable: false,
    isSystem: false,
  };
  const seen = new Set<string>();
  const once = (key: string, value: string | undefined, apply: (value: string) => void) => {
    if (value === undefined || seen.has(key)) return;
    seen.add(key);
    apply(value);
  };

  for (const line of output.split('\n')) {
    const trimmed = line.trim();

    // The installed package is dumped before "Hidden system packages:", so the
    // first occurrence of each field is the one that is actually running.
    once('versionName', trimmed.match(/\bversionName=(\S+)/)?.[1], (value) => { metadata.versionName = value; });
    once('versionCode', trimmed.match(/\bversionCode=(\d+)/)?.[1], (value) => { metadata.versionCode = parseInt(value, 10); });
    once('targetSdk', trimmed.match(/\btargetSdk=(\d+)/)?.[1], (value) => { metadata.targetSdk = parseInt(value, 10); });
    once('minSdk', trimmed.match(/\bminSdk=(\d+)/)?.[1], (value) => { metadata.minSdk = parseInt(value, 10); });
    once('firstInstallTime', trimmed.match(/^firstInstallTime=(.+)$/)?.[1], (value) => { metadata.firstInstallTime = value; });
    once('lastUpdateTime', trimmed.match(/^lastUpdateTime=(.+)$/)?.[1], (value) => { metadata.lastUpdateTime = value; });

    // Only trust the package flag lists; words like SYSTEM also appear in
    // intent actions and permission flags elsewhere in the dump.
    const flags = trimmed.match(/^(?:pkgFlags|flags)=\[(.*)\]/)?.[1];
    if (flags && !seen.has(`flags:${trimmed.startsWith('pkg') ? 'pkg' : 'app'}`)) {
      seen.add(`flags:${trimmed.startsWith('pkg') ? 'pkg' : 'app'}`);
      const tokens = flags.trim().split(/\s+/);
      if (tokens.includes('DEBUGGABLE')) metadata.isDebuggable = true;
      if (tokens.includes('SYSTEM')) metadata.isSystem = true;
    }

    const permMatch = trimmed.match(/android\.permission\.([A-Z_]+)/);
    if (permMatch) {
      const perm = `android.permission.${permMatch[1]}`;
      if (!metadata.permissions.includes(perm)) metadata.permissions.push(perm);
    }
  }

  return metadata;
}
