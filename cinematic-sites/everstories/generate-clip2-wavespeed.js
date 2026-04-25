const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const WAVESPEED_KEY = process.env.WAVESPEED_API_KEY;
const ASSETS = path.join(__dirname, 'assets');
const SOURCE = path.join(ASSETS, 'hero-frame-bw.jpg');

const PROMPT = `The digital photo frame inside the open EverStories box displays a black and white vintage wedding photograph of a couple — a bride in a white gown and veil, a groom in a dark suit, holding hands and smiling. Slowly, magically, warm color begins to bleed into the black and white image — starting from the center of the couple, spreading outward like a sunrise warming the scene. The bride's dress becomes ivory white, her bouquet blooms with soft warm color, the groom's suit becomes deep charcoal, golden afternoon light bathes the entire scene. The black and white memory fully transforms into a warm living color photograph on the frame screen — the couple alive, radiant, the moment eternal. Subtle warm light from the glowing frame illuminates the dark velvet interior of the box. Cinematic, emotional, reverent. Camera holds completely still throughout.`;

(async () => {
  // Resize source image to 1080p
  const resized = path.join(ASSETS, 'hero-frame-bw-1080p.jpg');
  execSync(`ffmpeg -y -i "${SOURCE}" -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2" -q:v 2 "${resized}" 2>/dev/null`);
  console.log('Resized to 1080p');

  // Upload to litterbox
  console.log('Uploading to litterbox...');
  const imageData = fs.readFileSync(resized);
  const formData = new FormData();
  formData.append('reqtype', 'fileupload');
  formData.append('time', '24h');
  formData.append('fileToUpload', new Blob([imageData], { type: 'image/jpeg' }), 'frame.jpg');
  const uploadRes = await fetch('https://litterbox.catbox.moe/resources/internals/api.php', { method: 'POST', body: formData });
  const imageUrl = (await uploadRes.text()).trim();
  console.log('Image URL:', imageUrl);

  // Submit to WaveSpeed
  const submitRes = await fetch('https://api.wavespeed.ai/api/v3/kwaivgi/kling-video-o3-pro/image-to-video', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${WAVESPEED_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: imageUrl, prompt: PROMPT, duration: 8, cfg_scale: 0.7, sound: false })
  });

  const submitted = await submitRes.json();
  const predId = submitted?.data?.id;
  if (!predId) { console.error('Submit failed:', JSON.stringify(submitted)); process.exit(1); }
  console.log('Prediction ID:', predId);

  // Poll every 15s
  for (let i = 0; i < 80; i++) {
    await new Promise(r => setTimeout(r, 15000));
    console.log(`Polling... (${(i+1)*15}s)`);
    const poll = await fetch(`https://api.wavespeed.ai/api/v3/predictions/${predId}/result`, {
      headers: { 'Authorization': `Bearer ${WAVESPEED_KEY}` }
    });
    const status = await poll.json();
    const s = status?.data?.status;
    console.log('Status:', s);
    if (s === 'completed') {
      const videoUrl = status?.data?.outputs?.[0];
      const videoRes = await fetch(videoUrl);
      const clip2 = path.join(ASSETS, 'hero-clip2.mp4');
      fs.writeFileSync(clip2, Buffer.from(await videoRes.arrayBuffer()));
      console.log(`Clip 2 saved → ${clip2}`);

      // Concatenate clip1 + clip2
      console.log('\nConcatenating...');
      const clip1 = path.join(ASSETS, 'hero-loop.mp4');
      const listFile = path.join(ASSETS, 'concat.txt');
      fs.writeFileSync(listFile, `file '${clip1}'\nfile '${clip2}'\n`);
      const combined = path.join(ASSETS, 'hero-final.mp4');
      execSync(`ffmpeg -y -f concat -safe 0 -i "${listFile}" -c:v libx264 -crf 18 "${combined}"`);

      // Re-extract frames
      console.log('Extracting frames...');
      const framesDir = path.join(ASSETS, 'frames');
      execSync(`rm -f "${framesDir}"/frame-*.jpg`);
      execSync(`ffmpeg -y -i "${combined}" -vf "fps=24,scale=1280:720" -q:v 4 "${path.join(framesDir, 'frame-%04d.jpg')}"`);
      const count = fs.readdirSync(framesDir).filter(f => f.endsWith('.jpg')).length;
      fs.copyFileSync(combined, clip1);
      console.log(`\nDone! ${count} frames extracted. Ready to build the site.`);
      return;
    }
    if (s === 'failed') { console.error('Failed:', JSON.stringify(status)); process.exit(1); }
  }
  console.error('Timed out');
})();
