import ICAL from "ical.js";
import type { CampusEvent } from "./types";
import { reconcileEvents } from "./locations";
export interface CalendarImport {
  events: CampusEvent[];
  unresolved: CampusEvent[];
  excluded: number;
  duplicates: number;
}
export function importCalendarFile(
  text: string,
  now = new Date(),
): CalendarImport {
  if (text.length > 8_000_000)
    throw Error("Calendar file is too large. Export one term or one calendar.");
  const root = new ICAL.Component(ICAL.parse(text));
  for (const tz of root.getAllSubcomponents("vtimezone")) {
    const zone = new ICAL.Timezone(tz);
    ICAL.TimezoneService.register(zone, zone.tzid);
  }
  const comps = root.getAllSubcomponents("vevent"),
    events: CampusEvent[] = [];
  const max = now.getTime() + 45 * 86400000,
    min = now.getTime() - 86400000;
  const exceptions = new Map<string, any[]>();
  for (const c of comps)
    if (c.hasProperty("recurrence-id")) {
      const id = String(c.getFirstPropertyValue("uid"));
      exceptions.set(id, [...(exceptions.get(id) || []), c]);
    }
  for (const component of comps) {
    if (component.hasProperty("recurrence-id")) continue;
    const ev = new ICAL.Event(component);
    for (const exception of exceptions.get(ev.uid) || [])
      try {
        ev.relateException(new ICAL.Event(exception));
      } catch {}
    const cancelled =
      String(component.getFirstPropertyValue("status")).toUpperCase() ===
      "CANCELLED";
    if (cancelled) continue;
    const add = (
      start: any,
      end: any,
      suffix: string,
      sourceEvent: any = ev,
    ) => {
      if (
        String(
          sourceEvent.component?.getFirstPropertyValue("status"),
        ).toUpperCase() === "CANCELLED"
      )
        return;
      const startDate = start.toJSDate(),
        endDate = end.toJSDate();
      if (endDate.getTime() < min || startDate.getTime() > max) return;
      events.push({
        id: `ical-${ev.uid}-${suffix}`,
        title: String(sourceEvent.summary || "Calendar event"),
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        locationText: String(sourceEvent.location || ""),
        description: String(sourceEvent.description || "").slice(0, 1000),
        source: "Calendar file",
        personal: true,
        allDay: start.isDate,
        updatedAt: new Date().toISOString(),
      });
    };
    if (ev.isRecurring()) {
      const iterator = ev.iterator();
      let next,
        iterations = 0;
      while (
        (next = iterator.next()) &&
        iterations++ < 6000 &&
        events.length < 2000
      ) {
        if (next.toJSDate().getTime() > max) break;
        const occurrence = ev.getOccurrenceDetails(next);
        add(
          occurrence.startDate,
          occurrence.endDate,
          String(next),
          occurrence.item,
        );
      }
    } else add(ev.startDate, ev.endDate, "single");
  }
  return reconcileEvents(events, { personal: true, now, days: 45 });
}
let token: string | undefined,
  expires = 0;
let libraryPromise: Promise<void> | undefined;
export function loadGoogleLibrary() {
  if ((window as any).google?.accounts?.oauth2) return Promise.resolve();
  return (libraryPromise ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      libraryPromise = undefined;
      reject(Error("Google sign-in could not load. Check your connection."));
    };
    document.head.appendChild(script);
  }));
}
export async function authorizeGoogle(clientId: string) {
  if (!clientId.endsWith(".apps.googleusercontent.com"))
    throw Error("A Google OAuth client ID is required for this installation.");
  await loadGoogleLibrary();
  return new Promise<void>((resolve, reject) => {
    const client = (window as any).google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope:
        "https://www.googleapis.com/auth/calendar.events.readonly https://www.googleapis.com/auth/calendar.calendarlist.readonly",
      callback: (response: any) => {
        if (response.error)
          return reject(Error(response.error_description || response.error));
        token = response.access_token;
        expires = Date.now() + Number(response.expires_in || 3600) * 1000;
        resolve();
      },
      error_callback: (e: any) =>
        reject(
          Error(
            e.type === "popup_closed"
              ? "Google sign-in was closed."
              : "Google sign-in could not open.",
          ),
        ),
    });
    client.requestAccessToken({ prompt: "" });
  });
}
async function googleGet(path: string) {
  if (!token || Date.now() >= expires)
    throw Error("Reconnect Google Calendar to refresh your permission.");
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/${path}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(12000),
    },
  );
  if (!response.ok)
    throw Error(
      response.status === 401
        ? "Reconnect Google Calendar to refresh your permission."
        : `Google Calendar returned ${response.status}.`,
    );
  return response.json();
}
export async function googleCalendars(): Promise<
  { id: string; summary: string; primary?: boolean }[]
> {
  const data = await googleGet(
    "users/me/calendarList?minAccessRole=reader&maxResults=100",
  );
  return data.items || [];
}
export async function syncGoogle(
  ids: string[],
  now = new Date(),
): Promise<CalendarImport> {
  const events: CampusEvent[] = [];
  for (const id of ids.slice(0, 10)) {
    let page: string | undefined;
    let rounds = 0;
    do {
      const params = new URLSearchParams({
        timeMin: new Date(now.getTime() - 86400000).toISOString(),
        timeMax: new Date(now.getTime() + 45 * 86400000).toISOString(),
        singleEvents: "true",
        orderBy: "startTime",
        maxResults: "250",
        timeZone: "America/Toronto",
      });
      if (page) params.set("pageToken", page);
      const data = await googleGet(
        `calendars/${encodeURIComponent(id)}/events?${params}`,
      );
      for (const e of data.items || []) {
        if (
          e.status === "cancelled" ||
          e.attendees?.some(
            (a: any) => a.self && a.responseStatus === "declined",
          )
        )
          continue;
        events.push({
          id: `google-${id}-${e.id}`,
          title: e.summary || "Calendar event",
          start: e.start?.dateTime || `${e.start?.date}T00:00:00-04:00`,
          end: e.end?.dateTime || `${e.end?.date}T00:00:00-04:00`,
          locationText: e.location || "",
          source: "Google Calendar",
          personal: true,
          allDay: !!e.start?.date,
          url: e.htmlLink,
          updatedAt: e.updated,
        });
      }
      page = data.nextPageToken;
    } while (page && ++rounds < 10);
  }
  return reconcileEvents(events, { personal: true, now, days: 45 });
}
export function disconnectGoogle() {
  if (token) (window as any).google?.accounts?.oauth2?.revoke(token, () => {});
  token = undefined;
  expires = 0;
}
export function googleSessionActive() {
  return !!token && Date.now() < expires;
}
