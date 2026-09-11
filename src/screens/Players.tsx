import { useState, useEffect } from "react";
import { db } from "../db/database";
import { useApp } from "../context/AppContext";
import type { Player, Team } from "../types/cricket";
import { getPlayerStats, formatStats } from "../engine/statistics";

export default function Players() {
  const { openPlayer } = useApp();
  const [players, setPlayers] = useState<Player[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [newPlayer, setNewPlayer] = useState({ name: "", teamId: 0, role: "bat", battingStyle: "right", bowlingStyle: "" });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const [p, t] = await Promise.all([db.players.toArray(), db.teams.toArray()]);
    setPlayers(p);
    setTeams(t);
    if (t.length > 0 && !newPlayer.teamId) setNewPlayer((prev) => ({ ...prev, teamId: t[0].id! }));
  }

  async function addPlayer() {
    if (!newPlayer.name || !newPlayer.teamId) return;
    await db.players.add({
      name: newPlayer.name,
      teamId: newPlayer.teamId,
      role: newPlayer.role as Player["role"],
      battingStyle: newPlayer.battingStyle as Player["battingStyle"],
      bowlingStyle: newPlayer.bowlingStyle,
      createdAt: Date.now(),
    });
    setShowAddPlayer(false);
    setNewPlayer({ name: "", teamId: newPlayer.teamId, role: "bat", battingStyle: "right", bowlingStyle: "" });
    loadData();
  }

  const teamMap: Record<number, Team> = {};
  for (const t of teams) teamMap[t.id!] = t;

  const filtered = players.filter((p) => {
    const matchTeam = selectedTeam === null || p.teamId === selectedTeam;
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase());
    return matchTeam && matchSearch;
  });

  return (
    <div className="flex flex-col h-full pb-20">
      <div className="px-4 pt-10 pb-4 bg-[#060e08]">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-black text-white">Players</h1>
          <button
            onClick={() => setShowAddPlayer(!showAddPlayer)}
            className="bg-[#00d25b] text-black font-bold px-4 py-2 rounded-lg text-sm"
          >
            + Add
          </button>
        </div>

        {/* Search */}
        <input
          placeholder="Search players..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-[#0d1f11] border border-[#1e3d24] rounded-xl px-4 py-2.5 text-white font-mono text-sm focus:outline-none focus:border-[#00d25b] mb-3"
        />

        {/* Team filter */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setSelectedTeam(null)}
            className={`shrink-0 px-3 py-1.5 rounded-lg border font-mono text-xs transition-colors ${selectedTeam === null ? "bg-[#00d25b] border-[#00d25b] text-black font-bold" : "border-[#1e3d24] text-[#4a6b52]"}`}
          >
            All
          </button>
          {teams.map((t) => (
            <button
              key={t.id}
              onClick={() => setSelectedTeam(t.id!)}
              className={`shrink-0 px-3 py-1.5 rounded-lg border font-mono text-xs transition-colors ${selectedTeam === t.id ? "bg-[#00d25b] border-[#00d25b] text-black font-bold" : "border-[#1e3d24] text-[#4a6b52]"}`}
            >
              {t.shortName}
            </button>
          ))}
        </div>
      </div>

      {/* Add player form */}
      {showAddPlayer && (
        <div className="px-4 py-4 bg-[#0d1f11] border-b border-[#1e3d24] space-y-3">
          <h3 className="text-white font-bold">New Player</h3>
          <input
            placeholder="Player name"
            value={newPlayer.name}
            onChange={(e) => setNewPlayer({ ...newPlayer, name: e.target.value })}
            className="w-full bg-[#060e08] border border-[#1e3d24] rounded-lg px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-[#00d25b]"
          />
          <select
            value={newPlayer.teamId}
            onChange={(e) => setNewPlayer({ ...newPlayer, teamId: Number(e.target.value) })}
            className="w-full bg-[#060e08] border border-[#1e3d24] rounded-lg px-3 py-2 text-white font-mono text-sm focus:outline-none"
          >
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2">
            {(["bat", "bowl", "allrounder", "wk"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setNewPlayer({ ...newPlayer, role: r })}
                className={`py-2 rounded-lg border font-mono text-xs ${newPlayer.role === r ? "bg-[#00d25b] border-[#00d25b] text-black" : "border-[#1e3d24] text-[#4a6b52]"}`}
              >
                {r}
              </button>
            ))}
          </div>
          <input
            placeholder="Bowling style (e.g. right-arm fast)"
            value={newPlayer.bowlingStyle}
            onChange={(e) => setNewPlayer({ ...newPlayer, bowlingStyle: e.target.value })}
            className="w-full bg-[#060e08] border border-[#1e3d24] rounded-lg px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-[#00d25b]"
          />
          <div className="flex gap-2">
            <button onClick={() => setShowAddPlayer(false)} className="flex-1 py-2 border border-[#1e3d24] rounded-lg text-[#4a6b52] font-bold text-sm">Cancel</button>
            <button onClick={addPlayer} className="flex-1 py-2 bg-[#00d25b] rounded-lg text-black font-black text-sm">Add Player</button>
          </div>
        </div>
      )}

      {/* Player list */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {filtered.map((p) => (
          <PlayerRow key={p.id} player={p} team={teamMap[p.teamId]} onSelect={() => openPlayer(p.id!)} />
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-12 text-[#4a6b52] font-mono text-sm">No players found</div>
        )}
      </div>
    </div>
  );
}

function PlayerRow({ player, team, onSelect }: { player: Player; team: Team | undefined; onSelect: () => void }) {
  const roleBadge = {
    bat: "BAT",
    bowl: "BWL",
    allrounder: "ALL",
    wk: "WK",
  }[player.role];

  const roleColor = {
    bat: "text-[#00d25b]",
    bowl: "text-[#f5c842]",
    allrounder: "text-blue-400",
    wk: "text-orange-400",
  }[player.role];

  return (
    <button
      onClick={onSelect}
      className="w-full flex items-center gap-3 bg-[#0d1f11] border border-[#1e3d24] rounded-xl px-4 py-3 hover:border-[#2e5d34] transition-colors text-left"
    >
      <div className="w-10 h-10 rounded-full bg-[#1e3d24] flex items-center justify-center font-black text-white text-sm shrink-0">
        {player.name.charAt(0)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-white font-bold text-sm truncate">{player.name}</div>
        <div className="text-[#4a6b52] font-mono text-xs">{team?.shortName || "?"} · {player.bowlingStyle || player.battingStyle + " bat"}</div>
      </div>
      <span className={`font-mono text-xs font-bold ${roleColor}`}>{roleBadge}</span>
      <span className="text-[#4a6b52] text-sm">›</span>
    </button>
  );
}
