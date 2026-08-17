import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { setExporting } from '@/store/editorSlice';
import { X, Download, CheckCircle2, Zap } from 'lucide-react';
import { BACKEND_URL } from '@/lib/api';

export function ExportModal() {
  const dispatch = useAppDispatch();
  const { isExporting, exportProgress, exportUrl, exportEta, exportStatus } = useAppSelector(
    (state) => state.editor,
  );

  if (!isExporting) return null;

  // Resolve clean download URL
  let resolvedDownloadUrl = exportUrl;
  if (resolvedDownloadUrl && resolvedDownloadUrl.startsWith('/')) {
    resolvedDownloadUrl = `${BACKEND_URL}${resolvedDownloadUrl}`;
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl p-6 w-full max-w-md flex flex-col items-center relative overflow-hidden">
        {/* Top close button */}
        <button
          onClick={() => dispatch(setExporting(false))}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-md transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="w-12 h-12 rounded-full bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400 mb-4">
          {exportUrl ? (
            <CheckCircle2 className="w-6 h-6 text-emerald-400" />
          ) : (
            <Zap className="w-6 h-6 text-blue-400 animate-pulse" />
          )}
        </div>

        <h2 className="text-lg font-bold text-white mb-2">
          {exportUrl ? 'Export Masterpiece Complete!' : 'Exporting Video Project'}
        </h2>

        {exportUrl ? (
          <div className="flex flex-col items-center w-full mt-2">
            <p className="text-xs text-slate-400 text-center mb-6">
              Your video was composited and rendered successfully. Ready to save or share!
            </p>

            <a
              href={resolvedDownloadUrl || '#'}
              target="_blank"
              rel="noopener noreferrer"
              download
              className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold py-2.5 px-6 rounded-lg w-full text-center transition-all shadow-lg hover:shadow-blue-500/25 flex items-center justify-center gap-2 mb-3 cursor-pointer text-sm"
            >
              <Download className="w-4 h-4" /> Download Video File
            </a>

            <button
              onClick={() => dispatch(setExporting(false))}
              className="text-slate-400 hover:text-slate-200 text-xs py-2 transition-colors cursor-pointer"
            >
              Back to Studio Editor
            </button>
          </div>
        ) : (
          <div className="w-full flex flex-col items-center mt-2">
            {/* Progress bar */}
            <div className="w-full bg-slate-800 rounded-full h-3 mb-3 overflow-hidden relative border border-slate-700/60">
              <div
                className="bg-gradient-to-r from-blue-600 to-indigo-500 h-full transition-all duration-300 relative rounded-full"
                style={{ width: `${Math.max(4, exportProgress)}%` }}
              >
                <div className="absolute top-0 bottom-0 left-0 right-0 bg-[linear-gradient(45deg,rgba(255,255,255,0.15)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.15)_50%,rgba(255,255,255,0.15)_75%,transparent_75%,transparent)] bg-[length:16px_16px] animate-[move-stripes_1s_linear_infinite]" />
              </div>
            </div>

            <div className="flex justify-between w-full text-xs text-slate-300 font-medium mb-1">
              <span>{Math.round(exportProgress)}% Completed</span>
              {exportEta !== null && <span>ETA: {exportEta}s</span>}
            </div>

            <p className="text-slate-400 text-[11px] text-center mb-6">
              {exportStatus || 'Orchestrating render pipeline across distributed nodes...'}
            </p>

            <button
              onClick={() => dispatch(setExporting(false))}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition-colors cursor-pointer"
            >
              Cancel Render
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default ExportModal;
