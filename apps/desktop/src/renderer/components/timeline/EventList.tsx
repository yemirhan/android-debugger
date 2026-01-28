import React, { useRef, useEffect, useCallback } from 'react';
import type { TimelineEvent } from '@android-debugger/shared';
import { EventRow } from './EventRow';

interface EventListProps {
  events: TimelineEvent[];
  selectedEvent: TimelineEvent | null;
  onSelectEvent: (event: TimelineEvent | null) => void;
  isLive: boolean;
}

export function EventList({ events, selectedEvent, onSelectEvent, isLive }: EventListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);

  // Check if user is at bottom of list
  const handleScroll = useCallback(() => {
    if (!listRef.current) return;
    const { scrollTop } = listRef.current;
    // When newest is at top, "at bottom" means scrollTop is near 0
    isAtBottomRef.current = scrollTop < 50;
  }, []);

  // Auto-scroll when new events arrive (if user was at top)
  useEffect(() => {
    if (isLive && isAtBottomRef.current && listRef.current) {
      listRef.current.scrollTop = 0;
    }
  }, [events.length, isLive]);

  if (events.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-muted">
        <div className="text-center">
          <svg className="w-12 h-12 mx-auto mb-3 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm">No events yet</p>
          <p className="text-xs mt-1">Events will appear here as they occur</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={listRef}
      onScroll={handleScroll}
      className="flex-1 overflow-auto"
    >
      {events.map((event) => (
        <EventRow
          key={event.id}
          event={event}
          isSelected={selectedEvent?.id === event.id}
          onClick={() => onSelectEvent(selectedEvent?.id === event.id ? null : event)}
        />
      ))}
    </div>
  );
}
