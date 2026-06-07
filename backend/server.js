import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { handleExport } from './export.js';

import Project from './models/Project.js';
import ProjectVersion from './models/ProjectVersion.js';
import Asset from './models/Asset.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// Serve static files from uploads directory (for exported videos)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Use fluent-ffmpeg for duration probing
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';

ffmpeg.setFfmpegPath(ffmpegStatic);
ffmpeg.setFfprobePath(ffprobeStatic.path);

// Configure Multer for local storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, 'uploads'));
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => console.error('MongoDB connection error:', err));

// Helper to probe duration
const probeDuration = (filePath) => {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      const duration = metadata.format.duration;
      resolve(duration || 0);
    });
  });
};

// Routes

// 1. ASSETS
app.post('/api/assets', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    let type = 'video';
    if (req.file.mimetype.startsWith('image/')) type = 'image';
    if (req.file.mimetype.startsWith('audio/')) type = 'audio';

    // Calculate duration for video and audio
    let assetDuration = 0;
    if (type === 'video' || type === 'audio') {
      try {
        assetDuration = await probeDuration(req.file.path);
      } catch (err) {
        console.error('Probe duration error:', err);
      }
    } else {
      assetDuration = 5; // Default image duration
    }

    const backendUrl = process.env.BACKEND_URL || 'http://localhost:3000';
    const fileUrl = `${backendUrl}/uploads/${req.file.filename}`;

    // Save metadata to DB
    const newAsset = new Asset({
      original_url: fileUrl,
      preview_url: fileUrl,
      duration: assetDuration,
      type: type,
      public_id: req.file.filename,
    });

    await newAsset.save();
    res.status(201).json(newAsset);
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to upload asset' });
  }
});

// Download Route for forcing PC save
app.get('/api/download/:filename', (req, res) => {
  const filePath = path.join(__dirname, 'uploads', req.params.filename);
  res.download(filePath, req.params.filename, (err) => {
    if (err) {
      console.error("Download failed:", err);
      if (!res.headersSent) res.status(404).send("File not found");
    }
  });
});

app.get('/api/assets', async (req, res) => {
  try {
    const assets = await Asset.find().sort({ createdAt: -1 });
    res.json(assets);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch assets' });
  }
});

// 2. PROJECTS
app.post('/api/projects', async (req, res) => {
  try {
    // Create new project
    const project = new Project({ title: req.body.title || 'New Project' });
    await project.save();
    
    // Create initial empty scene graph
    const initialSceneGraph = {
      projectId: project._id,
      duration: 0.0,
      fps: 30,
      resolution: { w: 1920, h: 1080 },
      tracks: []
    };

    const projectVersion = new ProjectVersion({
      projectId: project._id,
      versionNum: 1,
      sceneGraph: initialSceneGraph
    });
    await projectVersion.save();

    res.status(201).json({ project, sceneGraph: initialSceneGraph });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create project' });
  }
});

app.get('/api/projects/:id', async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    // Get the latest version
    const latestVersion = await ProjectVersion.findOne({ projectId: project._id }).sort({ versionNum: -1 });

    res.json({ project, sceneGraph: latestVersion ? latestVersion.sceneGraph : null });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch project' });
  }
});

app.put('/api/projects/:id/autosave', async (req, res) => {
  try {
    const { sceneGraph } = req.body;
    
    // In a real app, you might compute deltas or just upload full JSON to S3.
    // For this MVP, we just save a new version in Mongo.
    
    // Get latest version number
    const latestVersion = await ProjectVersion.findOne({ projectId: req.params.id }).sort({ versionNum: -1 });
    const nextVersionNum = latestVersion ? latestVersion.versionNum + 1 : 1;

    const newVersion = new ProjectVersion({
      projectId: req.params.id,
      versionNum: nextVersionNum,
      sceneGraph: sceneGraph
    });

    await newVersion.save();
    res.json({ message: 'Autosaved successfully', version: nextVersionNum });
  } catch (error) {
    res.status(500).json({ error: 'Autosave failed' });
  }
});

// Delete an asset from DB
app.delete('/api/assets/:id', async (req, res) => {
  try {
    const result = await Asset.findByIdAndDelete(req.params.id);
    if (!result) return res.status(404).json({ error: 'Asset not found' });
    // In a production app, we would also delete the asset from Cloudinary here
    // using cloudinary.uploader.destroy(public_id)
    res.json({ message: 'Asset deleted successfully' });
  } catch (error) {
    console.error('Delete asset error:', error);
    res.status(500).json({ error: 'Failed to delete asset' });
  }
});

// Export Video (SSE endpoint)
app.post('/api/export', handleExport);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
