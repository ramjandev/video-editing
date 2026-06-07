import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const ProjectVersion = mongoose.model('ProjectVersion', new mongoose.Schema({ sceneGraph: Object, versionNum: Number }));

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const latest = await ProjectVersion.findOne().sort({ _id: -1 });
  console.log(JSON.stringify(latest.sceneGraph, null, 2));
  process.exit(0);
});
