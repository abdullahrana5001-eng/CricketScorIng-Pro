import { useState, useEffect } from "react";
import { db } from "../db/database";
import { useApp } from "../context/AppContext";
import type { Match, Team, Innings, Player, BatsmanInnings, BowlerInnings, Delivery } from "../types/cricket";
import { formatOvers, calcStrikeRate, calcEconomy } from "../engine/scoring";

interface ScorecardData {
  match: Match;
  teamA: Team;
  teamB: Team;
  innings: Array<{
    innings: Innings;
    battingTeam: Team;
    bowlingTeam: Team;
    batsmen: Array<{ stats: BatsmanInnings; player: Player | undefined }>;
    bowlers: Array<{ stats: BowlerInnings; player: Player | undefined }>;
    fallOfWickets: Array<{ runs: number; wickets: number; playerName: string }>;
  }>;
}

export default function Scorecard() {
  const { state, navigate } = useApp();
  const { activeMatchId } = state;
  const [data, setData] = useState<ScorecardData | null>(null);
  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeMatchId) { setLoading(false); return; }
    loadScorecard();
  }, [activeMatchId]);

  async function loadScorecard() {
    setLoading(true);
    const match = await db.matches.get(activeMatchId!);
    if (!match) { setLoading(false); return; }

    const [teamA, teamB, players, allInnings] = await Promise.all([
      db.teams.get(match.teamAId),
      db.teams.get(match.teamBId),
      db.players.toArray(),
      db.innings.where({ matchId: match.id }).sortBy("inningsNumber"),
    ]);

    const playerMap: Record<number, Player> = {};
    for (const p of players) playerMap[p.id!] = p;

    const inningsData = await Promise.all(
      allInnings.map(async (inn) => {
        const [batRecords, bowlRecords, deliveries] = await Promise.all([
          db.batsmanInnings.where({ inningsId: inn.id }).sortBy("battingOrder"),
          db.bowlerInnings.where({ inningsId: inn.id }).toArray(),
          db.deliveries.where({ inningsId: inn.id }).sortBy("deliverySequence"),
        ]);

        // Fall of wickets
        const fow: Array<{ runs: number; wickets: number; playerName: string }> = [];
        let wicketCount = 0;
        let runCount = 0;
        for (const d of deliveries) {
          runCount += d.totalRuns;
          if (d.isWicket) {
            wicketCount++;
            const dismissed = playerMap[d.dismissedBatsmanId || d.strikerId];
            fow.push({ runs: runCount, wickets: wicketCount, playerName: dismissed?.name || "?" });
          }
        }

        const battingTeam = inn.battingTeamId === match.teamAId ? teamA! : teamB!;
        const bowlingTeam = inn.bowlingTeamId === match.teamAId ? teamA! : teamB!;

        return {
          innings: inn,
          battingTeam,
          bowlingTeam,
          batsmen: batRecords.map((b) => ({ stats: b, player: playerMap[b.playerId] })),
          bowlers: bowlRecords
            .sort((a, b) => (b.overs * 6 + b.balls) - (a.overs * 6 + a.balls))
            .map((b) => ({ stats: b, player: playerMap[b.playerId] })),
          fallOfWickets: fow,
        };
      })
    );

    setData({ match, teamA: teamA!, teamB: teamB!, innings: inningsData });
    setLoading(false);
  }

  function dismissalText(b: BatsmanInnings, players: Record<number, Player>): string {
    if (!b.isOut) return "not out";
    const type = b.dismissalType;
    if (type === "bowled") return `b ${players[b.bowlerId!]?.name || "?"}`;
    if (type === "caught") return `c ${players[b.fielder1Id!]?.name || "?"} b ${players[b.bowlerId!]?.name || "?"}`;
    if (type === "lbw") return `lbw b ${players[b.bowlerId!]?.name || "?"}`;
    if (type === "run-out") return `run out (${players[b.fielder1Id!]?.name || "?"})`;
    if (type === "stumped") return `st ${players[b.fielder1Id!]?.name || "?"} b ${players[b.bowlerId!]?.name || "?"}`;
    if (type === "hit-wicket") return `hit wkt b ${players[b.bowlerId!]?.name || "?"}`;
    if (type === "retired-hurt") return "retired hurt";
    return type || "out";
  }

  if (loading) {
    return <div className="flex items-center justify-center h-full"><div className="text-[#00d25b] font-mono animate-pulse">Loading...</div></div>;
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 px-6">
        <p className="text-[#4a6b52] font-mono">No active match. Go home to start one.</p>
        <button onClick={() => navigate("home")} className="bg-[#00d25b] text-black font-bold px-6 py-3 rounded-xl">Home</button>
      </div>
    );
  }

  const allPlayerMap: Record<number, Player> = {};
  // Re-build from all innings
  data.innings.forEach((inn) => {
    inn.batsmen.forEach((b) => { if (b.player) allPlayerMap[b.player.id!] = b.player; });
  });

  const completedInns = data.innings.filter((i) => i.innings.runs > 0 || i.innings.balls > 0 || i.innings.overs > 0);
  const displayInnings = completedInns.length > 0 ? completedInns : data.innings;

  return (
    <div className="flex flex-col h-full pb-20">
      {/* Header */}
      <div className="bg-[#060e08] px-4 pt-8 pb-4 border-b border-[#1e3d24]">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => navigate(state.activeMatchId ? "live-scoring" : "home")} className="text-[#4a6b52] text-2xl leading-none">←</button>
          <div>
            <h1 className="text-xl font-black text-white">{data.teamA.shortName} vs {data.teamB.shortName}</h1>
            <p className="text-[#4a6b52] font-mono text-xs">{data.match.format} · {data.match.ballType} · {data.match.totalOvers} ov</p>
          </div>
        </div>

        {/* Match result */}
        {data.match.result && (
          <div className="bg-[#0d1f11] border border-[#f5c842]/30 rounded-xl px-4 py-2 mb-3">
            <p className="text-[#f5c842] font-bold text-sm text-center">{data.match.result}</p>
          </div>
        )}

        {/* Innings tabs */}
        {displayInnings.length > 1 && (
          <div className="flex gap-2">
            {displayInnings.map((inn, i) => (
              <button
                key={i}
                onClick={() => setTab(i)}
                className={`flex-1 py-2 rounded-lg border font-mono text-xs font-bold transition-colors ${tab === i ? "bg-[#00d25b] border-[#00d25b] text-black" : "bg-[#0d1f11] border-[#1e3d24] text-[#4a6b52]"}`}
              >
                {inn.battingTeam.shortName} Inn {inn.innings.inningsNumber}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Scorecard content */}
      <div className="flex-1 overflow-y-auto">
        {displayInnings[tab] && (
          <ScorecardInnings
            data={displayInnings[tab]}
            playerMap={allPlayerMap}
            dismissalText={dismissalText}
          />
        )}
      </div>
    </div>
  );
}

function ScorecardInnings({
  data,
  playerMap,
  dismissalText,
}: {
  data: ScorecardData["innings"][0];
  playerMap: Record<number, Player>;
  dismissalText: (b: BatsmanInnings, players: Record<number, Player>) => string;
}) {
  const inn = data.innings;

  return (
    <div className="px-4 py-4 space-y-4">
      {/* Innings summary */}
      <div className="bg-[#0d1f11] border border-[#1e3d24] rounded-xl p-4">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-white font-black text-lg">{data.battingTeam.name}</h2>
          {inn.isCompleted && <span className="text-[#00d25b] font-mono text-xs">COMPLETED</span>}
        </div>
        <div className="flex items-baseline gap-3">
          <span className="text-4xl font-black text-white">{inn.runs}/{inn.wickets}</span>
          <span className="text-[#4a6b52] font-mono text-sm">({formatOvers(inn.overs, inn.balls)} ov)</span>
        </div>
        <div className="flex gap-4 mt-2 text-xs font-mono text-[#4a6b52]">
          <span>Extras: {inn.extras}</span>
          <span>Wd: {inn.wides}</span>
          <span>Nb: {inn.noBalls}</span>
          <span>B: {inn.byes}</span>
          <span>Lb: {inn.legByes}</span>
        </div>
        {inn.target && (
          <div className="mt-2 text-[#f5c842] font-mono text-xs">Target: {inn.target}</div>
        )}
      </div>

      {/* Batting */}
      <div>
        <h3 className="text-[#4a6b52] font-mono text-xs uppercase tracking-widest mb-2">Batting</h3>
        <div className="bg-[#0d1f11] border border-[#1e3d24] rounded-xl overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-3 px-3 py-2 border-b border-[#1e3d24]">
            <span className="text-[#4a6b52] font-mono text-[10px] uppercase">Batter</span>
            <span className="text-[#4a6b52] font-mono text-[10px]">R</span>
            <span className="text-[#4a6b52] font-mono text-[10px]">B</span>
            <span className="text-[#4a6b52] font-mono text-[10px]">4s</span>
            <span className="text-[#4a6b52] font-mono text-[10px]">SR</span>
          </div>
          {data.batsmen.map((b, i) => (
            <div key={i} className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-3 px-3 py-2.5 border-b border-[#1e3d24]/50 last:border-0">
              <div className="min-w-0">
                <div className="text-white font-bold text-sm truncate">{b.player?.name || "?"}</div>
                <div className="text-[#4a6b52] font-mono text-[10px] truncate">{dismissalText(b.stats, playerMap)}</div>
              </div>
              <span className={`font-black text-sm self-center ${b.stats.runs >= 100 ? "text-[#f5c842]" : b.stats.runs >= 50 ? "text-[#00d25b]" : "text-white"}`}>
                {b.stats.runs}{!b.stats.isOut ? "*" : ""}
              </span>
              <span className="text-[#4a6b52] font-mono text-xs self-center">{b.stats.balls}</span>
              <span className="text-blue-400 font-mono text-xs self-center">{b.stats.fours}</span>
              <span className="text-[#4a6b52] font-mono text-xs self-center">{calcStrikeRate(b.stats.runs, b.stats.balls)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Bowling */}
      <div>
        <h3 className="text-[#4a6b52] font-mono text-xs uppercase tracking-widest mb-2">Bowling — {data.bowlingTeam.name}</h3>
        <div className="bg-[#0d1f11] border border-[#1e3d24] rounded-xl overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-3 px-3 py-2 border-b border-[#1e3d24]">
            <span className="text-[#4a6b52] font-mono text-[10px] uppercase">Bowler</span>
            <span className="text-[#4a6b52] font-mono text-[10px]">O</span>
            <span className="text-[#4a6b52] font-mono text-[10px]">R</span>
            <span className="text-[#4a6b52] font-mono text-[10px]">W</span>
            <span className="text-[#4a6b52] font-mono text-[10px]">Eco</span>
          </div>
          {data.bowlers.map((b, i) => (
            <div key={i} className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-3 px-3 py-2.5 border-b border-[#1e3d24]/50 last:border-0">
              <div className="text-white font-bold text-sm truncate">{b.player?.name || "?"}</div>
              <span className="text-[#4a6b52] font-mono text-xs self-center">{formatOvers(b.stats.overs, b.stats.balls)}</span>
              <span className="text-white font-mono text-xs self-center">{b.stats.runs}</span>
              <span className={`font-black text-sm self-center ${b.stats.wickets >= 5 ? "text-[#f5c842]" : b.stats.wickets >= 3 ? "text-[#00d25b]" : "text-white"}`}>
                {b.stats.wickets}
              </span>
              <span className="text-[#4a6b52] font-mono text-xs self-center">{calcEconomy(b.stats.runs, b.stats.overs, b.stats.balls)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Fall of Wickets */}
      {data.fallOfWickets.length > 0 && (
        <div>
          <h3 className="text-[#4a6b52] font-mono text-xs uppercase tracking-widest mb-2">Fall of Wickets</h3>
          <div className="bg-[#0d1f11] border border-[#1e3d24] rounded-xl p-3">
            <div className="flex flex-wrap gap-2">
              {data.fallOfWickets.map((fow, i) => (
                <div key={i} className="bg-[#060e08] border border-[#1e3d24] rounded-lg px-2 py-1 text-xs">
                  <span className="text-white font-mono font-bold">{fow.runs}-{fow.wickets}</span>
                  <span className="text-[#4a6b52] font-mono ml-1">({fow.playerName})</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
