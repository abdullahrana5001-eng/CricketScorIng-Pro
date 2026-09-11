import React, { createContext, useContext, useReducer, useEffect } from "react";
import { db, seedDefaultTeams } from "../db/database";

export type Screen =
  | "home"
  | "new-match"
  | "live-scoring"
  | "scorecard"
  | "players"
  | "stats"
  | "export"
  | "android-info"
  | "player-profile";

interface AppState {
  screen: Screen;
  activeMatchId: number | null;
  activeInningsId: number | null;
  selectedPlayerId: number | null;
  isLoading: boolean;
  dbReady: boolean;
}

type Action =
  | { type: "NAVIGATE"; screen: Screen }
  | { type: "SET_ACTIVE_MATCH"; matchId: number; inningsId: number }
  | { type: "CLEAR_ACTIVE_MATCH" }
  | { type: "SET_INNINGS"; inningsId: number }
  | { type: "SET_SELECTED_PLAYER"; playerId: number }
  | { type: "SET_LOADING"; loading: boolean }
  | { type: "DB_READY" };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "NAVIGATE":
      return { ...state, screen: action.screen };
    case "SET_ACTIVE_MATCH":
      return { ...state, activeMatchId: action.matchId, activeInningsId: action.inningsId, screen: "live-scoring" };
    case "CLEAR_ACTIVE_MATCH":
      return { ...state, activeMatchId: null, activeInningsId: null, screen: "home" };
    case "SET_INNINGS":
      return { ...state, activeInningsId: action.inningsId };
    case "SET_SELECTED_PLAYER":
      return { ...state, selectedPlayerId: action.playerId, screen: "player-profile" };
    case "SET_LOADING":
      return { ...state, isLoading: action.loading };
    case "DB_READY":
      return { ...state, dbReady: true };
    default:
      return state;
  }
}

const initial: AppState = {
  screen: "home",
  activeMatchId: null,
  activeInningsId: null,
  selectedPlayerId: null,
  isLoading: false,
  dbReady: false,
};

interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  navigate: (screen: Screen) => void;
  openMatch: (matchId: number, inningsId: number) => void;
  openPlayer: (playerId: number) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial);

  useEffect(() => {
    seedDefaultTeams().then(() => {
      dispatch({ type: "DB_READY" });
    });
  }, []);

  const navigate = (screen: Screen) => dispatch({ type: "NAVIGATE", screen });
  const openMatch = (matchId: number, inningsId: number) =>
    dispatch({ type: "SET_ACTIVE_MATCH", matchId, inningsId });
  const openPlayer = (playerId: number) =>
    dispatch({ type: "SET_SELECTED_PLAYER", playerId });

  return (
    <AppContext.Provider value={{ state, dispatch, navigate, openMatch, openPlayer }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be inside AppProvider");
  return ctx;
}
