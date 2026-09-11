import { db } from "../db/database";
import type { PlayerStats, BatsmanInnings, BowlerInnings } from "../types/cricket";
import { calcAverage, calcStrikeRate, calcEconomy } from "./scoring";

export async function getPlayerStats(playerId: number): Promise<PlayerStats> {
  const batRecords: BatsmanInnings[] = await db.batsmanInnings.where({ playerId }).toArray();
  const bowlRecords: BowlerInnings[] = await db.bowlerInnings.where({ playerId }).toArray();

  const stats: PlayerStats = {
    playerId,
    matches: 0,
    battingRuns: 0,
    battingBalls: 0,
    battingInnings: batRecords.length,
    notOuts: 0,
    highScore: 0,
    fours: 0,
    sixes: 0,
    fifties: 0,
    hundreds: 0,
    bowlingOvers: 0,
    bowlingBalls: 0,
    bowlingRuns: 0,
    bowlingWickets: 0,
    bowlingInnings: bowlRecords.length,
    bestBowlingWickets: 0,
    bestBowlingRuns: 999,
    catches: 0,
    runOuts: 0,
    stumpings: 0,
  };

  const matchIds = new Set<number>();

  for (const b of batRecords) {
    matchIds.add(b.matchId);
    stats.battingRuns += b.runs;
    stats.battingBalls += b.balls;
    stats.fours += b.fours;
    stats.sixes += b.sixes;
    if (!b.isOut) stats.notOuts++;
    if (b.runs > stats.highScore) stats.highScore = b.runs;
    if (b.runs >= 100) stats.hundreds++;
    else if (b.runs >= 50) stats.fifties++;
  }

  for (const bw of bowlRecords) {
    matchIds.add(bw.matchId);
    stats.bowlingOvers += bw.overs;
    stats.bowlingBalls += bw.balls;
    stats.bowlingRuns += bw.runs;
    stats.bowlingWickets += bw.wickets;
    if (
      bw.wickets > stats.bestBowlingWickets ||
      (bw.wickets === stats.bestBowlingWickets && bw.runs < stats.bestBowlingRuns)
    ) {
      stats.bestBowlingWickets = bw.wickets;
      stats.bestBowlingRuns = bw.runs;
    }
  }

  // Count fielding dismissals
  const caughtAs = await db.batsmanInnings
    .where("fielder1Id")
    .equals(playerId)
    .filter((b) => b.dismissalType === "caught")
    .count();
  const stumpedAs = await db.batsmanInnings
    .where("fielder1Id")
    .equals(playerId)
    .filter((b) => b.dismissalType === "stumped")
    .count();
  const runOutAs = await db.batsmanInnings
    .where("fielder1Id")
    .equals(playerId)
    .filter((b) => b.dismissalType === "run-out")
    .count();

  stats.catches = caughtAs;
  stats.stumpings = stumpedAs;
  stats.runOuts = runOutAs;
  stats.matches = matchIds.size;

  return stats;
}

export interface FormattedStats {
  battingAvg: string;
  strikeRate: string;
  bowlingAvg: string;
  economy: string;
  bowlingFigures: string;
}

export function formatStats(stats: PlayerStats): FormattedStats {
  return {
    battingAvg: calcAverage(stats.battingRuns, stats.battingInnings, stats.notOuts),
    strikeRate: calcStrikeRate(stats.battingRuns, stats.battingBalls),
    bowlingAvg:
      stats.bowlingWickets > 0
        ? (stats.bowlingRuns / stats.bowlingWickets).toFixed(2)
        : "-",
    economy: calcEconomy(
      stats.bowlingRuns,
      stats.bowlingOvers,
      stats.bowlingBalls
    ),
    bowlingFigures:
      stats.bestBowlingWickets > 0
        ? `${stats.bestBowlingWickets}/${stats.bestBowlingRuns}`
        : "-",
  };
}

export interface TopBatsman {
  playerId: number;
  playerName: string;
  runs: number;
  innings: number;
  average: string;
  strikeRate: string;
  highScore: number;
  fifties: number;
  hundreds: number;
}

export interface TopBowler {
  playerId: number;
  playerName: string;
  wickets: number;
  innings: number;
  economy: string;
  average: string;
  bestFigures: string;
}

export async function getTopBatsmen(limit = 10): Promise<TopBatsman[]> {
  const allBat = await db.batsmanInnings.toArray();

  // Aggregate by player
  const playerMap: Record<number, { runs: number; balls: number; innings: number; notOuts: number; highScore: number; fifties: number; hundreds: number }> = {};

  for (const b of allBat) {
    if (!playerMap[b.playerId]) {
      playerMap[b.playerId] = { runs: 0, balls: 0, innings: 0, notOuts: 0, highScore: 0, fifties: 0, hundreds: 0 };
    }
    const p = playerMap[b.playerId];
    p.runs += b.runs;
    p.balls += b.balls;
    p.innings++;
    if (!b.isOut) p.notOuts++;
    if (b.runs > p.highScore) p.highScore = b.runs;
    if (b.runs >= 100) p.hundreds++;
    else if (b.runs >= 50) p.fifties++;
  }

  const players = await db.players.toArray();
  const nameMap: Record<number, string> = {};
  for (const p of players) nameMap[p.id!] = p.name;

  const results: TopBatsman[] = Object.entries(playerMap).map(([pidStr, stats]) => {
    const pid = Number(pidStr);
    return {
      playerId: pid,
      playerName: nameMap[pid] || "Unknown",
      runs: stats.runs,
      innings: stats.innings,
      average: calcAverage(stats.runs, stats.innings, stats.notOuts),
      strikeRate: calcStrikeRate(stats.runs, stats.balls),
      highScore: stats.highScore,
      fifties: stats.fifties,
      hundreds: stats.hundreds,
    };
  });

  return results.sort((a, b) => b.runs - a.runs).slice(0, limit);
}

export async function getTopBowlers(limit = 10): Promise<TopBowler[]> {
  const allBowl = await db.bowlerInnings.toArray();

  const playerMap: Record<number, { overs: number; balls: number; runs: number; wickets: number; innings: number; bestW: number; bestR: number }> = {};

  for (const b of allBowl) {
    if (!playerMap[b.playerId]) {
      playerMap[b.playerId] = { overs: 0, balls: 0, runs: 0, wickets: 0, innings: 0, bestW: 0, bestR: 999 };
    }
    const p = playerMap[b.playerId];
    p.overs += b.overs;
    p.balls += b.balls;
    p.runs += b.runs;
    p.wickets += b.wickets;
    p.innings++;
    if (b.wickets > p.bestW || (b.wickets === p.bestW && b.runs < p.bestR)) {
      p.bestW = b.wickets;
      p.bestR = b.runs;
    }
  }

  const players = await db.players.toArray();
  const nameMap: Record<number, string> = {};
  for (const p of players) nameMap[p.id!] = p.name;

  const results: TopBowler[] = Object.entries(playerMap).map(([pidStr, stats]) => {
    const pid = Number(pidStr);
    return {
      playerId: pid,
      playerName: nameMap[pid] || "Unknown",
      wickets: stats.wickets,
      innings: stats.innings,
      economy: calcEconomy(stats.runs, stats.overs, stats.balls),
      average: stats.wickets > 0 ? (stats.runs / stats.wickets).toFixed(2) : "-",
      bestFigures: stats.bestW > 0 ? `${stats.bestW}/${stats.bestR}` : "-",
    };
  });

  return results.sort((a, b) => b.wickets - a.wickets).slice(0, limit);
}
