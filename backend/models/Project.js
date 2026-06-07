import mongoose from 'mongoose';

const projectSchema = new mongoose.Schema({
  title: { type: String, default: 'Untitled Project' },
  duration: { type: Number, default: 30.0 }, // duration in seconds
  thumbnail_url: { type: String },
  fps: { type: Number, default: 30 },
  resolution: {
    w: { type: Number, default: 1920 },
    h: { type: Number, default: 1080 }
  }
}, { timestamps: true });

export default mongoose.model('Project', projectSchema);
