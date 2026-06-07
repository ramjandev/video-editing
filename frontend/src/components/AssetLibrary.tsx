import { useState, useRef } from 'react';
import axios from 'axios';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { loadAssets, triggerAutosave, deleteAsset, API_BASE } from '@/store/thunks';
import { addAssetToTimeline } from '@/store/editorSlice';
import type { Asset } from '@/types';

export function AssetLibrary() {
  const dispatch = useAppDispatch();
  const assets = useAppSelector(state => state.editor.assets);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      await axios.post(`${API_BASE}/assets`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      await dispatch(loadAssets()); // Refresh library
    } catch (error) {
      console.error('Upload failed', error);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleAddToTimeline = (asset: Asset) => {
    // For MVP, just add to a default track at time 0
    dispatch(addAssetToTimeline({ asset, trackId: 'track_1', startTime: 0 }));
    dispatch(triggerAutosave());
  };

  const handleDelete = (e: React.MouseEvent, assetId: string) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this asset?')) {
      dispatch(deleteAsset(assetId));
    }
  };

  const [activeTab, setActiveTab] = useState<'All' | 'Image' | 'Video' | 'Audio'>('All');

  const filteredAssets = assets.filter(asset => {
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
      content: 'Title Goes There',
      public_id: `text_${Date.now()}`,
    };
    dispatch(addAssetToTimeline({ asset: textAsset, trackId: 'track_1', startTime: 0 }));
    dispatch(triggerAutosave());
  };

  const handleDragStart = (e: React.DragEvent, asset: Asset) => {
    e.dataTransfer.setData('application/json', JSON.stringify({ type: 'asset', asset }));
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <div className="w-64 bg-white border-r border-slate-200 flex flex-col h-full shadow-sm z-10">
      <div className="p-4 border-b border-slate-100 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">My Resource</h2>
          <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="bg-blue-500 hover:bg-blue-600 text-white font-medium py-1.5 px-3 rounded-md text-sm transition-colors flex items-center gap-1 disabled:opacity-50"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            Upload
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
          className="w-full border border-dashed border-slate-300 hover:border-slate-400 hover:bg-slate-50 text-slate-600 font-medium py-2 px-4 rounded-md text-sm transition-colors flex items-center justify-center gap-2"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>
          Add Text Element
        </button>

        {/* Tabs */}
        <div className="flex gap-4 text-sm font-medium border-b border-slate-200">
          {['All', 'Image', 'Video', 'Audio'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`pb-2 px-1 relative ${activeTab === tab ? 'text-blue-500' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {tab}
              {activeTab === tab && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 rounded-t-full" />
              )}
            </button>
          ))}
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
        {filteredAssets.map(asset => (
          <div 
            key={asset._id} 
            draggable={true}
            onDragStart={(e) => handleDragStart(e, asset)}
            className="bg-white border border-slate-200 rounded-lg p-2 flex flex-col gap-2 cursor-grab active:cursor-grabbing hover:border-blue-300 hover:shadow-md transition-all group relative"
            onClick={() => handleAddToTimeline(asset)}
          >
            <button 
              onClick={(e) => handleDelete(e, asset._id)}
              className="absolute top-3 right-3 bg-red-500 text-white p-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 z-10 shadow-sm"
              title="Delete asset"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
            </button>
            
            {asset.type === 'image' ? (
              <img 
                src={asset.preview_url} 
                className="w-full h-24 object-cover rounded-md bg-slate-100"
                alt="asset"
              />
            ) : asset.type === 'audio' ? (
              <div className="w-full h-24 bg-blue-50 text-blue-500 flex items-center justify-center rounded-md border border-blue-100">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
              </div>
            ) : (
              <video 
                src={asset.preview_url} 
                className="w-full h-24 bg-black object-contain rounded-md"
                preload="metadata"
              />
            )}
            
            <div className="text-xs text-slate-700 truncate font-medium" title={asset.original_url.split('/').pop()}>
              {asset.original_url.split('/').pop()}
            </div>
            <div className="text-[10px] text-slate-400 flex justify-between font-medium">
              <span className="uppercase">{asset.type}</span>
              <span>{asset.duration?.toFixed(1) || '0.0'}s</span>
            </div>
          </div>
        ))}
        {filteredAssets.length === 0 && !isUploading && (
          <div className="text-sm text-slate-400 text-center mt-10">
            No assets found.
          </div>
        )}
      </div>
    </div>
  );
}
