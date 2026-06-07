import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { setExporting } from '@/store/editorSlice';

export function ExportModal() {
  const dispatch = useAppDispatch();
  const { isExporting, exportProgress, exportUrl } = useAppSelector(state => state.editor);

  if (!isExporting) return null;

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-2xl p-6 w-full max-w-md flex flex-col items-center">
        
        <h2 className="text-xl font-bold text-white mb-6">
          {exportUrl ? 'Export Complete!' : 'Rendering Video...'}
        </h2>

        {exportUrl ? (
          <div className="flex flex-col items-center w-full">
            <div className="w-16 h-16 bg-green-500/20 text-green-500 rounded-full flex items-center justify-center mb-6">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            </div>
            <a 
              href={exportUrl.replace('/uploads/', '/api/download/')} 
              target="_blank"
              download
              className="bg-blue-600 hover:bg-blue-500 text-white font-medium py-3 px-6 rounded w-full text-center transition-colors mb-3"
            >
              Download Video
            </a>
            <button 
              onClick={() => dispatch(setExporting(false))}
              className="text-slate-400 hover:text-white py-2"
            >
              Close
            </button>
          </div>
        ) : (
          <div className="w-full flex flex-col items-center">
            {/* Progress circle or bar */}
            <div className="w-full bg-slate-800 rounded-full h-4 mb-4 overflow-hidden relative">
              <div 
                className="bg-blue-600 h-full transition-all duration-300 relative"
                style={{ width: `${Math.max(5, exportProgress)}%` }}
              >
                <div className="absolute top-0 bottom-0 left-0 right-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGxpbmUgeDE9IjAiIHkxPSIyMCIgeDI9IjIwIiB5Mj0iMCIgc3Ryb2tlPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMSkiIHN0cm9rZS13aWR0aD0iNSIvPjwvc3ZnPg==')] opacity-50" />
              </div>
            </div>
            
            <p className="text-slate-400 text-sm mb-6">
              {exportProgress > 0 ? `Processing... ${Math.round(exportProgress)}%` : 'Initializing FFmpeg...'}
            </p>

            <button 
              onClick={() => {
                dispatch(setExporting(false));
                // Note: we can't easily cancel the fetch request in MVP without AbortController
              }}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
