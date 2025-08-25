import React, { useEffect, useMemo, useState } from "react";
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

export default function App() {
  // ONLY user-added categories (extras)
  const [categoriesExtras, setCategoriesExtras] = useState([]); // persisted as wp_categories
  const [players, setPlayers] = useState([]);                   // [{name, cap, isGoalie, isPreloaded, stats}]
  const [opponents, setOpponents] = useState([]);               // [{cap: 1..24, stats: {...}}]

  // UI state
  const [showPlayerModal, setShowPlayerModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [selected, setSelected] = useState(null);         // player name
  const [selectedOpp, setSelectedOpp] = useState(null);   // opponent cap number

  const [newPlayerName, setNewPlayerName] = useState("");
  const [newPlayerCap, setNewPlayerCap] = useState("");
  const [newPlayerGoalie, setNewPlayerGoalie] = useState(false);
  const [newCategory, setNewCategory] = useState("");

  const [gameId, setGameId] = useState("");

  // Undo stacks & flash
  const [historyByPlayer, setHistoryByPlayer] = useState({}); // { [playerName]: [{cat}] }
  const [historyByOpp, setHistoryByOpp] = useState({});       // { [capNumber]: [{cat}] }
  const [highlight, setHighlight] = useState(null);           // { key, cat, mode, nonce }
  // key is playerName or `opp-<cap>`

  // --- Load & migrate localStorage ---
  useEffect(() => {
    const p = localStorage.getItem("wp_players");
    const c = localStorage.getItem("wp_categories");
    const o = localStorage.getItem("wp_opponents");

    if (p) {
      const parsed = JSON.parse(p);
      setPlayers(parsed.map(migratePlayer));
    }

    // Clean categories -> only extras
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

    if (o) {
      const parsedO = JSON.parse(o);
      setOpponents(migrateOpponents(parsedO));
    } else {
      setOpponents(makeEmptyOpponents());
    }
  }, []);

  useEffect(() => { localStorage.setItem("wp_players", JSON.stringify(players)); }, [players]);
  useEffect(() => { localStorage.setItem("wp_categories", JSON.stringify(categoriesExtras)); }, [categoriesExtras]);
  useEffect(() => { localStorage.setItem("wp_opponents", JSON.stringify(opponents)); }, [opponents]);

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

  function migrateOpponents(arr) {
    const base = makeEmptyOpponents();
    const byCap = new Map(base.map(o => [o.cap, o]));
    (arr || []).forEach(o => {
      const target = byCap.get(o.cap);
      if (!target) return;
      const merged = { ...(o.stats || {}) };
      OPP_QUARTERS.forEach(q => {
        if (merged[OPP_EJ(q)] == null) merged[OPP_EJ(q)] = 0;
        if (merged[OPP_PE(q)] == null) merged[OPP_PE(q)] = 0;
      });
      target.stats = merged;
    });
    return Array.from(byCap.values());
  }

  // --- Flash helper: penalties flash RED on increment; all others GREEN on increment; undo always RED ---
  const flashClass = (key, cat) => {
    if (!highlight || highlight.key !== key || highlight.cat !== cat) return "";
    if (highlight.mode === "undo") return "flash-red";
    if (highlight.mode === "inc") return (cat === PENALTIES || cat.endsWith("_Penalties")) ? "flash-red" : "flash-green";
    return "";
  };

  const setFlash = (key, cat, mode) => {
    const nonce = Date.now();
    setHighlight({ key, cat, mode, nonce });
    setTimeout(() => {
      setHighlight(curr => (curr && curr.nonce === nonce ? null : curr));
    }, 120); // match CSS duration
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
  };

  const undoForPlayer = (playerName) => {
    setHistoryByPlayer(h => {
      const stack = [...(h[playerName] || [])];
      if (stack.length === 0) return h;
      const last = stack.pop();
      bump(playerName, last.cat, -1, "undo");
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
  };

  const undoOpp = (cap) => {
    setHistoryByOpp(h => {
      const stack = [...(h[cap] || [])];
      if (stack.length === 0) return h;
      const last = stack.pop();
      bumpOpp(cap, last.cat, -1, "undo");
      return { ...h, [cap]: stack };
    });
  };

  // --- Roster loaders ---
  const loadRoster = (rosterName) => {
    const list = rosterName === "VARSITY" ? VARSITY : JV;
    const hydrated = list.map(pl => ({
      name: pl.name,
      cap: pl.cap || "",
      isGoalie: !!pl.isGoalie,
      isPreloaded: true,
      stats: Object.fromEntries(baseCatsFor(!!pl.isGoalie).map(c => [c, 0])),
    }));
    setPlayers(hydrated);
    setSelected(null);
    setHistoryByPlayer({});
  };

  // --- Player ops ---
  const openAddPlayer = () => {
    setNewPlayerName("");
    setNewPlayerCap("");
    setNewPlayerGoalie(false);
    setShowPlayerModal(true);
  };
  const confirmAddPlayer = () => {
    const name = newPlayerName.trim();
    const cap = newPlayerCap.trim();
    const isGoalie = !!newPlayerGoalie;
    if (!name || players.some(p => p.name === name)) return;
    setPlayers([...players, {
      name, cap, isGoalie, isPreloaded: false,
      stats: Object.fromEntries(baseCatsFor(isGoalie).map(c => [c, 0])),
    }]);
    setShowPlayerModal(false);
  };
  const removePlayer = (name) => setPlayers(players.filter(p => p.name !== name));
  const updateCap = (name, cap) => { setPlayers(ps => ps.map(p => (p.name === name ? { ...p, cap } : p))); };

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
    // Players table
    const rowsPlayers = players.map(p => [
      p.name,
      p.cap || "",
      ...playerHeaders.slice(2).map(h => (p.stats && p.stats[h] != null ? p.stats[h] : ""))
    ]);

    // Opponent table
    const rowsOpponents = opponents.map(o => {
      const row = [String(o.cap)];
      OPP_QUARTERS.forEach(q => {
        row.push(o.stats[OPP_EJ(q)] ?? 0, o.stats[OPP_PE(q)] ?? 0);
      });
      return row;
    });

    // Combine sections with a blank line in between
    const csv = [
      playerHeaders.join(","),
      ...rowsPlayers.map(r => r.join(",")),
      "", // blank line
      opponentHeaders.join(","),
      ...rowsOpponents.map(r => r.join(",")),
    ].join("\n");

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
                    "bg-red-800", // darker red
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

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <header className="flex items-center gap-3 mb-6">
        <img src="/logo.png" alt="Logo" className="h-12 w-12 object-contain" />
        <h1 className="text-3xl font-bold" style={{ color: "var(--primary)" }}>Water Polo</h1>
      </header>

      {/* Controls row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-3 mb-6">
        <div className="flex-1">
          <label className="block mb-1 font-semibold" style={{ color: "var(--secondary)" }}>Game Identifier</label>
          <input
            value={gameId}
            onChange={e => setGameId(e.target.value)}
            placeholder="e.g., at South High School"
            className="border-2 rounded-xl px-3 py-2 w-full"
          />
        </div>

        <div className="flex gap-2 sm:self-end flex-wrap">
          <Button className="btn-primary" onClick={() => loadRoster("VARSITY")}>Varsity</Button>
          <Button className="btn-primary" onClick={() => loadRoster("JV")}>JV</Button>
          <Button className="btn-primary" onClick={openAddPlayer}>Add Player</Button>
          <Button className="btn-primary" onClick={openAddCategory}>Add Category</Button>
          <Button onClick={exportCSV} className="bg-gray-800 text-white">Export CSV</Button>
        </div>
      </div>

      {/* Player Grid */}
      <Card className="shadow w-full mb-6">
        <CardContent>
          {players.length === 0 ? (
            <div className="text-gray-500">Choose Varsity/JV or add players to begin.</div>
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
            <Button className="btn-primary" onClick={confirmAddPlayer}>Add Player</Button>
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
            <Button className="btn-primary" onClick={confirmAddCategory}>Add Category</Button>
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
    </div>
  );
}
