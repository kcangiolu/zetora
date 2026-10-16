import { tool } from 'ai';
import { z } from 'zod';
import { serverEnv } from '@/env/server';

import { createLogger } from '@/lib/logger';
import { EXTERNAL_API_TIMEOUT_MS } from '@/lib/timeouts';

const log = createLogger('flight-tracker');

const AMADEUS_API = 'https://api.amadeus.com';

let cachedToken: { value: string; expiresAt: number } | null = null;

// Amadeus client-credentials token, reused until shortly before it expires
// (they last about 30 minutes).
async function getAmadeusToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value;

  const response = await fetch(`${AMADEUS_API}/v1/security/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: serverEnv.AMADEUS_API_KEY,
      client_secret: serverEnv.AMADEUS_API_SECRET,
    }),
    signal: AbortSignal.timeout(EXTERNAL_API_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Amadeus authentication failed: ${response.status} ${response.statusText}`);
  }
  const { access_token, expires_in } = (await response.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: access_token, expiresAt: Date.now() + (expires_in - 60) * 1000 };
  return access_token;
}

function amadeusGet(path: string, params: Record<string, string>, accessToken: string): Promise<Response> {
  return fetch(`${AMADEUS_API}${path}?${new URLSearchParams(params)}`, {
    headers: { Accept: 'application/vnd.amadeus+json', Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(EXTERNAL_API_TIMEOUT_MS),
  });
}

// The parts of Amadeus's schedule API response this tool reads.
interface AmadeusPointTimes {
  timings?: Array<{ value?: string; type?: string }>;
  terminal?: { code?: string };
  gate?: { mainGate?: string };
  status?: unknown;
}
interface AmadeusFlightPoint {
  iataCode: string;
  departure?: AmadeusPointTimes;
  arrival?: AmadeusPointTimes;
  status?: unknown;
}
interface AmadeusLeg {
  boardPointIataCode: string;
  offPointIataCode: string;
  scheduledLegDuration?: string;
  aircraftEquipment?: { aircraftType?: string };
  status?: unknown;
  executionStatus?: unknown;
}
interface AmadeusSegment {
  boardPointIataCode: string;
  offPointIataCode: string;
  scheduledSegmentDuration?: string;
  partnership?: { operatingFlight?: { carrierCode: string; flightNumber: number } };
  status?: unknown;
  stage?: unknown;
}
interface AmadeusDatedFlight {
  scheduledDepartureDate: string;
  flightPoints: AmadeusFlightPoint[];
  legs?: AmadeusLeg[];
  segments?: AmadeusSegment[];
  status?: unknown;
  flightStatus?: unknown;
}

interface FlightEndpoint {
  airport: string;
  airport_code: string;
  timezone: string;
  iata: string;
  terminal: string | null;
  gate: string | null;
  delay: number | null;
  scheduled: string;
}
interface FlightLegData {
  flight_date: string;
  flight_status: string;
  departure: FlightEndpoint;
  arrival: FlightEndpoint;
  airline: { name: string; iata: string };
  flight: { number: string; iata: string; duration: number | null };
  amadeus_data: {
    aircraft_type?: string;
    operating_flight?: { carrierCode: string; flightNumber: number };
    segment_duration?: string;
  };
}

const preferredTimingTypes = ['actual', 'estimated', 'scheduled'] as const;

const getPreferredTimingValue = (timings?: Array<{ value?: string; type?: string }>): string | null => {
  if (!timings?.length) return null;

  for (const type of preferredTimingTypes) {
    const candidate = timings.find(
      (timing) => typeof timing?.type === 'string' && timing.type.toLowerCase() === type && timing.value,
    );
    if (candidate?.value) {
      return candidate.value;
    }
  }

  return timings[0]?.value ?? null;
};

const getPointTiming = (point: AmadeusFlightPoint | undefined, direction: 'departure' | 'arrival'): string | null =>
  getPreferredTimingValue(point?.[direction]?.timings);

const getStatusValue = (value: any): string | null => {
  if (!value) return null;

  if (typeof value === 'string') {
    return value.trim() || null;
  }

  if (typeof value === 'object') {
    if (typeof value.status === 'string' && value.status.trim()) {
      return value.status.trim();
    }
    if (typeof value.code === 'string' && value.code.trim()) {
      return value.code.trim();
    }
    if (typeof value.label === 'string' && value.label.trim()) {
      return value.label.trim();
    }
    if (typeof value.name === 'string' && value.name.trim()) {
      return value.name.trim();
    }
    if (typeof value?.status === 'object') {
      if (typeof value.status.code === 'string' && value.status.code.trim()) {
        return value.status.code.trim();
      }
      if (typeof value.status.name === 'string' && value.status.name.trim()) {
        return value.status.name.trim();
      }
    }
  }

  return null;
};

const getPointStatus = (point?: AmadeusFlightPoint): string | null => {
  if (!point) return null;

  return (
    getStatusValue(point?.arrival?.status) ?? getStatusValue(point?.departure?.status) ?? getStatusValue(point?.status)
  );
};

const determineFlightStatus = ({
  flight,
  leg,
  departurePoint,
  arrivalPoint,
  matchingSegment,
}: {
  flight: AmadeusDatedFlight;
  leg: AmadeusLeg;
  departurePoint?: AmadeusFlightPoint;
  arrivalPoint?: AmadeusFlightPoint;
  matchingSegment?: AmadeusSegment;
}): string => {
  const candidates = [
    getPointStatus(arrivalPoint),
    getPointStatus(departurePoint),
    getStatusValue(matchingSegment?.status),
    getStatusValue(matchingSegment?.stage),
    getStatusValue(leg?.status),
    getStatusValue(leg?.executionStatus),
    getStatusValue(flight?.status),
    getStatusValue(flight?.flightStatus),
  ];

  for (const candidate of candidates) {
    if (candidate) {
      return candidate;
    }
  }

  return 'scheduled';
};

export const flightTrackerTool = tool({
  description: 'Track flight information and status using airline code and flight number',
  inputSchema: z.object({
    carrierCode: z.string().describe('The 2-letter airline carrier code (e.g., UL for SriLankan Airlines)'),
    flightNumber: z.string().describe('The flight number without carrier code (e.g., 604)'),
    scheduledDepartureDate: z.string().describe('The scheduled departure date in YYYY-MM-DD format (e.g., 2025-07-01)'),
  }),
  execute: async ({
    carrierCode,
    flightNumber,
    scheduledDepartureDate,
  }: {
    carrierCode: string;
    flightNumber: string;
    scheduledDepartureDate: string;
  }) => {
    log.debug(`[Tracking flight]: ${carrierCode} ${flightNumber} on ${scheduledDepartureDate}`);

    try {
      const accessToken = await getAmadeusToken();
      const response = await amadeusGet(
        '/v2/schedule/flights',
        { carrierCode, flightNumber, scheduledDepartureDate },
        accessToken,
      );

      if (!response.ok) {
        throw new Error(`Amadeus API error: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as { data?: AmadeusDatedFlight[] };

      // Look up airline name
      let airlineName = carrierCode;
      try {
        const airlineResponse = await amadeusGet(
          '/v1/reference-data/airlines',
          { airlineCodes: carrierCode },
          accessToken,
        );

        if (airlineResponse.ok) {
          const airlineData = await airlineResponse.json();
          if (airlineData.data && airlineData.data.length > 0) {
            airlineName = airlineData.data[0].businessName || airlineData.data[0].commonName || carrierCode;
          }
        }
      } catch (error) {
        log.warn('Failed to lookup airline name:', error);
        // Fall back to carrier code
      }

      if (data.data && data.data.length > 0) {
        const flight = data.data[0];
        const legs = flight.legs || [];
        const segments = flight.segments || [];

        // Collect all unique airport codes
        const airportCodes = new Set<string>();
        legs.forEach((leg) => {
          if (leg.boardPointIataCode) airportCodes.add(leg.boardPointIataCode);
          if (leg.offPointIataCode) airportCodes.add(leg.offPointIataCode);
        });

        // Lookup airport names for all unique codes
        const airportNames: Record<string, string> = {};
        const airportLookupPromises = Array.from(airportCodes).map(async (code) => {
          try {
            const airportResponse = await amadeusGet(
              '/v1/reference-data/locations',
              {
                subType: 'AIRPORT',
                keyword: code,
                'page[limit]': '1',
                sort: 'analytics.travelers.score',
                view: 'FULL',
              },
              accessToken,
            );

            if (airportResponse.ok) {
              const airportData = await airportResponse.json();
              if (airportData.data && airportData.data.length > 0) {
                const airport = airportData.data[0];
                airportNames[code] = airport.name || code;
              } else {
                airportNames[code] = code;
              }
            } else {
              airportNames[code] = code;
            }
          } catch (error) {
            log.warn(`Failed to lookup airport name for ${code}:`, error);
            airportNames[code] = code;
          }
        });

        await Promise.all(airportLookupPromises);

        const flightData: FlightLegData[] = [];

        for (let legIndex = 0; legIndex < legs.length; legIndex++) {
          const leg = legs[legIndex];
          const boardPoint = leg.boardPointIataCode;
          const offPoint = leg.offPointIataCode;

          // Use the segment that matches this leg (segments have timing info)
          const matchingSegment = segments.find(
            (seg) => seg.boardPointIataCode === boardPoint && seg.offPointIataCode === offPoint,
          );

          // Find flight points - a flight point can have both departure and arrival
          // For departure, find the flight point at boardPoint that has departure info
          let departurePoint = flight.flightPoints.find((fp) => fp.iataCode === boardPoint && fp.departure);
          // If not found, try any flight point at boardPoint (might have both arrival and departure)
          if (!departurePoint) {
            const fp = flight.flightPoints.find((fp) => fp.iataCode === boardPoint);
            if (fp?.departure) {
              departurePoint = fp;
            }
          }

          // For arrival, find the flight point at offPoint that has arrival info
          let arrivalPoint = flight.flightPoints.find((fp) => fp.iataCode === offPoint && fp.arrival);
          // If not found, try any flight point at offPoint
          if (!arrivalPoint) {
            const fp = flight.flightPoints.find((fp) => fp.iataCode === offPoint);
            if (fp?.arrival) {
              arrivalPoint = fp;
            }
          }

          // Get departure time from flight point, preferring actual/estimated timings
          let departureTime = getPointTiming(departurePoint, 'departure');

          // For intermediate legs, if no departure time, calculate from previous leg arrival
          if (!departureTime && legIndex > 0 && flightData[legIndex - 1]) {
            const prevArrival = flightData[legIndex - 1].arrival.scheduled;
            if (prevArrival) {
              // Calculate from previous arrival + a small buffer (layover time)
              // For now, use previous arrival as departure (or could add a small buffer)
              departureTime = prevArrival;
            }
          }

          // Fallback to first flight point departure for first leg
          if (!departureTime && legIndex === 0) {
            departureTime = getPointTiming(flight.flightPoints[0], 'departure');
          }

          // Get arrival time from flight point, preferring actual/estimated timings
          let arrivalTime = getPointTiming(arrivalPoint, 'arrival');

          // If no arrival time, calculate from departure + duration
          if (!arrivalTime && departureTime && leg.scheduledLegDuration) {
            const depDate = new Date(departureTime);
            const duration = leg.scheduledLegDuration;
            const matches = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
            if (matches) {
              const hours = parseInt(matches[1] || '0');
              const minutes = parseInt(matches[2] || '0');
              depDate.setHours(depDate.getHours() + hours);
              depDate.setMinutes(depDate.getMinutes() + minutes);
              arrivalTime = depDate.toISOString();
            }
          }

          // Fallback to last flight point arrival for last leg
          if (!arrivalTime && legIndex === legs.length - 1) {
            const lastPoint = flight.flightPoints[flight.flightPoints.length - 1];
            arrivalTime = getPointTiming(lastPoint, 'arrival');
          }

          // Parse duration from leg
          const durationMinutes = leg.scheduledLegDuration
            ? (() => {
                const duration = leg.scheduledLegDuration;
                const matches = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
                if (matches) {
                  const hours = parseInt(matches[1] || '0');
                  const minutes = parseInt(matches[2] || '0');
                  return hours * 60 + minutes;
                }
                return null;
              })()
            : null;

          const flightStatus = determineFlightStatus({
            flight,
            leg,
            departurePoint,
            arrivalPoint,
            matchingSegment,
          });

          flightData.push({
            flight_date: flight.scheduledDepartureDate,
            flight_status: flightStatus,
            departure: {
              airport: airportNames[boardPoint] || boardPoint,
              airport_code: boardPoint,
              timezone: departureTime?.slice(-6) || '+00:00',
              iata: boardPoint,
              terminal: departurePoint?.departure?.terminal?.code ?? null,
              gate: departurePoint?.departure?.gate?.mainGate ?? null,
              delay: null,
              scheduled: departureTime || '',
            },
            arrival: {
              airport: airportNames[offPoint] || offPoint,
              airport_code: offPoint,
              timezone: arrivalTime?.slice(-6) || '+00:00',
              iata: offPoint,
              terminal: arrivalPoint?.arrival?.terminal?.code ?? null,
              gate: arrivalPoint?.arrival?.gate?.mainGate ?? null,
              delay: null,
              scheduled: arrivalTime || '',
            },
            airline: {
              name: airlineName,
              iata: carrierCode,
            },
            flight: {
              number: flightNumber,
              iata: `${carrierCode}${flightNumber}`,
              duration: durationMinutes,
            },
            amadeus_data: {
              aircraft_type: leg.aircraftEquipment?.aircraftType,
              operating_flight: matchingSegment?.partnership?.operatingFlight,
              segment_duration: matchingSegment?.scheduledSegmentDuration,
            },
          });
        }

        return { data: flightData };
      }

      return { data: [], error: 'No flight data found' };
    } catch (error) {
      log.error('Flight tracking error:', error);
      return {
        data: [],
        error: error instanceof Error ? error.message : 'Flight tracking failed',
      };
    }
  },
});
