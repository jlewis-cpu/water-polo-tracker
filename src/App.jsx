import React, { useEffect, useMemo, useState } from "react";
import Button from "./components/Button";
import { Card, CardContent } from "./components/Card";
import Modal from "./components/Modal";
import { VARSITY, JV } from "./rosters";

const QUARTERS = ["Q1", "Q2", "Q3", "Q4"];
const CORE_ROW = ["Attempts", "Assists", "Drawn Exclusions", "Steals", "Turnovers", "Shot Block", "Sprint Won"];
const GOALIE_TOP = ["Saves", "Goals Against", "Bad Passes", "Goals"];
const HIDDEN_TILE = "Ejections";

// Helper: which fixed categories a player should have
function baseCatsFor(isGoalie) {
  return isGoalie ? [...GOALIE_TOP, ...CORE_ROW, HIDDEN_TILE] : [...QUARTERS, ...CORE_ROW, HIDDEN_TILE];
}

export default function App() {
  // IMPORTANT: categoriesExtras are ONLY user-added categories (not quarters/goalie/core/ejections)
  const [categoriesExtras, setCategoriesExtras] = useState([]); // persisted as wp_categories
  const [players, setPlayers] = useState([]); // [{name, cap, isGoalie, isPreloaded, stats:{...}}]

  // UI state
  const [showPlayerModal, setShowPlayerModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [selected, setSelected] = useState(null);

  const [newPlayerName, setNewPlayerName] = useState("");
  const [newPlayerCap, setNewPlayerCap] = useState("");
  const [newPlayerGoalie, setNewPlayerGoalie] = useState(false);
  const [newCategory, setNewCategory] = useState("");

  const [gameId, setGameId] = useState("");

  // Per-player undo stacks
  const [historyByPlayer, setHistoryByPlayer] = useState({}); // { [playerName]: [{cat}] }
  const [highlight, setHighlight] = useState(null); // flash feedback

  // --- Load & migrate localStorage ---
  useEffect(() => {
    const p = localStorage.getItem("wp_players");
    const c = localStorage.getItem("wp_categories");

    if (p) {
      const parsed = JSON.parse(p);
      setPlayers(parsed.map(migratePlayer));
    }

    // Clean saved categories so they only contain extras (no quarters/goalie/core/ejections)
    if (c) {
      const parsedC = JSON.parse(c);
      const filtered = parsedC.filter(
        x => !QUARTERS.includes(x) && !GOALIE_TOP.includes(x) && !CORE_ROW.includes(x) && x !== HIDDEN_TILE
      );
      setCategoriesExtras(filtered);
      localStorage.setItem("wp_categories", JSON.stringify(filtered));
    }
  }, []);

  // Persist
  useEffect(() => { localStorage.setItem("wp_players", JSON.stringify(players)); }, [players]);
  useEffect(() => { localStorage.setItem("wp_categories", JSON.stringify(categoriesExtras)); }, [categoriesExtras]);

  function migratePlayer(pl) {
    const isGoalie = !!pl.isGoalie;
    const isPreloaded = !!pl.isPreloaded;
    const base = baseCatsFor(isGoalie);

    // Merge existing stats and ensure all base cats are present
    const merged = { ...(pl.stats || {}) };
    base.forEach(cat => { if (merged[cat] == null) merged[cat] = 0; });

    // Remove irrelevant top row from legacy data:
    (isGoalie ? QUARTERS : GOALIE_TOP).forEach(cat => { if (cat in merged) delete merged[cat]; });

    return { name: pl.name, cap: pl.cap ?? "", isGoalie, isPreloaded, stats: merged };
  }

  // --- Stat operations ---
  const bump = (playerName, cat, delta, mode) => {
    setPlayers(ps =>
      ps.map(p => {
        if (p.name !== playerName) return p;
        const next = Math.max(0, (p.stats?.[cat] ?? 0) + delta);
        return { ...p, stats: { ...p.stats, [cat]: next } };
      })
    );
    const nonce = Date.now();
    setHighlight({ player: playerName, cat, mode, nonce });
    setTimeout(() => {
      setHighlight(curr => (curr && curr.nonce === nonce ? null : curr));
    }, 220);
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

  const isHighlighted = (playerName, cat, mode) =>
    highlight && highlight.player === playerName && highlight.cat === cat && highlight.mode === mode;

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
      cat === HIDDEN_TILE
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
  const allHeaders = useMemo(() => {
    const set = new Set([
      ...categoriesExtras,
      ...QUARTERS, ...GOALIE_TOP, ...CORE_ROW, HIDDEN_TILE
    ]);
    return ["Player", "Cap", ...Array.from(set)];
  }, [categoriesExtras]);

  const exportCSV = () => {
    const headers = allHeaders;
    const rows = players.map(p => [
      p.name,
      p.cap || "",
      ...headers.slice(2).map(h => (p.stats && p.stats[h] != null ? p.stats[h] : ""))
    ]);
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = (gameId || "game") + ".csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const selectedPlayer = players.find(p => p.name === selected);

  // --- Stats UI in modal ---
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
            {/* Player-local undo (left of Ejections) */}
            <Button
              onClick={() => undoForPlayer(player.name)}
              className={`bg-gray-800 text-white ${!(historyByPlayer[player.name] && historyByPlayer[player.name].length) ? "opacity-50 cursor-not-allowed" : ""}`}
              disabled={!(historyByPlayer[player.name] && historyByPlayer[player.name].length)}
            >
              Undo
            </Button>

            {/* Small red Ejections button */}
            <Button
              onClick={() => incrementStat(player.name, HIDDEN_TILE)}
              className="bg-red-600 text-white px-3 py-1 rounded-md"
              title="Add 1 Ejection"
              aria-label={`Add 1 Ejection for ${player.name}`}
            >
              Ejections: {player.stats?.[HIDDEN_TILE] ?? 0}
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
              className="w-full border-2 rounded-lg p-2 flex flex-col items-center justify-center text-center select-none transition h-16 hover:shadow active:scale-[0.99]"
              title={`Add 1 to ${c}`}
              aria-label={`Add 1 to ${c} for ${player.name}`}
            >
              <span className="font-semibold text-xs">{c}</span>
              <span className="text-lg font-extrabold">{player.stats?.[c] ?? 0}</span>
            </button>
          ))}
        </div>

        {/* Core row (common to both) */}
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
          {CORE_ROW.map((c) => (
            <button
              key={c}
              onClick={() => incrementStat(player.name, c)}
              className="w-full border-2 rounded-lg p-2 flex flex-col items-center justify-center text-center select-none transition h-16 hover:shadow active:scale-[0.99]"
              title={`Add 1 to ${c}`}
              aria-label={`Add 1 to ${c} for ${player.name}`}
            >
              <span className="font-semibold text-xs">{c}</span>
              <span className="text-lg font-extrabold">{player.stats?.[c] ?? 0}</span>
            </button>
          ))}
        </div>

        {/* Only user-added extras (with removable ×) */}
        {extras.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
            {extras.map((c) => (
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
                  className="w-full border-2 rounded-lg p-2 flex flex-col items-center justify-center text-center select-none transition h-16 hover:shadow active:scale-[0.99]"
                  title={`Add 1 to ${c}`}
                  aria-label={`Add 1 to ${c} for ${player.name}`}
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
      <Card className="shadow w-full">
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
    </div>
  );
}
