import { db } from "../db/database";
import type { Match, Innings, Delivery, BatsmanInnings, BowlerInnings } from "../types/cricket";
import { formatOvers } from "./scoring";

export async function exportMatchCSV(matchId: number): Promise<string> {
  const match = await db.matches.get(matchId);
  if (!match) return "";

  const teamA = await db.teams.get(match.teamAId);
  const teamB = await db.teams.get(match.teamBId);
  const allInnings = await db.innings.where({ matchId }).sortBy("inningsNumber");
  const allDeliveries = await db.deliveries.where({ matchId }).sortBy("deliverySequence");
  const players = await db.players.toArray();
  const nameMap: Record<number, string> = {};
  for (const p of players) nameMap[p.id!] = p.name;

  let csv = `CRICKETSCORPRO EXPORT\n`;
  csv += `Match: ${teamA?.name} vs ${teamB?.name}\n`;
  csv += `Format: ${match.format} | Ball Type: ${match.ballType} | Overs: ${match.totalOvers}\n`;
  csv += `Date: ${new Date(match.createdAt).toLocaleDateString()}\n\n`;

  for (const innings of allInnings) {
    const battingTeam = innings.battingTeamId === match.teamAId ? teamA : teamB;
    csv += `\n=== INNINGS ${innings.inningsNumber}: ${battingTeam?.name} ===\n`;
    csv += `Score: ${innings.runs}/${innings.wickets} (${formatOvers(innings.overs, innings.balls)} ov)\n\n`;

    // Batting
    csv += `BATTING\n`;
    csv += `Player,R,B,4s,6s,SR,Dismissal\n`;
    const batStats = await db.batsmanInnings.where({ inningsId: innings.id }).sortBy("battingOrder");
    for (const b of batStats) {
      const sr = b.balls > 0 ? ((b.runs / b.balls) * 100).toFixed(1) : "0.0";
      const dismissal = b.isOut ? b.dismissalType || "out" : "not out";
      csv += `${nameMap[b.playerId] || b.playerId},${b.runs},${b.balls},${b.fours},${b.sixes},${sr},${dismissal}\n`;
    }

    // Bowling
    csv += `\nBOWLING\n`;
    csv += `Player,O,M,R,W,Eco\n`;
    const bowlStats = await db.bowlerInnings.where({ inningsId: innings.id }).toArray();
    for (const bw of bowlStats) {
      const overs = formatOvers(bw.overs, bw.balls);
      const eco = bw.overs + bw.balls / 6 > 0 ? (bw.runs / (bw.overs + bw.balls / 6)).toFixed(2) : "0.00";
      csv += `${nameMap[bw.playerId] || bw.playerId},${overs},${bw.maidens},${bw.runs},${bw.wickets},${eco}\n`;
    }
  }

  // Ball by ball
  csv += `\n=== BALL BY BALL ===\n`;
  csv += `Over,Ball,Bowler,Striker,Runs,Extra,Wicket\n`;
  for (const d of allDeliveries) {
    const over = `${d.overNumber + 1}.${d.deliverySequence}`;
    const extra = d.extraType !== "none" ? `${d.extraType}(${d.extraRuns})` : "";
    const wicket = d.isWicket ? d.wicketType || "out" : "";
    csv += `${over},${d.isLegalBall ? d.ballInOver : "e"},${nameMap[d.bowlerId] || d.bowlerId},${nameMap[d.strikerId] || d.strikerId},${d.batsmanRuns},${extra},${wicket}\n`;
  }

  return csv;
}

export function downloadFile(content: string, filename: string, mimeType = "text/csv"): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportBackup(matchId: number): Promise<string> {
  const match = await db.matches.get(matchId);
  if (!match) return "";

  const allInnings = await db.innings.where({ matchId }).toArray();
  const allDeliveries = await db.deliveries.where({ matchId }).toArray();
  const batsmanInnings = await db.batsmanInnings.where({ matchId }).toArray();
  const bowlerInnings = await db.bowlerInnings.where({ matchId }).toArray();

  const teamA = await db.teams.get(match.teamAId);
  const teamB = await db.teams.get(match.teamBId);
  const teamAPlayers = await db.players.where({ teamId: match.teamAId }).toArray();
  const teamBPlayers = await db.players.where({ teamId: match.teamBId }).toArray();

  const backup = {
    version: "1.0",
    exportedAt: Date.now(),
    match,
    teams: [teamA, teamB],
    players: [...teamAPlayers, ...teamBPlayers],
    innings: allInnings,
    deliveries: allDeliveries,
    batsmanInnings,
    bowlerInnings,
  };

  return JSON.stringify(backup, null, 2);
}

export async function importBackup(jsonStr: string): Promise<number> {
  const data = JSON.parse(jsonStr);
  if (data.version !== "1.0") throw new Error("Unsupported backup version");

  let newMatchId = 0;

  await db.transaction("rw", [db.matches, db.teams, db.players, db.innings, db.deliveries, db.batsmanInnings, db.bowlerInnings], async () => {
    const teamIdMap: Record<number, number> = {};
    const playerIdMap: Record<number, number> = {};
    const inningsIdMap: Record<number, number> = {};

    for (const team of data.teams) {
      const oldId = team.id;
      delete team.id;
      const newId = await db.teams.add(team);
      teamIdMap[oldId] = Number(newId);
    }

    for (const player of data.players) {
      const oldId = player.id;
      delete player.id;
      player.teamId = teamIdMap[player.teamId];
      const newId = await db.players.add(player);
      playerIdMap[oldId] = Number(newId);
    }

    const match = { ...data.match };
    delete match.id;
    match.teamAId = teamIdMap[match.teamAId];
    match.teamBId = teamIdMap[match.teamBId];
    newMatchId = Number(await db.matches.add(match));

    for (const innings of data.innings) {
      const oldId = innings.id;
      delete innings.id;
      innings.matchId = newMatchId;
      innings.battingTeamId = teamIdMap[innings.battingTeamId];
      innings.bowlingTeamId = teamIdMap[innings.bowlingTeamId];
      const newId = await db.innings.add(innings);
      inningsIdMap[oldId] = Number(newId);
    }

    for (const d of data.deliveries) {
      delete d.id;
      d.matchId = newMatchId;
      d.inningsId = inningsIdMap[d.inningsId];
      d.strikerId = playerIdMap[d.strikerId] || d.strikerId;
      d.nonStrikerId = playerIdMap[d.nonStrikerId] || d.nonStrikerId;
      d.bowlerId = playerIdMap[d.bowlerId] || d.bowlerId;
      await db.deliveries.add(d);
    }

    for (const b of data.batsmanInnings) {
      delete b.id;
      b.matchId = newMatchId;
      b.inningsId = inningsIdMap[b.inningsId];
      b.playerId = playerIdMap[b.playerId] || b.playerId;
      await db.batsmanInnings.add(b);
    }

    for (const bw of data.bowlerInnings) {
      delete bw.id;
      bw.matchId = newMatchId;
      bw.inningsId = inningsIdMap[bw.inningsId];
      bw.playerId = playerIdMap[bw.playerId] || bw.playerId;
      await db.bowlerInnings.add(bw);
    }
  });

  return newMatchId;
}
