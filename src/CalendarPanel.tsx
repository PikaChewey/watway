import { useEffect, useRef, useState } from "react";
import {
  CalendarDays,
  Upload,
  RefreshCw,
  Link2,
  Check,
  ChevronRight,
  X,
  ExternalLink,
  ShieldCheck,
  Plus,
  Trash2,
  MapPin,
  AlertCircle,
} from "lucide-react";
import {
  authorizeGoogle,
  googleCalendars,
  syncGoogle,
  disconnectGoogle,
  googleSessionActive,
  importCalendarFile,
  loadGoogleLibrary,
} from "./intelligence/calendar";
import { resolveCampusLocation } from "./intelligence/locations";
import type { CampusEvent } from "./intelligence/types";
import type { ClassEvent } from "./types";
import { buildings, resolveLocation, findRoom } from "./data/campus";
const displayTime = (s: string) =>
  new Date(s).toLocaleTimeString("en-CA", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Toronto",
  });
export default function CalendarPanel({
  events,
  classes,
  onEvents,
  onClasses,
  onRoute,
  notify,
  at,
}: {
  events: CampusEvent[];
  classes: ClassEvent[];
  onEvents: (e: CampusEvent[]) => void;
  onClasses: (e: ClassEvent[]) => void;
  onRoute: (id: string) => void;
  notify: (s: string) => void;
  at: Date;
}) {
  const [fileLoading, setFileLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [setup, setSetup] = useState(false),
    [add, setAdd] = useState(false),
    [unresolved, setUnresolved] = useState<CampusEvent[]>([]),
    [calendars, setCalendars] = useState<{ id: string; summary: string }[]>([]),
    [chosen, setChosen] = useState<string[]>([]),
    [connected, setConnected] = useState(googleSessionActive()),
    [selectedDay, setSelectedDay] = useState(at.getDay());
  const [clientId, setClientId] = useState(() => {
      try {
        return (
          localStorage.getItem("watway-google-client") ||
          import.meta.env.VITE_GOOGLE_CLIENT_ID ||
          ""
        );
      } catch {
        return "";
      }
    }),
    [title, setTitle] = useState(""),
    [room, setRoom] = useState(""),
    [start, setStart] = useState("09:30"),
    [end, setEnd] = useState("10:20"),
    [days, setDays] = useState([1, 3, 5]);
  const file = useRef<HTMLInputElement>(null);
  const existingPersonal = events.filter(
    (e) => e.source === "Google Calendar" || e.source === "Calendar file",
  );

  const saveImport = (
    result: {
      events: CampusEvent[];
      unresolved: CampusEvent[];
      excluded: number;
      duplicates: number;
    },
    source: "Google Calendar" | "Calendar file",
  ) => {
    const kept = events.filter((e) => e.source !== source);
    onEvents([...kept, ...result.events]);
    setUnresolved(result.unresolved);
    notify(
      `${result.events.length} campus events added${result.unresolved.length ? ` · ${result.unresolved.length} locations to review` : ""}${result.excluded ? ` · ${result.excluded} past or excluded` : ""}`,
    );
  };
  const connect = async () => {
    if (!clientId) {
      setSetup(true);
      return;
    }
    setBusy(true);
    try {
      await authorizeGoogle(clientId);
      setConnected(true);
      const list = await googleCalendars();
      setCalendars(list);
      setChosen(list.filter((c) => c.primary).map((c) => c.id));
      const ids = list.filter((c) => c.primary).map((c) => c.id);
      saveImport(
        await syncGoogle(ids.length ? ids : ["primary"]),
        "Google Calendar",
      );
    } catch (e) {
      notify(
        e instanceof Error ? e.message : "Could not connect Google Calendar",
      );
    } finally {
      setBusy(false);
    }
  };
  const sync = async () => {
    setBusy(true);
    try {
      saveImport(
        await syncGoogle(chosen.length ? chosen : ["primary"]),
        "Google Calendar",
      );
    } catch (e) {
      notify(String(e));
      if (!googleSessionActive()) setConnected(false);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (!connected) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") sync();
    }, 300000);
    return () => clearInterval(id);
  }, [connected, chosen, events]);
  const readFile = async (f?: File) => {
    if (!f) return;
    setFileLoading(true);
    try {
      saveImport(importCalendarFile(await f.text()), "Calendar file");
    } catch (e) {
      notify(
        e instanceof Error ? e.message : "That calendar could not be read",
      );
    } finally {
      setFileLoading(false);
      if (file.current) file.current.value = "";
    }
  };
  const addClass = (e: React.FormEvent) => {
    e.preventDefault();
    const r = resolveCampusLocation(room);
    if (!r?.locationId || !title.trim() || !days.length || end <= start) {
      notify("Choose a campus room, days, and an end time after the start.");
      return;
    }
    onClasses([
      ...classes,
      {
        id: crypto.randomUUID(),
        title: title.trim(),
        location: r.locationId,
        start,
        end,
        days,
      },
    ]);
    setAdd(false);
    setTitle("");
    setRoom("");
    notify("Class added to your week");
  };
  const day = new Date(at);
  day.setDate(at.getDate() + selectedDay - at.getDay());
  const dateKey = day.toLocaleDateString("en-CA", {
    timeZone: "America/Toronto",
  });
  const importedDay = events.filter(
    (e) =>
      new Date(e.start).toLocaleDateString("en-CA", {
        timeZone: "America/Toronto",
      }) === dateKey,
  );
  const manual = classes.filter((c) => c.days.includes(selectedDay));
  return (
    <div className="calendar-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">YOUR DAY, CONNECTED</span>
          <h1>My day</h1>
        </div>
        <button
          className="round-action"
          aria-label="Add class"
          onClick={() => setAdd(!add)}
        >
          <Plus size={20} />
        </button>
      </div>
      <div className="calendar-connect-card">
        <div className="course-icon-demo">
          <CalendarDays size={25} />
        </div>
        <div>
          <h3>
            {classes.some((c) => c.id.startsWith("demo"))
              ? "Your demo day is ready"
              : "Your week on the map"}
          </h3>
          <p>
            Classes already have rooms and routes. Edit your day or import a
            calendar—no sign-in needed.
          </p>
        </div>
      </div>
      <div className="button-pair">
        <button className="primary" onClick={() => setAdd(!add)}>
          <Plus size={17} />
          Add a class
        </button>
        <button
          className="secondary"
          onClick={() => file.current?.click()}
          disabled={fileLoading}
        >
          <Upload size={17} />
          {fileLoading ? "Reading…" : "Import .ics"}
        </button>
        <input
          type="file"
          ref={file}
          hidden
          accept=".ics,text/calendar"
          onChange={(e) => readFile(e.target.files?.[0])}
        />
      </div>
      <p className="privacy-caption">
        <ShieldCheck size={12} />
        Ready to explore. Changes stay on this device.
      </p>
      <details className="calendar-options optional-calendar">
        <summary>Optional calendar connection</summary>
        <p className="micro-copy">
          Connect a real calendar whenever you’re ready.
        </p>
        <button
          className="secondary"
          disabled={busy}
          onClick={connected ? sync : connect}
        >
          {busy
            ? "Connecting…"
            : connected
              ? "Sync Google Calendar"
              : "Connect Google Calendar"}
        </button>
        {setup && (
          <div className="inline-setup">
            <div className="section-head">
              <h3>Google connection setup</h3>
              <button
                aria-label="Close Google setup"
                onClick={() => setSetup(false)}
              >
                <X size={16} />
              </button>
            </div>
            <p>
              This installation needs a Google OAuth client ID. You can import a
              calendar file immediately.
            </p>
            <label>
              Web application client ID
              <input
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="…apps.googleusercontent.com"
              />
            </label>
            <small>Authorised JavaScript origin: {location.origin}</small>
            <button
              className="primary"
              onClick={() => {
                if (!clientId.endsWith(".apps.googleusercontent.com"))
                  return notify("Enter a valid Google OAuth web client ID.");
                localStorage.setItem("watway-google-client", clientId);
                setSetup(false);
                connect();
              }}
            >
              Save & connect
            </button>
            <a
              href="https://console.cloud.google.com/apis/credentials"
              target="_blank"
              rel="noreferrer"
            >
              Google Cloud credentials
              <ExternalLink size={13} />
            </a>
          </div>
        )}
        {connected && (
          <details className="calendar-options">
            <summary>Calendars & connection</summary>
            {calendars.map((c) => (
              <label key={c.id}>
                <input
                  type="checkbox"
                  checked={chosen.includes(c.id)}
                  onChange={(e) =>
                    setChosen((v) =>
                      e.target.checked
                        ? [...v, c.id]
                        : v.filter((x) => x !== c.id),
                    )
                  }
                />
                {c.summary}
              </label>
            ))}
            <button
              onClick={() => {
                disconnectGoogle();
                setConnected(false);
                onEvents(events.filter((e) => e.source !== "Google Calendar"));
                notify(
                  "Google Calendar disconnected and imported Google events removed.",
                );
              }}
            >
              Disconnect & remove Google events
            </button>
          </details>
        )}
      </details>
      {!!unresolved.length && (
        <details className="unresolved">
          <summary>
            <AlertCircle size={15} />
            {unresolved.length} locations need a quick check
          </summary>
          <p>
            Off-campus and online events are kept out of navigation. Assign a
            campus building only when appropriate.
          </p>
          {unresolved.slice(0, 30).map((e) => (
            <div key={e.id}>
              <strong>{e.title}</strong>
              <small>{e.locationText || "No location supplied"}</small>
              <select
                defaultValue=""
                aria-label={`Resolve ${e.title}`}
                onChange={(ev) => {
                  const r = resolveCampusLocation(ev.target.value);
                  if (r) {
                    onEvents([...events, { ...e, location: r }]);
                    setUnresolved((v) => v.filter((x) => x.id !== e.id));
                  }
                }}
              >
                <option value="">Choose campus building</option>
                {buildings.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.id} · {b.shortName}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </details>
      )}
      <div className="week-selector">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <button
            className={selectedDay === i ? "selected" : ""}
            aria-label={
              [
                "Sunday",
                "Monday",
                "Tuesday",
                "Wednesday",
                "Thursday",
                "Friday",
                "Saturday",
              ][i]
            }
            key={i}
            onClick={() => setSelectedDay(i)}
          >
            <span>{d}</span>
            <b>
              {new Date(at.getTime() + (i - at.getDay()) * 86400000).getDate()}
            </b>
          </button>
        ))}
      </div>
      {classes.some((c) => c.id.startsWith("demo")) && (
        <div className="sample-label">
          Sample classes{" "}
          <button
            onClick={() =>
              onClasses(classes.filter((c) => !c.id.startsWith("demo")))
            }
          >
            Clear sample
          </button>
        </div>
      )}
      <div className="section-head">
        <h2>{day.toLocaleDateString("en-CA", { weekday: "long" })}</h2>
        <span>{manual.length + importedDay.length} events</span>
      </div>
      {manual.length + importedDay.length === 0 && (
        <div className="empty-state">
          <CalendarDays size={30} />
          <h3>A little room in your day.</h3>
          <p>Connect a calendar or add your first class.</p>
        </div>
      )}
      {manual.map((c) => (
        <div className="agenda-item" key={c.id}>
          <div className="agenda-time">
            {c.start}
            <small>{c.end}</small>
          </div>
          <div>
            <strong>{c.title}</strong>
            <span>{resolveLocation(c.location)?.name || c.location}</span>
            <button
              className="inline-route"
              onClick={() => onRoute(c.location)}
            >
              Show route
              <ChevronRight size={14} />
            </button>
          </div>
          <button
            className="remove-event"
            aria-label={`Remove ${c.title}`}
            onClick={() => onClasses(classes.filter((x) => x.id !== c.id))}
          >
            <X size={15} />
          </button>
        </div>
      ))}
      {importedDay.map((e) => (
        <div className="agenda-item imported" key={e.id}>
          <div className="agenda-time">
            {displayTime(e.start)}
            <small>{e.allDay ? "All day" : displayTime(e.end)}</small>
          </div>
          <div>
            <strong>{e.title}</strong>
            <span>{e.location?.label || e.locationText}</span>
            <small className="source-tag">{e.source}</small>
            {e.location?.locationId && (
              <button
                className="inline-route"
                onClick={() => onRoute(e.location!.locationId)}
              >
                Show route
                <ChevronRight size={14} />
              </button>
            )}
          </div>
          <button
            className="remove-event"
            aria-label={`Remove ${e.title}`}
            onClick={() => onEvents(events.filter((x) => x.id !== e.id))}
          >
            <X size={15} />
          </button>
        </div>
      ))}
      <button className="add-dashed" onClick={() => setAdd(!add)}>
        <Plus size={17} />
        Add a class
      </button>
      {add && (
        <form className="class-inline-form" onSubmit={addClass}>
          <label>
            Course or event
            <input
              required
              placeholder="CS 135"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label>
            Room or building
            <input
              required
              placeholder="DC 1350"
              value={room}
              onChange={(e) => setRoom(e.target.value)}
            />
          </label>
          <div className="form-pair">
            <label>
              Start
              <input
                type="time"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </label>
            <label>
              End
              <input
                type="time"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </label>
          </div>
          <div className="weekday-picker">
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d, i) => (
              <button
                type="button"
                className={days.includes(i) ? "active" : ""}
                key={i}
                onClick={() =>
                  setDays((v) =>
                    v.includes(i) ? v.filter((x) => x !== i) : [...v, i],
                  )
                }
              >
                {d}
              </button>
            ))}
          </div>
          <button className="primary" type="submit">
            <Check size={17} />
            Save class
          </button>
        </form>
      )}
    </div>
  );
}
