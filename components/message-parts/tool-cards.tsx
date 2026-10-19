import { memo, useEffect, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';
import { ClockIcon as PhosphorClockIcon, MemoryIcon } from '@phosphor-icons/react';
import dynamic from 'next/dynamic';

import { useLocale } from '@/contexts/locale-context';

const MapComponent = dynamic(() => import('@/components/map-components').then((m) => ({ default: m.MapComponent })), {
  ssr: false,
});

// Ticks every second, aligned to the start of each second.
const LiveClock = memo(function LiveClock({ timezone }: { timezone?: string }) {
  const locale = useLocale();
  const [time, setTime] = useState(() => new Date());
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Sync with the nearest second
    const now = new Date();
    const delay = 1000 - now.getMilliseconds();

    // Initial sync
    const timeout = setTimeout(() => {
      setTime(new Date());

      // Then start the interval
      timerRef.current = setInterval(() => {
        setTime(new Date());
      }, 1000);
    }, delay);

    return () => {
      clearTimeout(timeout);
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  // Format the time according to the specified timezone
  const resolvedTimezone = timezone || new Intl.DateTimeFormat().resolvedOptions().timeZone;
  const formatter = new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    timeZone: resolvedTimezone,
  });

  const formattedParts = formatter.formatToParts(time);
  const timeParts = {
    hour: formattedParts.find((part) => part.type === 'hour')?.value || '12',
    minute: formattedParts.find((part) => part.type === 'minute')?.value || '00',
    second: formattedParts.find((part) => part.type === 'second')?.value || '00',
    dayPeriod: formattedParts.find((part) => part.type === 'dayPeriod')?.value || '',
  };

  return (
    <div className="mt-3">
      <div className="flex items-baseline">
        <div className="text-4xl sm:text-5xl md:text-6xl font-light tracking-tighter tabular-nums text-neutral-900 dark:text-white">
          {timeParts.hour.padStart(2, '0')}
        </div>
        <div className="mx-1 sm:mx-2 text-4xl sm:text-5xl md:text-6xl font-light text-neutral-400 dark:text-neutral-500">
          :
        </div>
        <div className="text-4xl sm:text-5xl md:text-6xl font-light tracking-tighter tabular-nums text-neutral-900 dark:text-white">
          {timeParts.minute.padStart(2, '0')}
        </div>
        <div className="mx-1 sm:mx-2 text-4xl sm:text-5xl md:text-6xl font-light text-neutral-400 dark:text-neutral-500">
          :
        </div>
        <div className="text-4xl sm:text-5xl md:text-6xl font-light tracking-tighter tabular-nums text-neutral-900 dark:text-white">
          {timeParts.second.padStart(2, '0')}
        </div>
        <div className="ml-2 sm:ml-4 text-xl sm:text-2xl font-light self-center text-neutral-400 dark:text-neutral-500">
          {timeParts.dayPeriod}
        </div>
      </div>
    </div>
  );
});

interface Place {
  name: string;
  formatted_address: string;
  place_id?: string;
  types?: string[];
  location: { lat: number; lng: number };
}

// The places find_place_on_map found, on a map and in a list.
export function PlacesResultCard({ output }: { output: { places: Place[]; search_type?: string } }) {
  const { places } = output;
  return (
    <div className="w-full my-4 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))] shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))]">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-[hsl(var(--primary))]/10 flex items-center justify-center">
            <MapPin className="h-4 w-4 text-[hsl(var(--primary))]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold truncate">
                {places.length} Location{places.length !== 1 ? 's' : ''} Found
              </h3>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))]">
                {output.search_type === 'forward' ? 'Address Search' : 'Coordinate Search'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Map */}
      <div className="relative h-[360px] sm:h-[400px] bg-[hsl(var(--muted))]">
        <MapComponent
          center={{ lat: places[0].location.lat, lng: places[0].location.lng }}
          places={places.map((place: any) => ({
            name: place.name,
            location: place.location,
            address: place.formatted_address,
            place_id: place.place_id,
            types: place.types,
          }))}
          zoom={places.length === 1 ? 15 : 12}
        />
      </div>

      {/* Results list */}
      <div className="p-3 divide-y divide-[hsl(var(--border))]">
        {places.map((place: any, index: number) => (
          <div key={place.place_id || index} className="py-3">
            <div className="flex items-start gap-3">
              <div className="shrink-0 w-9 h-9 rounded-lg bg-[hsl(var(--primary))]/10 flex items-center justify-center">
                <MapPin className="h-4 w-4 text-[hsl(var(--primary))]" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="text-sm font-medium text-ellipsis overflow-hidden whitespace-nowrap">{place.name}</h4>
                  <span className="text-[11px] text-[hsl(var(--muted-foreground))]">
                    {place.location.lat.toFixed(4)}, {place.location.lng.toFixed(4)}
                  </span>
                </div>
                <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1 line-clamp-2">
                  {place.formatted_address}
                </p>
                {place.types && place.types.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {place.types.slice(0, 3).map((type: string, typeIndex: number) => (
                      <span
                        key={typeIndex}
                        className="text-[10px] px-2 py-0.5 rounded-full bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] capitalize"
                      >
                        {type.replace(/_/g, ' ')}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// The datetime tool's answer, with a clock that keeps ticking.
export function CurrentTimeCard({
  output,
}: {
  output: { timezone?: string; timestamp?: string | number; formatted?: { date?: string; iso_local?: string } };
}) {
  return (
    <div className="w-full my-6">
      <div className="bg-white dark:bg-neutral-950 rounded-xl overflow-hidden border border-neutral-200 dark:border-neutral-800">
        <div className="p-4 sm:p-6">
          <div className="flex flex-col gap-4 sm:gap-6">
            <div>
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-xs font-medium text-neutral-500 dark:text-neutral-400 tracking-wider uppercase">
                  Current Time
                </h3>
                <div className="bg-neutral-100 dark:bg-neutral-800 rounded px-2 py-1 text-xs text-neutral-600 dark:text-neutral-300 font-medium flex items-center gap-1.5">
                  <PhosphorClockIcon weight="regular" className="h-3 w-3 text-blue-500" />
                  {output.timezone || new Intl.DateTimeFormat().resolvedOptions().timeZone}
                </div>
              </div>
              <LiveClock timezone={output.timezone} />
              <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-2">{output.formatted?.date}</p>
            </div>

            {/* Compact Technical Details */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              {output.formatted?.iso_local && (
                <div className="bg-neutral-50 dark:bg-neutral-900 rounded p-3">
                  <div className="text-neutral-500 dark:text-neutral-400 mb-1">Local</div>
                  <div className="font-mono text-neutral-700 dark:text-neutral-300 text-[11px]">
                    {output.formatted.iso_local}
                  </div>
                </div>
              )}

              {output.timestamp && (
                <div className="bg-neutral-50 dark:bg-neutral-900 rounded p-3">
                  <div className="text-neutral-500 dark:text-neutral-400 mb-1">Timestamp</div>
                  <div className="font-mono text-neutral-700 dark:text-neutral-300 text-[11px]">{output.timestamp}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function MemoriesFoundCard({
  count,
  results,
}: {
  count: number;
  results: Array<{ id?: string; memory: string }>;
}) {
  return (
    <div className="w-full my-4 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))] shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-2 py-2 border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))]">
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-[hsl(var(--primary))]/10 flex items-center justify-center shrink-0">
              <MemoryIcon className="h-4 w-4 text-[hsl(var(--primary))]" />
            </div>
            <h3 className="text-sm font-semibold">
              {count} Memor{count !== 1 ? 'ies' : 'y'} Found
            </h3>
          </div>
        </div>
      </div>

      {/* Results list */}
      <div className="">
        {results.map((memory, index) => (
          <div key={memory.id || index} className="px-4 py-2">
            <p className="text-xs text-[hsl(var(--muted-foreground))] line-clamp-2">• {memory.memory}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MemoryAddedCard({ memory: addedMemory }: { memory?: { memory: string } }) {
  return (
    <div className="w-full my-4 rounded-2xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950 shadow-sm overflow-hidden">
      <div className="px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-green-100 dark:bg-green-900 flex items-center justify-center">
              <MemoryIcon className="h-4 w-4 text-green-600 dark:text-green-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-green-900 dark:text-green-100">Memory Added Successfully</h3>
              <p className="text-xs text-green-700 dark:text-green-300 mt-1">
                Your information has been saved to memory for future reference.
              </p>
            </div>
          </div>
        </div>

        {addedMemory && (
          <div className="mt-3 p-3 bg-white dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
            <p className="text-xs text-green-700 dark:text-green-300">{addedMemory.memory}</p>
          </div>
        )}
      </div>
    </div>
  );
}
