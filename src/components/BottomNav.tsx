import { useApp, type Screen } from "../context/AppContext";

interface NavItem {
  id: Screen;
  label: string;
  icon: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: "home", label: "Home", icon: "⌂" },
  { id: "stats", label: "Stats", icon: "◈" },
  { id: "players", label: "Players", icon: "◉" },
  { id: "export", label: "Export", icon: "⬆" },
  { id: "android-info", label: "Android", icon: "◆" },
];

export default function BottomNav() {
  const { state, navigate } = useApp();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-[#0d1f11] border-t border-[#1e3d24] flex z-40">
      {NAV_ITEMS.map((item) => {
        const active = state.screen === item.id;
        return (
          <button
            key={item.id}
            onClick={() => navigate(item.id)}
            className={`flex-1 flex flex-col items-center gap-0.5 py-3 text-xs transition-colors ${
              active ? "text-[#00d25b]" : "text-[#4a6b52] hover:text-[#7ab587]"
            }`}
          >
            <span className={`text-xl leading-none transition-transform ${active ? "scale-110" : ""}`}>
              {item.icon}
            </span>
            <span className="font-mono tracking-wider uppercase text-[10px]">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
