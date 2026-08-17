import { useState, useRef } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { triggerAutosave, deleteAsset, uploadAsset } from '@/store/thunks';
import { addAssetToTimeline } from '@/store/editorSlice';
import type { Asset } from '@/types';
import { Upload, Plus, Trash2, Film, Image as ImageIcon, Music, Type, FolderOpen } from 'lucide-react';

export function AssetLibrary() {
  const dispatch = useAppDispatch();
  const assets = useAppSelector((state) => state.editor.assets);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<'All' | 'Image' | 'Video' | 'Audio'>('All');

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      await dispatch(uploadAsset(file)).unwrap();
    } catch (error) {
      console.error('Upload failed', error);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleAddToTimeline = (asset: Asset) => {
    dispatch(addAssetToTimeline({ asset, trackId: 'track_1', startTime: 0 }));
    dispatch(triggerAutosave());
  };

  const handleDelete = (e: React.MouseEvent, assetId: string) => {
    e.stopPropagation();
    if (confirm('Delete this asset from library?')) {
      dispatch(deleteAsset(assetId));
    }
  };

  const filteredAssets = assets.filter((asset) => {
    if (activeTab === 'All') return true;
    return asset.type.toLowerCase() === activeTab.toLowerCase();
  });

  const handleAddText = () => {
    const textAsset: Asset = {
      _id: `text_${Date.now()}`,
      original_url: '',
      preview_url: '',
      duration: 5,
      type: 'text',
      content: 'Headline Title',
      public_id: `text_${Date.now()}`,
    };
    dispatch(addAssetToTimeline({ asset: textAsset, trackId: 'track_1', startTime: 0 }));
    dispatch(triggerAutosave());
  };

  const handleDragStart = (e: React.DragEvent, asset: Asset) => {
    e.dataTransfer.setData('application/json', JSON.stringify({ type: 'asset', asset }));
    e.dataTransfer.effectAllowed = 'copy';
  };

  const getMediaIcon = (type: string) => {
    switch (type) {
      case 'video':
        return <Film className="w-3.5 h-3.5" />;
      case 'image':
        return <ImageIcon className="w-3.5 h-3.5" />;
      case 'audio':
        return <Music className="w-3.5 h-3.5" />;
      default:
        return <Type className="w-3.5 h-3.5" />;
    }
  };

  return (
    <div className="w-72 bg-slate-950 border-r border-slate-800 flex flex-col h-full shadow-lg z-10 select-none">
      <div className="p-3.5 border-b border-slate-800 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 font-bold text-xs uppercase tracking-wider text-slate-300">
            <FolderOpen className="w-4 h-4 text-blue-400" />
            <span>Media Library</span>
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="bg-blue-600 hover:bg-blue-500 text-white font-semibold py-1.5 px-3 rounded-lg text-xs transition-all flex items-center gap-1.5 disabled:opacity-50 shadow-md shadow-blue-500/20 cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            {isUploading ? 'Uploading...' : 'Upload'}
          </button>
        </div>

        <input
          type="file"
          accept="video/*,image/*,audio/*"
          className="hidden"
          ref={fileInputRef}
          onChange={handleUpload}
        />

        <button
          onClick={handleAddText}
          className="w-full border border-dashed border-slate-700 hover:border-slate-500 hover:bg-slate-900 text-slate-300 font-medium py-2 px-3 rounded-lg text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5 text-blue-400" />
          <span>Add Text Overlay</span>
        </button>

        {/* Filter Tabs */}
        <div className="flex bg-slate-900 p-1 rounded-lg border border-slate-800 text-xs">
          {(['All', 'Video', 'Audio', 'Image'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                activeTab === tab
                  ? 'bg-blue-600 text-white shadow-sm font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2.5 bg-slate-950">
        {filteredAssets.map((asset) => (
          <div
            key={asset._id}
            draggable={true}
            onDragStart={(e) => handleDragStart(e, asset)}
            className="bg-slate-900 border border-slate-800 rounded-lg p-2 flex flex-col gap-2 cursor-grab active:cursor-grabbing hover:border-blue-500/50 hover:shadow-md transition-all group relative"
            onClick={() => handleAddToTimeline(asset)}
          >
            <button
              onClick={(e) => handleDelete(e, asset._id)}
              className="absolute top-3 right-3 bg-red-600/90 text-white p-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 z-10 shadow-sm cursor-pointer"
              title="Delete asset"
            >
              <Trash2 className="w-3 h-3" />
            </button>

            {asset.type === 'image' ? (
              <img
                src={asset.preview_url || asset.original_url}
                className="w-full h-20 object-cover rounded bg-slate-950"
                alt="asset"
              />
            ) : asset.type === 'audio' ? (
              <div className="w-full h-20 bg-emerald-950/40 text-emerald-400 flex items-center justify-center rounded border border-emerald-500/20">
                <Music className="w-7 h-7" />
              </div>
            ) : asset.type === 'text' ? (
              <div className="w-full h-20 bg-indigo-950/40 text-indigo-300 flex items-center justify-center rounded border border-indigo-500/20 font-bold text-xs p-2 text-center">
                "{asset.content}"
              </div>
            ) : (
              <video
                src={asset.preview_url || asset.original_url}
                className="w-full h-20 bg-black object-contain rounded"
                preload="metadata"
              />
            )}

            <div className="flex items-center justify-between">
              <div className="text-[11px] text-slate-200 truncate font-medium max-w-[170px]" title={asset.public_id || asset.original_url}>
                {asset.public_id || asset.original_url.split('/').pop()}
              </div>
            </div>

            <div className="text-[10px] text-slate-400 flex justify-between items-center font-mono">
              <span className="flex items-center gap-1 uppercase">
                {getMediaIcon(asset.type)} {asset.type}
              </span>
              <span>{asset.duration?.toFixed(1) || '0.0'}s</span>
            </div>
          </div>
        ))}

        {filteredAssets.length === 0 && !isUploading && (
          <div className="text-xs text-slate-500 text-center mt-12 italic">
            No media assets found. Click upload above to get started.
          </div>
        )}
      </div>
    </div>
  );
}

export default AssetLibrary;
