import { useState, useEffect } from "react";
import { db } from "../db/database";
import { useApp } from "../context/AppContext";
import type { Player, Team } from "../types/cricket";
import { getPlayerStats, formatStats } from "../engine/statistics";

export default function PlayerProfile() {
  const { state, navigate } = useApp();
  const { selectedPlayerId } = state;
  const [player, setPlayer] = useState<Player | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [stats, setStats] = useState<ReturnType<typeof formatStats> | null>(null);
  const [rawStats, setRawStats] = useState<Awaited<ReturnType<typeof getPlayerStats>> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!selectedPlayerId) { setLoading(false); return; }
    loadProfile();
  }, [selectedPlayerId]);

  async function loadProfile() {
    setLoading(true);
    const p = await db.players.get(selectedPlayerId!);
    if (!p) { setLoading(false); return; }
    setPlayer(p);
    const t = await db.teams.get(p.teamId);
    setTeam(t || null);
    const s = await getPlayerStats(selectedPlayerId!);
    setRawStats(s);
    setStats(formatStats(s));
    setLoading(false);
  }

  if (loading) return <div className="flex items-center justify-center h-full"><div className="text-[#00d25b] font-mono animate-pulse">Loading...</div></div>;
  if (!player) return <div className="flex items-center justify-center h-full"><p className="text-[#4a6b52] font-mono">Player not found</p></div>;

  const roleLabel = { bat: "Batsman", bowl: "Bowler", allrounder: "All-Rounder", wk: "Wicket-Keeper" }[player.role];

  return (
    <div className="flex flex-col h-full pb-20">
      {/* Header */}
      <div className="bg-gradient-to-b from-[#0d1f11] to-[#060e08] px-4 pt-10 pb-6 border-b border-[#1e3d24]">
        <button onClick={() => navigate("players")} className="text-[#4a6b52] font-mono text-sm mb-4 block">← Players</button>
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-[#1e3d24] border-2 border-[#00d25b]/30 flex items-center justify-center text-2xl font-black text-white">
            {player.name.charAt(0)}
          </div>
          <div>
            <h1 className="text-2xl font-black text-white leading-tight">{player.name}</h1>
            <div className="text-[#00d25b] font-mono text-sm">{team?.name}</div>
            <div className="text-[#4a6b52] font-mono text-xs mt-0.5">{roleLabel} · {player.battingStyle}-hand bat</div>
          </div>
        </div>
        {player.bowlingStyle && (
          <div className="mt-3 inline-block bg-[#0d1f11] border border-[#1e3d24] rounded-lg px-3 py-1">
            <span className="text-[#4a6b52] font-mono text-xs">{player.bowlingStyle}</span>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Overview */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Matches", value: rawStats?.matches || 0 },
            { label: "Bat Inn", value: rawStats?.battingInnings || 0 },
            { label: "Bowl Inn", value: rawStats?.bowlingInnings || 0 },
          ].map((s) => (
            <div key={s.label} className="bg-[#0d1f11] border border-[#1e3d24] rounded-xl p-3 text-center">
              <div className="text-2xl font-black text-white">{s.value}</div>
              <div className="text-[#4a6b52] font-mono text-xs mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Batting stats */}
        {rawStats && rawStats.battingInnings > 0 && (
          <div>
            <h2 className="text-[#4a6b52] font-mono text-xs uppercase tracking-widest mb-2">Batting</h2>
            <div className="bg-[#0d1f11] border border-[#1e3d24] rounded-xl p-4">
              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                {[
                  { label: "Runs", value: rawStats.battingRuns },
                  { label: "Average", value: stats?.battingAvg },
                  { label: "Strike Rate", value: stats?.strikeRate },
                  { label: "High Score", value: rawStats.highScore + (rawStats.notOuts > 0 ? "*" : "") },
                  { label: "50s / 100s", value: `${rawStats.fifties} / ${rawStats.hundreds}` },
                  { label: "4s / 6s", value: `${rawStats.fours} / ${rawStats.sixes}` },
                  { label: "Not Outs", value: rawStats.notOuts },
                  { label: "Balls", value: rawStats.battingBalls },
                ].map((s) => (
                  <div key={s.label}>
                    <div className="text-[#4a6b52] font-mono text-xs">{s.label}</div>
                    <div className="text-white font-black text-lg leading-tight">{s.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Bowling stats */}
        {rawStats && rawStats.bowlingInnings > 0 && (
          <div>
            <h2 className="text-[#4a6b52] font-mono text-xs uppercase tracking-widest mb-2">Bowling</h2>
            <div className="bg-[#0d1f11] border border-[#1e3d24] rounded-xl p-4">
              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                {[
                  { label: "Wickets", value: rawStats.bowlingWickets },
                  { label: "Economy", value: stats?.economy },
                  { label: "Average", value: stats?.bowlingAvg },
                  { label: "Best Figures", value: stats?.bowlingFigures },
                  { label: "Runs Given", value: rawStats.bowlingRuns },
                  { label: "Overs Bowled", value: rawStats.bowlingOvers + "." + rawStats.bowlingBalls },
                ].map((s) => (
                  <div key={s.label}>
                    <div className="text-[#4a6b52] font-mono text-xs">{s.label}</div>
                    <div className="text-white font-black text-lg leading-tight">{s.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Fielding */}
        {rawStats && (rawStats.catches > 0 || rawStats.stumpings > 0 || rawStats.runOuts > 0) && (
          <div>
            <h2 className="text-[#4a6b52] font-mono text-xs uppercase tracking-widest mb-2">Fielding</h2>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "Catches", value: rawStats.catches },
                { label: "Stumpings", value: rawStats.stumpings },
                { label: "Run Outs", value: rawStats.runOuts },
              ].map((s) => (
                <div key={s.label} className="bg-[#0d1f11] border border-[#1e3d24] rounded-xl p-3 text-center">
                  <div className="text-2xl font-black text-white">{s.value}</div>
                  <div className="text-[#4a6b52] font-mono text-xs mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {rawStats && rawStats.matches === 0 && (
          <div className="text-center py-8 text-[#4a6b52] font-mono text-sm">
            No match data yet. Start scoring to see stats here.
          </div>
        )}
      </div>
    </div>
  );
}
