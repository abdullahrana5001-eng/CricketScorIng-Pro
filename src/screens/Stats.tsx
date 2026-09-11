import { useState, useEffect } from "react";
import { getTopBatsmen, getTopBowlers } from "../engine/statistics";
import type { TopBatsman, TopBowler } from "../engine/statistics";

type Tab = "batting" | "bowling";

export default function Stats() {
  const [tab, setTab] = useState<Tab>("batting");
  const [batsmen, setBatsmen] = useState<TopBatsman[]>([]);
  const [bowlers, setBowlers] = useState<TopBowler[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  async function loadStats() {
    setLoading(true);
    const [bat, bowl] = await Promise.all([getTopBatsmen(15), getTopBowlers(15)]);
    setBatsmen(bat);
    setBowlers(bowl);
    setLoading(false);
  }

  return (
    <div className="flex flex-col h-full pb-20">
      <div className="px-4 pt-10 pb-4 bg-[#060e08] border-b border-[#1e3d24]">
        <h1 className="text-2xl font-black text-white mb-4">Statistics</h1>
        <div className="flex gap-2">
          {(["batting", "bowling"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2.5 rounded-xl border font-mono text-sm font-bold uppercase tracking-widest transition-colors ${tab === t ? "bg-[#00d25b] border-[#00d25b] text-black" : "bg-[#0d1f11] border-[#1e3d24] text-[#4a6b52]"}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center flex-1">
          <div className="text-[#00d25b] font-mono animate-pulse">Loading...</div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {tab === "batting" && (
            <div className="px-4 py-4">
              {batsmen.length === 0 ? (
                <div className="text-center py-12 text-[#4a6b52] font-mono text-sm">No batting data yet. Score some matches!</div>
              ) : (
                <>
                  {/* Header row */}
                  <div className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-x-3 px-3 py-2 mb-1">
                    <span className="text-[#4a6b52] font-mono text-[10px] w-5">#</span>
                    <span className="text-[#4a6b52] font-mono text-[10px]">Player</span>
                    <span className="text-[#4a6b52] font-mono text-[10px]">Runs</span>
                    <span className="text-[#4a6b52] font-mono text-[10px]">Avg</span>
                    <span className="text-[#4a6b52] font-mono text-[10px]">SR</span>
                    <span className="text-[#4a6b52] font-mono text-[10px]">HS</span>
                  </div>
                  <div className="space-y-1.5">
                    {batsmen.map((b, i) => (
                      <div key={b.playerId} className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-x-3 bg-[#0d1f11] border border-[#1e3d24] rounded-xl px-3 py-3 items-center">
                        <span className={`font-mono text-sm font-black w-5 ${i === 0 ? "text-[#f5c842]" : i < 3 ? "text-[#00d25b]" : "text-[#4a6b52]"}`}>
                          {i + 1}
                        </span>
                        <div className="min-w-0">
                          <div className="text-white font-bold text-sm truncate">{b.playerName}</div>
                          <div className="text-[#4a6b52] font-mono text-[10px]">{b.innings} inn · {b.fifties} 50s · {b.hundreds} 100s</div>
                        </div>
                        <span className="text-white font-black text-sm">{b.runs}</span>
                        <span className="text-[#4a6b52] font-mono text-xs">{b.average}</span>
                        <span className="text-[#4a6b52] font-mono text-xs">{b.strikeRate}</span>
                        <span className={`font-black text-sm ${b.highScore >= 100 ? "text-[#f5c842]" : b.highScore >= 50 ? "text-[#00d25b]" : "text-white"}`}>{b.highScore}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {tab === "bowling" && (
            <div className="px-4 py-4">
              {bowlers.length === 0 ? (
                <div className="text-center py-12 text-[#4a6b52] font-mono text-sm">No bowling data yet. Score some matches!</div>
              ) : (
                <>
                  <div className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-x-3 px-3 py-2 mb-1">
                    <span className="text-[#4a6b52] font-mono text-[10px] w-5">#</span>
                    <span className="text-[#4a6b52] font-mono text-[10px]">Player</span>
                    <span className="text-[#4a6b52] font-mono text-[10px]">Wkts</span>
                    <span className="text-[#4a6b52] font-mono text-[10px]">Avg</span>
                    <span className="text-[#4a6b52] font-mono text-[10px]">Eco</span>
                    <span className="text-[#4a6b52] font-mono text-[10px]">Best</span>
                  </div>
                  <div className="space-y-1.5">
                    {bowlers.map((b, i) => (
                      <div key={b.playerId} className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-x-3 bg-[#0d1f11] border border-[#1e3d24] rounded-xl px-3 py-3 items-center">
                        <span className={`font-mono text-sm font-black w-5 ${i === 0 ? "text-[#f5c842]" : i < 3 ? "text-[#00d25b]" : "text-[#4a6b52]"}`}>
                          {i + 1}
                        </span>
                        <div className="min-w-0">
                          <div className="text-white font-bold text-sm truncate">{b.playerName}</div>
                          <div className="text-[#4a6b52] font-mono text-[10px]">{b.innings} inn</div>
                        </div>
                        <span className={`font-black text-sm ${b.wickets >= 50 ? "text-[#f5c842]" : b.wickets >= 20 ? "text-[#00d25b]" : "text-white"}`}>{b.wickets}</span>
                        <span className="text-[#4a6b52] font-mono text-xs">{b.average}</span>
                        <span className="text-[#4a6b52] font-mono text-xs">{b.economy}</span>
                        <span className="text-[#00d25b] font-mono text-xs font-bold">{b.bestFigures}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
