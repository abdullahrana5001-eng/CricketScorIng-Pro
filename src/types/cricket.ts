export type BallType = "tape-ball" | "tennis-ball" | "club" | "hard-ball";
export type MatchFormat = "T20" | "ODI" | "Test" | "Custom";
export type MatchStatus = "setup" | "toss" | "live" | "innings-break" | "completed";
export type ExtraType = "none" | "wide" | "no-ball" | "bye" | "leg-bye";
export type WicketType =
  | "bowled"
  | "caught"
  | "lbw"
  | "run-out"
  | "stumped"
  | "hit-wicket"
  | "retired-hurt"
  | "obstructing-field"
  | "handled-ball"
  | "timed-out";

export type PlayerRole = "bat" | "bowl" | "allrounder" | "wk";
export type BattingStyle = "right" | "left";

export interface Player {
  id?: number;
  name: string;
  teamId: number;
  jerseyNumber?: string;
  role: PlayerRole;
  battingStyle: BattingStyle;
  bowlingStyle: string;
  createdAt: number;
}

export interface Team {
  id?: number;
  name: string;
  shortName: string;
  color: string;
  createdAt: number;
}

export interface Tournament {
  id?: number;
  name: string;
  format: MatchFormat;
  ballType: BallType;
  createdAt: number;
}

export interface Venue {
  id?: number;
  name: string;
  city: string;
}

export interface Match {
  id?: number;
  tournamentId?: number;
  teamAId: number;
  teamBId: number;
  venueId?: number;
  format: MatchFormat;
  ballType: BallType;
  totalOvers: number;
  status: MatchStatus;
  tossWinnerId?: number;
  tossChoice?: "bat" | "field";
  currentInnings: number;
  createdAt: number;
  completedAt?: number;
  result?: string;
  notes?: string;
}

export interface Innings {
  id?: number;
  matchId: number;
  inningsNumber: number;
  battingTeamId: number;
  bowlingTeamId: number;
  target?: number;
  runs: number;
  wickets: number;
  overs: number; // completed overs
  balls: number; // balls in current over (0-5)
  extras: number;
  wides: number;
  noBalls: number;
  byes: number;
  legByes: number;
  isCompleted: boolean;
  completedAt?: number;
}

export interface Delivery {
  id?: number;
  matchId: number;
  inningsId: number;
  overNumber: number; // 0-indexed completed overs
  ballInOver: number; // legal ball number in over (1-6)
  deliverySequence: number; // absolute sequence in innings
  strikerId: number;
  nonStrikerId: number;
  bowlerId: number;
  batsmanRuns: number;
  extraType: ExtraType;
  extraRuns: number;
  totalRuns: number;
  isLegalBall: boolean;
  isWicket: boolean;
  wicketType?: WicketType;
  dismissedBatsmanId?: number;
  fielder1Id?: number;
  fielder2Id?: number;
  strikeChangedAfter: boolean; // after this delivery, did strike change?
  timestamp: number;
}

export interface BatsmanInnings {
  id?: number;
  playerId: number;
  inningsId: number;
  matchId: number;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  isOut: boolean;
  dismissalType?: WicketType;
  bowlerId?: number;
  fielder1Id?: number;
  fielder2Id?: number;
  battingOrder: number;
  minutesFaced?: number;
}

export interface BowlerInnings {
  id?: number;
  playerId: number;
  inningsId: number;
  matchId: number;
  overs: number;
  balls: number;
  maidens: number;
  runs: number;
  wickets: number;
  wides: number;
  noBalls: number;
}

export interface Partnership {
  batter1Id: number;
  batter2Id: number;
  runs: number;
  balls: number;
  startWicket: number;
}

// Aggregated career stats
export interface PlayerStats {
  playerId: number;
  matches: number;
  battingRuns: number;
  battingBalls: number;
  battingInnings: number;
  notOuts: number;
  highScore: number;
  fours: number;
  sixes: number;
  fifties: number;
  hundreds: number;
  bowlingOvers: number;
  bowlingBalls: number;
  bowlingRuns: number;
  bowlingWickets: number;
  bowlingInnings: number;
  bestBowlingWickets: number;
  bestBowlingRuns: number;
  catches: number;
  runOuts: number;
  stumpings: number;
}

export interface LiveMatchState {
  match: Match;
  innings: Innings;
  teamA: Team;
  teamB: Team;
  battingTeam: Team;
  bowlingTeam: Team;
  striker: Player | null;
  nonStriker: Player | null;
  bowler: Player | null;
  currentOverDeliveries: Delivery[];
  allDeliveries: Delivery[];
  batsmanMap: Record<number, BatsmanInnings>;
  bowlerMap: Record<number, BowlerInnings>;
  battingOrder: number[]; // playerIds in order of batting
  availableBatters: Player[];
  availableBowlers: Player[];
}

export interface MatchSummary {
  match: Match;
  teamA: Team;
  teamB: Team;
  innings1?: Innings;
  innings2?: Innings;
}
