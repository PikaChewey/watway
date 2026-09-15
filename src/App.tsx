import DemoPlayback from "./DemoPlayback";
import { presentation } from "./intelligence/presentation";
import AlgorithmPanel from "./AlgorithmPanel";
import { StudentStory, StudentWeek, StudentProfile } from "./StudentDemo";
import { DEMO_DAY, studentWeek, chapters, type DemoChapter } from "./intelligence/student-demo";
import TunnelDemo from "./TunnelDemo";
import pitchRouteData from "./data/tunnel-pitch-route.json";
import { entrances as physicalEntrances } from "./navigation/physicalModel";
import { tunnelStart, stairWells } from "./navigation/walkWorld";
import type { VisualMode } from "./visual/basemaps";
import { Satellite, Mountain } from "lucide-react";
import { useCampusSearch } from "./intelligence/useCampusSearch";
import {
  useState,
  useEffect,
  useRef,
  useMemo,
  lazy,
  Suspense,
  Component,
  type ReactNode,
} from "react";
import {
  Search,
  Navigation,
  MapPin,
  ChevronRight,
  ArrowRight,
  ArrowLeft,
  Plus,
  Minus,
  X,
  Clock,
  CalendarDays,
  Compass,
  Layers,
  Sun,
  CloudRain,
  CloudSnow,
  CloudFog,
  Moon,
  Footprints,
  PersonStanding,
  Box,
  Route as RouteIcon,
  LocateFixed,
  RotateCcw,
  Play,
  Pause,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ExternalLink,
  Info,
  Check,
  Bookmark,
  Building2,
  Coffee,
  BookOpen,
  Accessibility,
  TrainFront,
  Printer,
  GlassWater,
  Bike,
  Heart,
  Utensils,
  GraduationCap,
  Construction,
  PanelLeftClose,
  PanelLeftOpen,
  Keyboard,
  Wind,
  Droplets,
  RefreshCw,
  Link2,
  Activity,
  ChevronDown,
  SlidersHorizontal,
  ShieldCheck,
  TrendingUp,
  WifiOff,
  Maximize,
  Flag,
  LogIn,
  Bell,
  Map,
  Settings2,
  Volume2,
  VolumeX,
  Download,
} from "lucide-react";
import {
  buildings,
  buildingById,
  places,
  placeById,
  resolveLocation,
  categoryNames,
  sources,
  project,
  closure,
  findRoom,
} from "./data/campus";
import "./indoor";
import { dcRooms } from "./indoor";
import {
  computeRoute,
  minutes,
  profileLabels,
  routePoint,
  addLocation,
  graphStats,
} from "./routing";
import { searchCampus } from "./semantic";
import { useWeather, effectiveWeather, weatherDescription } from "./weather";
import { useCampusFeed } from "./intelligence/useCampusFeed";
import {
  reconcileEvents,
  resolveCampusLocation,
  resolveLocationId,
} from "./intelligence/locations";
import {
  watWayState,
  weeklyEvents,
  gapRecommendations,
  estimateFlow,
  buildingMinCut,
} from "./intelligence/state";
import type { CampusEvent, FacilityReading } from "./intelligence/types";
import type {
  RouteProfile,
  WeatherMode,
  ClassEvent,
  Point,
  Place,
  Route,
} from "./types";
import type { MapHandle, CameraMode } from "./ThreeMap";
import CalendarPanel from "./CalendarPanel";
const ThreeMap = lazy(() => import("./ThreeMap"));
function stored<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
}
const defaultClasses: ClassEvent[] = [
  {
    id: "demo-1",
    title: "CS 135 · Functional programming",
    location: "room-DC-1350",
    start: "11:30",
    end: "12:50",
    days: [1, 2, 3, 4, 5],
  },
  {
    id: "demo-2",
    title: "MATH 135 · Algebra",
    location: "room-MC-2065",
    start: "14:30",
    end: "15:20",
    days: [1, 2, 3, 4, 5],
  },
  {
    id: "demo-3",
    title: "Study at Davis",
    location: "poi-0",
    start: "16:00",
    end: "17:00",
    days: [1, 2, 3, 4, 5],
  },
];
const formatTime = (date: Date | string) =>
  new Date(date).toLocaleTimeString("en-CA", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Toronto",
  });
const iconFor = (cat: string) =>
  ({
    study: BookOpen,
    food: Coffee,
    washroom: Accessibility,
    printer: Printer,
    water: GlassWater,
    bike: Bike,
    transit: TrainFront,
    health: Heart,
    microwave: Utensils,
    room: GraduationCap,
    recreation: Activity,
  })[cat] || Building2;
function IconButton({
  icon: Icon,
  label,
  onClick,
  active = false,
}: {
  icon: any;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      className={`map-control ${active ? "active" : ""}`}
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      <Icon size={20} />
    </button>
  );
}
class SceneBoundary extends Component<
  { children: ReactNode },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <div className="map-error">
        <Box size={36} />
        <h2>3D view unavailable</h2>
        <p>Your campus cards and directions still work.</p>
        <button className="primary" onClick={() => location.reload()}>
          Reload the map
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}
export default function App() {
  const autoObservedScene = useRef<number | null>(null);
  const [autoWalkPending, setAutoWalkPending] = useState(false);
  const [autoIndex, setAutoIndex] = useState<number | null>(null);
  const [autoPaused, setAutoPaused] = useState(false);
  const [autoElapsed, setAutoElapsed] = useState(0);
  const [engineOpen, setEngineOpen] = useState(false);
  const [demoStudentActive, setDemoStudentActive] = useState(true);
  const [studentProfileOpen, setStudentProfileOpen] = useState(false);
  const mayaEvents = useMemo(studentWeek, []);
  const [tunnelFrame, setTunnelFrame] = useState<"demo" | "network">("demo");
  const [pitchActive, setPitchActive] = useState(false),
    [pendingPitch, setPendingPitch] = useState<"guided" | "manual" | null>(
      null,
    );
  const [visualMode, setVisualMode] = useState<VisualMode>("realistic"),
    [imageryStatus, setImageryStatus] = useState("Loading imagery…");
  const [tab, setTab] = useState<"home" | "explore" | "day" | "campus">("home"),
    [sheet, setSheet] = useState<"peek" | "half" | "full">("half"),
    [desktopHidden, setDesktopHidden] = useState(false);
  const [query, setQuery] = useState(""),
    [searchOpen, setSearchOpen] = useState(false),
    [category, setCategory] = useState("all"),
    [selected, setSelected] = useState<string | null>(null),
    [selectedPlace, setSelectedPlace] = useState<string | null>(null);
  const [from, setFrom] = useState("REV"),
    [to, setTo] = useState("room-DC-1350"),
    [profile, setProfile] = useState<RouteProfile>(() =>
      "weather",
    ),
    [routeVisible, setRouteVisible] = useState(false);
  const [mode, setMode] = useState<CameraMode>("orbit"),
    [indoor, setIndoor] = useState(false),
    [floor, setFloor] = useState(1),
    [playing, setPlaying] = useState(false),
    [progress, setProgress] = useState(0),
    [speed, setSpeed] = useState(1),
    [voice, setVoice] = useState(false),
    [position, setPosition] = useState<Point>([0, 0, 0]);
  const [customClasses, setClasses] = useState<ClassEvent[]>(() =>
      stored("watway-classes", defaultClasses),
    ),
    [calendarEvents, setCalendarEvents] = useState<CampusEvent[]>(() =>
      stored("watway-personal-events", []),
    ),
    [importedEvents, setImportedEvents] = useState<CampusEvent[]>(() =>
      stored("watway-imported-events", []),
    ),
    [saved, setSaved] = useState<string[]>(() => stored("watway-saved", []));
  const [weatherMode, setWeatherMode] = useState<WeatherMode>("snow"),
    [nightOverride, setNightOverride] = useState<boolean | null>(null),
    [season, setSeason] = useState("winter"),
    [labels, setLabels] = useState(true),
    [paths, setPaths] = useState(true),
    [connections, setConnections] = useState(true),
    [crowds, setCrowds] = useState(true),
    [quality, setQuality] = useState<"auto" | "high" | "battery">(() =>
      stored("watway-quality", "auto"),
    );
  const [layersOpen, setLayersOpen] = useState(false),
    [weatherOpen, setWeatherOpen] = useState(false),
    [timelineOpen, setTimelineOpen] = useState(false),
    [about, setAbout] = useState(false),
    [toast, setToast] = useState(""),
    [ready, setReady] = useState(false),
    [offline, setOffline] = useState(!navigator.onLine),
    [originEdit, setOriginEdit] = useState(false),
    [eventLink, setEventLink] = useState(""),
    [eventLoading, setEventLoading] = useState(false);
  const [now, setNow] = useState(new Date()),
    [scrub, setScrub] = useState<number | null>(545),
    [mobile, setMobile] = useState(window.innerWidth < 760);
  const map = useRef<MapHandle>(null),
    search = useRef<HTMLInputElement>(null),
    body = useRef<HTMLDivElement>(null),
    drag = useRef(0),
    lastSpoken = useRef(-1);
  const weather = useWeather();
  const {
    feed,
    loading: feedLoading,
    error: feedError,
    refresh,
    liveEnabled,
    setLiveEnabled,
  } = useCampusFeed(demoStudentActive ? DEMO_DAY : undefined);
  const classes = demoStudentActive ? [] : customClasses;
  const at = useMemo(() => {
    const d = new Date(demoStudentActive ? DEMO_DAY : now);
    if (scrub !== null) d.setHours(Math.floor(scrub / 60), scrub % 60, 0, 0);
    return d;
  }, [now, scrub, demoStudentActive]);
  const effective = useMemo(() => {
    const base = effectiveWeather(weather, weatherMode);
    if (scrub === null || weatherMode !== "live") return base;
    const forecast = weather.hourly.find(
      (h) =>
        h.time.slice(0, 13) ===
        `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(at.getDate()).padStart(2, "0")}T${String(at.getHours()).padStart(2, "0")}`,
    );
    return forecast
      ? {
          ...base,
          temperature: forecast.temperature,
          code: forecast.code,
          precipitation: forecast.rain > 50 ? 1 : 0,
        }
      : base;
  }, [weather, weatherMode, scrub, at]);
  const publicEvents = useMemo(
    () =>
      reconcileEvents([...(feed?.events || []), ...importedEvents], {
        now: at,
        days: 30,
      }),
    [feed, importedEvents, at],
  );
  const personal = useMemo(
    () => demoStudentActive ? mayaEvents : [
      ...weeklyEvents(classes, at),
      ...reconcileEvents(calendarEvents, { personal: true, now: at, days: 45 })
        .events,
    ],
    [classes, calendarEvents, at, demoStudentActive, mayaEvents],
  );
  const campus = useMemo(
    () =>
      watWayState(from, at, personal, feed, effective, profile, scrub === null),
    [from, at, personal, feed, effective, profile, scrub],
  );
  const flow = useMemo(
    () => estimateFlow(at, effective),
    [
      at.getDay(),
      at.getHours(),
      Math.floor(at.getMinutes() / 5),
      effective.precipitation > 0,
      effective.code,
    ],
  );
  const route = useMemo(
    () =>
      pitchActive
        ? (pitchRouteData as unknown as Route)
        : computeRoute(from, to, profile, effective, at.getHours(), {
            at,
            edgeDelays: flow.edgeDelays,
          }),
    [from, to, profile, effective, at, flow, pitchActive],
  );
  const nextRoute = useMemo(
    () =>
      campus.nextEvent?.location?.locationId
        ? computeRoute(
            from,
            campus.nextEvent.location.locationId,
            profile,
            effective,
            at.getHours(),
            { at, edgeDelays: flow.edgeDelays },
          )
        : null,
    [from, campus.nextEvent?.id, effective, profile, at, flow],
  );
  const suggestions = useMemo(
    () => gapRecommendations(campus, effective),
    [campus, effective],
  );
  const next = campus.nextEvent;
  const nextLeave =
    next && nextRoute
      ? new Date(Date.parse(next.start) - nextRoute.seconds * 1000 - 180000)
      : undefined;
  const leaveMinutes = nextLeave
    ? Math.floor((nextLeave.getTime() - at.getTime()) / 60000)
    : 0;
  const happening = next && Date.parse(next.start) <= at.getTime();
  const selectedBuilding = selected ? buildingById[selected] : null;
  const selectedPOI = selectedPlace ? placeById[selectedPlace] : null;
  const results = useCampusSearch(query);
  const night = nightOverride ?? (at.getHours() < 7 || at.getHours() >= 19);
  const WeatherIcon =
    effective.code >= 71 && effective.code <= 77
      ? CloudSnow
      : effective.precipitation > 0
        ? CloudRain
        : effective.code === 45
          ? CloudFog
          : night
            ? Moon
            : Sun;
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    const network = () => setOffline(!navigator.onLine);
    const resume = () => {
      if (document.visibilityState === "visible") setNow(new Date());
    };
    const size = () => setMobile(window.innerWidth < 760);
    window.addEventListener("online", network);
    window.addEventListener("offline", network);
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("resize", size);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", network);
      window.removeEventListener("offline", network);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("resize", size);
    };
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("watway-classes", JSON.stringify(customClasses));
      localStorage.setItem(
        "watway-personal-events",
        JSON.stringify(calendarEvents),
      );
      localStorage.setItem(
        "watway-imported-events",
        JSON.stringify(importedEvents),
      );
      localStorage.setItem("watway-origin", JSON.stringify(from));
      localStorage.setItem("watway-profile", JSON.stringify(profile));
      localStorage.setItem("watway-saved", JSON.stringify(saved));
      localStorage.setItem("watway-quality", JSON.stringify(quality));
    } catch {}
  }, [customClasses, calendarEvents, importedEvents, from, profile, saved, quality]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 6000);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    body.current?.scrollTo({ top: 0 });
  }, [tab, selected, routeVisible, searchOpen]);
  useEffect(() => {
    if (!playing || !route || route.physical) return;
    let last = performance.now(),
      frame = 0;
    const tick = (time: number) => {
      const dt = Math.min((time - last) / 1000, 0.1);
      last = time;
      setProgress((p) =>
        Math.min(1, p + (dt * speed * 10) / Math.max(route.seconds, 1)),
      );
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, route, speed]);
  useEffect(() => {
    if (progress >= 1 && playing) {
      setPlaying(false);
      setToast("Arrived. Your route preview is complete.");
    }
    if (!playing || !route) return;
    const pos = routePoint(route, progress),
      e = route.edges[pos.edgeIndex],
      n = route.nodes[pos.edgeIndex + 1];
    if (n?.building && e?.kind !== "outdoor") {
      setSelected(n.building);
      setFloor(n.floor ?? 1);
      setIndoor(true);
    } else setIndoor(false);
    const step = route.steps.findIndex(
      (s) => pos.edgeIndex >= s.edgeStart && pos.edgeIndex <= s.edgeEnd,
    );
    if (
      voice &&
      step !== lastSpoken.current &&
      step >= 0 &&
      "speechSynthesis" in window
    ) {
      speechSynthesis.cancel();
      speechSynthesis.speak(
        new SpeechSynthesisUtterance(route.steps[step].title),
      );
      lastSpoken.current = step;
    }
  }, [progress, playing, route, voice]);
  useEffect(() => {
    setProgress(0);
    setPlaying(false);
  }, [from, to, profile]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAbout(false);
        setLayersOpen(false);
        setWeatherOpen(false);
        setSearchOpen(false);
        setTimelineOpen(false);
        setPlaying(false);
        if (mode === "first" || mode === "third") setMode("orbit");
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
        setSheet("full");
        search.current?.focus();
      }
      if ((e.target as HTMLElement).matches("input,textarea,select")) return;
      if (e.key === "1") setMode("map");
      if (e.key === "2") setMode("third");
      if (e.key === "3") setMode("first");
      if (e.key.toLowerCase() === "m")
        setMode((m) => (m === "map" ? "orbit" : "map"));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode]);
  const switchTab = (v: typeof tab) => {
    setTab(v);
    setSelected(null);
    setSelectedPlace(null);
    setRouteVisible(false);
    setPlaying(false);
    setSearchOpen(false);
    setSheet("half");
    setDesktopHidden(false);
  };
  const selectBuilding = (id: string, poi?: string) => {
    setSelected(id);
    setSelectedPlace(poi || null);
    setTab("explore");
    setRouteVisible(false);
    setSearchOpen(false);
    setQuery("");
    setSheet("half");
    setIndoor(false);
    setFloor(poi ? placeById[poi]?.floor || 1 : 1);
    map.current?.focus(buildingById[id].center, 170);
  };
  const startRoute = (destination: string, origin = from) => {
    setPitchActive(false);
    const dest = resolveLocationId(destination);
    if (!dest)
      return setToast(
        "This venue needs a building or room before it can be routed.",
      );
    setFrom(origin);
    setTo(destination);
    setRouteVisible(true);
    setSearchOpen(false);
    setQuery("");
    setSelected(dest.building);
    setIndoor(false);
    setProgress(0);
    setPlaying(false);
    setMode("orbit");
    setSheet("half");
    setDesktopHidden(false);
    const source = resolveLocation(origin);
    map.current?.focus(
      source
        ? [
            (source.point[0] + dest.point[0]) / 2,
            0,
            (source.point[2] + dest.point[2]) / 2,
          ]
        : dest.point,
      Math.max(
        230,
        source
          ? Math.hypot(
              source.point[0] - dest.point[0],
              source.point[2] - dest.point[2],
            )
          : 280,
      ),
    );
  };
  const chooseChapter = (chapter: DemoChapter) => {
    setDemoStudentActive(true); setLiveEnabled(false); setScrub(chapter.time); setFrom(chapter.from);
    setPitchActive(false); setPendingPitch(null); setRouteVisible(false); setPlaying(false);
    setMode("orbit"); setIndoor(false); setVisualMode("realistic"); setTab("home");
    setSelected(null); setSelectedPlace(null); setSheet("half"); setDesktopHidden(false);
    setWeatherMode("snow"); setSeason("winter"); setProfile("weather");
    body.current?.scrollTo({top:0,behavior:"smooth"});
    const place = resolveLocationId(chapter.from); if (place) map.current?.focus(place.point, 240);
  };
  const startPitch = (choice: "guided" | "manual") => {
    setPitchActive(true);
    if(demoStudentActive) setScrub(1083);
    setFrom("SCH");
    setTo("AL");
    setProfile("indoor");
    setRouteVisible(true);
    setSearchOpen(false);
    setVisualMode("realistic");
    setSelected("SCH");
    setIndoor(false);
    setMode("first");
    setSheet("peek");
    setProgress(0);
    setSpeed(3);
    setWeatherMode("snow");
    setPendingPitch(choice);
  };
  useEffect(() => {
    if (!pendingPitch || !pitchActive || !route || !map.current) return;
    map.current.rehearse(route);
    setPlaying(pendingPitch === "guided" && !(autoIndex !== null && autoPaused));
    setPendingPitch(null);
  }, [pendingPitch, pitchActive, route]);
  const stopFullDemo = () => {
    setAutoWalkPending(false); setAutoIndex(null); setAutoPaused(false); setEngineOpen(false); setStudentProfileOpen(false);
    chooseChapter(chapters[0]);
  };
  const advanceFullDemo = () => {
    if (autoIndex === presentation.length - 1) { stopFullDemo(); setToast("Demo complete. Ready to present again."); }
    else {setAutoIndex(i => i === null ? 0 : i + 1); setAutoElapsed(0);}
  };
  useEffect(() => {
    if (autoIndex === null) return;
    const scene = presentation[autoIndex];
    setAutoWalkPending(false); setAutoElapsed(0); setEngineOpen(false); setStudentProfileOpen(false); setPlaying(false);
    if(scene.kind === "chapter") chooseChapter(chapters[scene.chapter]);
    else if(scene.kind === "profile") {chooseChapter(chapters[0]);setStudentProfileOpen(true);}
    else if(scene.kind === "week") {chooseChapter(chapters[0]);setTab("day");setSheet("full");}
    else if(scene.kind === "engine") {
      chooseChapter(chapters[0]); setEngineOpen(true);
      if('dry' in scene) {setWeatherMode("sun");setSeason("summer");}
      if(scene.stage === 3) setScrub(775);
    } else if(scene.kind === "interior") {
      chooseChapter(chapters[0]); startRoute("room-MC-4020","MC"); setSpeed(3); setProgress(0);setAutoWalkPending(true);
    } else if(scene.kind === "walk") {chooseChapter(chapters[6]);startPitch("guided");}
  }, [autoIndex]);
  useEffect(() => {
    if(!autoWalkPending || !routeVisible || !route || !ready) return;
    if(route.physical && map.current) {map.current.rehearse(route);setMode("first");setSheet("peek");setPlaying(!autoPaused);}
    else {setAutoPaused(true);setToast("Classroom route preview unavailable. Use Next scene to continue.");}
    setAutoWalkPending(false);
  },[autoWalkPending,routeVisible,route,ready,autoPaused]);
  useEffect(() => {
    if(autoIndex === null || autoPaused || !ready) return;
    const timer=setInterval(()=>{if(document.visibilityState === "visible")setAutoElapsed(t=>t+.25);},250);
    return ()=>clearInterval(timer);
  }, [autoIndex,autoPaused,ready]);
  useEffect(() => {
    if(autoObservedScene.current !== autoIndex){autoObservedScene.current=autoIndex;return;}
    if(autoIndex === null || autoPaused) return;
    const scene=presentation[autoIndex];
    if(scene.kind === "walk" || scene.kind === "interior") {
      if(progress >= 1 && autoElapsed > 3) advanceFullDemo();
      else if(autoElapsed > 100) {setAutoPaused(true);setPlaying(false);setToast("Walk paused. Resume or skip to the next scene.");}
    } else if(autoElapsed >= scene.seconds) advanceFullDemo();
  },[autoIndex,autoPaused,autoElapsed,progress]);
  const toggleFullDemo = () => {
    setAutoPaused(!autoPaused);
    if(autoIndex !== null && ["walk","interior"].includes(presentation[autoIndex].kind))setPlaying(autoPaused);
  };
  const walk = (preview = false, m: CameraMode = "first") => {
    setVisualMode("realistic");
    setMode(preview ? "first" : m);
    if (mobile) setSheet("peek");
    if (preview) {
      setProgress(0);
      setPlaying(true);
      if (route?.physical) map.current?.rehearse(route);
    } else setPlaying(false);
  };
  const walkNetwork = (kind: "tunnel" | "stairs") => {
    const building = kind === "stairs" ? "MC" : "STC";
    const entry = physicalEntrances.find(
      (e) => e.building === building && e.floor === 1,
    );
    if (entry)
      startRoute(
        kind === "stairs" ? "room-MC-4020" : "room-STC-0010",
        entry.id,
      );
  };
  const enterIndoor = () => {
    setVisualMode("realistic");
    const id = selected || "DC";
    setSelected(id);
    setIndoor(true);
    setFloor(1);
    map.current?.focus(buildingById[id].center, 125);
    setSheet("peek");
    setMode("orbit");
  };
  const locate = () => {
    setToast("Finding your campus location…");
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        const p = project(pos.coords.latitude, pos.coords.longitude);
        if (Math.hypot(p[0], p[2]) > 2200)
          return setToast(
            "You’re outside the mapped campus. Choose a starting building.",
          );
        addLocation("my-location", p);
        setFrom("my-location");
        map.current?.focus(p, 150);
        setToast(`Location found · ±${Math.round(pos.coords.accuracy)} m`);
      },
      () =>
        setToast(
          "Location unavailable. Choose your starting building instead.",
        ),
      { timeout: 10000, enableHighAccuracy: true },
    );
  };
  const addEventLink = async () => {
    if (!eventLink.trim()) return;
    setEventLoading(true);
    try {
      const r = await fetch(
          `/api/campus/event?url=${encodeURIComponent(eventLink.trim())}`,
          { signal: AbortSignal.timeout(18000) },
        ),
        data = await r.json();
      if (!r.ok) throw Error(data.error);
      const accepted = reconcileEvents(data.events, { now });
      if (!accepted.events.length)
        throw Error(
          "This event is off campus, has no confirmed campus venue, or is outside the upcoming window.",
        );
      setImportedEvents(
        (v) => reconcileEvents([...v, ...accepted.events], { now }).events,
      );
      setEventLink("");
      setToast(`${accepted.events.length} campus event added`);
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Event could not be imported");
    } finally {
      setEventLoading(false);
    }
  };
  const displayedEvents = publicEvents.events
    .filter((e) => Date.parse(e.end) > at.getTime())
    .slice(0, 10);
  const filteredPlaces =
    category === "all"
      ? places.filter((p) => saved.includes(p.id))
      : places.filter((p) => p.category === category);
  const nav = [
    ["home", Navigation, "For you"],
    ["explore", Compass, "Explore"],
    ["day", CalendarDays, "My day"],
    ["campus", Activity, "Campus"],
  ] as const;
  return (
    <div
      className={`watway ${autoIndex !== null ? `presenting ${autoPaused ? "presentation-paused" : ""}` : ""} ${demoStudentActive && tab === "home" && !routeVisible ? "demo-home" : ""} visual-${visualMode} ${night ? "night" : ""} sheet-${sheet} ${desktopHidden ? "panel-hidden" : ""} ${mode === "first" || mode === "third" ? "walking" : ""}`}
    >
      {autoIndex !== null && <DemoPlayback index={autoIndex} paused={autoPaused} elapsed={autoElapsed} walkProgress={progress} onPause={toggleFullDemo} onNext={advanceFullDemo} onRestart={()=>{setAutoIndex(null);setAutoPaused(false);setTimeout(()=>setAutoIndex(0),0);}} onStop={stopFullDemo}/>}
      {engineOpen && <AlgorithmPanel presentationStage={autoIndex !== null && presentation[autoIndex].kind === "engine" ? (presentation[autoIndex] as {stage:number}).stage : undefined} route={routeVisible ? route : nextRoute} flow={flow} weather={effective} at={at} frozen={pitchActive && routeVisible} onClose={() => setEngineOpen(false)} onWeather={(snow) => {setWeatherMode(snow ? "snow" : "sun"); setSeason(snow ? "winter" : "summer"); setProfile("weather");}} onTraffic={(busy) => setScrub(busy ? 775 : 760)}/>}
      {studentProfileOpen && <StudentProfile onClose={() => setStudentProfileOpen(false)} onPersonal={() => {setDemoStudentActive(false); setStudentProfileOpen(false); setScrub(null); setFrom("SLC"); switchTab("day"); setVisualMode("realistic"); setMode("orbit"); setWeatherMode("live");}}/>}
      <header className="app-header">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            switchTab("home");
            setIndoor(false);
            setMode("orbit");
            map.current?.reset();
          }}
        >
          <span className="brand-mark">
            W<i />
          </span>
          <span>
            WAT<span>Way</span>
            <small>YOUR CAMPUS, IN SYNC</small>
          </span>
        </a>
        <div className="header-campus">
          <span className="status-dot" />
          University of Waterloo <ChevronDown size={13} />
        </div>
        <div className="header-actions">
          <button className="student-avatar header-student" aria-label="Open Maya’s demo profile" onClick={() => setStudentProfileOpen(true)}>MP</button>
          {offline && (
            <span className="offline-badge">
              <WifiOff size={14} />
              Offline
            </span>
          )}
          <button
            className="header-weather"
            aria-label="Campus weather"
            onClick={() => {
              setWeatherOpen(!weatherOpen);
              setLayersOpen(false);
            }}
          >
            <WeatherIcon size={19} />
            <b>{Math.round(effective.temperature)}°</b>
            <span>
              {weatherMode !== "live"
                ? "Preview"
                : weather.status === "live"
                  ? "Feels like " + Math.round(weather.apparent) + "°"
                  : "Weather cached"}
            </span>
          </button>
          <button
            className={`time-chip ${scrub !== null ? "previewing" : ""}`}
            onClick={() => setTimelineOpen(!timelineOpen)}
          >
            <Clock size={14} />
            {scrub === null
              ? feed?.mode === "demo"
                ? "Demo campus"
                : "Live campus"
              : formatTime(at)}
            <ChevronDown size={12} />
          </button>
          <button
            className="header-info"
            aria-label="Data sources and accuracy"
            onClick={() => setAbout(true)}
          >
            <Info size={19} />
          </button>
        </div>
      </header>
      <main className="campus-map" aria-label="Interactive campus map">
        <SceneBoundary>
          <Suspense
            fallback={
              <div className="map-loading">
                <span className="loading-mark">W</span>
                <h2>Finding your campus.</h2>
                <p>Buildings, pathways, and your day—coming together.</p>
              </div>
            }
          >
            <ThreeMap
              ref={map}
              selected={selected}
              onSelect={selectBuilding}
              mode={mode}
              route={routeVisible ? route : autoIndex !== null ? nextRoute : null}
              progress={progress}
              playing={playing}
              indoor={indoor}
              floor={floor}
              weather={effective}
              night={night}
              season={season}
              showPaths={paths}
              showLabels={labels}
              showConnections={connections}
              showCrowds={crowds}
              studentLocation={demoStudentActive ? resolveLocation(from) : null}
              onReady={() => setReady(true)}
              onPosition={setPosition}
              traversalSpeed={speed}
              onTraversalProgress={(p, blocked, done) => {
                setProgress(p);
                if (blocked) {
                  if(autoIndex !== null) setAutoPaused(true);
                  setPlaying(false);
                  setToast(
                    "Stopped at a physical obstruction. You can take over with WASD.",
                  );
                }
                if (done) {
                  setPlaying(false);
                  setToast("Arrived at the destination door.");
                }
              }}
              onWalkContext={(building, floor) => {
                setSelected(building);
                setFloor(floor);
                setIndoor(true);
              }}
              visualMode={visualMode}
              onImageryStatus={setImageryStatus}
              quality={quality}
              timeOfDay={at.getHours() + at.getMinutes() / 60}
              flowScale={campus.flowScale}
              viewportInset={
                mobile && mode !== "first" && mode !== "third"
                  ? sheet === "peek"
                    ? 0.05
                    : sheet === "full"
                      ? 0.05
                      : 0.18
                  : 0
              }
            />
          </Suspense>
        </SceneBoundary>
        <div className="map-search">
          <Search size={19} />
          <input
            ref={search}
            aria-label="Search campus"
            value={query}
            onFocus={() => {
              setSearchOpen(true);
              setSheet("full");
              setDesktopHidden(false);
            }}
            onChange={(e) => {
              setQuery(e.target.value);
              setSearchOpen(true);
            }}
            placeholder="Where on campus?"
          />
          {query ? (
            <button aria-label="Clear search" onClick={() => setQuery("")}>
              <X size={17} />
            </button>
          ) : (
            <span className="search-shortcut">⌘ K</span>
          )}
        </div>
        <div className="world-mode-switch" aria-label="Map appearance">
          {[
            ["realistic", Box, "Campus 3D"],
            ["satellite", Satellite, "Satellite"],
            ["terrain", Mountain, "Terrain"],
            ["tunnels", RouteIcon, "Tunnels"],
          ].map(([id, I, label]) => {
            const Icon = I as any;
            return (
              <button
                aria-label={label as string}
                className={visualMode === id ? "active" : ""}
                key={id as string}
                onClick={() => {
                  setVisualMode(id as VisualMode);
                  if (id === "tunnels") {
                    setRouteVisible(false);
                    setSelected(null);
                    setProgress(0);
                    setPitchActive(false);
                    setSheet("half");
                  }
                  setMode(id === "realistic" ? "orbit" : "map");
                  setIndoor(false);
                  setPlaying(false);
                }}
              >
                <Icon size={15} />
                <span>{label as string}</span>
              </button>
            );
          })}
        </div>
        <button className="engine-trigger" onClick={() => setEngineOpen(true)} aria-label="See algorithms in action"><Activity size={15}/><strong>A*</strong><span>·</span><strong>{weatherMode === "snow" ? "Winter" : "Weather"}</strong><span>·</span><strong>Max-flow</strong><ChevronRight size={15}/></button>
        <div className="map-status-pill">
          <span className="status-dot" />
          {indoor
            ? `${selected} · ${floor === 0 ? "Basement" : `Floor ${floor}`}`
            : scrub !== null
              ? "TIME PREVIEW"
              : "MAIN CAMPUS"}
          <span>
            {indoor
              ? selected === "DC" && floor === 1
                ? "Mapped interior"
                : "Partial interior"
              : campus.congestionLevel}
          </span>
        </div>
        {visualMode === "tunnels" && (
          <div className="tunnel-map-title">
            <span>WATERLOO UNDERGROUND</span>
            <strong>
              {tunnelFrame === "demo"
                ? "The arts tunnel, revealed."
                : "The underground network."}
            </strong>
            <small>Cutaway mesh · mapped connections</small>
            <div className="tunnel-frame-switch">
              <button
                className={tunnelFrame === "demo" ? "active" : ""}
                onClick={() => {
                  setTunnelFrame("demo");
                  map.current?.focus([225, -1, 265], 185);
                }}
              >
                Featured route
              </button>
              <button
                className={tunnelFrame === "network" ? "active" : ""}
                onClick={() => {
                  setTunnelFrame("network");
                  map.current?.focus([150, -1, 115], 450);
                }}
              >
                Whole network
              </button>
            </div>
          </div>
        )}
        {visualMode === "tunnels" && (
          <details className="scene-reference">
            <summary>Real campus reference</summary>
            <img
              loading="lazy"
              src="/references/sch-al-tunnel.jpeg"
              alt="Actual orange and yellow SCH–AL tunnel at Waterloo"
            />
            <p>SCH–AL tunnel · University of Waterloo</p>
            <a
              href="https://uwaterloo.ca/news/mathematics/wat-connects-us"
              target="_blank"
              rel="noreferrer"
            >
              View original photograph
            </a>
          </details>
        )}
        <div className="map-tools">
          <button
            className="compass-control"
            aria-label="Rotate map"
            onClick={() => map.current?.rotate()}
          >
            <b>N</b>
            <Navigation size={21} fill="currentColor" />
          </button>
          <div className="zoom-stack">
            <IconButton
              icon={Plus}
              label="Zoom in"
              onClick={() => map.current?.zoom(0.8)}
            />
            <IconButton
              icon={Minus}
              label="Zoom out"
              onClick={() => map.current?.zoom(1.25)}
            />
          </div>
          <IconButton icon={LocateFixed} label="My location" onClick={locate} />
          <IconButton
            icon={Layers}
            label="Map layers"
            active={layersOpen}
            onClick={() => {
              setLayersOpen(!layersOpen);
              setWeatherOpen(false);
            }}
          />
          <IconButton
            icon={RotateCcw}
            label="Reset map"
            onClick={() => {
              setMode("orbit");
              setIndoor(false);
              map.current?.reset();
            }}
          />
        </div>
        {indoor && (
          <div className="floor-picker">
            <span>FLOOR</span>
            {Array.from(
              { length: Math.min(selectedBuilding?.floors || 3, 10) + 1 },
              (_, i) => i,
            )
              .reverse()
              .map((f) => (
                <button
                  className={floor === f ? "active" : ""}
                  key={f}
                  onClick={() => {
                    setPlaying(false);
                    setMode("orbit");
                    setFloor(f);
                    map.current?.focus(
                      [
                        selectedBuilding?.center[0] || 0,
                        (f - 1) * 3.8,
                        selectedBuilding?.center[2] || 0,
                      ],
                      125,
                    );
                  }}
                >
                  {f === 0 ? "B" : f}
                </button>
              ))}
          </div>
        )}
        {visualMode === "realistic" && mode !== "first" && mode !== "third" && (
          <div className="walk-experiences">
            <button
              onClick={() => {
                setVisualMode("tunnels");
                setMode("map");
                setRouteVisible(false);
                setSelected(null);
                setIndoor(false);
                setPlaying(false);
                setSheet("half");
              }}
            >
              <LogIn size={16} />
              Tunnel demo
            </button>
            <button onClick={() => walkNetwork("stairs")}>
              <Footprints size={16} />
              MC 4020
            </button>
          </div>
        )}
        <div className="map-view-actions">
          <button
            className={`indoor-toggle ${indoor ? "active" : ""}`}
            onClick={() => {
              if (indoor) {
                setIndoor(false);
                setMode("orbit");
                map.current?.reset();
              } else enterIndoor();
            }}
          >
            <Layers size={17} />
            <span>{indoor ? "Outside" : "Go inside"}</span>
          </button>
          <div className="camera-switch" aria-label="Camera modes">
            {[
              ["map", Map, "Map"],
              ["orbit", Box, "3D"],
              ["third", Footprints, "Follow"],
              ["first", PersonStanding, "Walk"],
            ].map(([id, I, label]) => {
              const Icon = I as any;
              return (
                <button
                  aria-label={label as string}
                  className={mode === id ? "active" : ""}
                  key={id as string}
                  onClick={() => {
                    if (
                      (id === "first" || id === "third") &&
                      visualMode === "tunnels"
                    ) {
                      startPitch("manual");
                      if (id === "third") setMode("third");
                    } else if (id === "first" || id === "third")
                      walk(false, id as CameraMode);
                    else setMode(id as CameraMode);
                  }}
                >
                  <Icon size={17} />
                  <span>{label as string}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="imagery-status">
          {(visualMode === "satellite" || visualMode === "terrain") && imageryStatus !== "Imagery ready" && (
            <span>{imageryStatus}</span>
          )}
        </div>
        <div className="map-credit">
          <a
            href="https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9"
            target="_blank"
            rel="noreferrer"
          >
            {visualMode === "terrain"
              ? "Basemap © Esri and contributors"
              : "Imagery © Esri · Vantor · Earthstar"}
          </a>
          <span>·</span>
          <a href={sources.map} target="_blank" rel="noreferrer">
            © OpenStreetMap
          </a>
          <span>·</span>
          <button onClick={() => setAbout(true)}>Data & accuracy</button>
        </div>
        {timelineOpen && (
          <div className="time-scrubber">
            <div>
              <span>
                <Clock size={16} />
                {scrub === null ? "Right now" : formatTime(at)}
              </span>
              <button
                onClick={() => {
                  setScrub(demoStudentActive ? 545 : null);
                  setTimelineOpen(false);
                }}
              >
                {demoStudentActive ? "Reset demo time" : "Back to live"}
                <X size={14} />
              </button>
            </div>
            <input
              aria-label="Campus time preview"
              type="range"
              min={360}
              max={1380}
              step={5}
              value={scrub ?? now.getHours() * 60 + now.getMinutes()}
              onChange={(e) => setScrub(Number(e.target.value))}
            />
            <div className="time-marks">
              <span>6 AM</span>
              <span>Noon</span>
              <span>6 PM</span>
              <span>11 PM</span>
            </div>
            <p>
              {campus.congestionLevel} · routes, predicted activity, and
              lighting follow this time.
            </p>
          </div>
        )}
        {layersOpen && (
          <div className="map-popover">
            <div className="popover-title">
              <h3>Your map</h3>
              <button
                aria-label="Close layers"
                onClick={() => setLayersOpen(false)}
              >
                <X size={18} />
              </button>
            </div>
            {[
              ["Building labels", labels, setLabels],
              ["Walking paths", paths, setPaths],
              ["Bridges & tunnels", connections, setConnections],
              ["Predicted campus activity", crowds, setCrowds],
            ].map(([label, value, fn]) => (
              <label className="toggle-row" key={label as string}>
                <span>{label as string}</span>
                <input
                  type="checkbox"
                  checked={value as boolean}
                  onChange={(e) => (fn as any)(e.target.checked)}
                />
                <i />
              </label>
            ))}
            <label className="toggle-row">
              <span>Night view</span>
              <input
                type="checkbox"
                checked={night}
                onChange={(e) => setNightOverride(e.target.checked)}
              />
              <i />
            </label>
            <label className="setting-row">
              Season
              <select
                value={season}
                onChange={(e) => setSeason(e.target.value)}
              >
                <option value="spring">Spring</option>
                <option value="summer">Summer</option>
                <option value="autumn">Autumn</option>
                <option value="winter">Winter</option>
              </select>
            </label>
            <label className="setting-row">
              Quality
              <select
                value={quality}
                onChange={(e) => setQuality(e.target.value as any)}
              >
                <option value="auto">Adaptive</option>
                <option value="high">High detail</option>
                <option value="battery">Battery saver</option>
              </select>
            </label>
            <p className="micro-copy">
              Activity is simulated from campus movement patterns. Gyms show
              published occupancy in Campus.
            </p>
          </div>
        )}
        {weatherOpen && (
          <div className="map-popover weather-popover">
            <div className="popover-title">
              <h3>Campus weather</h3>
              <button
                aria-label="Close weather"
                onClick={() => setWeatherOpen(false)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="weather-display">
              <WeatherIcon size={40} />
              <strong>{Math.round(effective.temperature)}°</strong>
              <span>
                {weatherDescription(effective.code)}
                <small>Feels like {Math.round(effective.apparent)}°</small>
              </span>
            </div>
            <div className="weather-numbers">
              <span>
                <Wind size={15} />
                {Math.round(effective.wind)} km/h
              </span>
              <span>
                <Droplets size={15} />
                {effective.precipitation} mm
              </span>
            </div>
            <div className="hourly-weather">
              {weather.hourly.slice(0, 5).map((h) => (
                <div key={h.time}>
                  <small>{h.time.slice(11, 16)}</small>
                  <b>{Math.round(h.temperature)}°</b>
                  <span>{h.rain}%</span>
                </div>
              ))}
            </div>
            <p className="section-eyebrow">PREVIEW CONDITIONS</p>
            <div className="weather-presets">
              {[
                ["live", "Live", LocateFixed],
                ["sun", "Sun", Sun],
                ["rain", "Rain", CloudRain],
                ["snow", "Snow", CloudSnow],
                ["fog", "Fog", CloudFog],
              ].map(([id, label, I]) => {
                const Icon = I as any;
                return (
                  <button
                    className={weatherMode === id ? "active" : ""}
                    key={id as string}
                    onClick={() => setWeatherMode(id as WeatherMode)}
                  >
                    <Icon size={18} />
                    {label as string}
                  </button>
                );
              })}
            </div>
            <p className="micro-copy">
              {weatherMode === "live"
                ? weather.status === "live"
                  ? `Open-Meteo · updated ${formatTime(weather.fetchedAt)}`
                  : "Cached or sample conditions; live weather unavailable."
                : "Simulated conditions change weather-aware route choices."}
            </p>
          </div>
        )}
        {(mode === "first" || mode === "third") && (
          <>
            <div className="walking-hud">
              <span>
                <PersonStanding size={17} />
                {mode === "first" ? "First person" : "Follow camera"}
              </span>
              {playing && (
                <button
                  className="take-control"
                  onClick={() => setPlaying(false)}
                >
                  Take control
                </button>
              )}
              <button
                onClick={() => {
                  setMode("orbit");
                  setPlaying(false);
                  setSheet("half");
                }}
              >
                Exit
                <X size={15} />
              </button>
            </div>
            {mode === "first" && <div className="crosshair" />}
            {!playing && progress === 0 && (
              <GameMinimap
                position={position}
                indoor={indoor && selected === "DC" && floor === 1}
                route={routeVisible ? route : null}
              />
            )}
            <div className="walk-help">
              <kbd>WASD</kbd> move <span>·</span> drag to look <span>·</span>{" "}
              <kbd>Shift</kbd> run
            </div>
            <div className="touch-move">
              {[
                ["w", ArrowUp],
                ["a", ArrowLeft],
                ["s", ArrowDown],
                ["d", ArrowRight],
              ].map(([k, I]) => {
                const Icon = I as any;
                return (
                  <button
                    aria-label={`Move ${{w:"forward",a:"left",s:"back",d:"right"}[k as string]}`}
                    key={k as string}
                    onPointerDown={(e) => {
                      e.currentTarget.setPointerCapture(e.pointerId);
                      map.current?.move(k as string, true);
                    }}
                    onPointerUp={() => map.current?.move(k as string, false)}
                    onLostPointerCapture={() => map.current?.move(k as string, false)}
                    onPointerCancel={() =>
                      map.current?.move(k as string, false)
                    }
                  >
                    <Icon size={20} />
                  </button>
                );
              })}
            </div>
          </>
        )}
        {(playing || progress > 0) && route && (
          <div className="playback">
            <div>
              <span className="status-dot" />
              <strong>
                {progress >= 1
                  ? `Arrived at ${resolveLocation(to)?.name || "your destination"}`
                  : pitchActive
                    ? "SCH → AL · " +
                      (playing ? "guided walk" : "you’re in control")
                    : "Route preview"}
              </strong>
              <small>{Math.round(progress * 100)}%</small>
              <button
                aria-label="Close preview"
                onClick={() => {
                  setPlaying(false);
                  setProgress(0);
                  setMode("orbit");
                  setSheet("half");
                }}
              >
                <X size={16} />
              </button>
            </div>
            <div>
              <button
                className="play-button"
                aria-label={playing ? "Pause preview" : "Play preview"}
                onClick={() => {
                  if (progress >= 1) setProgress(0);
                  setPlaying(!playing);
                }}
              >
                {playing ? <Pause size={17} /> : <Play size={17} />}
              </button>
              <input
                type="range"
                aria-label="Walkthrough progress"
                disabled={!!route.physical}
                min="0"
                max="1"
                step="0.001"
                value={progress}
                onChange={(e) => setProgress(Number(e.target.value))}
              />
              <button
                onClick={() => setSpeed((s) => (s === 1 ? 2 : s === 2 ? 4 : 1))}
              >
                {speed}×
              </button>
            </div>
          </div>
        )}
      </main>
      <aside className="bottom-sheet" aria-label="Campus navigation panel">
        <button
          className="sheet-handle"
          aria-label={sheet === "full" ? "Collapse panel" : "Expand panel"}
          onClick={() =>
            setSheet((s) =>
              s === "half" ? "full" : s === "full" ? "peek" : "half",
            )
          }
          onPointerDown={(e) => {
            drag.current = e.clientY;
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerUp={(e) => {
            const dy = e.clientY - drag.current;
            if (dy > 50) setSheet(sheet === "full" ? "half" : "peek");
            if (dy < -50) setSheet(sheet === "peek" ? "half" : "full");
          }}
        >
          <i />
          <span>
            {routeVisible && route
              ? `${minutes(route)} min to ${resolveLocation(to)?.name}`
              : next?.location?.label
                ? `Next: ${next.location.label}`
                : "Your campus, at a glance"}
          </span>
          <ChevronDown size={16} />
        </button>
        <nav className="desktop-nav">
          {nav.map(([id, Icon, label]) => (
            <button
              className={tab === id && !routeVisible ? "active" : ""}
              key={id}
              onClick={() => switchTab(id)}
            >
              <Icon size={17} />
              {label}
            </button>
          ))}
        </nav>
        <div className="sheet-content" ref={body}>
          {searchOpen ? (
            <>
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">CAMPUS SEARCH</span>
                  <h1>{query ? "Here’s what we found" : "Find your place"}</h1>
                </div>
                <button
                  className="round-action"
                  aria-label="Close search"
                  onClick={() => {
                    setSearchOpen(false);
                    setSheet("half");
                  }}
                >
                  <X size={19} />
                </button>
              </div>
              {results.map((r) => (
                <button
                  className="search-result"
                  key={r.id}
                  onClick={() => {
                    if (originEdit) {
                      setFrom(r.id);
                      setOriginEdit(false);
                      setSearchOpen(false);
                      setToast("Starting point updated");
                    } else selectBuilding(r.building, r.place?.id);
                  }}
                >
                  <span className={`place-icon ${r.category}`}>
                    {(() => {
                      const I = iconFor(r.category);
                      return <I size={21} />;
                    })()}
                  </span>
                  <span>
                    <strong>{r.name}</strong>
                    <small>{r.subtitle}</small>
                  </span>
                  <ChevronRight size={16} />
                </button>
              ))}
              {!results.length && (
                <div className="empty-state">
                  <Search size={30} />
                  <h3>No campus match yet.</h3>
                  <p>Try a building code, “DC 1350”, or “quiet study”.</p>
                </div>
              )}
            </>
          ) : routeVisible ? (
            <>
              <div className="panel-heading">
                <button
                  className="back-link"
                  onClick={() => {
                    setRouteVisible(false);
                    setPlaying(false);
                    setSelected(null);
                  }}
                >
                  <ArrowLeft size={17} />
                  Your route
                </button>
                <button
                  className="round-action"
                  aria-label="Close directions"
                  onClick={() => {
                    setRouteVisible(false);
                    setPlaying(false);
                  }}
                >
                  <X size={19} />
                </button>
              </div>
              <div className="route-locations">
                <div className="route-stops">
                  <i />
                  <span />
                  <MapPin size={17} />
                </div>
                <div>
                  <LocationInput label="From" value={from} onChange={setFrom} />
                  <LocationInput label="To" value={to} onChange={setTo} />
                </div>
                <button
                  aria-label="Swap route endpoints"
                  onClick={() => {
                    setFrom(to);
                    setTo(from);
                  }}
                >
                  <ArrowUpDown size={19} />
                </button>
              </div>
              <div className="preference-chips">
                {Object.entries(profileLabels).map(([id, label]) => (
                  <button
                    className={profile === id ? "active" : ""}
                    key={id}
                    onClick={() => setProfile(id as RouteProfile)}
                  >
                    {id === "accessible" && <Accessibility size={14} />} {label}
                  </button>
                ))}
              </div>
              {route ? (
                <>
                  <div className="route-hero">
                    <strong>
                      {minutes(route)}
                      <small>min</small>
                    </strong>
                    <div>
                      <b>{Math.round(route.distance)} m walk</b>
                      <span>
                        Arrive{" "}
                        {formatTime(
                          new Date(at.getTime() + route.seconds * 1000),
                        )}
                      </span>
                    </div>
                    <span className="route-quality">
                      <ShieldCheck size={13} />
                      {profileLabels[profile]}
                    </span>
                  </div>
                  <div className="route-facts">
                    <span>
                      <Building2 size={16} />
                      {route.indoorPercent}% indoors
                    </span>
                    <span>
                      <Footprints size={16} />
                      {route.stairs} stair segments
                    </span>
                    <span>
                      <Wind size={16} />
                      {Math.ceil(route.outdoorDistance / 80)} min outside
                    </span>
                  </div>
                  {route.elevatorWait > 0 && (
                    <div className="route-context">
                      <Clock size={16} />
                      {route.elevatorWait}s estimated elevator wait
                    </div>
                  )}
                  <div className="route-context">
                    <Activity size={16} />
                    {campus.congestionLevel} campus movement ·{" "}
                    {scrub === null ? "current" : "preview"} ETA
                  </div>
                  <button
                    className="primary start-walk"
                    disabled={!route.physical}
                    onClick={() => walk(true, "first")}
                  >
                    <Navigation size={18} fill="currentColor" />
                    Rehearse this route<span>{minutes(route)} min</span>
                  </button>
                  <div className="section-head">
                    <h2>Along the way</h2>
                    <button
                      aria-label={
                        voice ? "Mute directions" : "Read directions aloud"
                      }
                      onClick={() => setVoice(!voice)}
                    >
                      {voice ? <Volume2 size={17} /> : <VolumeX size={17} />}
                    </button>
                  </div>
                  <ol className="directions-list">
                    {route.steps.map((s, i) => (
                      <li key={i}>
                        <button
                          onClick={() => {
                            setProgress(
                              route.edges
                                .slice(0, s.edgeStart)
                                .reduce((n, e) => n + e.distance, 0) /
                                route.distance,
                            );
                            map.current?.focus(s.point, 100);
                          }}
                        >
                          <span className={`step-icon ${s.kind}`}>
                            {s.kind === "elevator" ? (
                              <ArrowUpDown size={18} />
                            ) : s.kind === "stairs" ? (
                              <Footprints size={18} />
                            ) : s.kind === "bridge" || s.kind === "tunnel" ? (
                              <Building2 size={18} />
                            ) : s.kind === "entrance" ? (
                              <LogIn size={18} />
                            ) : (
                              <ArrowUp size={18} />
                            )}
                          </span>
                          <span>
                            <strong>{s.title}</strong>
                            <small>{s.detail}</small>
                          </span>
                          <em>{Math.round(s.distance)}m</em>
                        </button>
                      </li>
                    ))}
                    <li className="arrival">
                      <Flag size={18} />
                      <b>{resolveLocation(to)?.name}</b>
                    </li>
                  </ol>
                  <div className="accuracy-note">
                    <Info size={15} />
                    {profile === "accessible"
                      ? "Step-free avoids mapped stairs and known steep links. Door access and elevator operation still require local confirmation."
                      : "Mapped paths are combined with approximate interior approaches. Follow posted signs and construction detours."}
                  </div>
                </>
              ) : (
                <div className="empty-state">
                  <RouteIcon size={30} />
                  <h3>No connected route.</h3>
                  <p>Try a nearby entrance or another route preference.</p>
                </div>
              )}
            </>
          ) : visualMode === "tunnels" ? (
            <TunnelDemo onStart={startPitch} />
          ) : tab === "home" ? (
            <>
              <div className="home-greeting">
                <div>
                  <span className="eyebrow">
                    {at.getHours() < 12
                      ? "GOOD MORNING"
                      : at.getHours() < 17
                        ? "GOOD AFTERNOON"
                        : "GOOD EVENING"}
                  </span>
                  <h1>{demoStudentActive ? "Your day, Maya." : "Your day, in sync."}</h1>
                </div>
                <span className="greeting-symbol">
                  <Navigation size={28} />
                </span>
              </div>
              {demoStudentActive ? <StudentStory onPlay={()=>{setAutoPaused(false);setAutoIndex(0);}} presenting={autoIndex !== null} at={at} onChapter={chooseChapter} onProfile={() => setStudentProfileOpen(true)} onTunnel={() => startPitch("guided")}/> : <button className="secondary" onClick={() => chooseChapter(chapters[0])}>Follow Maya’s demo day</button>}
              <button
                className="current-origin"
                onClick={() => {
                  setOriginEdit(true);
                  setSearchOpen(true);
                  setSheet("full");
                  search.current?.focus();
                }}
              >
                <MapPin size={14} />
                <span>
                  From <b>{resolveLocation(from)?.name || "your location"}</b>
                </span>
                <ChevronDown size={13} />
              </button>
              {next ? (
                <article className="destination-card">
                  <div className="destination-eyebrow">
                    <span>
                      {happening
                        ? "HAPPENING NOW"
                        : leaveMinutes <= 0
                          ? "TIME TO HEAD OUT"
                          : `LEAVE IN ${leaveMinutes} MIN`}
                    </span>
                    <small>
                      {next.source === "Sample" ? "SAMPLE DAY" : next.source}
                    </small>
                  </div>
                  <div className="destination-main">
                    <div className="destination-code">
                      {next.location?.building || "UW"}
                    </div>
                    <div>
                      <h2>{next.title}</h2>
                      <p>
                        {next.location?.label}{" "}
                        <span>· {formatTime(next.start)}</span>
                      </p>
                    </div>
                  </div>
                  <div className="destination-route">
                    <span>
                      <Clock size={15} />
                      {nextLeave
                        ? `Leave ${formatTime(nextLeave)}`
                        : "Choose a location"}
                    </span>
                    <span>
                      <Building2 size={15} />
                      {nextRoute?.indoorPercent || 0}% indoors
                    </span>
                  </div>
                  <button
                    onClick={() =>
                      next.location?.locationId &&
                      startRoute(next.location.locationId)
                    }
                  >
                    <Navigation size={17} />
                    Your best route
                    <strong>
                      {minutes(nextRoute)} min
                      <ArrowRight size={17} />
                    </strong>
                  </button>
                </article>
              ) : (
                <article className="connect-prompt">
                  <CalendarDays size={27} />
                  <div>
                    <h2>Let the map know your day.</h2>
                    <p>
                      Connect your calendar for upcoming rooms, leave-by times,
                      and timely suggestions.
                    </p>
                  </div>
                  <button onClick={() => switchTab("day")}>
                    <ArrowRight size={19} />
                  </button>
                </article>
              )}
              <div className="context-grid">
                <button onClick={() => setWeatherOpen(true)}>
                  <WeatherIcon size={20} />
                  <span>
                    <strong>
                      {effective.precipitation > 0
                        ? "Stay a little drier"
                        : weatherDescription(effective.code)}
                    </strong>
                    <small>
                      {effective.precipitation > 0
                        ? "Try Weather-smart routing"
                        : `${Math.round(effective.temperature)}° · a good day to walk`}
                    </small>
                  </span>
                </button>
                <button
                  onClick={() => {
                    switchTab("campus");
                    setTimelineOpen(true);
                  }}
                >
                  <Activity size={20} />
                  <span>
                    <strong>{campus.congestionLevel}</strong>
                    <small>Predicted campus movement</small>
                  </span>
                </button>
              </div>
              <div className="section-head">
                <h2>
                  {campus.gapMinutes >= 15
                    ? `${campus.gapMinutes} minutes to make yours`
                    : "A good next stop"}
                </h2>
                <span>FOR YOU</span>
              </div>
              {suggestions.length ? (
                suggestions.map((r) => (
                  <Opportunity
                    key={r.place.id}
                    name={r.place.name}
                    category={r.place.category}
                    minutes={r.walk}
                    description={`${r.spare >= 60 ? "60+" : r.spare} min after walking · ${r.occupancy < 45 ? "usually quieter" : "activity estimated"}`}
                    onClick={() => startRoute(r.place.id)}
                  />
                ))
              ) : (
                <div className="quiet-note">
                  <Clock size={17} />A tight gap. Your next destination comes
                  first.
                </div>
              )}
              <div className="section-head">
                <h2>On campus today</h2>
                <button onClick={() => switchTab("campus")}>
                  See all
                  <ArrowRight size={13} />
                </button>
              </div>
              {displayedEvents.slice(0, 2).map((e) => (
                <EventCard key={e.id} event={e} onRoute={startRoute} />
              ))}
              {!displayedEvents.length && (
                <div className="quiet-note">
                  <CalendarDays size={17} />
                  {feedLoading
                    ? "Checking public campus listings…"
                    : "No confirmed upcoming campus events in this update."}
                </div>
              )}
              <button
                className="construction-note"
                onClick={() => {
                  map.current?.focus(closure.point, 160);
                  setToast(closure.detail);
                }}
              >
                <Construction size={19} />
                <span>
                  <strong>Math quad detour</strong>
                  <small>MC–DC and MC–M3 bridges removed</small>
                </span>
                <ChevronRight size={17} />
              </button>
            </>
          ) : tab === "day" ? (
            demoStudentActive ? <StudentWeek events={mayaEvents} at={at} onRoute={startRoute} onProfile={() => setStudentProfileOpen(true)}/> : <CalendarPanel
              events={calendarEvents}
              classes={classes}
              onEvents={setCalendarEvents}
              onClasses={setClasses}
              onRoute={startRoute}
              notify={setToast}
              at={at}
            />
          ) : tab === "campus" ? (
            <>
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">WHAT’S HAPPENING AROUND YOU</span>
                  <h1>Campus pulse</h1>
                </div>
                <button
                  className="round-action"
                  aria-label="Refresh campus data"
                  onClick={refresh}
                >
                  <RefreshCw size={19} className={feedLoading ? "spin" : ""} />
                </button>
              </div>
              <div className="feed-freshness">
                <span className="status-dot" />
                {feed?.mode === "demo"
                  ? "Demo day · ready to explore"
                  : feedLoading
                    ? "Updating campus sources…"
                    : feed?.fetchedAt
                      ? `Updated ${formatTime(feed.fetchedAt)}`
                      : "Connecting public sources"}
                {scrub !== null && <b>Time preview</b>}
                <button
                  className="feed-mode-toggle"
                  onClick={() => setLiveEnabled(!liveEnabled)}
                >
                  {liveEnabled ? "Use demo data" : "Try live sources"}
                </button>
              </div>
              <div className="section-head">
                <h2>Room for a workout?</h2>
                <a
                  href="https://warrior.uwaterloo.ca/FacilityOccupancy"
                  target="_blank"
                  rel="noreferrer"
                >
                  Warrior Rec
                  <ExternalLink size={12} />
                </a>
              </div>
              {feed?.facilities.length ? (
                feed.facilities
                  .filter((f) =>
                    /Fitness Centre|Free Weights|Cardio|Weight Machines/.test(
                      f.name,
                    ),
                  )
                  .map((f) => (
                    <FacilityCard
                      key={f.id}
                      facility={f}
                      onRoute={() => startRoute(f.building)}
                      preview={scrub !== null}
                      predicted={campus.states[f.building]?.occupancy}
                    />
                  ))
              ) : (
                <div className="quiet-note">
                  <Activity size={18} />
                  {feedLoading
                    ? "Checking published occupancy…"
                    : "Occupancy unavailable. Check Warrior Rec for current availability."}
                </div>
              )}
              <div className="section-head">
                <h2>Happening on campus</h2>
                <span>{displayedEvents.length} MATCHES</span>
              </div>
              {displayedEvents.map((e) => (
                <EventCard key={e.id} event={e} onRoute={startRoute} />
              ))}
              <p className="micro-copy">
                {feed?.mode === "demo"
                  ? "Curated demo events at real campus venues. Times are illustrative and repeat daily."
                  : "Only confirmed UW venues or explicitly announced UW campus events."}{" "}
                {publicEvents.excluded > 0
                  ? `${publicEvents.excluded} off-campus, past, or unresolved listings filtered.`
                  : ""}{" "}
                Duplicates are reconciled across sources.
              </p>
              <details className="event-import">
                <summary>
                  <Link2 size={16} />
                  Add a Luma, Partiful, or WYGO event
                </summary>
                <p>
                  Public event details are checked against Waterloo’s campus.
                  Private or hidden venues need a calendar file.
                </p>
                <label>
                  Public event link
                  <input
                    type="url"
                    value={eventLink}
                    onChange={(e) => setEventLink(e.target.value)}
                    placeholder="https://luma.com/…"
                  />
                </label>
                <button
                  className="secondary"
                  disabled={eventLoading || !eventLink.trim()}
                  onClick={addEventLink}
                >
                  {eventLoading ? "Checking venue…" : "Check & add event"}
                </button>
              </details>
              <div className="section-head">
                <h2>The campus, over time</h2>
                <button onClick={() => setTimelineOpen(true)}>
                  Explore
                  <Clock size={13} />
                </button>
              </div>
              <div className="flow-card">
                <div>
                  <Activity size={19} />
                  <strong>{campus.congestionLevel}</strong>
                  <span>MODEL</span>
                </div>
                <p>
                  ~{flow.totalDemand} trips/min across modelled class-change
                  routes. Estimates change with time and weather.
                </p>
                <div className="flow-sparkline">
                  {Array.from({ length: 24 }, (_, i) => (
                    <i
                      key={i}
                      style={{
                        height: `${12 + Math.sin(i * 0.8) ** 2 * 26 + (i > 8 && i < 18 ? 22 : 0)}px`,
                        opacity: i === at.getHours() ? 1 : 0.35,
                      }}
                    />
                  ))}
                </div>
                {flow.bottlenecks.slice(0, 3).map((b) => (
                  <button
                    key={b.id}
                    onClick={() => map.current?.focus(b.point, 130)}
                  >
                    <span>
                      <strong>{b.name}</strong>
                      <small>
                        Estimated {b.peoplePerMinute} people/min · model
                        capacity {b.capacity}/min
                      </small>
                    </span>
                    <ChevronRight size={16} />
                  </button>
                ))}
                <small>
                  Class patterns and link capacities are curated assumptions,
                  not measured timetables or safety capacities.
                </small>
              </div>
              <details className="source-status">
                <summary>
                  <ShieldCheck size={15} />
                  Sources & freshness
                </summary>
                {feed?.sources.map((s) => (
                  <a key={s.id} href={s.url} target="_blank" rel="noreferrer">
                    <span>
                      <strong>{s.name}</strong>
                      <small>{s.detail}</small>
                    </span>
                    <b className={s.status}>{s.status}</b>
                  </a>
                ))}
                <a
                  href="https://github.com/rickyqin005/WATIsGrass"
                  target="_blank"
                  rel="noreferrer"
                >
                  <span>
                    <strong>WATIsGrass</strong>
                    <small>
                      Community indoor paths · closure filters applied
                    </small>
                  </span>
                  <b>mapped</b>
                </a>
              </details>
              {feedError && <p className="micro-copy">{feedError}</p>}
            </>
          ) : selectedBuilding ? (
            <>
              <button
                className="back-link"
                onClick={() => {
                  setSelected(null);
                  setSelectedPlace(null);
                  setIndoor(false);
                  map.current?.reset();
                }}
              >
                <ArrowLeft size={16} />
                Explore campus
              </button>
              <div className="building-detail-head">
                <span className="building-code">
                  {selectedBuilding.id === "LIB" ? "DP" : selectedBuilding.id}
                </span>
                <button
                  className={
                    saved.includes(selectedPlace || selected!) ? "saved" : ""
                  }
                  aria-label="Save this place"
                  onClick={() =>
                    setSaved((v) =>
                      v.includes(selectedPlace || selected!)
                        ? v.filter((x) => x !== (selectedPlace || selected!))
                        : [...v, selectedPlace || selected!],
                    )
                  }
                >
                  <Bookmark size={21} />
                </button>
              </div>
              <span className="eyebrow">
                {
                  categoryNames[
                    selectedPOI?.category || selectedBuilding.category
                  ]
                }
              </span>
              <h1 className="building-title">
                {selectedPOI?.name || selectedBuilding.shortName}
              </h1>
              <div className="building-meta">
                <span>
                  <Layers size={15} />
                  {selectedPOI
                    ? `Floor ${selectedPOI.floor}`
                    : `${selectedBuilding.floors} floors`}
                </span>
                <span>
                  <MapPin size={15} />
                  Main campus
                </span>
              </div>
              <p className="building-description">
                {selectedPOI?.description || selectedBuilding.description}
              </p>
              <div className="button-pair">
                <button
                  className="primary"
                  onClick={() => startRoute(selectedPlace || selected!)}
                >
                  <Navigation size={18} />
                  Directions
                </button>
                <button
                  className="secondary"
                  onClick={() => {
                    setFrom(selectedPlace || selected!);
                    setToast("Starting point updated");
                  }}
                >
                  Start here
                </button>
              </div>
              <button className="indoor-card" onClick={enterIndoor}>
                <Box size={27} />
                <span>
                  <strong>Step inside</strong>
                  <small>
                    {selected === "DC"
                      ? "128 mapped spaces · doors & corridors"
                      : "Floor overview · community paths where available"}
                  </small>
                </span>
                <ArrowRight size={18} />
              </button>
              {selected === "MC" && (
                <div className="reference-links">
                  {[2, 3, 6].map((f) => (
                    <a
                      key={f}
                      href={`/floorplans/MC-${f}.${f === 6 ? "pdf" : "png"}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Floor {f} plan
                      <ExternalLink size={12} />
                    </a>
                  ))}
                </div>
              )}
              {selected === "SLC" && (
                <details className="interior-reference">
                  <summary>Photo reference · SLC 1120</summary>
                  <img
                    loading="lazy"
                    src="/references/slc-1120.jpg"
                    alt="Actual SLC 1120 doors and corridor finishes"
                  />
                  <a
                    href="https://uwaterloo.ca/student-life-centre/inside-student-life-centre/slc-spaces"
                    target="_blank"
                    rel="noreferrer"
                  >
                    University of Waterloo source
                  </a>
                </details>
              )}
              <div className="section-head">
                <h2>Inside {selectedBuilding.id}</h2>
                <span>PLACES</span>
              </div>
              {places
                .filter((p) => p.building === selected && p.category !== "room")
                .slice(0, 15)
                .map((p) => (
                  <PlaceRow
                    key={p.id}
                    place={p}
                    onClick={() => {
                      setSelectedPlace(p.id);
                      setFloor(p.floor || 1);
                      map.current?.focus(p.point, 100);
                    }}
                    onRoute={() => startRoute(p.id)}
                  />
                ))}
              <div className="accuracy-note">
                <Info size={15} />
                {selected === "DC"
                  ? "Ground-floor room outlines and doors are mapped. Other floors and some connecting approaches remain schematic."
                  : "Interior coverage is partial. Consult the source floor plan and posted signs for the final approach."}
              </div>
              <a
                className="source-link"
                href={sources.accessibility}
                target="_blank"
                rel="noreferrer"
              >
                Official accessibility details
                <ExternalLink size={14} />
              </a>
            </>
          ) : (
            <>
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">
                    YOUR FAVOURITE CORNERS, CLOSER
                  </span>
                  <h1>Explore Waterloo</h1>
                </div>
                <Compass size={28} className="muted-icon" />
              </div>
              <div className="explore-categories">
                {[
                  ["all", Building2, "Buildings"],
                  ["study", BookOpen, "Study"],
                  ["food", Coffee, "Food"],
                  ["washroom", Accessibility, "Washrooms"],
                  ["water", GlassWater, "Water"],
                  ["printer", Printer, "Print"],
                  ["residence", Building2, "Residences"],
                  ["recreation", Activity, "Active"],
                  ["transit", TrainFront, "Transit"],
                ].map(([id, I, label]) => {
                  const Icon = I as any;
                  return (
                    <button
                      className={category === id ? "active" : ""}
                      key={id as string}
                      onClick={() => setCategory(id as string)}
                    >
                      <Icon size={19} />
                      {label as string}
                    </button>
                  );
                })}
              </div>
              {category === "all" || category === "residence" ? (
                <>
                  {saved.length > 0 && (
                    <>
                      <div className="section-head">
                        <h2>Your saved places</h2>
                      </div>
                      {saved.map((id) => {
                        const p = resolveLocationId(id);
                        return p ? (
                          <button
                            className="saved-place"
                            key={id}
                            onClick={() =>
                              selectBuilding(
                                p.building,
                                placeById[id] ? id : undefined,
                              )
                            }
                          >
                            <Bookmark size={16} />
                            {p.name}
                            <ChevronRight size={16} />
                          </button>
                        ) : null;
                      })}
                    </>
                  )}
                  <div className="section-head">
                    <h2>Campus essentials</h2>
                    <span>{buildings.length} BUILDINGS</span>
                  </div>
                  {buildings
                    .filter(
                      (b) =>
                        category !== "residence" || b.category === "residence",
                    )
                    .map((b) => (
                      <button
                        className="building-list-row"
                        key={b.id}
                        onClick={() => selectBuilding(b.id)}
                      >
                        <span>{b.id === "LIB" ? "DP" : b.id}</span>
                        <div>
                          <strong>{b.shortName}</strong>
                          <small>
                            {b.floors} floors ·{" "}
                            {campus.states[b.id]?.occupancy < 45
                              ? "usually quieter"
                              : "activity estimated"}
                          </small>
                        </div>
                        <ChevronRight size={16} />
                      </button>
                    ))}
                </>
              ) : (
                <>
                  <div className="section-head">
                    <h2>{categoryNames[category]}</h2>
                    <span>{filteredPlaces.length} PLACES</span>
                  </div>
                  {filteredPlaces.map((p) => (
                    <PlaceRow
                      key={p.id}
                      place={p}
                      onClick={() => selectBuilding(p.building, p.id)}
                      onRoute={() => startRoute(p.id)}
                    />
                  ))}
                </>
              )}
            </>
          )}
        </div>
        <div className="desktop-panel-footer">
          <span>
            <ShieldCheck size={13} />
            Made for Waterloo. Grounded in sources.
          </span>
          <button onClick={() => setAbout(true)}>About</button>
        </div>
      </aside>
      <nav className="mobile-nav" aria-label="Main navigation">
        {nav.map(([id, Icon, label]) => (
          <button
            className={tab === id && !routeVisible ? "active" : ""}
            key={id}
            onClick={() => switchTab(id)}
          >
            <Icon size={21} />
            <span>{label}</span>
            {id === "day" && calendarEvents.length > 0 && <i />}
          </button>
        ))}
      </nav>
      {!mobile && (
        <button
          className="panel-toggle"
          aria-label={desktopHidden ? "Show campus panel" : "Hide campus panel"}
          onClick={() => setDesktopHidden(!desktopHidden)}
        >
          {desktopHidden ? (
            <PanelLeftOpen size={18} />
          ) : (
            <PanelLeftClose size={18} />
          )}
        </button>
      )}
      {toast && (
        <div className="toast" role="status">
          <Info size={17} />
          <span>{toast}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {about && (
        <div className="modal-backdrop" onClick={() => setAbout(false)}>
          <section
            className="about-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="about-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close"
              aria-label="Close about"
              onClick={() => setAbout(false)}
            >
              <X size={22} />
            </button>
            <span className="eyebrow">A MORE UNDERSTANDABLE CAMPUS</span>
            <h2 id="about-title">The intelligence underneath.</h2>
            <p>
              WatWay combines campus geography, your calendar, public events,
              published occupancy, and time-dependent routing. No conversations
              required.
            </p>
            <div className="about-stats">
              <span>
                <b>{buildings.length}</b>buildings
              </span>
              <span>
                <b>{dcRooms.length}</b>mapped spaces
              </span>
              <span>
                <b>{graphStats.nodes.toLocaleString()}</b>route nodes
              </span>
            </div>
            <ul>
              <li>
                <ShieldCheck size={19} />
                <span>
                  <strong>Mapped, not surveyed</strong>OpenStreetMap geometry
                  and WATIsGrass community paths. Davis ground-floor rooms are
                  mapped; other interiors and approaches remain partial.
                </span>
              </li>
              <li>
                <Activity size={19} />
                <span>
                  <strong>Live where available</strong>Weather, published
                  Warrior Rec occupancy, and public UW/WYGO listings show source
                  freshness. Hidden event venues are not guessed.
                </span>
              </li>
              <li>
                <TrendingUp size={19} />
                <span>
                  <strong>Predictions are estimates</strong>Class-change demand,
                  crowd movement, elevator queues, and link capacity are
                  modelled. They are not live footfall sensors or verified
                  safety capacities.
                </span>
              </li>
              <li>
                <CalendarDays size={19} />
                <span>
                  <strong>Your calendar stays yours</strong>Google access is
                  read-only. Tokens stay in memory. Imported events stay on this
                  device. Google connection needs an OAuth client ID for this
                  installation.
                </span>
              </li>
              <li>
                <Construction size={19} />
                <span>
                  <strong>Construction matters</strong>Removed MC–DC and MC–M3
                  bridges are excluded. Local signs and operating conditions
                  take priority.
                </span>
              </li>
            </ul>
            <div className="reference-links">
              {[
                ["OpenStreetMap", sources.map],
                ["Waterloo data", sources.buildings],
                ["WATIsGrass", "https://github.com/rickyqin005/WATIsGrass"],
                ["Accessibility", sources.accessibility],
                ["Construction", sources.closure],
                ["Open-Meteo", sources.weather],
              ].map(([n, u]) => (
                <a href={u} target="_blank" rel="noreferrer" key={n}>
                  {n}
                  <ExternalLink size={12} />
                </a>
              ))}
            </div>
            <p className="micro-copy">
              Independent prototype. Not affiliated with or endorsed by the
              University of Waterloo.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
function LocationInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false),
    [q, setQ] = useState("");
  const results = searchCampus(q, 7);
  return (
    <div className="location-field">
      <label>{label}</label>
      <input
        aria-label={label === "From" ? "Starting point" : "Destination"}
        value={editing ? q : resolveLocationId(value)?.name || "Your location"}
        onFocus={() => {
          setEditing(true);
          setQ("");
        }}
        onChange={(e) => setQ(e.target.value)}
        onBlur={() => setTimeout(() => setEditing(false), 160)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && results[0]) {
            onChange(results[0].id);
            setEditing(false);
          }
        }}
      />
      {editing && (
        <div className="location-results">
          {results.map((r) => (
            <button
              key={r.id}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(r.id);
                setEditing(false);
              }}
            >
              <strong>{r.name}</strong>
              <small>{r.subtitle}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
function Opportunity({
  name,
  category,
  minutes,
  description,
  onClick,
}: {
  name: string;
  category: string;
  minutes: number;
  description: string;
  onClick: () => void;
}) {
  const Icon = iconFor(category);
  return (
    <button className="opportunity" onClick={onClick}>
      <span className={`place-icon ${category}`}>
        <Icon size={23} />
      </span>
      <span>
        <strong>{name}</strong>
        <small>{description}</small>
      </span>
      <b>
        {minutes}
        <small>min</small>
      </b>
    </button>
  );
}
function PlaceRow({
  place,
  onClick,
  onRoute,
}: {
  place: Place;
  onClick: () => void;
  onRoute: () => void;
}) {
  const Icon = iconFor(place.category);
  return (
    <div className="place-row">
      <button onClick={onClick}>
        <span className={`place-icon ${place.category}`}>
          <Icon size={20} />
        </span>
        <span>
          <strong>{place.name}</strong>
          <small>
            {place.building} ·{" "}
            {place.floor ? `Floor ${place.floor}` : "Outside"}
            {place.confidence === "approximate" ? " · approximate" : ""}
          </small>
        </span>
      </button>
      <button
        className="place-route"
        aria-label={`Directions to ${place.name}`}
        onClick={onRoute}
      >
        <Navigation size={17} />
      </button>
    </div>
  );
}
function EventCard({
  event: e,
  onRoute,
}: {
  event: CampusEvent;
  onRoute: (id: string) => void;
}) {
  const d = new Date(e.start);
  return (
    <article className="event-card">
      <div className="event-date">
        <span>{d.toLocaleDateString("en-CA", { month: "short" })}</span>
        <b>{d.getDate()}</b>
      </div>
      <div>
        <div className="event-source">
          <span>
            {e.source}
            {e.demo ? " · DEMO" : ""}
          </span>
          <small>{formatTime(e.start)}</small>
        </div>
        <h3>{e.title}</h3>
        <p>
          <MapPin size={12} />
          {e.location?.label || e.locationText}
        </p>
        <div className="event-actions">
          {e.location?.locationId ? (
            <button onClick={() => onRoute(e.location!.locationId)}>
              Get there
              <ArrowRight size={13} />
            </button>
          ) : (
            <small>Venue pending</small>
          )}
          {e.url && (
            <a href={e.url} target="_blank" rel="noreferrer">
              {e.demo ? "Original listing" : "Event details"}
              <ExternalLink size={12} />
            </a>
          )}
        </div>
      </div>
    </article>
  );
}
function FacilityCard({
  facility: f,
  onRoute,
  preview,
  predicted,
}: {
  facility: FacilityReading;
  onRoute: () => void;
  preview: boolean;
  predicted?: number;
}) {
  const percent = preview ? (predicted ?? f.percent) : f.percent;
  const fresh =
    !preview &&
    f.status === "live" &&
    Date.now() - Date.parse(f.updatedAt) < 300000;
  return (
    <button className="facility-card" onClick={onRoute}>
      <div>
        <span className="facility-symbol">
          <Activity size={21} />
        </span>
        <span>
          <strong>{f.name}</strong>
          <small>
            {f.status === "demo"
              ? "Demo activity"
              : fresh
                ? "Published just now"
                : preview
                  ? "Predicted activity"
                  : "Cached reading"}{" "}
            ·{" "}
            {percent < 40
              ? "room to move"
              : percent < 75
                ? "moderately busy"
                : "busy"}
          </small>
        </span>
        <b>{percent}%</b>
      </div>
      <div className="occupancy-track">
        <i
          style={{
            width: `${Math.min(100, percent)}%`,
            background:
              percent > 80 ? "#d99e64" : percent > 55 ? "#d8c171" : "#83bd9e",
          }}
        />
      </div>
      <footer>
        <span>
          {f.status === "demo" ? (
            "DEMO DATA"
          ) : fresh ? (
            <>
              <span className="status-dot" />
              LIVE SOURCE
            </>
          ) : preview ? (
            "ESTIMATE"
          ) : (
            "CACHED"
          )}{" "}
          {!preview && f.status !== "demo" && formatTime(f.updatedAt)}
        </span>
        <span>
          Directions
          <ChevronRight size={13} />
        </span>
      </footer>
    </button>
  );
}
function GameMinimap({
  position,
  indoor,
  route,
}: {
  position: Point;
  indoor: boolean;
  route: Route | null;
}) {
  const radius = indoor ? 65 : 150,
    x = position[0] - radius,
    z = position[2] - radius;
  return (
    <div className="game-minimap">
      <div>
        <Compass size={13} />
        <span>{indoor ? "INSIDE DAVIS" : "CAMPUS"}</span>
        <b>N</b>
      </div>
      <svg
        viewBox={`${x} ${z} ${radius * 2} ${radius * 2}`}
        aria-label="Exploration minimap"
      >
        <rect
          x={x}
          y={z}
          width={radius * 2}
          height={radius * 2}
          fill="#203b41"
        />
        {(indoor
          ? dcRooms.map((r) => ({ id: r.id, polygon: r.points }))
          : buildings
        ).map((b) => (
          <polygon
            key={b.id}
            points={b.polygon.map((p) => p.join(",")).join(" ")}
            fill="#496660"
            stroke="#78968b"
            strokeWidth={indoor ? 0.3 : 1}
          />
        ))}
        {route && (
          <polyline
            points={route.nodes
              .map((n) => `${n.point[0]},${n.point[2]}`)
              .join(" ")}
            fill="none"
            stroke="#edc65b"
            strokeWidth={indoor ? 1 : 2}
          />
        )}
        <circle
          cx={position[0]}
          cy={position[2]}
          r={radius * 0.045}
          fill="#ffd568"
          stroke="#fff8d3"
          strokeWidth={radius * 0.012}
        />
      </svg>
      <small>Exploration position · not GPS</small>
    </div>
  );
}
