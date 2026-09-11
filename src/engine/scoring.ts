import { db } from "../db/database";
import type {
  Delivery,
  ExtraType,
  Innings,
  BatsmanInnings,
  BowlerInnings,
  WicketType,
  Match,
} from "../types/cricket";

export interface ScoringInput {
  matchId: number;
  inningsId: number;
  strikerId: number;
  nonStrikerId: number;
  bowlerId: number;
  batsmanRuns: number;
  extraType: ExtraType;
  extraRuns: number;
  isWicket: boolean;
  wicketType?: WicketType;
  dismissedBatsmanId?: number;
  fielder1Id?: number;
  fielder2Id?: number;
}

function calcTotalRuns(input: ScoringInput): number {
  const extraPenalty = input.extraType === "wide" || input.extraType === "no-ball" ? 1 : 0;
  return input.batsmanRuns + input.extraRuns + extraPenalty;
}

function isLegalBall(extraType: ExtraType): boolean {
  return extraType !== "wide" && extraType !== "no-ball";
}

function calcStrikeChange(input: ScoringInput, totalRuns: number): boolean {
  // Strike changes if odd runs taken (batsman physically ran odd number)
  // For wides: only byes run by batter count
  if (input.extraType === "wide") {
    return input.extraRuns % 2 === 1;
  }
  return totalRuns % 2 === 1;
}

export async function recordDelivery(input: ScoringInput): Promise<void> {
  const innings = await db.innings.get(input.inningsId);
  if (!innings) throw new Error("Innings not found");

  const totalRuns = calcTotalRuns(input);
  const legal = isLegalBall(input.extraType);
  const extraPenalty = !legal ? 1 : 0;

  // Determine over state
  const overNumber = innings.overs;
  const ballInOver = legal ? innings.balls + 1 : innings.balls;
  const deliverySequence = await db.deliveries
    .where({ inningsId: input.inningsId })
    .count();

  // Strike change after delivery
  let strikeChangedAfter = calcStrikeChange(input, totalRuns);

  // On a wicket (run out special case): dismissedBatsman might not be striker
  if (input.isWicket && input.wicketType === "run-out" && input.dismissedBatsmanId === input.nonStrikerId) {
    // Non-striker run out: strike doesn't change from wicket perspective
  }

  const delivery: Delivery = {
    matchId: input.matchId,
    inningsId: input.inningsId,
    overNumber,
    ballInOver,
    deliverySequence,
    strikerId: input.strikerId,
    nonStrikerId: input.nonStrikerId,
    bowlerId: input.bowlerId,
    batsmanRuns: input.batsmanRuns,
    extraType: input.extraType,
    extraRuns: input.extraRuns,
    totalRuns,
    isLegalBall: legal,
    isWicket: input.isWicket,
    wicketType: input.wicketType,
    dismissedBatsmanId: input.dismissedBatsmanId,
    fielder1Id: input.fielder1Id,
    fielder2Id: input.fielder2Id,
    strikeChangedAfter,
    timestamp: Date.now(),
  };

  await db.transaction("rw", [db.deliveries, db.innings, db.batsmanInnings, db.bowlerInnings], async () => {
    // Insert delivery
    await db.deliveries.add(delivery);

    // Update innings totals
    const newBalls = legal ? innings.balls + 1 : innings.balls;
    const overComplete = legal && newBalls === 6;

    const inningsUpdate: Partial<Innings> = {
      runs: innings.runs + totalRuns,
      extras: innings.extras + (totalRuns - input.batsmanRuns),
      wides: innings.wides + (input.extraType === "wide" ? 1 + input.extraRuns : 0),
      noBalls: innings.noBalls + (input.extraType === "no-ball" ? 1 : 0),
      byes: innings.byes + (input.extraType === "bye" ? input.extraRuns : 0),
      legByes: innings.legByes + (input.extraType === "leg-bye" ? input.extraRuns : 0),
      overs: overComplete ? innings.overs + 1 : innings.overs,
      balls: overComplete ? 0 : newBalls,
      wickets: input.isWicket ? innings.wickets + 1 : innings.wickets,
    };
    await db.innings.update(input.inningsId, inningsUpdate);

    // Update batsman innings
    if (input.batsmanRuns > 0 || input.isWicket || legal) {
      await updateBatsmanInnings(input, legal);
    }

    // Update bowler innings
    await updateBowlerInnings(input, totalRuns, legal, overComplete);
  });
}

async function updateBatsmanInnings(input: ScoringInput, legal: boolean): Promise<void> {
  const existing = await db.batsmanInnings
    .where({ playerId: input.strikerId, inningsId: input.inningsId })
    .first();

  if (existing) {
    const update: Partial<BatsmanInnings> = {
      runs: existing.runs + input.batsmanRuns,
      balls: legal ? existing.balls + 1 : existing.balls,
      fours: existing.fours + (input.batsmanRuns === 4 ? 1 : 0),
      sixes: existing.sixes + (input.batsmanRuns === 6 ? 1 : 0),
    };

    if (input.isWicket && input.dismissedBatsmanId === input.strikerId) {
      update.isOut = true;
      update.dismissalType = input.wicketType;
      if (input.wicketType !== "run-out" && input.wicketType !== "retired-hurt") {
        update.bowlerId = input.bowlerId;
      }
      update.fielder1Id = input.fielder1Id;
      update.fielder2Id = input.fielder2Id;
    }
    await db.batsmanInnings.update(existing.id!, update);
  } else {
    // First ball for this batsman
    const count = await db.batsmanInnings.where({ inningsId: input.inningsId }).count();
    await db.batsmanInnings.add({
      playerId: input.strikerId,
      inningsId: input.inningsId,
      matchId: input.matchId,
      runs: input.batsmanRuns,
      balls: legal ? 1 : 0,
      fours: input.batsmanRuns === 4 ? 1 : 0,
      sixes: input.batsmanRuns === 6 ? 1 : 0,
      isOut: input.isWicket && input.dismissedBatsmanId === input.strikerId,
      dismissalType: input.isWicket && input.dismissedBatsmanId === input.strikerId ? input.wicketType : undefined,
      bowlerId: input.isWicket && input.dismissedBatsmanId === input.strikerId && input.wicketType !== "run-out" ? input.bowlerId : undefined,
      fielder1Id: input.fielder1Id,
      fielder2Id: input.fielder2Id,
      battingOrder: count,
    });
  }

  // Handle non-striker run out
  if (input.isWicket && input.wicketType === "run-out" && input.dismissedBatsmanId === input.nonStrikerId) {
    const nsExisting = await db.batsmanInnings
      .where({ playerId: input.nonStrikerId, inningsId: input.inningsId })
      .first();
    if (nsExisting) {
      await db.batsmanInnings.update(nsExisting.id!, {
        isOut: true,
        dismissalType: "run-out",
        fielder1Id: input.fielder1Id,
        fielder2Id: input.fielder2Id,
      });
    } else {
      const count = await db.batsmanInnings.where({ inningsId: input.inningsId }).count();
      await db.batsmanInnings.add({
        playerId: input.nonStrikerId,
        inningsId: input.inningsId,
        matchId: input.matchId,
        runs: 0,
        balls: 0,
        fours: 0,
        sixes: 0,
        isOut: true,
        dismissalType: "run-out",
        fielder1Id: input.fielder1Id,
        battingOrder: count,
      });
    }
  }
}

async function updateBowlerInnings(
  input: ScoringInput,
  totalRuns: number,
  legal: boolean,
  overComplete: boolean
): Promise<void> {
  // Byes/leg-byes don't count against bowler's runs (but wides/no-balls do)
  const bowlerRuns =
    input.extraType === "bye" || input.extraType === "leg-bye"
      ? input.batsmanRuns
      : totalRuns;

  // Wickets not credited for run-outs
  const bowlerWicket = input.isWicket && input.wicketType !== "run-out" && input.wicketType !== "retired-hurt" ? 1 : 0;

  const existing = await db.bowlerInnings
    .where({ playerId: input.bowlerId, inningsId: input.inningsId })
    .first();

  if (existing) {
    const newBalls = legal ? existing.balls + 1 : existing.balls;
    await db.bowlerInnings.update(existing.id!, {
      overs: overComplete ? existing.overs + 1 : existing.overs,
      balls: overComplete ? 0 : newBalls,
      runs: existing.runs + bowlerRuns,
      wickets: existing.wickets + bowlerWicket,
      wides: existing.wides + (input.extraType === "wide" ? 1 : 0),
      noBalls: existing.noBalls + (input.extraType === "no-ball" ? 1 : 0),
    });
  } else {
    await db.bowlerInnings.add({
      playerId: input.bowlerId,
      inningsId: input.inningsId,
      matchId: input.matchId,
      overs: overComplete ? 1 : 0,
      balls: overComplete ? 0 : (legal ? 1 : 0),
      maidens: 0,
      runs: bowlerRuns,
      wickets: bowlerWicket,
      wides: input.extraType === "wide" ? 1 : 0,
      noBalls: input.extraType === "no-ball" ? 1 : 0,
    });
  }
}

// Undo last delivery — removes it and recalculates innings from scratch
export async function undoLastDelivery(inningsId: number): Promise<void> {
  const deliveries = await db.deliveries
    .where({ inningsId })
    .sortBy("deliverySequence");

  if (deliveries.length === 0) return;

  const lastId = deliveries[deliveries.length - 1].id!;

  await db.transaction("rw", [db.deliveries, db.innings, db.batsmanInnings, db.bowlerInnings], async () => {
    await db.deliveries.delete(lastId);
    await recalculateInnings(inningsId);
  });
}

// Full recalculation of innings state from ball history
export async function recalculateInnings(inningsId: number): Promise<void> {
  const inningsRecord = await db.innings.get(inningsId);
  if (!inningsRecord) return;

  const deliveries = await db.deliveries
    .where({ inningsId })
    .sortBy("deliverySequence");

  // Reset innings
  let runs = 0, wickets = 0, overs = 0, balls = 0;
  let extras = 0, wides = 0, noBalls = 0, byes = 0, legByes = 0;

  const batsmanMap: Record<number, Partial<BatsmanInnings>> = {};
  const bowlerMap: Record<number, Partial<BowlerInnings>> = {};

  for (const d of deliveries) {
    runs += d.totalRuns;
    if (d.isWicket) wickets++;

    const extraPenalty = !d.isLegalBall ? 1 : 0;
    const extraTotal = d.extraRuns + extraPenalty;
    extras += extraTotal;

    if (d.extraType === "wide") wides += 1 + d.extraRuns;
    if (d.extraType === "no-ball") noBalls += 1;
    if (d.extraType === "bye") byes += d.extraRuns;
    if (d.extraType === "leg-bye") legByes += d.extraRuns;

    if (d.isLegalBall) {
      balls++;
      if (balls === 6) { overs++; balls = 0; }
    }

    // Batsman
    const b = batsmanMap[d.strikerId] || {
      playerId: d.strikerId, inningsId, matchId: inningsRecord.matchId,
      runs: 0, balls: 0, fours: 0, sixes: 0, isOut: false,
      battingOrder: Object.keys(batsmanMap).length,
    };
    b.runs = (b.runs ?? 0) + d.batsmanRuns;
    b.balls = (b.balls ?? 0) + (d.isLegalBall ? 1 : 0);
    b.fours = (b.fours ?? 0) + (d.batsmanRuns === 4 ? 1 : 0);
    b.sixes = (b.sixes ?? 0) + (d.batsmanRuns === 6 ? 1 : 0);
    if (d.isWicket && d.dismissedBatsmanId === d.strikerId) {
      b.isOut = true;
      b.dismissalType = d.wicketType;
      if (d.wicketType !== "run-out" && d.wicketType !== "retired-hurt") b.bowlerId = d.bowlerId;
      b.fielder1Id = d.fielder1Id;
      b.fielder2Id = d.fielder2Id;
    }
    batsmanMap[d.strikerId] = b;

    if (d.isWicket && d.wicketType === "run-out" && d.dismissedBatsmanId === d.nonStrikerId) {
      const nb = batsmanMap[d.nonStrikerId] || {
        playerId: d.nonStrikerId, inningsId, matchId: inningsRecord.matchId,
        runs: 0, balls: 0, fours: 0, sixes: 0, isOut: false,
        battingOrder: Object.keys(batsmanMap).length,
      };
      nb.isOut = true;
      nb.dismissalType = "run-out";
      nb.fielder1Id = d.fielder1Id;
      batsmanMap[d.nonStrikerId] = nb;
    }

    // Bowler
    const bowlerExtraRuns = d.extraType === "bye" || d.extraType === "leg-bye" ? 0 : d.extraRuns + (d.isLegalBall ? 0 : 1);
    const bowlerRuns = d.batsmanRuns + bowlerExtraRuns;
    const bw = bowlerMap[d.bowlerId] || {
      playerId: d.bowlerId, inningsId, matchId: inningsRecord.matchId,
      overs: 0, balls: 0, maidens: 0, runs: 0, wickets: 0, wides: 0, noBalls: 0,
    };
    bw.runs = (bw.runs ?? 0) + bowlerRuns;
    if (d.isWicket && d.wicketType !== "run-out" && d.wicketType !== "retired-hurt") {
      bw.wickets = (bw.wickets ?? 0) + 1;
    }
    if (d.extraType === "wide") bw.wides = (bw.wides ?? 0) + 1;
    if (d.extraType === "no-ball") bw.noBalls = (bw.noBalls ?? 0) + 1;
    if (d.isLegalBall) {
      const newBalls = (bw.balls ?? 0) + 1;
      if (newBalls === 6) { bw.overs = (bw.overs ?? 0) + 1; bw.balls = 0; }
      else { bw.balls = newBalls; }
    }
    bowlerMap[d.bowlerId] = bw;
  }

  // Update innings
  await db.innings.update(inningsId, { runs, wickets, overs, balls, extras, wides, noBalls, byes, legByes });

  // Update batsman innings
  for (const [pidStr, stats] of Object.entries(batsmanMap)) {
    const pid = Number(pidStr);
    const existing = await db.batsmanInnings.where({ playerId: pid, inningsId }).first();
    if (existing) {
      await db.batsmanInnings.update(existing.id!, stats);
    } else {
      await db.batsmanInnings.add(stats as BatsmanInnings);
    }
  }

  // Update bowler innings
  for (const [pidStr, stats] of Object.entries(bowlerMap)) {
    const pid = Number(pidStr);
    const existing = await db.bowlerInnings.where({ playerId: pid, inningsId }).first();
    if (existing) {
      await db.bowlerInnings.update(existing.id!, stats);
    } else {
      await db.bowlerInnings.add(stats as BowlerInnings);
    }
  }
}

export function formatOvers(overs: number, balls: number): string {
  return `${overs}.${balls}`;
}

export function calcRunRate(runs: number, overs: number, balls: number): string {
  const totalBalls = overs * 6 + balls;
  if (totalBalls === 0) return "0.00";
  return ((runs / totalBalls) * 6).toFixed(2);
}

export function calcRequiredRate(target: number, runs: number, totalOvers: number, overs: number, balls: number): string {
  const remaining = target - runs;
  const ballsLeft = (totalOvers * 6) - (overs * 6 + balls);
  if (ballsLeft <= 0 || remaining <= 0) return "0.00";
  return ((remaining / ballsLeft) * 6).toFixed(2);
}

export function calcStrikeRate(runs: number, balls: number): string {
  if (balls === 0) return "0.00";
  return ((runs / balls) * 100).toFixed(1);
}

export function calcEconomy(runs: number, overs: number, balls: number): string {
  const total = overs + balls / 6;
  if (total === 0) return "0.00";
  return (runs / total).toFixed(2);
}

export function calcAverage(runs: number, innings: number, notOuts: number): string {
  const dismissals = innings - notOuts;
  if (dismissals === 0) return runs > 0 ? "∞" : "0.00";
  return (runs / dismissals).toFixed(2);
}

// Determine current striker after a sequence of deliveries
export function deriveCurrentStrikers(deliveries: Delivery[], openingStrikerId: number, openingNonStrikerId: number): { strikerId: number; nonStrikerId: number } {
  let strikerId = openingStrikerId;
  let nonStrikerId = openingNonStrikerId;

  let legalBallsInOver = 0;

  for (const d of deliveries) {
    if (d.strikeChangedAfter) {
      [strikerId, nonStrikerId] = [nonStrikerId, strikerId];
    }
    if (d.isLegalBall) {
      legalBallsInOver++;
      if (legalBallsInOver === 6) {
        // End of over: swap if not already swapped
        [strikerId, nonStrikerId] = [nonStrikerId, strikerId];
        legalBallsInOver = 0;
      }
    }
  }

  return { strikerId, nonStrikerId };
}

export async function completeInnings(inningsId: number, matchId: number): Promise<void> {
  await db.innings.update(inningsId, { isCompleted: true, completedAt: Date.now() });

  const match = await db.matches.get(matchId);
  if (!match) return;

  const allInnings = await db.innings.where({ matchId }).toArray();
  const completedCount = allInnings.filter((i) => i.isCompleted).length;

  if (match.format === "Test") {
    if (completedCount < 4) {
      // Start next innings
    } else {
      await db.matches.update(matchId, { status: "completed", completedAt: Date.now() });
    }
  } else {
    if (completedCount === 1) {
      // Set target
      const completedInnings = allInnings.find((i) => i.isCompleted);
      if (completedInnings) {
        const nextInnings = allInnings.find((i) => !i.isCompleted);
        if (nextInnings) {
          await db.innings.update(nextInnings.id!, { target: completedInnings.runs + 1 });
        }
      }
      await db.matches.update(matchId, { status: "innings-break" });
    } else {
      await db.matches.update(matchId, { status: "completed", completedAt: Date.now() });
    }
  }
}
