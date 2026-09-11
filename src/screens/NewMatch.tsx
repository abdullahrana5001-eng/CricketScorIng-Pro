import { useState, useEffect } from "react";
import { db } from "../db/database";
import { useApp } from "../context/AppContext";
import type { Team, Player, BallType, MatchFormat } from "../types/cricket";

const FORMATS: { value: MatchFormat; label: string }[] = [
  { value: "Custom", label: "Limited overs" },
  { value: "T20", label: "T20" },
  { value: "ODI", label: "ODI" },
  { value: "Test", label: "Test" },
];
const BALL_TYPES: BallType[] = ["tape-ball", "tennis-ball", "club", "hard-ball"];
const OVER_PRESETS = [4, 5, 6, 8, 10, 12, 15, 20, 25, 50];
const DEFAULT_OVERS: Record<MatchFormat, number> = { T20: 20, ODI: 50, Test: 0, Custom: 6 };

export default function NewMatch() {
  const { navigate, dispatch } = useApp();
  const [teams, setTeams] = useState<Team[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);

  const [teamAId, setTeamAId] = useState<number | null>(null);
  const [teamBId, setTeamBId] = useState<number | null>(null);
  const [format, setFormat] = useState<MatchFormat>("Custom");
  const [ballType, setBallType] = useState<BallType>("tennis-ball");
  const [totalOvers, setTotalOvers] = useState(6);
  const [tossWinner, setTossWinner] = useState<"A" | "B">("A");
  const [tossChoice, setTossChoice] = useState<"bat" | "field">("bat");
  const [step, setStep] = useState(1);

  const [openingBatA, setOpeningBatA] = useState<number[]>([]);
  const [openingBatB, setOpeningBatB] = useState<number[]>([]);
  const [openingBowlerA, setOpeningBowlerA] = useState<number | null>(null);
  const [openingBowlerB, setOpeningBowlerB] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  const [showNewTeam, setShowNewTeam] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamShort, setNewTeamShort] = useState("");
  const [newTeamPlayers, setNewTeamPlayers] = useState<string[]>(Array(11).fill(""));
  const [teamSaving, setTeamSaving] = useState(false);

  async function loadData() {
    const [t, p] = await Promise.all([db.teams.toArray(), db.players.toArray()]);
    setTeams(t);
    setPlayers(p);
    if (!teamAId && t[0]?.id) setTeamAId(t[0].id);
    if (!teamBId && t[1]?.id) setTeamBId(t[1].id);
  }

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    if (format !== "Custom") setTotalOvers(DEFAULT_OVERS[format]);
  }, [format]);

  const teamAPlayerList = players.filter((p) => p.teamId === teamAId);
  const teamBPlayerList = players.filter((p) => p.teamId === teamBId);
  const battingTeamId = tossWinner === "A"
    ? (tossChoice === "bat" ? teamAId : teamBId)
    : (tossChoice === "bat" ? teamBId : teamAId);
  const bowlingTeamId = battingTeamId === teamAId ? teamBId : teamAId;
  const battingPlayers = battingTeamId === teamAId ? teamAPlayerList : teamBPlayerList;
  const bowlingPlayers = bowlingTeamId === teamAId ? teamAPlayerList : teamBPlayerList;
  const openingBat = battingTeamId === teamAId ? openingBatA : openingBatB;
  const setOpeningBat = battingTeamId === teamAId ? setOpeningBatA : setOpeningBatB;
  const openingBowler = bowlingTeamId === teamAId ? openingBowlerA : openingBowlerB;
  const setOpeningBowler = bowlingTeamId === teamAId ? setOpeningBowlerA : setOpeningBowlerB;

  async function createTeam() {
    const names = newTeamPlayers.map((n) => n.trim()).filter(Boolean);
    if (!newTeamName.trim() || !newTeamShort.trim() || names.length < 2 || teamSaving) return;
    setTeamSaving(true);
    try {
      const colors = ["#00d25b", "#f5c842", "#ef4444", "#3b82f6", "#a855f7", "#f97316"];
      const teamId = Number(await db.teams.add({
        name: newTeamName.trim(),
        shortName: newTeamShort.trim().slice(0, 4).toUpperCase(),
        color: colors[teams.length % colors.length],
        createdAt: Date.now(),
      }));
      await db.players.bulkAdd(names.map((name, i) => ({
        name,
        teamId,
        role: i === 0 ? "wk" : "bat",
        battingStyle: "right" as const,
        bowlingStyle: "",
        createdAt: Date.now(),
      })));
      await loadData();
      setTeamAId(teamAId || teamId);
      if (teamAId) setTeamBId(teamBId || teamId);
      setShowNewTeam(false);
      setNewTeamName(""); setNewTeamShort(""); setNewTeamPlayers(Array(11).fill(""));
    } finally { setTeamSaving(false); }
  }

  function togglePlayer(id: number, list: number[], setter: (v: number[]) => void, max = 11) {
    setter(list.includes(id) ? list.filter((x) => x !== id) : list.length < max ? [...list, id] : list);
  }

  async function startMatch() {
    if (!teamAId || !teamBId || teamAId === teamBId || openingBat.length < 2 || !openingBowler || totalOvers < 1) return;
    setCreating(true);
    try {
      const matchId = Number(await db.matches.add({
        teamAId, teamBId, format, ballType, totalOvers,
        status: "live", tossWinnerId: tossWinner === "A" ? teamAId : teamBId,
        tossChoice, currentInnings: 1, createdAt: Date.now(),
      }));
      const inningsId = Number(await db.innings.add({
        matchId, inningsNumber: 1, battingTeamId: battingTeamId!, bowlingTeamId: bowlingTeamId!,
        runs: 0, wickets: 0, overs: 0, balls: 0, extras: 0, wides: 0, noBalls: 0, byes: 0, legByes: 0, isCompleted: false,
      }));
      await db.innings.add({
        matchId, inningsNumber: 2, battingTeamId: bowlingTeamId!, bowlingTeamId: battingTeamId!,
        runs: 0, wickets: 0, overs: 0, balls: 0, extras: 0, wides: 0, noBalls: 0, byes: 0, legByes: 0, isCompleted: false,
      });
      dispatch({ type: "SET_ACTIVE_MATCH", matchId, inningsId });
    } finally { setCreating(false); }
  }

  const selectedA = teams.find((t) => t.id === teamAId);
  const selectedB = teams.find((t) => t.id === teamBId);

  return (
    <div className="flex flex-col min-h-full pb-24">
      <div className="px-4 pt-10 pb-4 flex items-center gap-3">
        <button onClick={() => navigate("home")} className="text-[#4a6b52] hover:text-white text-2xl">←</button>
        <div><h1 className="text-2xl font-black text-white">New Match</h1><p className="text-[#4a6b52] font-mono text-xs">Step {step} of 3</p></div>
      </div>
      <div className="px-4 mb-6"><div className="flex gap-1">{[1,2,3].map(s => <div key={s} className={`flex-1 h-1 rounded-full ${s <= step ? "bg-[#00d25b]" : "bg-[#1e3d24]"}`} />)}</div></div>

      {step === 1 && <div className="px-4 space-y-5">
        <section>
          <p className="text-white text-sm font-bold mb-2">Match format</p>
          <div className="grid grid-cols-2 gap-2">
            {FORMATS.map(f => <button key={f.value} onClick={() => setFormat(f.value)} className={`py-3 rounded-xl border font-bold transition-all ${format === f.value ? "bg-[#00d25b] border-[#00d25b] text-black" : "bg-[#0d1f11] border-[#1e3d24] text-white"}`}>{f.label}</button>)}
          </div>
        </section>

        {format !== "Test" && <section className="bg-[#0d1f11] border border-[#1e3d24] rounded-2xl p-4">
          <div className="flex justify-between items-center mb-3"><div><p className="text-white font-bold">Overs per side</p><p className="text-[#4a6b52] text-xs font-mono">Choose any short format: 4, 5, 6, 8, 10 overs and more.</p></div><span className="text-[#00d25b] font-black text-2xl">{totalOvers}</span></div>
          <div className="grid grid-cols-5 gap-2">{OVER_PRESETS.map(o => <button key={o} onClick={() => {setTotalOvers(o); setFormat("Custom")}} className={`py-2.5 rounded-lg font-mono font-bold text-sm ${totalOvers === o && format === "Custom" ? "bg-[#00d25b] text-black" : "bg-[#060e08] border border-[#1e3d24] text-white"}`}>{o}</button>)}</div>
          <div className="flex gap-2 mt-3"><input type="number" min={1} max={90} value={totalOvers} onChange={e => setTotalOvers(Math.max(1, Math.min(90, Number(e.target.value) || 1)))} className="flex-1 bg-[#060e08] border border-[#1e3d24] rounded-lg px-3 py-2.5 text-white font-mono"/><span className="self-center text-[#4a6b52] font-mono text-sm">overs</span></div>
        </section>}

        <section>
          <p className="text-white text-sm font-bold mb-2">Ball type</p>
          <div className="grid grid-cols-2 gap-2">{BALL_TYPES.map(b => <button key={b} onClick={() => setBallType(b)} className={`py-3 rounded-xl border capitalize ${ballType === b ? "bg-[#00d25b] border-[#00d25b] text-black font-bold" : "bg-[#0d1f11] border-[#1e3d24] text-white"}`}>{b.replace("-", " ")}</button>)}</div>
        </section>

        <section>
          <div className="flex items-center justify-between mb-2"><p className="text-white text-sm font-bold">Teams</p><button onClick={() => setShowNewTeam(!showNewTeam)} className="text-[#00d25b] font-mono text-xs">+ Create team</button></div>
          {showNewTeam && <div className="bg-[#0d1f11] border border-[#00d25b]/40 rounded-2xl p-4 mb-3 space-y-3">
            <div><p className="text-white font-bold">Create an offline team</p><p className="text-[#4a6b52] text-xs mt-1">Team and player lists stay on this device. No account or internet is required.</p></div>
            <div className="grid grid-cols-3 gap-2"><input placeholder="Team name" value={newTeamName} onChange={e=>setNewTeamName(e.target.value)} className="col-span-2 bg-[#060e08] border border-[#1e3d24] rounded-lg px-3 py-2 text-white"/><input placeholder="Short" maxLength={4} value={newTeamShort} onChange={e=>setNewTeamShort(e.target.value.toUpperCase())} className="bg-[#060e08] border border-[#1e3d24] rounded-lg px-3 py-2 text-white uppercase"/></div>
            <p className="text-white text-sm font-bold">Players <span className="text-[#4a6b52] font-normal">(minimum 2, up to 11)</span></p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto">{newTeamPlayers.map((name,i)=><input key={i} placeholder={`Player ${i+1} name`} value={name} onChange={e=>setNewTeamPlayers(a=>a.map((x,j)=>j===i?e.target.value:x))} className="bg-[#060e08] border border-[#1e3d24] rounded-lg px-3 py-2 text-white text-sm"/>)}</div>
            <div className="flex gap-2"><button onClick={()=>setShowNewTeam(false)} className="flex-1 py-2 border border-[#1e3d24] rounded-lg text-[#4a6b52]">Cancel</button><button onClick={createTeam} disabled={teamSaving || newTeamPlayers.filter(x=>x.trim()).length<2} className="flex-1 py-2 bg-[#00d25b] disabled:opacity-40 rounded-lg text-black font-black">{teamSaving ? "Saving..." : "Save Team"}</button></div>
          </div>}
          <div className="grid grid-cols-2 gap-3">{(["A","B"] as const).map(side => {const id=side==="A"?teamAId:teamBId; const other=side==="A"?teamBId:teamAId; const set=side==="A"?setTeamAId:setTeamBId; return <div key={side}><p className="text-[#4a6b52] font-mono text-xs mb-1">TEAM {side}</p><div className="space-y-1.5 max-h-44 overflow-y-auto">{teams.map(t=><button key={t.id} disabled={other===t.id} onClick={()=>set(t.id!)} className={`w-full text-left px-3 py-3 rounded-xl border ${id===t.id?"bg-[#00d25b] border-[#00d25b] text-black":"bg-[#0d1f11] border-[#1e3d24] text-white"} disabled:opacity-25`}><b>{t.shortName}</b><span className="text-xs ml-1 opacity-70">{t.name}</span></button>)}</div></div>})}</div>
        </section>
        <button onClick={()=>setStep(2)} disabled={!teamAId || !teamBId || teamAId===teamBId} className="w-full bg-[#00d25b] disabled:opacity-40 text-black font-black py-4 rounded-xl text-lg">NEXT →</button>
      </div>}

      {step === 2 && <div className="px-4 space-y-5">
        <section><p className="text-white font-bold mb-3">Toss</p><div className="grid grid-cols-2 gap-2 mb-3">{(["A","B"] as const).map(side=>{const team=side==="A"?selectedA:selectedB;return <button key={side} onClick={()=>setTossWinner(side)} className={`py-4 rounded-xl border font-bold ${tossWinner===side?"bg-[#f5c842] border-[#f5c842] text-black":"bg-[#0d1f11] border-[#1e3d24] text-white"}`}>{team?.shortName}<span className="block text-xs font-normal opacity-70">won toss</span></button>})}</div><div className="grid grid-cols-2 gap-2">{(["bat","field"] as const).map(c=><button key={c} onClick={()=>setTossChoice(c)} className={`py-4 rounded-xl border font-bold uppercase ${tossChoice===c?"bg-[#00d25b] border-[#00d25b] text-black":"bg-[#0d1f11] border-[#1e3d24] text-[#4a6b52]"}`}>chose to {c}</button>)}</div></section>
        <div className="bg-[#0d1f11] border border-[#1e3d24] rounded-xl p-4 text-center"><span className="text-[#f5c842] font-mono text-sm">{teams.find(t=>t.id=== (tossWinner==="A"?teamAId:teamBId))?.name} will {tossChoice==="bat"?"bat":"bowl"} first</span></div>
        <div className="flex gap-2"><button onClick={()=>setStep(1)} className="flex-1 bg-[#0d1f11] border border-[#1e3d24] text-white font-bold py-3 rounded-xl">← Back</button><button onClick={()=>setStep(3)} className="flex-1 bg-[#00d25b] text-black font-black py-3 rounded-xl">NEXT →</button></div>
      </div>}

      {step === 3 && <div className="px-4 space-y-5">
        <section><p className="text-white font-bold text-sm">Opening batters — {teams.find(t=>t.id===battingTeamId)?.shortName}</p><p className="text-[#4a6b52] font-mono text-xs mb-2">Tap two players. The first selected is striker.</p><div className="space-y-1.5 max-h-60 overflow-y-auto">{battingPlayers.map(p=><button key={p.id} onClick={()=>togglePlayer(p.id!,openingBat,setOpeningBat,2)} className={`w-full flex justify-between px-3 py-3 rounded-xl border ${openingBat.includes(p.id!)?"bg-[#00d25b] border-[#00d25b] text-black":"bg-[#0d1f11] border-[#1e3d24] text-white"}`}><span className="font-bold">{p.name}</span><span className="font-mono text-xs">{openingBat[0]===p.id?"STRIKER":openingBat[1]===p.id?"NON-STR":p.role}</span></button>)}</div></section>
        <section><p className="text-white font-bold text-sm mb-2">Opening bowler — {teams.find(t=>t.id===bowlingTeamId)?.shortName}</p><div className="space-y-1.5 max-h-52 overflow-y-auto">{bowlingPlayers.map(p=><button key={p.id} onClick={()=>setOpeningBowler(p.id!)} className={`w-full flex justify-between px-3 py-3 rounded-xl border ${openingBowler===p.id?"bg-[#f5c842] border-[#f5c842] text-black":"bg-[#0d1f11] border-[#1e3d24] text-white"}`}><span className="font-bold">{p.name}</span><span className="font-mono text-xs">{p.bowlingStyle||p.role}</span></button>)}</div></section>
        <div className="bg-[#0d1f11] border border-[#1e3d24] rounded-xl p-4 text-sm"><span className="text-[#4a6b52]">Match:</span> <b className="text-white">{selectedA?.shortName} vs {selectedB?.shortName}</b><span className="text-[#4a6b52]"> · </span><b className="text-[#00d25b]">{format === "Test" ? "Test" : `${totalOvers} overs`}</b></div>
        <div className="flex gap-2"><button onClick={()=>setStep(2)} className="flex-1 bg-[#0d1f11] border border-[#1e3d24] text-white font-bold py-3 rounded-xl">← Back</button><button onClick={startMatch} disabled={openingBat.length<2 || !openingBowler || creating || battingPlayers.length<2} className="flex-1 bg-[#00d25b] disabled:opacity-40 text-black font-black py-3 rounded-xl">{creating?"Creating...":"START MATCH ▶"}</button></div>
      </div>}
    </div>
  );
}
