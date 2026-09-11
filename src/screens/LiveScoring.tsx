import { useState, useEffect, useCallback } from "react";
import { db } from "../db/database";
import { useApp } from "../context/AppContext";
import type { Player, Innings, Match, Team, Delivery, BatsmanInnings, BowlerInnings, WicketType, ExtraType } from "../types/cricket";
import { recordDelivery, undoLastDelivery, formatOvers, calcRunRate, calcRequiredRate, calcStrikeRate, calcEconomy, deriveCurrentStrikers, completeInnings } from "../engine/scoring";

interface WicketModalState {
  open: boolean;
  dismissedId: number | null;
}

interface NewBatterModal {
  open: boolean;
}

interface NewBowlerModal {
  open: boolean;
}

interface ExtraRunsModal {
  open: boolean;
  extraType: ExtraType;
}

export default function LiveScoring() {
  const { state, navigate, dispatch } = useApp();
  const { activeMatchId, activeInningsId } = state;

  const [match, setMatch] = useState<Match | null>(null);
  const [innings, setInnings] = useState<Innings | null>(null);
  const [teamA, setTeamA] = useState<Team | null>(null);
  const [teamB, setTeamB] = useState<Team | null>(null);
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [currentOverDeliveries, setCurrentOverDeliveries] = useState<Delivery[]>([]);
  const [recentDeliveries, setRecentDeliveries] = useState<Delivery[]>([]);
  const [batsmanMap, setBatsmanMap] = useState<Record<number, BatsmanInnings>>({});
  const [bowlerMap, setBowlerMap] = useState<Record<number, BowlerInnings>>({});

  const [strikerId, setStrikerId] = useState<number | null>(null);
  const [nonStrikerId, setNonStrikerId] = useState<number | null>(null);
  const [bowlerId, setBowlerId] = useState<number | null>(null);

  const [wicketModal, setWicketModal] = useState<WicketModalState>({ open: false, dismissedId: null });
  const [pendingWicket, setPendingWicket] = useState<{
    wicketType: WicketType; dismissedId: number; fielder1?: number; fielder2?: number;
  } | null>(null);
  const [newBatterModal, setNewBatterModal] = useState<NewBatterModal>({ open: false });
  const [newBowlerModal, setNewBowlerModal] = useState<NewBowlerModal>({ open: false });
  const [extraModal, setExtraModal] = useState<ExtraRunsModal>({ open: false, extraType: "none" });
  const [pendingExtra, setPendingExtra] = useState<{ extraType: ExtraType; batsmanRuns: number } | null>(null);
  const [extraRunsInput, setExtraRunsInput] = useState(0);
  const [loading, setLoading] = useState(true);
  const [scoring, setScoring] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const reload = useCallback(async () => {
    if (!activeMatchId || !activeInningsId) return;
    const [m, inn] = await Promise.all([
      db.matches.get(activeMatchId),
      db.innings.get(activeInningsId),
    ]);
    if (!m || !inn) return;
    setMatch(m);
    setInnings(inn);

    const [tA, tB, players] = await Promise.all([
      db.teams.get(m.teamAId),
      db.teams.get(m.teamBId),
      db.players.toArray(),
    ]);
    setTeamA(tA || null);
    setTeamB(tB || null);
    setAllPlayers(players);

    const deliveries = await db.deliveries.where({ inningsId: activeInningsId }).sortBy("deliverySequence");
    setRecentDeliveries(deliveries.slice(-30));

    const currentOver = deliveries.filter((d) => d.overNumber === inn.overs);
    setCurrentOverDeliveries(currentOver);

    const batMap: Record<number, BatsmanInnings> = {};
    const batRecords = await db.batsmanInnings.where({ inningsId: activeInningsId }).toArray();
    for (const b of batRecords) batMap[b.playerId] = b;
    setBatsmanMap(batMap);

    const bowlMap: Record<number, BowlerInnings> = {};
    const bowlRecords = await db.bowlerInnings.where({ inningsId: activeInningsId }).toArray();
    for (const b of bowlRecords) bowlMap[b.playerId] = b;
    setBowlerMap(bowlMap);

    setLoading(false);
  }, [activeMatchId, activeInningsId]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Derive current strikers from delivery history
  useEffect(() => {
    if (!recentDeliveries.length) return;
    const allDels = recentDeliveries;
    if (allDels.length > 0) {
      const first = allDels[0];
      const { strikerId: newStriker, nonStrikerId: newNon } = deriveCurrentStrikers(
        allDels,
        first.strikerId,
        first.nonStrikerId
      );
      setStrikerId(newStriker);
      setNonStrikerId(newNon);
      setBowlerId(allDels[allDels.length - 1].bowlerId);
    }
  }, [recentDeliveries]);

  async function addDelivery(batsmanRuns: number, extraType: ExtraType = "none", extraRuns = 0, isWicket = false, wicketType?: WicketType, dismissedId?: number, fielder1?: number, fielder2?: number) {
    if (!activeMatchId || !activeInningsId || !strikerId || !nonStrikerId || !bowlerId) return;
    if (scoring) return;
    setScoring(true);
    try {
      await recordDelivery({
        matchId: activeMatchId,
        inningsId: activeInningsId,
        strikerId,
        nonStrikerId,
        bowlerId,
        batsmanRuns,
        extraType,
        extraRuns,
        isWicket,
        wicketType,
        dismissedBatsmanId: dismissedId,
        fielder1Id: fielder1,
        fielder2Id: fielder2,
      });
      await reload();

      // Check if over complete
      const updatedInnings = await db.innings.get(activeInningsId);
      if (updatedInnings && updatedInnings.balls === 0 && updatedInnings.overs > 0) {
        // Over complete — swap strike (handled by engine) and ask for new bowler
        setNewBowlerModal({ open: true });
      }

      // If wicket, ask for new batsman
      if (isWicket) {
        setNewBatterModal({ open: true });
      }

      // Check match end conditions
      if (updatedInnings) {
        const maxWickets = 10;
        const isAllOut = updatedInnings.wickets >= maxWickets;
        const isOversComplete = match?.format !== "Test" && updatedInnings.overs >= (match?.totalOvers || 20) && updatedInnings.balls === 0;
        const target = updatedInnings.target;
        const chased = target && updatedInnings.runs >= target;

        if (isAllOut || isOversComplete || chased) {
          await completeInnings(activeInningsId, activeMatchId);
          await reload();
        }
      }
    } finally {
      setScoring(false);
    }
  }

  function handleRunButton(runs: number) {
    addDelivery(runs);
  }

  function handleExtra(extraType: ExtraType) {
    if (extraType === "wide" || extraType === "no-ball" || extraType === "bye" || extraType === "leg-bye") {
      setPendingExtra({ extraType, batsmanRuns: 0 });
      setExtraRunsInput(0);
      setExtraModal({ open: true, extraType });
    }
  }

  function confirmExtra() {
    if (!pendingExtra) return;
    const runs = extraRunsInput;
    addDelivery(
      pendingExtra.extraType === "bye" || pendingExtra.extraType === "leg-bye" || pendingExtra.extraType === "wide" ? 0 : pendingExtra.batsmanRuns,
      pendingExtra.extraType,
      runs
    );
    setExtraModal({ open: false, extraType: "none" });
    setPendingExtra(null);
    setExtraRunsInput(0);
  }

  function handleWicket() {
    setWicketModal({ open: true, dismissedId: strikerId });
  }

  async function handleUndo() {
    if (!activeInningsId || scoring) return;
    setScoring(true);
    try {
      await undoLastDelivery(activeInningsId);
      await reload();
      // Recompute strikers after undo
    } finally {
      setScoring(false);
    }
  }

  const striker = strikerId ? allPlayers.find((p) => p.id === strikerId) : null;
  const nonStriker = nonStrikerId ? allPlayers.find((p) => p.id === nonStrikerId) : null;
  const bowler = bowlerId ? allPlayers.find((p) => p.id === bowlerId) : null;
  const strikerStats = strikerId ? batsmanMap[strikerId] : null;
  const nonStrikerStats = nonStrikerId ? batsmanMap[nonStrikerId] : null;
  const bowlerStats = bowlerId ? bowlerMap[bowlerId] : null;
  const battingTeam = innings ? (innings.battingTeamId === match?.teamAId ? teamA : teamB) : null;
  const bowlingTeam = innings ? (innings.bowlingTeamId === match?.teamAId ? teamA : teamB) : null;
  const battingPlayers = allPlayers.filter((p) => p.teamId === innings?.battingTeamId);
  const bowlingPlayers = allPlayers.filter((p) => p.teamId === innings?.bowlingTeamId);
  const availableBatters = battingPlayers.filter((p) => !batsmanMap[p.id!]?.isOut && p.id !== strikerId && p.id !== nonStrikerId);
  const isTapeBall = match?.ballType === "tape-ball" || match?.ballType === "tennis-ball";

  const rr = innings ? calcRunRate(innings.runs, innings.overs, innings.balls) : "0.00";
  const rrq = innings?.target ? calcRequiredRate(innings.target, innings.runs, match?.totalOvers || 20, innings.overs, innings.balls) : null;

  function ballDotColor(d: Delivery) {
    if (d.isWicket) return "bg-red-600 text-white";
    if (d.batsmanRuns === 6) return "bg-[#f5c842] text-black";
    if (d.batsmanRuns === 4) return "bg-blue-500 text-white";
    if (d.extraType !== "none") return "bg-[#4a6b52] text-white";
    if (d.batsmanRuns === 0) return "bg-[#1e3d24] text-[#4a6b52]";
    return "bg-[#00d25b]/20 text-[#00d25b]";
  }

  function ballLabel(d: Delivery) {
    if (d.isWicket) return "W";
    if (d.extraType === "wide") return `Wd${d.extraRuns > 0 ? "+" + d.extraRuns : ""}`;
    if (d.extraType === "no-ball") return `Nb${d.batsmanRuns > 0 ? "+" + d.batsmanRuns : ""}`;
    if (d.extraType === "bye") return `B${d.extraRuns}`;
    if (d.extraType === "leg-bye") return `Lb${d.extraRuns}`;
    return String(d.batsmanRuns);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-[#00d25b] font-mono animate-pulse">Loading...</div>
      </div>
    );
  }

  if (!innings || !match) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 px-6">
        <p className="text-[#4a6b52] font-mono text-center">No active match. Start a new match from home.</p>
        <button onClick={() => navigate("home")} className="bg-[#00d25b] text-black font-bold px-6 py-3 rounded-xl">Go Home</button>
      </div>
    );
  }

  if (innings.isCompleted) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 px-6">
        <div className="text-4xl">🏆</div>
        <p className="text-white font-black text-xl text-center">Innings Complete</p>
        <p className="text-[#4a6b52] font-mono text-center">{innings.runs}/{innings.wickets} ({formatOvers(innings.overs, innings.balls)} ov)</p>
        <button onClick={() => navigate("scorecard")} className="bg-[#00d25b] text-black font-bold px-8 py-3 rounded-xl">View Scorecard</button>
        <button onClick={() => navigate("home")} className="text-[#4a6b52] font-mono text-sm">Back to Home</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full pb-0 relative">
      {/* Top bar */}
      <div className="bg-[#060e08] px-4 pt-6 pb-3 border-b border-[#1e3d24]">
        <div className="flex items-center justify-between mb-2">
          <button onClick={() => navigate("home")} className="text-[#4a6b52] text-sm font-mono">← Back</button>
          <div className="text-center">
            <div className="text-[#4a6b52] font-mono text-xs tracking-widest">
              {battingTeam?.shortName} vs {bowlingTeam?.shortName}
            </div>
            <div className="text-[#4a6b52] font-mono text-xs">{match.format} · {match.ballType}</div>
          </div>
          <button onClick={() => setShowMenu(!showMenu)} className="text-[#4a6b52] text-xl">≡</button>
        </div>

        {/* Score */}
        <div className="flex items-end justify-between">
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-5xl font-black text-white leading-none">{innings.runs}/{innings.wickets}</span>
            </div>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-[#4a6b52] font-mono text-sm">{formatOvers(innings.overs, innings.balls)}/{match.totalOvers} ov</span>
              <span className="text-[#00d25b] font-mono text-sm">RR {rr}</span>
              {rrq && <span className="text-[#f5c842] font-mono text-sm">RRQ {rrq}</span>}
            </div>
            {innings.target && (
              <div className="text-[#f5c842] font-mono text-xs mt-0.5">
                Target {innings.target} · Need {innings.target - innings.runs} off {(match.totalOvers * 6) - (innings.overs * 6 + innings.balls)} balls
              </div>
            )}
          </div>
          <div className="text-right">
            {innings.extras > 0 && (
              <div className="text-[#4a6b52] font-mono text-xs">Extras: {innings.extras}</div>
            )}
            <div className="text-[#4a6b52] font-mono text-xs">Inn {innings.inningsNumber}</div>
          </div>
        </div>

        {/* Current over balls */}
        <div className="flex items-center gap-1.5 mt-3 overflow-x-auto">
          <span className="text-[#4a6b52] font-mono text-xs shrink-0">This over:</span>
          {currentOverDeliveries.map((d, i) => (
            <span
              key={i}
              className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${ballDotColor(d)}`}
            >
              {ballLabel(d)}
            </span>
          ))}
          {currentOverDeliveries.length === 0 && (
            <span className="text-[#1e3d24] font-mono text-xs">No balls bowled yet</span>
          )}
        </div>
      </div>

      {/* Batsmen + bowler */}
      <div className="px-4 py-3 border-b border-[#1e3d24] bg-[#0a1a0c]">
        <div className="grid grid-cols-2 gap-3 mb-2">
          {[
            { player: striker, stats: strikerStats, label: "STRIKER ●" },
            { player: nonStriker, stats: nonStrikerStats, label: "Non-striker" },
          ].map(({ player, stats, label }) => (
            <div key={label} className="bg-[#0d1f11] rounded-lg p-2.5 border border-[#1e3d24]">
              <div className="text-[#4a6b52] font-mono text-[10px] uppercase tracking-widest mb-0.5">{label}</div>
              <div className="text-white font-bold text-sm leading-tight truncate">{player?.name || "—"}</div>
              <div className="text-[#00d25b] font-mono text-sm font-bold mt-0.5">
                {stats?.runs ?? 0}<span className="text-[#4a6b52] text-xs">({stats?.balls ?? 0})</span>
              </div>
              <div className="text-[#4a6b52] font-mono text-xs">
                SR: {calcStrikeRate(stats?.runs ?? 0, stats?.balls ?? 0)}
              </div>
            </div>
          ))}
        </div>
        <div className="bg-[#0d1f11] rounded-lg px-3 py-2 border border-[#1e3d24] flex items-center justify-between">
          <div>
            <div className="text-[#4a6b52] font-mono text-[10px] uppercase tracking-widest">Bowler</div>
            <div className="text-white font-bold text-sm">{bowler?.name || "—"}</div>
          </div>
          <div className="text-right font-mono text-sm">
            <span className="text-white">{formatOvers(bowlerStats?.overs ?? 0, bowlerStats?.balls ?? 0)}-{bowlerStats?.maidens ?? 0}-{bowlerStats?.runs ?? 0}-{bowlerStats?.wickets ?? 0}</span>
            <div className="text-[#4a6b52] text-xs">Eco: {calcEconomy(bowlerStats?.runs ?? 0, bowlerStats?.overs ?? 0, bowlerStats?.balls ?? 0)}</div>
          </div>
        </div>
      </div>

      {/* Scoring pad */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {/* Runs */}
        <div className="grid grid-cols-6 gap-2">
          {[0, 1, 2, 3, 4, 6].map((r) => (
            <button
              key={r}
              onClick={() => handleRunButton(r)}
              disabled={scoring}
              className={`aspect-square rounded-xl font-black text-xl flex items-center justify-center disabled:opacity-50 transition-all active:scale-95 ${
                r === 6 ? "bg-[#f5c842] text-black" :
                r === 4 ? "bg-blue-600 text-white" :
                r === 0 ? "bg-[#0d1f11] border border-[#1e3d24] text-[#4a6b52]" :
                "bg-[#0d1f11] border border-[#1e3d24] text-white hover:border-[#00d25b]/50"
              }`}
            >
              {r}
            </button>
          ))}
        </div>

        {/* Extras + Wicket */}
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => handleExtra("wide")}
            disabled={scoring}
            className="py-3 rounded-xl bg-[#0d1f11] border border-[#1e3d24] text-[#f5c842] font-bold text-sm disabled:opacity-50 active:scale-95 transition-all"
          >
            Wide
          </button>
          <button
            onClick={() => handleExtra("no-ball")}
            disabled={scoring}
            className="py-3 rounded-xl bg-[#0d1f11] border border-[#1e3d24] text-orange-400 font-bold text-sm disabled:opacity-50 active:scale-95 transition-all"
          >
            No Ball
          </button>
          <button
            onClick={handleWicket}
            disabled={scoring || !strikerId}
            className="py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-black text-sm disabled:opacity-50 active:scale-95 transition-all"
          >
            WICKET
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => handleExtra("bye")}
            disabled={scoring}
            className="py-3 rounded-xl bg-[#0d1f11] border border-[#1e3d24] text-[#4a6b52] font-bold text-sm disabled:opacity-50 active:scale-95 transition-all"
          >
            Bye
          </button>
          <button
            onClick={() => handleExtra("leg-bye")}
            disabled={scoring}
            className="py-3 rounded-xl bg-[#0d1f11] border border-[#1e3d24] text-[#4a6b52] font-bold text-sm disabled:opacity-50 active:scale-95 transition-all"
          >
            Leg Bye
          </button>
          <button
            onClick={handleUndo}
            disabled={scoring || recentDeliveries.length === 0}
            className="py-3 rounded-xl bg-[#0d1f11] border border-red-800/50 text-red-400 font-bold text-sm disabled:opacity-30 active:scale-95 transition-all"
          >
            ↩ Undo
          </button>
        </div>

        {/* Recent balls history */}
        <div>
          <p className="text-[#4a6b52] font-mono text-xs uppercase tracking-widest mb-2">Recent Deliveries</p>
          <div className="flex flex-wrap gap-1.5">
            {recentDeliveries.slice(-18).reverse().map((d, i) => (
              <span key={i} className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold ${ballDotColor(d)}`}>
                {ballLabel(d)}
              </span>
            ))}
          </div>
        </div>

        <div className="pb-4">
          <button
            onClick={() => navigate("scorecard")}
            className="w-full py-3 rounded-xl border border-[#1e3d24] text-[#4a6b52] font-mono text-sm hover:text-white hover:border-[#2e5d34] transition-colors"
          >
            View Full Scorecard →
          </button>
        </div>
      </div>

      {/* Menu overlay */}
      {showMenu && (
        <div className="absolute inset-0 bg-black/80 z-50 flex flex-col justify-end" onClick={() => setShowMenu(false)}>
          <div className="bg-[#0d1f11] border-t border-[#1e3d24] rounded-t-2xl p-6 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-white font-black text-lg mb-4">Match Options</h3>
            <button onClick={() => { navigate("scorecard"); setShowMenu(false); }} className="w-full text-left py-3 px-4 rounded-xl border border-[#1e3d24] text-white font-bold">View Scorecard</button>
            <button onClick={() => { setNewBowlerModal({ open: true }); setShowMenu(false); }} className="w-full text-left py-3 px-4 rounded-xl border border-[#1e3d24] text-white font-bold">Change Bowler</button>
            <button onClick={() => { setNewBatterModal({ open: true }); setShowMenu(false); }} className="w-full text-left py-3 px-4 rounded-xl border border-[#1e3d24] text-white font-bold">Change Batsman</button>
            <button onClick={() => setShowMenu(false)} className="w-full py-3 text-[#4a6b52] font-mono text-sm">Cancel</button>
          </div>
        </div>
      )}

      {/* Wicket Modal */}
      {wicketModal.open && (
        <WicketModal
          players={battingPlayers}
          fieldingPlayers={bowlingPlayers}
          strikerId={strikerId!}
          nonStrikerId={nonStrikerId!}
          isTapeBall={isTapeBall}
          onConfirm={(wicketType, dismissedId, fielder1, fielder2) => {
            setWicketModal({ open: false, dismissedId: null });
            addDelivery(0, "none", 0, true, wicketType, dismissedId, fielder1, fielder2);
          }}
          onCancel={() => setWicketModal({ open: false, dismissedId: null })}
        />
      )}

      {/* Extra runs modal */}
      {extraModal.open && (
        <div className="absolute inset-0 bg-black/80 z-50 flex items-center justify-center px-6">
          <div className="bg-[#0d1f11] border border-[#1e3d24] rounded-2xl p-6 w-full max-w-sm">
            <h3 className="text-white font-black text-lg mb-1 capitalize">{extraModal.extraType}</h3>
            <p className="text-[#4a6b52] font-mono text-xs mb-4">Additional runs? (excluding penalty)</p>
            <div className="grid grid-cols-5 gap-2 mb-4">
              {[0, 1, 2, 3, 4].map((r) => (
                <button
                  key={r}
                  onClick={() => setExtraRunsInput(r)}
                  className={`aspect-square rounded-xl font-black text-lg ${extraRunsInput === r ? "bg-[#00d25b] text-black" : "bg-[#060e08] border border-[#1e3d24] text-white"}`}
                >
                  {r}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setExtraModal({ open: false, extraType: "none" }); setPendingExtra(null); }} className="flex-1 py-3 border border-[#1e3d24] rounded-xl text-[#4a6b52] font-bold">Cancel</button>
              <button onClick={confirmExtra} className="flex-1 py-3 bg-[#00d25b] rounded-xl text-black font-black">Confirm</button>
            </div>
          </div>
        </div>
      )}

      {/* New batsman modal */}
      {newBatterModal.open && (
        <div className="absolute inset-0 bg-black/90 z-50 flex flex-col">
          <div className="bg-[#0d1f11] border-b border-[#1e3d24] px-4 pt-8 pb-4">
            <h3 className="text-white font-black text-xl">New Batsman</h3>
            <p className="text-[#4a6b52] font-mono text-xs">Select next batter</p>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
            {availableBatters.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  // The dismissed batsman is replaced by new batter
                  // strikerId is replaced if striker was dismissed, otherwise nonStriker
                  const wasStrikerOut = pendingWicket ? pendingWicket.dismissedId === strikerId : true;
                  if (wasStrikerOut) {
                    setStrikerId(p.id!);
                  } else {
                    setNonStrikerId(p.id!);
                  }
                  setNewBatterModal({ open: false });
                }}
                className="w-full flex items-center justify-between bg-[#0d1f11] border border-[#1e3d24] rounded-xl px-4 py-3 hover:border-[#00d25b]/50"
              >
                <span className="text-white font-bold">{p.name}</span>
                <span className="text-[#4a6b52] font-mono text-xs">{p.role}</span>
              </button>
            ))}
            {availableBatters.length === 0 && (
              <div className="text-center py-8">
                <p className="text-[#4a6b52] font-mono">All out!</p>
                <button onClick={() => { setNewBatterModal({ open: false }); }} className="mt-4 text-[#00d25b] font-mono text-sm">Close</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* New bowler modal */}
      {newBowlerModal.open && (
        <div className="absolute inset-0 bg-black/90 z-50 flex flex-col">
          <div className="bg-[#0d1f11] border-b border-[#1e3d24] px-4 pt-8 pb-4">
            <h3 className="text-white font-black text-xl">New Bowler</h3>
            <p className="text-[#4a6b52] font-mono text-xs">Over complete — select bowler</p>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
            {bowlingPlayers.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setBowlerId(p.id!);
                  setNewBowlerModal({ open: false });
                }}
                className={`w-full flex items-center justify-between border rounded-xl px-4 py-3 ${p.id === bowlerId ? "border-[#4a6b52] opacity-50" : "bg-[#0d1f11] border-[#1e3d24] hover:border-[#f5c842]/50"}`}
                disabled={p.id === bowlerId}
              >
                <span className="text-white font-bold">{p.name}</span>
                <div className="text-right">
                  {bowlerMap[p.id!] ? (
                    <span className="text-[#4a6b52] font-mono text-xs">
                      {formatOvers(bowlerMap[p.id!].overs, bowlerMap[p.id!].balls)}-{bowlerMap[p.id!].runs}-{bowlerMap[p.id!].wickets}
                    </span>
                  ) : (
                    <span className="text-[#4a6b52] font-mono text-xs">{p.bowlingStyle || "yet to bowl"}</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

type WicketModalProps = {
  players: Player[];
  fieldingPlayers: Player[];
  strikerId: number;
  nonStrikerId: number;
  isTapeBall: boolean;
  onConfirm: (wicketType: WicketType, dismissedId: number, fielder1?: number, fielder2?: number) => void;
  onCancel: () => void;
};

const WICKET_TYPES: { type: WicketType; label: string; needsFielder: boolean; tapeBallAllowed: boolean }[] = [
  { type: "bowled", label: "Bowled", needsFielder: false, tapeBallAllowed: true },
  { type: "caught", label: "Caught", needsFielder: true, tapeBallAllowed: true },
  { type: "lbw", label: "LBW", needsFielder: false, tapeBallAllowed: false },
  { type: "run-out", label: "Run Out", needsFielder: true, tapeBallAllowed: true },
  { type: "stumped", label: "Stumped", needsFielder: true, tapeBallAllowed: true },
  { type: "hit-wicket", label: "Hit Wicket", needsFielder: false, tapeBallAllowed: true },
  { type: "retired-hurt", label: "Retired Hurt", needsFielder: false, tapeBallAllowed: true },
  { type: "obstructing-field", label: "Obstructing Field", needsFielder: false, tapeBallAllowed: true },
];

function WicketModal({ players, fieldingPlayers, strikerId, nonStrikerId, isTapeBall, onConfirm, onCancel }: WicketModalProps) {
  const [selectedType, setSelectedType] = useState<WicketType | null>(null);
  const [dismissedId, setDismissedId] = useState<number>(strikerId);
  const [fielder1, setFielder1] = useState<number | null>(null);

  const availableTypes = WICKET_TYPES.filter((w) => !isTapeBall || w.tapeBallAllowed);
  const needsFielder = selectedType ? WICKET_TYPES.find((w) => w.type === selectedType)?.needsFielder : false;
  const runOutBatter = [strikerId, nonStrikerId];

  return (
    <div className="absolute inset-0 bg-black/90 z-50 flex flex-col">
      <div className="bg-[#0d1f11] border-b border-[#1e3d24] px-4 pt-8 pb-4">
        <h3 className="text-white font-black text-xl">Wicket</h3>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Dismissed batter */}
        <div>
          <p className="text-[#4a6b52] font-mono text-xs uppercase tracking-widest mb-2">Dismissed Batsman</p>
          <div className="grid grid-cols-2 gap-2">
            {[strikerId, nonStrikerId].map((id) => {
              const p = players.find((pl) => pl.id === id);
              return (
                <button
                  key={id}
                  onClick={() => setDismissedId(id)}
                  className={`py-3 px-3 rounded-xl border font-bold text-sm text-left ${dismissedId === id ? "bg-red-600 border-red-600 text-white" : "bg-[#0d1f11] border-[#1e3d24] text-white"}`}
                >
                  {p?.name}
                  {id === strikerId && <span className="text-[10px] font-mono block opacity-70">Striker</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Wicket type */}
        <div>
          <p className="text-[#4a6b52] font-mono text-xs uppercase tracking-widest mb-2">Dismissal Type</p>
          <div className="grid grid-cols-2 gap-2">
            {availableTypes.map((w) => (
              <button
                key={w.type}
                onClick={() => setSelectedType(w.type)}
                className={`py-2.5 px-3 rounded-xl border font-bold text-sm transition-colors ${selectedType === w.type ? "bg-red-600 border-red-600 text-white" : "bg-[#0d1f11] border-[#1e3d24] text-white hover:border-red-800"}`}
              >
                {w.label}
              </button>
            ))}
          </div>
        </div>

        {/* Fielder */}
        {needsFielder && (
          <div>
            <p className="text-[#4a6b52] font-mono text-xs uppercase tracking-widest mb-2">
              {selectedType === "run-out" ? "Fielder (direct hit)" : selectedType === "caught" ? "Caught by" : "Fielder"}
            </p>
            <div className="space-y-1.5 max-h-36 overflow-y-auto">
              {fieldingPlayers.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setFielder1(p.id!)}
                  className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${fielder1 === p.id ? "bg-[#f5c842] border-[#f5c842] text-black" : "bg-[#0d1f11] border-[#1e3d24] text-white"}`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="px-4 pb-6 flex gap-3 bg-[#0d1f11] border-t border-[#1e3d24] pt-4">
        <button onClick={onCancel} className="flex-1 py-3 border border-[#1e3d24] rounded-xl text-[#4a6b52] font-bold">Cancel</button>
        <button
          disabled={!selectedType}
          onClick={() => selectedType && onConfirm(selectedType, dismissedId, fielder1 || undefined)}
          className="flex-1 py-3 bg-red-600 disabled:opacity-40 rounded-xl text-white font-black"
        >
          Confirm Wicket
        </button>
      </div>
    </div>
  );
}
