import { AppProvider, useApp } from "./context/AppContext";
import BottomNav from "./components/BottomNav";
import Home from "./screens/Home";
import NewMatch from "./screens/NewMatch";
import LiveScoring from "./screens/LiveScoring";
import Scorecard from "./screens/Scorecard";
import Players from "./screens/Players";
import PlayerProfile from "./screens/PlayerProfile";
import Stats from "./screens/Stats";
import BackupExport from "./screens/BackupExport";
import AndroidInfo from "./screens/AndroidInfo";

function AppContent() {
  const { state } = useApp();

  const showBottomNav = !["live-scoring", "new-match"].includes(state.screen);

  function renderScreen() {
    switch (state.screen) {
      case "home":
        return <Home />;
      case "new-match":
        return <NewMatch />;
      case "live-scoring":
        return <LiveScoring />;
      case "scorecard":
        return <Scorecard />;
      case "players":
        return <Players />;
      case "player-profile":
        return <PlayerProfile />;
      case "stats":
        return <Stats />;
      case "export":
        return <BackupExport />;
      case "android-info":
        return <AndroidInfo />;
      default:
        return <Home />;
    }
  }

  return (
    <div className="flex flex-col h-full max-w-md mx-auto relative overflow-hidden bg-[#060e08]">
      <div className="flex-1 overflow-hidden relative">
        <div className="h-full overflow-y-auto">
          {renderScreen()}
        </div>
      </div>
      {showBottomNav && <BottomNav />}
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
