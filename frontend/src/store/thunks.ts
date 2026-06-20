import { createAsyncThunk } from '@reduxjs/toolkit';
import axios from 'axios';
import { setAssets, setProject, setExportProgressDetails } from './editorSlice';
import type { RootState } from './index';

export const API_BASE = import.meta.env.VITE_BACKEND_URL ? import.meta.env.VITE_BACKEND_URL + '/api' : 'http://localhost:3000/api';

export const loadAssets = createAsyncThunk(
  'editor/loadAssets',
  async (_, { dispatch }) => {
    try {
      const res = await axios.get(`${API_BASE}/assets`);
      dispatch(setAssets(res.data));
    } catch (error) {
      console.error('Failed to load assets', error);
    }
  }
);

export const uploadAsset = createAsyncThunk(
  'editor/uploadAsset',
  async (file: File, { dispatch }) => {
    const formData = new FormData();
    formData.append('video', file);
    
    const response = await axios.post(`${API_BASE}/assets`, formData);
    dispatch(loadAssets()); // Refresh list
    return response.data;
  }
);

export const deleteAsset = createAsyncThunk(
  'editor/deleteAsset',
  async (assetId: string, { dispatch }) => {
    await axios.delete(`${API_BASE}/assets/${assetId}`);
    dispatch(loadAssets()); // Refresh list
  }
);

export const createProject = createAsyncThunk(
  'editor/createProject',
  async (_, { dispatch }) => {
    try {
      const res = await axios.post(`${API_BASE}/projects`, { title: 'New Video' });
      dispatch(setProject({ 
        projectId: res.data.project._id, 
        sceneGraph: res.data.sceneGraph 
      }));
    } catch (error) {
      console.error('Failed to create project', error);
    }
  }
);

export const loadProject = createAsyncThunk(
  'editor/loadProject',
  async (projectId: string, { dispatch }) => {
    try {
      const res = await axios.get(`${API_BASE}/projects/${projectId}`);
      dispatch(setProject({ 
        projectId: res.data.project._id, 
        sceneGraph: res.data.sceneGraph 
      }));
    } catch (error) {
      console.error('Failed to load project', error);
    }
  }
);

export const triggerAutosave = createAsyncThunk(
  'editor/triggerAutosave',
  async (_, { getState }) => {
    const state = getState() as RootState;
    const { activeProjectId, sceneGraph } = state.editor;
    
    if (!activeProjectId || !sceneGraph) return;

    try {
      await axios.put(`${API_BASE}/projects/${activeProjectId}/autosave`, {
        sceneGraph: sceneGraph
      });
      console.log('Autosaved');
    } catch (error) {
      console.error('Autosave failed', error);
    }
  }
);

export const exportVideo = createAsyncThunk(
  'editor/exportVideo',
  async (_, { dispatch, getState }) => {
    const state = getState() as RootState;
    const { sceneGraph } = state.editor;
    if (!sceneGraph) return;

    dispatch({ type: 'editor/setExporting', payload: true });

    try {
      const response = await fetch(`${API_BASE}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sceneGraph })
      });

      if (!response.body) throw new Error('No response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === 'progress') {
                dispatch(setExportProgressDetails({
                  percent: data.percent,
                  eta: data.etaSeconds !== undefined ? data.etaSeconds : null,
                  status: data.status || 'rendering'
                }));
              } else if (data.type === 'complete') {
                dispatch({ type: 'editor/setExportUrl', payload: data.url });
              } else if (data.type === 'error') {
                console.error("Export error:", data.message);
                dispatch({ type: 'editor/setExporting', payload: false });
              }
            } catch (e) {
              // ignore parse errors for partial chunks
            }
          }
        }
      }
    } catch (error) {
      console.error("Failed to export video", error);
      dispatch({ type: 'editor/setExporting', payload: false });
    }
  }
);
