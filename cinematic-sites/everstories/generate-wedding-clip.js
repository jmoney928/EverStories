const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const WAVESPEED_KEY = process.env.WAVESPEED_API_KEY;
const ASSETS = path.join(__dirname, 'assets');
const WEDDING_SRC = '/Users/sully/EverStories/wedding.jpg';
const EVERLIFE1 = '/Users/sully/EverStories/Everlife1.mp4';

const PROMPT = `A vintage black and white wedding photograph slowly comes to life. The still image begins to breathe — warm color bleeds in from the edges, starting with golden afternoon light bathing the scene. The bride in her white gown begins to move gently — she turns and laughs, her veil catching a soft breeze. The groom squeezes her hand and smiles warmly at her. The background trees sway softly. The scene is intimate, joyful, cinematic — like watching a memory play out in real time. Shallow depth of field, warm golden hour light, film grain, 1950s cinematic color grade. The couple is radiant, alive, the moment eternal.`;

(async () => {
  // Resize wedding photo to 1080p
  console.log('Preparing wedding photo...');
  const resized = path.join(ASSETS, 'wedding-1080p.jpg');
  execSync(`ffmpeg -y -i "${WEDDING_SRC}" -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2" -q:v 2 "${resized}" 2>/dev/null`);

  // Upload to litterbox
  console.log('Uploading to litterbox...');
  const imageData = fs.readFileSync(resized);
  const formData = new FormData();
  formData.append('reqtype', 'fileupload');
  formData.append('time', '24h');
  formData.append('fileToUpload', new Blob([imageData], { type: 'image/jpeg' }), 'wedding.jpg');
  const uploadRes = await fetch('https://litterbox.catbox.moe/resources/internals/api.php', { method: 'POST', body: formData });
  const imageUrl = (await uploadRes.text()).trim();
  console.log('Image URL:', imageUrl);

  // Submit to WaveSpeed
  const submitRes = await fetch('https://api.wavespeed.ai/api/v3/kwaivgi/kling-video-o3-pro/image-to-video', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${WAVESPEED_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: imageUrl, prompt: PROMPT, duration: 8, cfg_scale: 0.6, sound: false })
  });

  const submitted = await submitRes.json();
  const predId = submitted?.data?.id;
  if (!predId) { console.error('Submit failed:', JSON.stringify(submitted)); process.exit(1); }
  console.log('Prediction ID:', predId);

  // Poll
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
      const weddingClip = path.join(ASSETS, 'wedding-clip.mp4');
      const videoRes = await fetch(videoUrl);
      fs.writeFileSync(weddingClip, Buffer.from(await videoRes.arrayBuffer()));
      console.log(`Wedding clip saved → ${weddingClip}`);

      // Stitch Everlife1 + wedding clip
      console.log('\nStitching Everlife1 + wedding clip...');
      const listFile = path.join(ASSETS, 'concat-final.txt');
      fs.writeFileSync(listFile, `file '${EVERLIFE1}'\nfile '${weddingClip}'\n`);
      const combined = path.join(ASSETS, 'hero-loop.mp4');
      execSync(`ffmpeg -y -f concat -safe 0 -i "${listFile}" -c:v libx264 -crf 18 -vf "scale=1280:720" "${combined}"`);
      console.log(`Combined → ${combined}`);

      // Extract frames
      const framesDir = path.join(ASSETS, 'frames');
      execSync(`rm -f "${framesDir}"/frame-*.jpg`);
      execSync(`ffmpeg -y -i "${combined}" -vf "fps=24" -q:v 4 "${path.join(framesDir, 'frame-%04d.jpg')}"`);
      const count = fs.readdirSync(framesDir).filter(f => f.endsWith('.jpg')).length;
      console.log(`\nDone! ${count} frames extracted. Ready to build the site.`);
      return;
    }
    if (s === 'failed') { console.error('Failed:', JSON.stringify(status)); process.exit(1); }
  }
})();
