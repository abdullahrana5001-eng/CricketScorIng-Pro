import Dexie, { type Table } from "dexie";
import type {
  Player,
  Team,
  Tournament,
  Venue,
  Match,
  Innings,
  Delivery,
  BatsmanInnings,
  BowlerInnings,
} from "../types/cricket";

export class CricketDatabase extends Dexie {
  players!: Table<Player>;
  teams!: Table<Team>;
  tournaments!: Table<Tournament>;
  venues!: Table<Venue>;
  matches!: Table<Match>;
  innings!: Table<Innings>;
  deliveries!: Table<Delivery>;
  batsmanInnings!: Table<BatsmanInnings>;
  bowlerInnings!: Table<BowlerInnings>;

  constructor() {
    super("CricketScorePro");

    this.version(1).stores({
      players: "++id, name, teamId, createdAt",
      teams: "++id, name, shortName, createdAt",
      tournaments: "++id, name, createdAt",
      venues: "++id, name, city",
      matches: "++id, tournamentId, teamAId, teamBId, status, createdAt",
      innings: "++id, matchId, inningsNumber, battingTeamId, bowlingTeamId",
      deliveries: "++id, matchId, inningsId, overNumber, deliverySequence, strikerId, bowlerId",
      batsmanInnings: "++id, playerId, inningsId, matchId, battingOrder",
      bowlerInnings: "++id, playerId, inningsId, matchId",
    });
  }
}

export const db = new CricketDatabase();

// Seed some default data
export async function seedDefaultTeams(): Promise<void> {
  const count = await db.teams.count();
  if (count > 0) return;

  const teamIds = await db.teams.bulkAdd([
    { name: "Team Alpha", shortName: "ALP", color: "#00d25b", createdAt: Date.now() },
    { name: "Team Beta", shortName: "BET", color: "#f5c842", createdAt: Date.now() },
    { name: "Challengers", shortName: "CHR", color: "#ef4444", createdAt: Date.now() },
    { name: "Warriors", shortName: "WAR", color: "#3b82f6", createdAt: Date.now() },
  ]);

  // Seed players for first two teams
  const team1Id = Number(teamIds[0]);
  const team2Id = Number(teamIds[1]);

  const playerNames1 = ["Rohit Sharma", "Shubman Gill", "Virat Kohli", "Suryakumar Yadav", "Hardik Pandya", "Ravindra Jadeja", "MS Dhoni", "Shardul Thakur", "Mohammed Shami", "Jasprit Bumrah", "Mohammed Siraj"];
  const playerNames2 = ["David Warner", "Travis Head", "Mitchell Marsh", "Steve Smith", "Glenn Maxwell", "Cameron Green", "Matthew Wade", "Pat Cummins", "Mitchell Starc", "Adam Zampa", "Josh Hazlewood"];

  const now = Date.now();
  await db.players.bulkAdd(
    playerNames1.map((name, i) => ({
      name,
      teamId: team1Id,
      role: i < 5 ? "bat" : i < 8 ? "allrounder" : "bowl",
      battingStyle: "right" as const,
      bowlingStyle: i >= 8 ? "right-arm fast" : "none",
      createdAt: now,
    }))
  );

  await db.players.bulkAdd(
    playerNames2.map((name, i) => ({
      name,
      teamId: team2Id,
      role: i < 5 ? "bat" : i < 8 ? "allrounder" : "bowl",
      battingStyle: "right" as const,
      bowlingStyle: i >= 8 ? "right-arm fast" : "none",
      createdAt: now,
    }))
  );
}
