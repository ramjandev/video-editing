import { useEffect, useState } from 'react';
import { AssetLibrary } from './components/AssetLibrary';
import { Player } from './components/Player';
import { Timeline } from './components/Timeline';
import { ExportModal } from './components/ExportModal';
import { PreviewModal } from './components/PreviewModal';
import { useAppDispatch, useAppSelector } from './store/hooks';
import { loadAssets, createProject, exportVideo } from './store/thunks';
import { setPlayhead } from './store/editorSlice';

function App() {
  const dispatch = useAppDispatch();
  const { activeProjectId, sceneGraph } = useAppSelector(state => state.editor);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  useEffect(() => {
    // Initial load
    dispatch(loadAssets());
    
    // Create an empty project on load for MVP
    if (!activeProjectId) {
      dispatch(createProject());
    }
  }, [dispatch, activeProjectId]);

  const handleLogJSON = () => {
    console.log("Current Timeline JSON Scene Graph:");
    console.log(JSON.stringify(sceneGraph, null, 2));
  };

  const handleExport = () => {
    dispatch(exportVideo());
  };

  const handlePreview = () => {
    dispatch(setPlayhead(0));
    setIsPreviewOpen(true);
  };

  return (
    <div className="h-screen w-screen bg-slate-50 text-slate-900 flex flex-col overflow-hidden font-sans">
      <ExportModal />
      {isPreviewOpen && <PreviewModal onClose={() => setIsPreviewOpen(false)} />}

      {/* Top Navbar */}
      <header className="h-14 border-b border-slate-200 bg-white flex items-center px-6 justify-between shrink-0 shadow-sm z-10">
        <h1 className="text-xl font-bold text-slate-800">
          Editor
        </h1>
        <div className="flex gap-4">
          <button 
            onClick={handleLogJSON}
            className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-sm font-medium rounded-md transition-colors text-slate-700"
          >
            Log JSON
          </button>
          <button 
            onClick={handlePreview}
            className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-sm font-medium rounded-md transition-colors text-slate-700"
          >
            Preview
          </button>
          <button 
            onClick={handleExport}
            className="px-4 py-1.5 bg-blue-500 hover:bg-blue-600 text-sm font-medium rounded-md transition-colors text-white shadow-sm"
          >
            Export
          </button>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="flex flex-1 overflow-hidden bg-white">
        {/* Left Sidebar - Assets */}
        <AssetLibrary />

        {/* Center - Player & Timeline */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 flex items-center justify-center relative min-h-[300px] bg-slate-50">
             <Player />
          </div>
          
          <div className="h-1/3 min-h-[250px] shrink-0 border-t border-slate-200 bg-white">
             <Timeline />
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
