import {
  ArrowRight,
  ArrowDown,
  Footprints,
  PersonStanding,
  Play,
  ShieldCheck,
  Layers,
  MapPin,
  Navigation,
  ExternalLink,
} from "lucide-react";
export default function TunnelDemo({
  onStart,
}: {
  onStart: (mode: "guided" | "manual") => void;
}) {
  return (
    <section className="tunnel-demo-panel">
      <div className="tunnel-demo-kicker">
        <span />
        WATERLOO BELOW THE SURFACE
      </div>
      <h1>
        Your campus.
        <br />A different level.
      </h1>
      <p className="tunnel-demo-intro">
        A continuous journey from South Campus Hall to Arts Lecture Hall.
      </p>
      <div className="demo-endpoints">
        <div>
          <span>SCH</span>
          <small>South Campus Hall</small>
        </div>
        <ArrowRight size={20} />
        <div>
          <span>AL</span>
          <small>Arts Lecture Hall</small>
        </div>
      </div>
      <div className="demo-metrics">
        <span>
          <Footprints size={15} />
          226 m
        </span>
        <span>
          <Layers size={15} />
          Through the tunnel
        </span>
      </div>
      <button className="demo-play" onClick={() => onStart("guided")}>
        <Play size={17} fill="currentColor" />
        <span>
          Play the pitch demo<small>Guided · about 50 seconds</small>
        </span>
        <ArrowRight size={18} />
      </button>
      <button className="demo-manual" onClick={() => onStart("manual")}>
        <PersonStanding size={18} />
        Walk it yourself<span>WASD</span>
      </button>
      <div className="demo-collision">
        <ShieldCheck size={14} />
        <span>Solid-wall collisions · no free-fly camera</span>
      </div>
      <div className="tunnel-demo-photo">
        <img
          src="/references/sch-al-tunnel.jpeg"
          alt="The actual ochre and yellow arts tunnel at Waterloo"
        />
        <div>
          <span>THE CLASSIC ARTS TUNNEL</span>
          <strong>
            Stay dry.
            <br />
            Keep moving.
          </strong>
          <a
            href="https://uwaterloo.ca/news/mathematics/wat-connects-us"
            target="_blank"
            rel="noreferrer"
          >
            University of Waterloo photo
            <ExternalLink size={11} />
          </a>
        </div>
      </div>
      <div className="demo-story">
        <h2>One connected walk</h2>
        {[
          ["01", "Enter South Campus Hall", "Start at the mapped entrance."],
          [
            "02",
            "Find the lower-level passage",
            "Follow the corridor and vertical connections.",
          ],
          [
            "03",
            "Walk the arts tunnel",
            "Warm ochre walls. The same route in 3D.",
          ],
          [
            "04",
            "Emerge at Arts Lecture Hall",
            "Arrive through the connected floor network.",
          ],
        ].map(([n, t, d]) => (
          <div key={n}>
            <span>{n}</span>
            <p>
              <strong>{t}</strong>
              <small>{d}</small>
            </p>
          </div>
        ))}
      </div>
      <p className="demo-disclosure">
        Curated demo route. Mapped connections are retained; corridor dimensions
        and stair geometry are reconstructed.
      </p>
    </section>
  );
}
