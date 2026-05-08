import { useState, useEffect, useRef, useCallback } from "react";

type TimerType = "focus" | "short_break" | "long_break";
type AppState = "idle" | "running" | "paused";

const CONFIG = {
  focus:       { label: "Focus",      minutes: 25, accent: "#e74c3c", accentDim: "rgba(231,76,60,0.15)" as string },
  short_break: { label: "Short Break", minutes: 5,  accent: "#2ecc71", accentDim: "rgba(46,204,113,0.15)" as string },
  long_break:  { label: "Long Break",  minutes: 15, accent: "#3498db", accentDim: "rgba(52,152,219,0.15)" as string },
};

const LONG_BREAK_INTERVAL = 4;
const R = 82;
const CIRCUMFERENCE = 2 * Math.PI * R;

// ── Sound ──────────────────────────────────────────────────────────
let audioCtx: AudioContext | null = null;

function beep() {
  try {
    if (!audioCtx) audioCtx = new AudioContext();
    if (audioCtx.state === "suspended") audioCtx.resume();
    [880, 1100].forEach((freq, i) => {
      const osc = audioCtx!.createOscillator();
      const gain = audioCtx!.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.15, audioCtx!.currentTime + i * 0.18);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx!.currentTime + i * 0.28 + 0.1);
      osc.connect(gain).connect(audioCtx!.destination);
      osc.start(audioCtx!.currentTime + i * 0.18);
      osc.stop(audioCtx!.currentTime + i * 0.18 + 0.4);
    });
  } catch { /* audio unavailable */ }
}

// ── Tauri notification ────────────────────────────────────────────
async function notify(title: string, body: string) {
  try {
    const { isPermissionGranted, requestPermission, sendNotification } =
      await import("@tauri-apps/plugin-notification");
    if (await isPermissionGranted()) {
      sendNotification({ title, body });
    } else {
      const perm = await requestPermission();
      if (perm === "granted") sendNotification({ title, body });
    }
  } catch {
    // Fallback: Web Notification API
    try {
      new Notification(title, { body });
    } catch { /* no notification support */ }
  }
}

export default function App() {
  const [timerType, setTimerType] = useState<TimerType>("focus");
  const [appState, setAppState] = useState<AppState>("idle");
  const [timeRemaining, setTimeRemaining] = useState(CONFIG.focus.minutes * 60);
  const [cycleCount, setCycleCount] = useState(0);
  const [alwaysOnTop, setAlwaysOnTop] = useState(false);

  const config = CONFIG[timerType];
  const progress = 1 - timeRemaining / (config.minutes * 60);
  const dashOffset = CIRCUMFERENCE * (1 - progress);
  const m = Math.floor(timeRemaining / 60);
  const s = timeRemaining % 60;

  // Refs for fresh values in callbacks
  const timerTypeRef = useRef(timerType);
  timerTypeRef.current = timerType;
  const appStateRef = useRef(appState);
  appStateRef.current = appState;

  // ── Timer interval ────────────────────────────────────────────
  useEffect(() => {
    if (appState !== "running") return;
    const id = setInterval(() => setTimeRemaining((t) => t - 1), 1000);
    return () => clearInterval(id);
  }, [appState]);

  // ── Completion detection ──────────────────────────────────────
  const prevRemaining = useRef(timeRemaining);
  useEffect(() => {
    if (appStateRef.current === "running" && prevRemaining.current === 1 && timeRemaining <= 0) {
      handleComplete();
    }
    prevRemaining.current = timeRemaining;
  });

  // ── Timer switching ───────────────────────────────────────────
  const switchTo = useCallback((type: TimerType) => {
    setAppState("idle");
    setTimerType(type);
    setTimeRemaining(CONFIG[type].minutes * 60);
  }, []);

  // ── Completion handler ────────────────────────────────────────
  const handleComplete = useCallback(() => {
    setAppState("idle");
    const type = timerTypeRef.current;

    notify(
      type === "focus" ? "Focus Complete!" : type === "short_break" ? "Break Over" : "Long Break Over",
      type === "focus" ? "Time for a break 🍃" : "Back to focus 💪",
    );
    beep();

    if (type === "focus") {
      setCycleCount((c) => {
        const next = c + 1;
        // schedule switch outside setState callback
        setTimeout(() => {
          switchTo(next >= LONG_BREAK_INTERVAL ? "long_break" : "short_break");
        }, 0);
        return next >= LONG_BREAK_INTERVAL ? 0 : next;
      });
    } else {
      switchTo("focus");
    }
  }, [switchTo]);

  // ── Controls ──────────────────────────────────────────────────
  const toggle = useCallback(() => {
    setAppState((s) => (s === "running" ? "paused" : "running"));
  }, []);

  const reset = useCallback(() => {
    setAppState("idle");
    setTimeRemaining(CONFIG[timerTypeRef.current].minutes * 60);
  }, []);

  const toggleAlwaysOnTop = useCallback(async () => {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const win = getCurrentWindow();
      const next = !alwaysOnTop;
      await win.setAlwaysOnTop(next);
      setAlwaysOnTop(next);
    } catch { /* not in Tauri context */ }
  }, [alwaysOnTop]);

  // ── Keyboard shortcuts ────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === "Space") { e.preventDefault(); toggle(); }
      if (e.code === "Escape") { reset(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggle, reset]);

  // ── Render ────────────────────────────────────────────────────
  const btnLabel = appState === "running" ? "Pause" : appState === "paused" ? "Resume" : "Start";

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* Glass background */}
      <div className="absolute inset-0" style={{ backgroundColor: "var(--glass-bg)" }} />

      {/* Accent glow */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 rounded-full blur-3xl pointer-events-none transition-colors duration-700"
        style={{ backgroundColor: config.accentDim }}
      />

      {/* Content */}
      <div className="relative z-10 h-full flex flex-col items-center justify-center px-6 drag-region">
        {/* Title row with pin */}
        <div className="flex items-center gap-3 mb-1 no-drag">
          <span className="text-xs font-medium tracking-[0.2em] uppercase" style={{ color: "var(--text-dim)" }}>
            Pomodoro
          </span>
          <button
            onClick={toggleAlwaysOnTop}
            className="text-xs cursor-pointer transition-all duration-200 hover:scale-110"
            style={{ color: alwaysOnTop ? config.accent : "var(--text-dim)", opacity: alwaysOnTop ? 1 : 0.4 }}
            title="Always on top"
          >
            📌
          </button>
        </div>

        {/* Ring + timer */}
        <div className="relative mb-2 no-drag">
          <svg width={200} height={200} viewBox="0 0 200 200" className="rotate-[-90deg]">
            <circle cx="100" cy="100" r={R} fill="none" stroke={config.accentDim} strokeWidth="5" strokeLinecap="round" />
            <circle
              cx="100" cy="100" r={R}
              fill="none" stroke={config.accent} strokeWidth="5" strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={dashOffset}
              className="transition-all duration-500 ease-out"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-6xl font-light tabular-nums tracking-tight" style={{ color: "var(--text-primary)" }}>
              {String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
            </span>
            <span className="text-sm font-medium mt-1 transition-colors duration-500" style={{ color: config.accent }}>
              {config.label}
            </span>
          </div>
        </div>

        {/* Dots */}
        <div className="flex gap-2 mb-4 no-drag">
          {Array.from({ length: LONG_BREAK_INTERVAL }).map((_, i) => (
            <span
              key={i}
              className="text-base transition-all duration-500"
              style={{
                color: i < cycleCount ? config.accent : "var(--text-dim)",
                opacity: i < cycleCount ? 1 : 0.3,
              }}
            >
              ●
            </span>
          ))}
        </div>

        {/* Buttons */}
        <div className="flex gap-3 no-drag">
          <button
            onClick={toggle}
            className="px-7 py-2.5 rounded-xl text-sm font-medium cursor-pointer
                       transition-all duration-200 active:scale-95 border-none"
            style={{
              backgroundColor: config.accent,
              color: "white",
              boxShadow: `0 4px 20px ${config.accentDim}`,
            }}
          >
            {btnLabel}
          </button>
          <button
            onClick={reset}
            className="px-7 py-2.5 rounded-xl text-sm font-medium cursor-pointer
                       transition-all duration-200 active:scale-95 border"
            style={{
              backgroundColor: "rgba(255,255,255,0.06)",
              color: "var(--text-secondary)",
              borderColor: "rgba(255,255,255,0.08)",
            }}
          >
            Reset
          </button>
        </div>

        {/* Hints */}
        <span className="text-xs mt-5" style={{ color: "var(--text-dim)" }}>
          Space · Esc
        </span>
      </div>
    </div>
  );
}
