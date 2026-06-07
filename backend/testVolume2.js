import { execSync } from 'child_process';
import ffmpegStatic from 'ffmpeg-static';
try {
  const result = execSync(`"${ffmpegStatic}" -i "C:\\Users\\Ramjan\\Desktop\\video\\backend\\uploads\\export_1780804963894.mp4" -af "volumedetect" -vn -sn -dn -f null /dev/null 2>&1`, { encoding: 'utf8' });
  console.log("VOLUME DETECT LOGS:");
  const lines = result.split('\n').filter(line => line.includes('mean_volume') || line.includes('max_volume') || line.includes('audio'));
  console.log(lines.join('\n'));
} catch (e) {
  console.log("VOLUME DETECT ERROR LOGS:");
  const lines = e.stdout.split('\n').concat(e.stderr.split('\n')).filter(line => line.includes('mean_volume') || line.includes('max_volume') || line.includes('audio'));
  console.log(lines.join('\n'));
}
