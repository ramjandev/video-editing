import mongoose from 'mongoose';

const projectVersionSchema = new mongoose.Schema({
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
  versionNum: { type: Number, required: true },
  // In a real app, this would be an S3 key. Here we store the JSON string directly for simplicity,
  // or as an Object since MongoDB can handle JSON documents easily.
  sceneGraph: { type: Object, required: true },
}, { timestamps: true });

export default mongoose.model('ProjectVersion', projectVersionSchema);
