import React from 'react';
import type { Device } from '@android-debugger/shared';
import { useTimelineContext } from '../contexts/TimelineContext';
import { TimelineHeader, EventList, EventDetail } from './timeline';

interface TimelinePanelProps {
  device: Device | null;
  packageName: string;
}

export function TimelinePanel({ device, packageName }: TimelinePanelProps) {
  const { filteredEvents, selectedEvent, setSelectedEvent, isLive } = useTimelineContext();

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <TimelineHeader device={device} packageName={packageName} />
      <div className="flex-1 flex overflow-hidden">
        <EventList
          events={filteredEvents}
          selectedEvent={selectedEvent}
          onSelectEvent={setSelectedEvent}
          isLive={isLive}
        />
        {selectedEvent && (
          <EventDetail
            event={selectedEvent}
            onClose={() => setSelectedEvent(null)}
          />
        )}
      </div>
    </div>
  );
}
