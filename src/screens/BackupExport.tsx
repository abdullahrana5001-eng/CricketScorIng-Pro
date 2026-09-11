import { useState, useEffect, useRef } from "react";
import { db } from "../db/database";
import { exportMatchCSV, exportBackup, importBackup, downloadFile } from "../engine/export";
import type { Match, Team } from "../types/cricket";
import { useApp } from "../context/AppContext";

interface MatchOption {
  match: Match;
  teamA: Team | undefined;
  teamB: Team | undefined;
}

export default function BackupExport() {
  const { state } = useApp();
  const [matches, setMatches] = useState<MatchOption[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState<number | null>(state.activeMatchId);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadMatches();
  }, []);

  async function loadMatches() {
    const allMatches = await db.matches.orderBy("createdAt").reverse().limit(20).toArray();
    const opts: MatchOption[] = await Promise.all(
      allMatches.map(async (m) => ({
        match: m,
        teamA: await db.teams.get(m.teamAId),
        teamB: await db.teams.get(m.teamBId),
      }))
    );
    setMatches(opts);
    if (!selectedMatchId && opts.length > 0) setSelectedMatchId(opts[0].match.id!);
  }

  function flash(type: "success" | "error", text: string) {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  }

  async function handleExportCSV() {
    if (!selectedMatchId) return;
    setExporting(true);
    try {
      const csv = await exportMatchCSV(selectedMatchId);
      const opt = matches.find((m) => m.match.id === selectedMatchId);
      const filename = `cricket_${opt?.teamA?.shortName}_vs_${opt?.teamB?.shortName}_${new Date().toISOString().slice(0, 10)}.csv`;
      downloadFile(csv, filename);
      flash("success", "CSV exported successfully");
    } catch {
      flash("error", "Export failed");
    } finally {
      setExporting(false);
    }
  }

  async function handleExportBackup() {
    if (!selectedMatchId) return;
    setExporting(true);
    try {
      const json = await exportBackup(selectedMatchId);
      const opt = matches.find((m) => m.match.id === selectedMatchId);
      const filename = `backup_${opt?.teamA?.shortName}_vs_${opt?.teamB?.shortName}_${Date.now()}.csp`;
      downloadFile(json, filename, "application/json");
      flash("success", "Backup file (.csp) saved");
    } catch {
      flash("error", "Backup failed");
    } finally {
      setExporting(false);
    }
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      await importBackup(text);
      flash("success", "Match imported successfully");
      loadMatches();
    } catch (err) {
      flash("error", "Import failed: " + (err instanceof Error ? err.message : "invalid file"));
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col h-full pb-20">
      <div className="px-4 pt-10 pb-4 bg-[#060e08]">
        <h1 className="text-2xl font-black text-white">Export & Backup</h1>
        <p className="text-[#4a6b52] font-mono text-xs mt-1">Save matches locally · restore anytime</p>
      </div>

      {message && (
        <div className={`mx-4 mb-4 px-4 py-3 rounded-xl font-mono text-sm ${message.type === "success" ? "bg-[#00d25b]/20 border border-[#00d25b]/50 text-[#00d25b]" : "bg-red-500/20 border border-red-500/50 text-red-400"}`}>
          {message.text}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 space-y-4 py-2">
        {/* Match selector */}
        <div>
          <p className="text-[#4a6b52] font-mono text-xs uppercase tracking-widest mb-2">Select Match</p>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {matches.map((opt) => (
              <button
                key={opt.match.id}
                onClick={() => setSelectedMatchId(opt.match.id!)}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border text-sm transition-colors ${selectedMatchId === opt.match.id ? "bg-[#00d25b]/10 border-[#00d25b]/50 text-white" : "bg-[#0d1f11] border-[#1e3d24] text-[#4a6b52] hover:text-white"}`}
              >
                <div className="text-left">
                  <div className="font-bold">{opt.teamA?.shortName} vs {opt.teamB?.shortName}</div>
                  <div className="font-mono text-xs opacity-70">{opt.match.format} · {new Date(opt.match.createdAt).toLocaleDateString()}</div>
                </div>
                <div className="font-mono text-xs opacity-50">{opt.match.status}</div>
              </button>
            ))}
            {matches.length === 0 && (
              <div className="text-center py-6 text-[#4a6b52] font-mono text-sm">No matches found</div>
            )}
          </div>
        </div>

        {/* Export options */}
        <div>
          <p className="text-[#4a6b52] font-mono text-xs uppercase tracking-widest mb-2">Export</p>
          <div className="space-y-2">
            <button
              onClick={handleExportCSV}
              disabled={!selectedMatchId || exporting}
              className="w-full flex items-center justify-between bg-[#0d1f11] border border-[#1e3d24] hover:border-[#00d25b]/50 disabled:opacity-40 rounded-xl px-4 py-4 transition-colors"
            >
              <div className="text-left">
                <div className="text-white font-bold">Export as CSV</div>
                <div className="text-[#4a6b52] font-mono text-xs">Ball-by-ball data, batting & bowling scorecards</div>
              </div>
              <span className="text-[#00d25b] text-xl">⬇</span>
            </button>

            <button
              onClick={handleExportBackup}
              disabled={!selectedMatchId || exporting}
              className="w-full flex items-center justify-between bg-[#0d1f11] border border-[#1e3d24] hover:border-[#f5c842]/50 disabled:opacity-40 rounded-xl px-4 py-4 transition-colors"
            >
              <div className="text-left">
                <div className="text-white font-bold">Backup (.csp file)</div>
                <div className="text-[#4a6b52] font-mono text-xs">Complete match backup — restorable anytime</div>
              </div>
              <span className="text-[#f5c842] text-xl">◼</span>
            </button>
          </div>
        </div>

        {/* Import */}
        <div>
          <p className="text-[#4a6b52] font-mono text-xs uppercase tracking-widest mb-2">Restore / Import</p>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={importing}
            className="w-full flex items-center justify-between bg-[#0d1f11] border border-[#1e3d24] hover:border-[#00d25b]/50 disabled:opacity-40 rounded-xl px-4 py-4 transition-colors"
          >
            <div className="text-left">
              <div className="text-white font-bold">{importing ? "Importing..." : "Import .csp Backup"}</div>
              <div className="text-[#4a6b52] font-mono text-xs">Restore a previously exported backup file</div>
            </div>
            <span className="text-[#00d25b] text-xl">⬆</span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csp,.json"
            onChange={handleImport}
            className="hidden"
          />
        </div>

        {/* Info */}
        <div className="bg-[#0d1f11] border border-[#1e3d24] rounded-xl p-4">
          <h3 className="text-white font-bold text-sm mb-2">About Offline Storage</h3>
          <ul className="space-y-1.5 text-[#4a6b52] font-mono text-xs">
            <li>• All data stored locally in IndexedDB (browser)</li>
            <li>• No internet connection required</li>
            <li>• Export CSVs to open in Excel/Google Sheets</li>
            <li>• .csp backup files can be shared & re-imported</li>
            <li>• Data persists across browser sessions</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
