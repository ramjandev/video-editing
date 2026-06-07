import mongoose from 'mongoose';

const assetSchema = new mongoose.Schema({
  original_url: { type: String, required: true },
  preview_url: { type: String }, // e.g., 720p version
  thumbnail_sprite_url: { type: String },
  duration: { type: Number },
  type: { type: String, enum: ['video', 'audio', 'image'], default: 'video' },
  public_id: { type: String }, // Cloudinary public_id for management
}, { timestamps: true });

export default mongoose.model('Asset', assetSchema);
