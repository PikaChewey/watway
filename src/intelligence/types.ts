import type { Point } from "../types";
export interface ResolvedLocation {
  locationId: string;
  building: string;
  label: string;
  point: Point;
  confidence: "room" | "building" | "campus" | "unresolved";
  reason: string;
}
export interface CampusEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  locationText: string;
  location?: ResolvedLocation;
  source:
    | "UW"
    | "WYGO"
    | "Luma"
    | "Partiful"
    | "Google Calendar"
    | "Calendar file"
    | "Manual"
    | "Sample";
  url?: string;
  description?: string;
  allDay?: boolean;
  updatedAt?: string;
  personal?: boolean;
  cancelled?: boolean;
}
export interface FacilityReading {
  id: string;
  name: string;
  building: string;
  percent: number;
  capacity?: number;
  count?: number;
  updatedAt: string;
  status: "live" | "cached" | "unavailable";
  source: string;
}
export interface SourceStatus {
  id: string;
  name: string;
  status: "live" | "cached" | "unavailable" | "import";
  updatedAt?: string;
  detail: string;
  url: string;
}
export interface CampusFeed {
  events: CampusEvent[];
  facilities: FacilityReading[];
  sources: SourceStatus[];
  fetchedAt: string;
}
export interface PlaceState {
  building: string;
  occupancy: number;
  occupancyKind: "live" | "estimate";
  pedestrianFactor: number;
  queueSeconds: number;
  open: "open" | "closed" | "unknown";
  nextChange?: string;
  source?: string;
}
export interface CampusState {
  time: Date;
  isLive: boolean;
  place: string;
  states: Record<string, PlaceState>;
  nextEvent?: CampusEvent;
  events: CampusEvent[];
  leaveAt?: Date;
  gapMinutes: number;
  congestionLevel: "Quiet" | "Typical" | "Class change" | "Busy";
  flowScale: number;
}
