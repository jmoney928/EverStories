const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const WAVESPEED_KEY = process.env.WAVESPEED_API_KEY;
const ASSETS = path.join(__dirname, 'assets');
const SOURCE = path.join(ASSETS, 'hero-source-v14.jpg');

const PROMPT = `Cinematic camera movement sequence over 8 seconds:

SECONDS 0-2: Camera starts directly overhead — perfect bird's eye view looking straight down at the closed matte black EverStories keepsake box on dark velvet. Gold foil tree logo, "EverStories" and tagline "A Lifetime of Memories, Brought to Life." gleam on the lid.

SECONDS 2-4: Camera smoothly descends and tilts forward — rotating from overhead down to eye level, coming to rest directly in front of the box.

SECONDS 4-6: The box lid slowly opens — magnetic closure releases, lid rises to reveal the interior. Inside, a sleek digital photo frame nestled in black velvet foam. The frame screen glows on displaying a vintage black and white wedding photograph — a bride in a white gown and veil, a groom in a dark suit, both smiling.

SECONDS 6-8: The black and white wedding photo on the frame screen slowly blooms into warm color — ivory dress, warm golden skin tones, soft amber light fills the scene — the memory coming to life. Camera gently pushes in toward the glowing frame.

Cinematic, emotional, reverent. Deep blacks, warm gold throughout.`;

(async () => {
  // Resize to 1080p
  const resized = path.join(ASSETS, 'hero-source-v14-1080p.jpg');
  execSync(`ffmpeg -y -i "${SOURCE}" -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2" -q:v 2 "${resized}" 2>/dev/null`);
  console.log('Resized to 1080p');

  // Upload to litterbox
  console.log('Uploading to litterbox...');
  const imageData = fs.readFileSync(resized);
  const formData = new FormData();
  formData.append('reqtype', 'fileupload');
  formData.append('time', '24h');
  formData.append('fileToUpload', new Blob([imageData], { type: 'image/jpeg' }), 'hero.jpg');
  const uploadRes = await fetch('https://litterbox.catbox.moe/resources/internals/api.php', { method: 'POST', body: formData });
  const imageUrl = (await uploadRes.text()).trim();
  console.log('Image URL:', imageUrl);

  // Submit to WaveSpeed Kling O3 Pro
  const submitRes = await fetch('https://api.wavespeed.ai/api/v3/kwaivgi/kling-video-o3-pro/image-to-video', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${WAVESPEED_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: imageUrl, prompt: PROMPT, duration: 8, cfg_scale: 0.5, sound: false })
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
      const videoRes = await fetch(videoUrl);
      const outPath = path.join(ASSETS, 'hero-loop.mp4');
      fs.writeFileSync(outPath, Buffer.from(await videoRes.arrayBuffer()));
      console.log(`Video saved → ${outPath}`);

      // Extract frames
      console.log('Extracting frames...');
      const framesDir = path.join(ASSETS, 'frames');
      execSync(`rm -f "${framesDir}"/frame-*.jpg`);
      execSync(`ffmpeg -y -i "${outPath}" -vf "fps=24,scale=1280:720" -q:v 4 "${path.join(framesDir, 'frame-%04d.jpg')}"`);
      const count = fs.readdirSync(framesDir).filter(f => f.endsWith('.jpg')).length;
      console.log(`\nDone! ${count} frames extracted. Ready to build the site.`);
      return;
    }
    if (s === 'failed') { console.error('Failed:', JSON.stringify(status)); process.exit(1); }
  }
  console.error('Timed out');
})();
