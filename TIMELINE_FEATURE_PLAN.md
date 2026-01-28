# Timeline & Recording Feature Implementation Plan

## Overview
Add a unified Timeline view that aggregates all debugging events chronologically, with session recording/replay capabilities.

---

## Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Storage | JSON files (MVP), LevelDB later if needed | Simple start, no new dependencies |
| Timestamps | Normalize all to Unix ms | Logs use ISO strings, everything else uses Unix ms - normalize on ingestion |
| Timeline location | New tab/panel | Cross-cutting feature, shouldn't clutter existing panels |
| Live vs Recorded | Same components, different data source | Reduces code duplication |

---

## Data Structures

```typescript
// New types in packages/shared/src/types.ts

type TimelineEventType =
  | 'log' | 'crash' | 'console' | 'network' | 'state'
  | 'custom' | 'zustand' | 'websocket' | 'memory'
  | 'cpu' | 'fps' | 'battery' | 'activity';

interface TimelineEvent {
  id: string;
  timestamp: number;        // Normalized Unix ms
  type: TimelineEventType;
  severity?: 'info' | 'warning' | 'error' | 'critical';
  title: string;
  subtitle?: string;
  data: unknown;
}

interface RecordingSession {
  id: string;
  name: string;
  notes?: string;
  createdAt: number;
  startTime: number;
  endTime: number;
  device: { id: string; model: string; androidVersion: string; };
  packageName: string;
  eventCount: number;
}
```

---

## Files to Create

### Renderer - Contexts
- `contexts/TimelineContext.tsx` - Aggregate events, manage time range, filtering
- `contexts/RecordingContext.tsx` - Recording state, save/load sessions

### Renderer - Components
- `components/TimelinePanel.tsx` - Main container
- `components/timeline/TimelineHeader.tsx` - Controls, filters, zoom
- `components/timeline/EventList.tsx` - Virtualized event list
- `components/timeline/EventRow.tsx` - Single event with type icon
- `components/timeline/EventDetail.tsx` - Selected event details panel
- `components/timeline/TimelineChart.tsx` - Performance metrics overlay (Phase 3)
- `components/timeline/PlaybackControls.tsx` - Scrubber, speed controls (Phase 4)

### Renderer - Hooks
- `hooks/useTimelineAggregator.ts` - Transform/combine all data sources

### Main Process
- `main/recording.ts` - IPC handlers for file operations

---

## Files to Modify

| File | Changes |
|------|---------|
| `renderer/App.tsx` | Add 'timeline' tab, wrap with Timeline/Recording providers |
| `renderer/components/Sidebar.tsx` | Add Timeline nav item, recording indicator |
| `renderer/contexts/LogsContext.tsx` | Add `subscribe()` for timeline to listen |
| `renderer/contexts/SdkContext.tsx` | Add `subscribe()` for timeline to listen |
| `renderer/contexts/CrashContext.tsx` | Add `subscribe()` for timeline to listen |
| `main/index.ts` | Add recording IPC handlers |
| `preload/index.ts` | Add recording API methods |
| `packages/shared/src/types.ts` | Add Timeline types |

---

## Implementation Phases

### Phase 1: MVP Timeline View [PRIORITY]
1. Create `TimelineContext` aggregating logs, crashes, SDK events
2. Create `TimelinePanel` with basic event list
3. Add Timeline to sidebar and routing
4. Implement event type filtering
5. Add event detail side panel

### Phase 2: Recording Basics [PRIORITY]
1. Create `RecordingContext` with start/stop
2. Add main process file save/load handlers
3. Create session metadata editor
4. Add load recording modal
5. Session list in settings

### Phase 3: Performance Overlay [LATER]
- `TimelineChart` with memory/CPU/FPS as background

### Phase 4: Advanced Playback [LATER]
- Time scrubber, playback controls, zoom

### Phase 5: Export [LATER]
- JSON/CSV export, shareable format

---

## Session File Structure

```
userData/recordings/{session-id}/
  session.json    # Metadata
  events.json     # TimelineEvent[]
  metrics.json    # Performance data points
```

---

## UI Layout

```
+----------------------------------------------------------+
| [● Record] [Stop] | Filter: [Log ✓][Net ✓][State ✓] | 5m |
+----------------------------------------------------------+
|  ╭ Memory ─── CPU ═══ FPS ▪▪▪  (background chart)        |
|----------------------------------------------------------|
| 00:01.234  LOG     App started                           |
| 00:01.456  NET     GET /api/user → 200 (45ms)            |
| 00:01.789  STATE   userStore.login                       |
| 00:02.012  CRASH   SIGSEGV in libui.so                   |
+----------------------------------------------------------+
| ◀ ⏸ ▶ ⏩  |═══════●═══════|  1x    00:05:23 / 00:12:45  |
+----------------------------------------------------------+
```

---

## Verification

1. **Timeline View**: Start app, connect device, see events appearing in timeline
2. **Filtering**: Toggle filters, verify only selected types show
3. **Event Details**: Click event, verify detail panel shows full data
4. **Recording**: Start recording, perform actions, stop, verify session saved
5. **Playback**: Load saved session, verify events replay correctly
6. **Chart**: Verify memory/CPU/FPS graphs sync with event timeline

---

## Key Implementation Notes

- Use `react-window` or similar for virtualized list (performance with 10k+ events)
- Debounce filter changes (300ms)
- Recording state lives in main process (survives renderer crash)
- Normalize log timestamps: `new Date(isoString).getTime()`
- Max events in live view: 50,000 (older events buffer to disk during recording)
