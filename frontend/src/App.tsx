import { useEffect, useState } from 'react';
import { AssetLibrary } from './components/AssetLibrary';
import { Player } from './components/Player';
import { Timeline } from './components/Timeline';
import { ExportModal } from './components/ExportModal';
import { PreviewModal } from './components/PreviewModal';
import { AuthModal } from './components/AuthModal';
import { WorkerStatus } from './components/WorkerStatus';
import { useAppDispatch, useAppSelector } from './store/hooks';
import { loadAssets, createProject, exportVideo, triggerAutosave } from './store/thunks';
import { setPlayhead } from './store/editorSlice';
import { openAuthModal, logout, fetchCurrentUser } from './store/authSlice';
import { renderWorker } from './services/renderWorker';
import { Film, Maximize2, Download, Code, User, LogOut } from 'lucide-react';

function App() {
  const dispatch = useAppDispatch();
  const { activeProjectId, sceneGraph } = useAppSelector((state) => state.editor);
  const { user, isAuthenticated } = useAppSelector((state) => state.auth);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  useEffect(() => {
    // Check authenticated user
    if (localStorage.getItem('token')) {
      dispatch(fetchCurrentUser());
    }

    // Initial load
    dispatch(loadAssets());

    if (!activeProjectId) {
      dispatch(createProject());
    }

    // Initialize distributed background render worker
    renderWorker.init();

    return () => {
      renderWorker.destroy();
    };
  }, [dispatch, activeProjectId]);

  // Periodic autosave every 30s
  useEffect(() => {
    if (!sceneGraph || !activeProjectId) return;
    const interval = setInterval(() => {
      dispatch(triggerAutosave());
    }, 30000);

    return () => clearInterval(interval);
  }, [dispatch, sceneGraph, activeProjectId]);

  const handleLogJSON = () => {
    console.log('Current Timeline JSON Scene Graph:', JSON.stringify(sceneGraph, null, 2));
  };

  const handleExport = () => {
    dispatch(exportVideo());
  };

  const handlePreview = () => {
    dispatch(setPlayhead(0));
    setIsPreviewOpen(true);
  };

  return (
    <div className="h-screen w-screen bg-slate-900 text-slate-100 flex flex-col overflow-hidden font-sans select-none">
      <ExportModal />
      <AuthModal />
      {isPreviewOpen && <PreviewModal onClose={() => setIsPreviewOpen(false)} />}

      {/* Top Professional Navbar */}
      <header className="h-14 border-b border-slate-800 bg-slate-950 flex items-center px-4 justify-between shrink-0 shadow-md z-30">
        {/* Brand & Project Info */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
            <Film className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-white tracking-wide">
                VideoStudio Pro
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-semibold uppercase">
                Phase 1 Active
              </span>
            </div>
            <div className="text-[11px] text-slate-400 font-mono flex items-center gap-1.5">
              <span>{sceneGraph?.projectId ? `Project: ${sceneGraph.projectId.slice(0, 8)}...` : 'Initializing...'}</span>
              <span>•</span>
              <span className="text-emerald-400 font-medium">Autosave Ready</span>
            </div>
          </div>
        </div>

        {/* Center: Distributed Worker Telemetry */}
        <div className="flex items-center gap-2">
          <WorkerStatus />
        </div>

        {/* Right Tools & User Profile */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={handleLogJSON}
            className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-medium rounded-lg transition-colors text-slate-300 flex items-center gap-1.5 cursor-pointer border border-slate-700/60"
            title="Log Scene Graph JSON"
          >
            <Code className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">JSON</span>
          </button>

          <button
            onClick={handlePreview}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-medium rounded-lg transition-colors text-slate-200 flex items-center gap-1.5 cursor-pointer border border-slate-700/60"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>1080p Preview</span>
          </button>

          <button
            onClick={handleExport}
            className="px-4 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-xs font-semibold rounded-lg transition-all text-white shadow-md shadow-blue-500/20 flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Video</span>
          </button>

          {/* User Auth Pill */}
          {isAuthenticated && user ? (
            <div className="relative">
              <button
                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg border border-slate-700/60 text-xs cursor-pointer"
              >
                <div className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold">
                  {user.firstName[0]}
                </div>
                <span className="text-slate-200 font-medium hidden md:inline truncate max-w-[100px]">
                  {user.firstName}
                </span>
              </button>

              {isUserMenuOpen && (
                <div className="absolute right-0 top-10 w-48 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-2 z-50 text-xs animate-in fade-in zoom-in-95">
                  <div className="px-3 py-2 border-b border-slate-800">
                    <div className="font-semibold text-white truncate">{user.firstName} {user.lastName}</div>
                    <div className="text-[10px] text-slate-400 truncate">{user.email}</div>
                  </div>
                  <button
                    onClick={() => {
                      dispatch(logout());
                      setIsUserMenuOpen(false);
                    }}
                    className="w-full mt-1 flex items-center gap-2 px-3 py-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors text-left cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" /> Sign Out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => dispatch(openAuthModal('login'))}
              className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg border border-slate-700/60 text-xs font-medium text-slate-200 cursor-pointer transition-colors"
            >
              <User className="w-3.5 h-3.5 text-blue-400" />
              <span>Sign In</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Workspace */}
      <div className="flex flex-1 overflow-hidden bg-slate-950">
        {/* Left Sidebar - Assets */}
        <AssetLibrary />

        {/* Center - Player & Timeline */}
        <div className="flex-1 flex flex-col min-w-0 bg-slate-900">
          <div className="flex-1 flex items-center justify-center relative min-h-[300px] bg-slate-950/80 p-3">
            <Player />
          </div>

          <div className="h-1/3 min-h-[250px] shrink-0 border-t border-slate-800 bg-slate-900">
            <Timeline />
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
