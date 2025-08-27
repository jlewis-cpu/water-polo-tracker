import React, { useEffect, useMemo, useState, useRef } from "react";
import Button from "./components/Button";
import { Card, CardContent } from "./components/Card";
import Modal from "./components/Modal";
import { VARSITY, JV } from "./rosters";

const QUARTERS = ["Q1", "Q2", "Q3", "Q4"];
const CORE_ROW = ["Attempts", "Assists", "Drawn Exclusions", "Steals", "Turnovers", "Shot Block", "Sprint Won"];
const GOALIE_TOP = ["Saves", "Goals Against", "Bad Passes", "Goals"];
const HIDDEN_TILE = "Ejections";
const PENALTIES = "Penalties"; // player-level penalties

// Opponent stats per quarter: Ejections + Penalties
const OPP_QUARTERS = QUARTERS;
const OPP_EJ = (q) => `${q}_Ejections`;
const OPP_PE = (q) => `${q}_Penalties`;

function baseCatsFor(isGoalie) {
  return isGoalie
    ? [...GOALIE_TOP, ...CORE_ROW, HIDDEN_TILE, PENALTIES]
    : [...QUARTERS, ...CORE_ROW, HIDDEN_TILE, PENALTIES];
}

// Simple id maker for events
const eid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const fmtTime = (d) =>
  new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export default function App() {
  // ONLY user-added categories (extras)
  const [categoriesExtras, setCategoriesExtras] = useState([]); // persisted as wp_categories
  const [players, setPlayers] = useState([]);                   // [{name, cap, isGoalie, isPreloaded, stats}]
  const [opponents, setOpponents] = useState([]);               // [{cap: 1..24, stats: {...}}]

  // Game flow
  const [showStart, setShowStart] = useState(true);
  const [rosterChoice, setRosterChoice] = useState("VARSITY");
  const [pendingGameId, setPendingGameId] = useState("");
  const [gameId, setGameId] = useState("");

  // UI state
  const [showPlayerModal, setShowPlayerModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [selected, setSelected] = useState(null);         // player name
  const [selectedOpp, setSelectedOpp] = useState(null);   // opponent cap number

  const [newPlayerName, setNewPlayerName] = useState("");
  const [newPlayerCap, setNewPlayerCap] = useState("");
  const [newPlayerGoalie, setNewPlayerGoalie] = useState(false);
  const [newCategory, setNewCategory] = useState("");

  // Undo stacks & flash
  const [historyByPlayer, setHistoryByPlayer] = useState({}); // { [playerName]: [{cat}] }
  const [historyByOpp, setHistoryByOpp] = useState({});       // { [capNumber]: [{cat}] }
  const [highlight, setHighlight] = useState(null);           // { key, cat, mode, nonce }
  // key is playerName or `opp-<cap>`

  // Timeline
  const [events, setEvents] = useState([]);              // [{id, ts, subjectType, subject, category, delta, remarks?}]
  const [showTimeline, setShowTimeline] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [remarksDraft, setRemarksDraft] = useState("");

  // --- Load & migrate localStorage (only categories and opponents template initially) ---
useEffect(() => {
  // Load categories, filter out core/goalie/quarters
  const c = localStorage.getItem("wp_categories");
  if (c) {
    const parsedC = JSON.parse(c);
    const filtered = parsedC.filter(
      x =>
        !QUARTERS.includes(x) &&
        !GOALIE_TOP.includes(x) &&
        !CORE_ROW.includes(x) &&
        x !== HIDDEN_TILE &&
        x !== PENALTIES
    );
    setCategoriesExtras(filtered);
    localStorage.setItem("wp_categories", JSON.stringify(filtered));
  }

  // Start with empty opponents grid
  setOpponents(makeEmptyOpponents());

  // Try to resume in-progress session (optional)
  const p = localStorage.getItem("wp_players");
  const o = localStorage.getItem("wp_opponents");
  const e = localStorage.getItem("wp_events");
  const g = localStorage.getItem("wp_gameId");
  if (p && o && e && g) {
    try {
      setPlayers(JSON.parse(p));
      setOpponents(JSON.parse(o));
      setEvents(JSON.parse(e));
      setGameId(g);
      setShowStart(false);
    } catch {}
  }
}, []); // ← only ONE effect here


  // Persist dynamic data on change
  useEffect(() => { localStorage.setItem("wp_players", JSON.stringify(players)); }, [players]);
  useEffect(() => { localStorage.setItem("wp_categories", JSON.stringify(categoriesExtras)); }, [categoriesExtras]);
  useEffect(() => { localStorage.setItem("wp_opponents", JSON.stringify(opponents)); }, [opponents]);
  useEffect(() => { localStorage.setItem("wp_events", JSON.stringify(events)); }, [events]);
  useEffect(() => { if (gameId) localStorage.setItem("wp_gameId", gameId); }, [gameId]);

  function migratePlayer(pl) {
    const isGoalie = !!pl.isGoalie;
    const isPreloaded = !!pl.isPreloaded;
    const base = baseCatsFor(isGoalie);
    const merged = { ...(pl.stats || {}) };
    base.forEach(cat => { if (merged[cat] == null) merged[cat] = 0; });
    (isGoalie ? QUARTERS : GOALIE_TOP).forEach(cat => { if (cat in merged) delete merged[cat]; });
    return { name: pl.name, cap: pl.cap ?? "", isGoalie, isPreloaded, stats: merged };
  }

  function makeEmptyOpponents() {
    const list = [];
    for (let cap = 1; cap <= 24; cap++) {
      const stats = {};
      OPP_QUARTERS.forEach(q => {
        stats[OPP_EJ(q)] = 0;
        stats[OPP_PE(q)] = 0;
      });
      list.push({ cap, stats });
    }
    return list;
  }

  // --- Flash helper (fast) ---
  const flashClass = (key, cat) => {
    if (!highlight || highlight.key !== key || highlight.cat !== cat) return "";
    if (highlight.mode === "undo") return "flash-red";
    if (highlight.mode === "inc") return (cat === PENALTIES || String(cat).endsWith("_Penalties")) ? "flash-red" : "flash-green";
    return "";
  };
  const setFlash = (key, cat, mode) => {
    const nonce = Date.now();
    setHighlight({ key, cat, mode, nonce });
    setTimeout(() => {
      setHighlight(curr => (curr && curr.nonce === nonce ? null : curr));
    }, 120);
  };

// --- Reset / New Game helper ---
const resetToLanding = () => {
  // clear saved session from localStorage
  ['wp_players','wp_opponents','wp_categories','wp_events','wp_gameId'].forEach(k => localStorage.removeItem(k));
  
  // reset state
  setPlayers([]);
  setOpponents([]);
  setEvents([]);
  setHistoryByPlayer({});
  setHistoryByOpp({});
  setSelected(null);
  setRemarksDraft("");
  setSelectedOpp(null);
  setGameId("");
  setPendingGameId("");
  setShowStart(true);
};


  // --- Timeline helpers ---
  const recordEvent = (subjectType, subject, category, delta) => {
  const ev = { id: eid(), ts: Date.now(), subjectType, subject, category, delta, remarks: "" };
  setEvents(prev => [ev, ...prev]); // newest first
  // If nothing is selected yet, select this new event and reset draft once.
  if (selectedEventId == null) {
    setSelectedEventId(ev.id);
    setRemarksDraft("");
  }
};


  const selectedEvent = events.find(e => e.id === selectedEventId) || null;
  const updateSelectedRemarks = (text) => {
    setEvents(list => list.map(ev => ev.id === selectedEventId ? { ...ev, remarks: text } : ev));
  };
  const removeEvent = (id) => {
    setEvents(list => list.filter(ev => ev.id !== id));
     if (selectedEventId === id) {
   setSelectedEventId(null);
   setRemarksDraft("");
 }
  };

const saveRemarks = () => {
  if (!selectedEventId) return;
  const text = remarksDraft;
  setEvents(list =>
    list.map(ev => (ev.id === selectedEventId ? { ...ev, remarks: text } : ev))
  );
};


// Remove the newest matching +1 event from the timeline
const removeLatestEvent = (subjectType, subject, category) => {
  setEvents(prev => {
    const idx = prev.findIndex(
      ev =>
        ev.subjectType === subjectType &&
        ev.subject === subject &&
        ev.category === category &&
        ev.delta === +1
    );
    if (idx === -1) return prev; // nothing to remove
    const next = prev.slice();
    next.splice(idx, 1);
    return next;
  });
};


  // --- Player stat ops ---
  const bump = (playerName, cat, delta, modeForFlash) => {
    setPlayers(ps =>
      ps.map(p => {
        if (p.name !== playerName) return p;
        const next = Math.max(0, (p.stats?.[cat] ?? 0) + delta);
        return { ...p, stats: { ...p.stats, [cat]: next } };
      })
    );
    setFlash(playerName, cat, modeForFlash);
  };

  const incrementStat = (playerName, cat) => {
    bump(playerName, cat, +1, "inc");
    setHistoryByPlayer(h => ({
      ...h,
      [playerName]: [...(h[playerName] || []), { cat }]
    }));
    recordEvent("player", playerName, cat, +1);
  };

  const undoForPlayer = (playerName) => {
  setHistoryByPlayer(h => {
    const stack = [...(h[playerName] || [])];
    if (stack.length === 0) return h;
    const last = stack.pop();
    bump(playerName, last.cat, -1, "undo");
    // remove the newest matching +1 from timeline
    removeLatestEvent("player", playerName, last.cat);
    return { ...h, [playerName]: stack };
  });
};


  // --- Opponent stat ops ---
  const bumpOpp = (cap, cat, delta, modeForFlash) => {
    setOpponents(list =>
      list.map(o => {
        if (o.cap !== cap) return o;
        const next = Math.max(0, (o.stats?.[cat] ?? 0) + delta);
        return { ...o, stats: { ...o.stats, [cat]: next } };
      })
    );
    setFlash(`opp-${cap}`, cat, modeForFlash);
  };

  const incOpp = (cap, cat) => {
    bumpOpp(cap, cat, +1, "inc");
    setHistoryByOpp(h => ({
      ...h,
      [cap]: [...(h[cap] || []), { cat }]
    }));
    recordEvent("opponent", String(cap), cat, +1);
  };

const undoOpp = (cap) => {
  setHistoryByOpp(h => {
    const stack = [...(h[cap] || [])];
    if (stack.length === 0) return h;
    const last = stack.pop();
    bumpOpp(cap, last.cat, -1, "undo");
    // remove the newest matching +1 from timeline
    removeLatestEvent("opponent", String(cap), last.cat);
    return { ...h, [cap]: stack };
  });
};


  // --- Roster loaders (used only when starting a game) ---
  const buildRoster = (which) => {
    const list = which === "VARSITY" ? VARSITY : JV;
    return list.map(pl => ({
      name: pl.name,
      cap: pl.cap || "",
      isGoalie: !!pl.isGoalie,
      isPreloaded: true,
      stats: Object.fromEntries(baseCatsFor(!!pl.isGoalie).map(c => [c, 0])),
    })).map(migratePlayer);
  };

  // --- Start / End game ---
  const startGame = () => {
    setPlayers(buildRoster(rosterChoice));
    setOpponents(makeEmptyOpponents());
    setHistoryByPlayer({});
    setHistoryByOpp({});
    setEvents([]);
    setSelectedEventId(null);
    setRemarksDraft("");
    setGameId(pendingGameId.trim());
    setShowStart(false);
    setSelected(null);
    setSelectedOpp(null);
  };

  const endGame = () => {
    const ok = window.confirm("End game and download CSV?");
    if (!ok) return;
    exportCSV();
    // keep state so you can review/export again if needed
  };

  // --- Category ops (EXTRAS ONLY) ---
  const openAddCategory = () => { setNewCategory(""); setShowCategoryModal(true); };
  const confirmAddCategory = () => {
    const cat = newCategory.trim();
    if (
      !cat ||
      categoriesExtras.includes(cat) ||
      QUARTERS.includes(cat) ||
      GOALIE_TOP.includes(cat) ||
      CORE_ROW.includes(cat) ||
      cat === HIDDEN_TILE ||
      cat === PENALTIES
    ) return;

    const nextCats = [...categoriesExtras, cat];
    setCategoriesExtras(nextCats);
    setPlayers(players.map(p => ({ ...p, stats: { ...p.stats, [cat]: 0 } })));
    setShowCategoryModal(false);
  };
  const removeCategory = (cat) => {
    setCategoriesExtras(categoriesExtras.filter(c => c !== cat));
    setPlayers(players.map(p => {
      const { [cat]: _, ...rest } = p.stats || {};
      return { ...p, stats: rest };
    }));
  };

  // --- CSV ---
  const playerHeaders = useMemo(() => {
    const set = new Set([
      ...categoriesExtras,
      ...QUARTERS, ...GOALIE_TOP, ...CORE_ROW,
      HIDDEN_TILE, PENALTIES
    ]);
    return ["Player", "Cap", ...Array.from(set)];
  }, [categoriesExtras]);

  // Opponent headers: Cap, then Q1/Q2/Q3/Q4 × (Ejections, Penalties)
  const opponentHeaders = useMemo(() => {
    const cols = ["Opponent Cap"];
    OPP_QUARTERS.forEach(q => {
      cols.push(`${q} Ejections`, `${q} Penalties`);
    });
    return cols;
  }, []);

  const exportCSV = () => {
  // --- helpers for CSV escaping ---
  const csvEscape = (val) => {
    const s = String(val ?? "");
    // wrap in quotes if it contains comma, quote, or newline; escape quotes
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const row = (arr) => arr.map(csvEscape).join(",");

  // Players table
  const rowsPlayers = players.map(p => [
    p.name,
    p.cap || "",
    ...playerHeaders.slice(2).map(h => (p.stats && p.stats[h] != null ? p.stats[h] : ""))
  ]);

  // Opponent table
  const rowsOpponents = opponents.map(o => {
    const r = [String(o.cap)];
    OPP_QUARTERS.forEach(q => {
      r.push(o.stats[OPP_EJ(q)] ?? 0, o.stats[OPP_PE(q)] ?? 0);
    });
    return r;
  });

  // Timeline table (new third section)
  const timelineHeaders = ["Time", "Type", "Subject", "Category", "Delta", "Remarks"];
  const rowsTimeline = events.map(ev => [
    fmtTime(ev.ts),
    ev.subjectType,                           // "player" | "opponent"
    ev.subjectType === "player" ? ev.subject : `#${ev.subject}`,
    ev.category,
    ev.delta > 0 ? "+1" : "-1",
    ev.remarks || ""
  ]);

  // Build CSV with blank lines between sections
  const csvParts = [
    row(playerHeaders),
    ...rowsPlayers.map(row),
    "",
    row(opponentHeaders),
    ...rowsOpponents.map(row),
    "",
    row(timelineHeaders),
    ...rowsTimeline.map(row),
  ];

  const csv = csvParts.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = (gameId || "game") + ".csv";
  a.click();
  URL.revokeObjectURL(url);
};

  const selectedPlayer = players.find(p => p.name === selected);
  const selectedOppObj = opponents.find(o => o.cap === selectedOpp);

  // --- Stats UI in modal (Player) ---
  const PlayerStatsPanel = ({ player }) => {
    if (!player) return null;
    const topRow = player.isGoalie ? GOALIE_TOP : QUARTERS;
    const extras = categoriesExtras; // Only user-added

    return (
      <div className="space-y-4">
        {/* Header row inside modal */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="text-2xl font-bold" style={{ color: "var(--secondary)" }}>{player.name}</div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">Cap #</label>
              <input
                value={player.cap || ""}
                onChange={e => updateCap(player.name, e.target.value)}
                className="border rounded-md px-2 py-1 w-20"
                placeholder="#"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Player-local undo */}
            <Button
              onClick={() => undoForPlayer(player.name)}
              className={`bg-gray-800 text-white ${!(historyByPlayer[player.name] && historyByPlayer[player.name].length) ? "opacity-50 cursor-not-allowed" : ""}`}
              disabled={!(historyByPlayer[player.name] && historyByPlayer[player.name].length)}
            >
              Undo
            </Button>

            {/* Ejections */}
            <Button
              onClick={() => incrementStat(player.name, HIDDEN_TILE)}
              className={[
                "px-3 py-1 rounded-md text-white",
                "bg-red-600",
                flashClass(player.name, HIDDEN_TILE),
              ].join(" ")}
            >
              Ejections: {player.stats?.[HIDDEN_TILE] ?? 0}
            </Button>

            {/* Penalties (darker red, red flash on inc) */}
            <Button
              onClick={() => incrementStat(player.name, PENALTIES)}
              className={[
                "px-3 py-1 rounded-md text-white",
                "bg-red-800",
                flashClass(player.name, PENALTIES),
              ].join(" ")}
            >
              Penalties: {player.stats?.[PENALTIES] ?? 0}
            </Button>

            {/* Remove only for non-preloaded players */}
            {!player.isPreloaded && (
              <button className="text-red-600 font-semibold" onClick={() => removePlayer(player.name)}>Remove</button>
            )}
          </div>
        </div>

        {/* Top row (goalie OR field) */}
        <div className="grid grid-cols-4 gap-2">
          {topRow.map((c) => (
            <button
              key={c}
              onClick={() => incrementStat(player.name, c)}
              className={[
                "w-full border-2 rounded-lg p-2 flex flex-col items-center justify-center",
                "text-center select-none transition h-16",
                flashClass(player.name, c),
                "hover:shadow active:scale-[0.99]",
              ].join(" ")}
              title={`Add 1 to ${c}`}
              aria-label={`Add 1 to ${c} for ${player.name}`}
            >
              <span className="font-semibold text-xs">{c}</span>
              <span className="text-lg font-extrabold">{player.stats?.[c] ?? 0}</span>
            </button>
          ))}
        </div>

        {/* Core row */}
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
          {CORE_ROW.map((c) => (
            <button
              key={c}
              onClick={() => incrementStat(player.name, c)}
              className={[
                "w-full border-2 rounded-lg p-2 flex flex-col items-center justify-center",
                "text-center select-none transition h-16",
                flashClass(player.name, c),
                "hover:shadow active:scale-[0.99]",
              ].join(" ")}
            >
              <span className="font-semibold text-xs">{c}</span>
              <span className="text-lg font-extrabold">{player.stats?.[c] ?? 0}</span>
            </button>
          ))}
        </div>

        {/* Extras (removable) */}
        {categoriesExtras.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
            {categoriesExtras.map((c) => (
              <div key={c} className="relative">
                <button
                  className="absolute -top-2 -right-2 bg-white border rounded-full w-5 h-5 text-red-600 leading-5 text-center z-10"
                  onClick={(e) => { e.stopPropagation(); removeCategory(c); }}
                  title={`Remove category ${c}`}
                  aria-label={`Remove category ${c}`}
                >
                  ×
                </button>
                <button
                  onClick={() => incrementStat(player.name, c)}
                  className={[
                    "w-full border-2 rounded-lg p-2 flex flex-col items-center justify-center",
                    "text-center select-none transition h-16",
                    flashClass(player.name, c),
                    "hover:shadow active:scale-[0.99]",
                  ].join(" ")}
                >
                  <span className="font-semibold text-xs">{c}</span>
                  <span className="text-lg font-extrabold">{player.stats?.[c] ?? 0}</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // --- Opponent modal UI ---
  const OpponentStatsPanel = ({ cap, opp }) => {
    if (!opp) return null;
    const hasUndo = !!(historyByOpp[cap] && historyByOpp[cap].length);

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-2xl font-bold" style={{ color: "var(--secondary)" }}>Opponent Cap #{cap}</div>
          <Button
            onClick={() => undoOpp(cap)}
            className={`bg-gray-800 text-white ${!hasUndo ? "opacity-50 cursor-not-allowed" : ""}`}
            disabled={!hasUndo}
          >
            Undo
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-3">
          {OPP_QUARTERS.map((q) => (
            <div key={q} className="flex items-center justify-between gap-3 border rounded-xl p-3">
              <div className="font-semibold">
                {q === "Q1" ? "Quarter 1" : q === "Q2" ? "Quarter 2" : q === "Q3" ? "Quarter 3" : "Quarter 4"}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => incOpp(cap, OPP_EJ(q))}
                  className={[
                    "px-3 py-1 rounded-md text-white",
                    "bg-red-600",
                    flashClass(`opp-${cap}`, OPP_EJ(q)),
                  ].join(" ")}
                >
                  Ejections: {opp.stats[OPP_EJ(q)]}
                </Button>
                <Button
                  onClick={() => incOpp(cap, OPP_PE(q))}
                  className={[
                    "px-3 py-1 rounded-md text-white",
                    "bg-red-800",
                    flashClass(`opp-${cap}`, OPP_PE(q)), // Penalties flash RED on inc
                  ].join(" ")}
                >
                  Penalties: {opp.stats[OPP_PE(q)]}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

// Ultra-simple, click-safe modal for debugging and production use
function SafeModal({ open, title, onClose, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[1000]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={() => {
          console.log("Backdrop click");
          onClose?.();
        }}
      />
      {/* Dialog */}
      <div
        className="absolute inset-0 flex items-center justify-center"
        // pointer-events on wrapper are enabled (default); dialog is clickable
      >
        <div
          className="relative bg-white rounded-xl shadow-2xl max-w-3xl w-[95%] p-4 outline-none"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold">{title}</h2>
            <button
              type="button"
              onClick={() => {
                console.log("X click");
                onClose?.();
              }}
              aria-label="Close"
              className="rounded p-1 hover:bg-gray-100"
            >
              ✕
            </button>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}


// --- Timeline modal UI ---
const TimelineModal = () => {
  const selectedEvent = events.find(e => e.id === selectedEventId) || null;

  // Keep the textarea focused while typing; only move focus on open/selection change
  const textareaRef = useRef(null);
  useEffect(() => {
    if (!showTimeline) return;
    if (!selectedEventId) return;
    const el = textareaRef.current;
    if (el) {
      const len = el.value.length;
      // place caret at the end and focus once when selection changes / modal opens
      try { el.setSelectionRange(len, len); } catch {}
      el.focus({ preventScroll: true });
    }
  }, [showTimeline, selectedEventId]); // not on every keystroke

  return (
    <SafeModal
      open={showTimeline}
      title="Timeline"
      onClose={() => setShowTimeline(false)}
      autoFocusOnOpen={false} // prevent modal from stealing focus each render
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left: event list */}
        <div className="max-h-[70vh] overflow-auto border rounded-xl">
          {events.length === 0 ? (
            <div className="p-4 text-gray-500">No events yet. Start tapping stats to see them here.</div>
          ) : (
            <ul>
              {events.map(ev => (
                <li
                  key={ev.id}
                  onClick={() => {
                    setSelectedEventId(ev.id);          // select this event
                    setRemarksDraft(ev.remarks || "");  // load its remarks into draft
                  }}
                  className={[
                    "px-3 py-2 border-b cursor-pointer flex items-center justify-between",
                    selectedEventId === ev.id ? "bg-gray-100" : "hover:bg-gray-50"
                  ].join(" ")}
                  title="Select to add remarks"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">{fmtTime(ev.ts)}</span>
                    <span className="font-medium">
                      {ev.subjectType === "player" ? `Player ${ev.subject}` : `Opp #${ev.subject}`}
                    </span>
                    <span className="text-sm text-gray-700">• {ev.category}</span>
                  </div>
                  <div className={`font-bold ${ev.delta > 0 ? "text-green-700" : "text-red-700"}`}>
                    {ev.delta > 0 ? "+1" : "-1"}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Right: remarks editor */}
        <div className="flex flex-col">
          <div className="mb-2 font-semibold" style={{ color: "var(--secondary)" }}>Remarks</div>
          {selectedEvent ? (
            <>
              <div className="mb-2 text-sm text-gray-600">
                {fmtTime(selectedEvent.ts)} — {selectedEvent.subjectType === "player" ? `Player ${selectedEvent.subject}` : `Opp #${selectedEvent.subject}`} • {selectedEvent.category} {selectedEvent.delta > 0 ? "+1" : "-1"}
              </div>

              <textarea
                ref={textareaRef}
                className="border rounded-xl p-3 min-h-[200px]"
                placeholder="Type notes about the play…"
                value={remarksDraft}
                onChange={(e) => setRemarksDraft(e.target.value)}  // update draft only (no events write)
              />

              <div className="flex justify-between items-center mt-3">
                <div className="text-xs text-gray-500">Saved locally</div>
                <div className="flex gap-2">
                  <Button className="btn-primary" onClick={() => { saveRemarks(); setShowTimeline(false); }}
      aria-label="Save and close"
      disabled={!selectedEventId}
    >
      Save & Close</Button>
                 
                </div>
              </div>
            </>
          ) : (
            <div className="text-gray-500">Select an event from the list to add remarks.</div>
          )}
        </div>
      </div>
    </SafeModal>
  );
};

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header row: left logo/title, right buttons */}
      <header className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="Logo" className="h-14 w-14 object-contain" />
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold" style={{ color: "var(--primary)" }}>Water Polo</h1>
            {(!showStart && gameId) && (
              <span className="text-sm text-gray-600">Game: {gameId}</span>
            )}
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          <Button className="btn-primary" onClick={() => setShowPlayerModal(true)}>Add Player</Button>
          <Button className="btn-primary" onClick={() => openAddCategory()}>Add Category</Button>
          <Button onClick={endGame} className="bg-gray-800 text-white">End Game</Button>
<Button onClick={() => {
  if (window.confirm("Start a new game? Current stats will be cleared.")) resetToLanding();
}} className="bg-red-700 text-white">
  New Game
</Button>
        </div>
      </header>

      {/* Player Grid */}
      <Card className="shadow w-full mb-6">
        <CardContent>
          {players.length === 0 ? (
            <div className="text-gray-500">Start a game from the landing screen to load a roster.</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {players.map((p) => (
                <button
                  key={p.name}
                  onClick={() => setSelected(p.name)}
                  className="border-2 rounded-xl p-3 text-left hover:shadow active:scale-[0.99] transition"
                  title={`Open stats for ${p.name}`}
                >
                  <div className="font-bold" style={{ color: "var(--secondary)" }}>{p.name}</div>
                  <div className="text-xs mt-0.5 text-gray-600">
                    {p.isGoalie ? "Goalie" : "Field"}{p.cap ? ` • Cap #${p.cap}` : ""}
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Opposition Caps Grid */}
      <Card className="shadow w-full">
        <CardContent>
          <div className="mb-3 font-semibold" style={{ color: "var(--secondary)" }}>Opposition Caps</div>
          <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-12 gap-2">
            {opponents.map((o) => (
              <button
                key={o.cap}
                onClick={() => setSelectedOpp(o.cap)}
                className="rounded-lg py-2 text-center font-bold hover:shadow active:scale-[0.99] transition"
                style={{ background: "#b3b3b3", color: "#fff" }}
                title={`Open stats for Opponent #${o.cap}`}
              >
                #{o.cap}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

{/* Timeline launcher (centered, primary color) */}
<div className="mt-4 flex justify-center">
  <Button
    onClick={() => setShowTimeline(true)}
    className="text-white px-4 py-2 rounded-lg"
    style={{ background: "var(--primary)" }}
  >
    Timeline
  </Button>
</div>


      {/* Landing / Start Game Overlay */}
      <Modal open={showStart} title="Start Game" onClose={() => { /* keep explicit flow */ }}>
        <div className="space-y-4">
          <div>
            <label className="block mb-1 font-semibold" style={{ color: "var(--secondary)" }}>Game Identifier</label>
            <input
              value={pendingGameId}
              onChange={e => setPendingGameId(e.target.value)}
              placeholder="e.g., at South High School"
              className="border-2 rounded-xl px-3 py-2 w-full"
            />
          </div>

          <div>
            <div className="mb-2 font-semibold" style={{ color: "var(--secondary)" }}>Choose Roster</div>
            <div className="flex gap-2">
              <Button
                className={`btn-primary ${rosterChoice === "VARSITY" ? "" : "opacity-60"}`}
                onClick={() => setRosterChoice("VARSITY")}
              >
                Varsity
              </Button>
              <Button
                className={`btn-primary ${rosterChoice === "JV" ? "" : "opacity-60"}`}
                onClick={() => setRosterChoice("JV")}
              >
                JV
              </Button>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button className="btn-ghost" onClick={() => { /* optional cancel */ }}>Cancel</Button>
            <Button
              className="btn-primary"
              onClick={startGame}
              disabled={!rosterChoice}
            >
              Start Game
            </Button>
          </div>
        </div>
      </Modal>

      {/* Add Player Modal */}
      <Modal open={showPlayerModal} title="Add Player" onClose={() => setShowPlayerModal(false)}>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">Player Name</label>
            <input
              value={newPlayerName}
              onChange={e => setNewPlayerName(e.target.value)}
              className="border rounded-lg px-3 py-2 w-full"
              placeholder="e.g., Taylor Smith"
            />
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className="block text-sm font-medium mb-1">Cap # (optional)</label>
              <input
                value={newPlayerCap}
                onChange={e => setNewPlayerCap(e.target.value)}
                className="border rounded-lg px-3 py-2 w-full"
                placeholder="e.g., 7"
              />
            </div>
            <label className="inline-flex items-center gap-2 mt-6">
              <input
                type="checkbox"
                checked={newPlayerGoalie}
                onChange={e => setNewPlayerGoalie(e.target.checked)}
              />
              <span className="text-sm">Goalie</span>
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button className="btn-ghost" onClick={() => setShowPlayerModal(false)}>Cancel</Button>
            <Button
              className="btn-primary"
              onClick={() => {
                const name = newPlayerName.trim();
                const cap = newPlayerCap.trim();
                const isGoalie = !!newPlayerGoalie;
                if (!name || players.some(p => p.name === name)) return;
                setPlayers([...players, {
                  name, cap, isGoalie, isPreloaded: false,
                  stats: Object.fromEntries(baseCatsFor(isGoalie).map(c => [c, 0])),
                }]);
                setShowPlayerModal(false);
              }}
            >
              Add Player
            </Button>
          </div>
        </div>
      </Modal>

      {/* Add Category Modal */}
      <Modal open={showCategoryModal} title="Add Category" onClose={() => setShowCategoryModal(false)}>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">Category Name</label>
            <input
              value={newCategory}
              onChange={e => setNewCategory(e.target.value)}
              className="border rounded-lg px-3 py-2 w-full"
              placeholder="e.g., Blocks"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button className="btn-ghost" onClick={() => setShowCategoryModal(false)}>Cancel</Button>
            <Button className="btn-primary" onClick={() => {
              const cat = newCategory.trim();
              if (
                !cat ||
                categoriesExtras.includes(cat) ||
                QUARTERS.includes(cat) ||
                GOALIE_TOP.includes(cat) ||
                CORE_ROW.includes(cat) ||
                cat === HIDDEN_TILE ||
                cat === PENALTIES
              ) return;
              const nextCats = [...categoriesExtras, cat];
              setCategoriesExtras(nextCats);
              setPlayers(players.map(p => ({ ...p, stats: { ...p.stats, [cat]: 0 } })));
              setShowCategoryModal(false);
            }}>
              Add Category
            </Button>
          </div>
        </div>
      </Modal>

      {/* Player Stats Modal */}
      <Modal open={!!selected} title="Player Stats" onClose={() => setSelected(null)}>
        {selectedPlayer ? <PlayerStatsPanel player={selectedPlayer} /> : null}
      </Modal>

      {/* Opponent Stats Modal */}
      <Modal open={!!selectedOpp} title="Opponent Stats" onClose={() => setSelectedOpp(null)}>
        {selectedOppObj ? <OpponentStatsPanel cap={selectedOppObj.cap} opp={selectedOppObj} /> : null}
      </Modal>

      {/* Timeline Modal */}
      <TimelineModal />
    </div>
  );
}
