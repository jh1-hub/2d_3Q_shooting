import React, {useState} from 'react';
import {Check, Copy, FileCode2, FolderOpen} from 'lucide-react';
import {GODOT_PROJECT_FILES, GodotFileEntry} from '../godot/godotFiles';

const CATEGORIES: GodotFileEntry['category'][] = [
  'Project & Scenes',
  'Autoload & Managers',
  'Player & Weapons',
  'Enemies & Boss',
  'Resources (.gd / .tres)',
];

export const GodotStudioView: React.FC = () => {
  const [selectedPath, setSelectedPath] = useState<string>(
    'scripts/player/player.gd',
  );
  const [copied, setCopied] = useState(false);

  const activeFile =
    GODOT_PROJECT_FILES.find((f) => f.path === selectedPath) ??
    GODOT_PROJECT_FILES[0];

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(activeFile.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore clipboard restrictions
    }
  };

  const lines = activeFile.code.split('\n');

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-6">
      <div className="mb-5 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">
            Godot 4 + GDScript 実装プロジェクト
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            責務分離（Player / WeaponManager / UpgradeManager / SpawnManager / StageManager / GameManager / UIManager）とResourceデータ駆動設計に準拠した完全コード一式。
          </p>
        </div>
        <div className="text-xs font-mono text-slate-400 tabular-nums whitespace-nowrap">
          全 {GODOT_PROJECT_FILES.length} ファイル · Godot 4.3+ 対応
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Left File Tree */}
        <aside className="lg:col-span-4 bg-slate-900/90 border border-slate-800 rounded-xl p-3 flex flex-col gap-4 max-h-[72vh] overflow-y-auto">
          {CATEGORIES.map((category) => {
            const items = GODOT_PROJECT_FILES.filter(
              (f) => f.category === category,
            );
            return (
              <div key={category}>
                <div className="flex items-center gap-2 px-2 py-1 text-xs font-semibold text-slate-400">
                  <FolderOpen className="w-3.5 h-3.5 text-cyan-400" />
                  <span>{category}</span>
                </div>
                <div className="mt-1 flex flex-col gap-0.5">
                  {items.map((item) => {
                    const isActive = item.path === activeFile.path;
                    return (
                      <button
                        key={item.path}
                        type="button"
                        onClick={() => setSelectedPath(item.path)}
                        className={`w-full text-left px-2.5 py-2 rounded-lg text-xs font-mono flex items-center gap-2 transition-colors cursor-pointer ${
                          isActive
                            ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                            : 'text-slate-300 hover:bg-slate-800/80 border border-transparent'
                        }`}
                      >
                        <FileCode2 className="w-3.5 h-3.5 shrink-0 opacity-75" />
                        <span className="truncate">res://{item.path}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </aside>

        {/* Right Code Viewer */}
        <section className="lg:col-span-8 bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-950/60">
            <div className="min-w-0">
              <div className="text-xs font-mono text-cyan-300 truncate">
                res://{activeFile.path}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                {activeFile.summary}
              </div>
            </div>

            <button
              type="button"
              onClick={handleCopy}
              className="px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>コピー済み</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>コードをコピー</span>
                </>
              )}
            </button>
          </div>

          <div className="overflow-x-auto max-h-[64vh] overflow-y-auto bg-[#060A13] p-4 font-mono text-xs leading-relaxed">
            <table className="w-full border-collapse">
              <tbody>
                {lines.map((line, i) => (
                  <tr key={i} className="hover:bg-slate-900/60">
                    <td className="select-none pr-4 text-right text-slate-600 tabular-nums w-10 align-top">
                      {i + 1}
                    </td>
                    <td className="text-slate-200 whitespace-pre">
                      {line.length > 0 ? line : ' '}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
};
