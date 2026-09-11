import { useState, useEffect } from "react";
import { db } from "../db/database";
import { useApp } from "../context/AppContext";
import type { Match, Team, Innings } from "../types/cricket";
import { formatOvers, calcRunRate } from "../engine/scoring";

interface MatchCard {
  match: Match;
  teamA: Team | undefined;
  teamB: Team | undefined;
  innings: Innings[];
}

export default function Home() {
  const { navigate, openMatch, state } = useApp();
  const [matches, setMatches] = useState<MatchCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!state.dbReady) return;
    loadMatches();
  }, [state.dbReady]);

  async function loadMatches() {
    setLoading(true);
    const allMatches = await db.matches.orderBy("createdAt").reverse().limit(20).toArray();
    const cards: MatchCard[] = await Promise.all(
      allMatches.map(async (m) => {
        const [teamA, teamB, innings] = await Promise.all([
          db.teams.get(m.teamAId),
          db.teams.get(m.teamBId),
          db.innings.where({ matchId: m.id }).sortBy("inningsNumber"),
        ]);
        return { match: m, teamA, teamB, innings };
      })
    );
    setMatches(cards);
    setLoading(false);
  }

  async function resumeMatch(card: MatchCard) {
    const liveInnings = card.innings.find((i) => !i.isCompleted);
    if (liveInnings) {
      openMatch(card.match.id!, liveInnings.id!);
    }
  }

  function statusColor(status: string) {
    if (status === "live") return "text-[#00d25b]";
    if (status === "completed") return "text-[#4a6b52]";
    return "text-[#f5c842]";
  }

  function statusLabel(status: string) {
    if (status === "live") return "● LIVE";
    if (status === "completed") return "FINAL";
    if (status === "innings-break") return "BREAK";
    if (status === "toss") return "TOSS";
    return "SETUP";
  }

  const liveMatches = matches.filter((c) => c.match.status === "live" || c.match.status === "innings-break");
  const recentMatches = matches.filter((c) => c.match.status === "completed");

  return (
    <div className="flex flex-col min-h-full pb-20">
      {/* Header */}
      <div className="px-4 pt-10 pb-6 bg-gradient-to-b from-[#060e08] to-transparent">
        <div className="flex items-end justify-between mb-1">
          <div>
            <p className="text-[#4a6b52] font-mono text-xs tracking-widest uppercase">Offline First</p>
            <h1 className="text-3xl font-black tracking-tight text-white leading-none">
              Cricket<span className="text-[#00d25b]">Score</span> Pro
            </h1>
          </div>
          <div className="text-right">
            <div className="text-[#4a6b52] font-mono text-xs">v1.0</div>
            <div className="text-[#00d25b] font-mono text-xs">◉ READY</div>
          </div>
        </div>
      </div>

      {/* Quick Action */}
      <div className="px-4 mb-6">
        <button
          onClick={() => navigate("new-match")}
          className="w-full bg-[#00d25b] hover:bg-[#00b84e] active:scale-[0.98] transition-all text-black font-black text-lg py-4 rounded-xl tracking-tight flex items-center justify-center gap-3"
        >
          <span className="text-2xl">▶</span>
          START NEW MATCH
        </button>
      </div>

      {/* Live Matches */}
      {liveMatches.length > 0 && (
        <section className="px-4 mb-6">
          <h2 className="font-mono text-xs text-[#4a6b52] tracking-widest uppercase mb-3">Active Matches</h2>
          <div className="space-y-3">
            {liveMatches.map((card) => (
              <LiveMatchCard key={card.match.id} card={card} onResume={() => resumeMatch(card)} />
            ))}
          </div>
        </section>
      )}

      {/* Recent Matches */}
      {loading ? (
        <div className="px-4 text-center text-[#4a6b52] font-mono text-sm py-8">Loading...</div>
      ) : (
        <section className="px-4 mb-4">
          <h2 className="font-mono text-xs text-[#4a6b52] tracking-widest uppercase mb-3">Recent Matches</h2>
          {recentMatches.length === 0 ? (
            <div className="bg-[#0d1f11] rounded-xl border border-[#1e3d24] p-8 text-center">
              <div className="text-4xl mb-3">🏏</div>
              <p className="text-[#4a6b52] font-mono text-sm">No matches yet.</p>
              <p className="text-[#4a6b52] font-mono text-xs mt-1">Start scoring to see history here.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentMatches.map((card) => (
                <RecentMatchCard key={card.match.id} card={card} />
              ))}
            </div>
          )}
        </section>
      )}

      {/* Formats info */}
      <section className="px-4 mb-4">
        <h2 className="font-mono text-xs text-[#4a6b52] tracking-widest uppercase mb-3">Supported Formats</h2>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: "Tape Ball", icon: "🟡", desc: "No LBW, casual rules" },
            { label: "Tennis Ball", icon: "🟠", desc: "Outdoor/beach cricket" },
            { label: "Club Cricket", icon: "⚪", desc: "Formal competition" },
            { label: "Hard Ball", icon: "🔴", desc: "Full professional rules" },
          ].map((f) => (
            <div key={f.label} className="bg-[#0d1f11] border border-[#1e3d24] rounded-xl p-3">
              <div className="text-xl mb-1">{f.icon}</div>
              <div className="text-white font-bold text-sm">{f.label}</div>
              <div className="text-[#4a6b52] text-xs font-mono mt-0.5">{f.desc}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function LiveMatchCard({ card, onResume }: { card: MatchCard; onResume: () => void }) {
  const liveInnings = card.innings.find((i) => !i.isCompleted);
  const score = liveInnings ? `${liveInnings.runs}/${liveInnings.wickets}` : "--";
  const overs = liveInnings ? formatOvers(liveInnings.overs, liveInnings.balls) : "0.0";
  const rr = liveInnings ? calcRunRate(liveInnings.runs, liveInnings.overs, liveInnings.balls) : "0.00";

  return (
    <div className="bg-[#0d1f11] border border-[#00d25b]/30 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#00d25b] animate-pulse" />
          <span className="text-[#00d25b] font-mono text-xs tracking-widest">LIVE</span>
        </div>
        <span className="text-[#4a6b52] font-mono text-xs">{card.match.ballType} · {card.match.totalOvers} ov</span>
      </div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-white font-black text-xl leading-none">{score}</div>
          <div className="text-[#4a6b52] font-mono text-xs mt-1">({overs} ov) RR: {rr}</div>
        </div>
        <div className="text-right">
          <div className="text-white font-bold text-sm">{card.teamA?.shortName} vs {card.teamB?.shortName}</div>
          <div className="text-[#4a6b52] font-mono text-xs">
            Inn {liveInnings?.inningsNumber || 1}
          </div>
        </div>
      </div>
      <button
        onClick={onResume}
        className="w-full bg-[#00d25b] text-black font-black text-sm py-2.5 rounded-lg hover:bg-[#00b84e] transition-colors"
      >
        RESUME SCORING →
      </button>
    </div>
  );
}

function RecentMatchCard({ card }: { card: MatchCard }) {
  const inn1 = card.innings[0];
  const inn2 = card.innings[1];

  return (
    <div className="bg-[#0d1f11] border border-[#1e3d24] rounded-xl p-3 flex items-center justify-between">
      <div>
        <div className="text-white font-bold text-sm">
          {card.teamA?.shortName} vs {card.teamB?.shortName}
        </div>
        <div className="text-[#4a6b52] font-mono text-xs mt-0.5">
          {card.match.format} · {new Date(card.match.createdAt).toLocaleDateString()}
        </div>
      </div>
      <div className="text-right">
        {inn1 && (
          <div className="text-white font-mono text-sm font-bold">
            {inn1.runs}/{inn1.wickets}
          </div>
        )}
        {inn2 && (
          <div className="text-[#4a6b52] font-mono text-xs">
            {inn2.runs}/{inn2.wickets}
          </div>
        )}
        {card.match.result && (
          <div className="text-[#f5c842] font-mono text-[10px] mt-0.5">{card.match.result}</div>
        )}
      </div>
    </div>
  );
}
