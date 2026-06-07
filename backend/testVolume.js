import { execSync } from 'child_process';
import ffmpegStatic from 'ffmpeg-static';
import path from 'path';

try {
  const result = execSync(`"${ffmpegStatic}" -i "C:\\Users\\Ramjan\\Desktop\\video\\backend\\uploads\\export_1780804017376.mp4" -af "volumedetect" -vn -sn -dn -f null /dev/null`, { encoding: 'utf8', stdio: 'pipe' });
  console.log(result);
} catch (err) {
  console.log("STDOUT:", err.stdout);
  console.log("STDERR:", err.stderr);
}
