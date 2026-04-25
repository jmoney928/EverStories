const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const WAVESPEED_KEY = process.env.WAVESPEED_API_KEY;
const ASSETS = path.join(__dirname, 'assets');
const SOURCE = path.join(ASSETS, 'hero-source-v14.jpg');

const PROMPT = `Cinematic camera sequence. Starting from directly overhead — bird's eye view looking straight down at a closed matte black luxury keepsake box on dark obsidian velvet. The lid clearly shows a gold foil tree of life logo, the brand name "EverStories" and the tagline "A Lifetime of Memories, Brought to Life." in gold foil beneath it.

The camera slowly descends and tilts forward, smoothly rotating from the overhead position down to eye level, landing directly in front of the box.

The box lid then opens slowly — the magnetic closure releases and the lid rises — revealing the interior. Nestled inside the dark velvet-lined box is a sleek matte black rectangular digital picture frame. The picture frame screen powers on and glows warmly — displayed on the frame screen is a classic black and white wedding photograph: a beautiful young bride in a white satin gown with a cathedral veil, and a handsome young groom in a dark suit, both smiling joyfully at each other, holding hands. The photograph is clearly visible on the picture frame screen, with a thin bezel around it. The glowing frame screen illuminates the dark velvet interior of the box with warm light.

Camera gently pushes in closer toward the picture frame. The couple on the frame screen is the clear focal point. Cinematic, emotional, reverent. Deep blacks, warm gold highlights.`;

(async () => {
  // Resize to 1080p
  const resized = path.join(ASSETS, 'hero-v14-1080p.jpg');
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

  // Submit to WaveSpeed
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
      const clip1 = path.join(ASSETS, 'hero-clip1-v3.mp4');
      const videoRes = await fetch(videoUrl);
      fs.writeFileSync(clip1, Buffer.from(await videoRes.arrayBuffer()));
      console.log(`Clip 1 saved → ${clip1}`);

      // Stitch with existing wedding clip
      console.log('\nStitching clips...');
      const weddingClip = path.join(ASSETS, 'wedding-clip.mp4');
      const listFile = path.join(ASSETS, 'concat-final.txt');
      fs.writeFileSync(listFile, `file '${clip1}'\nfile '${weddingClip}'\n`);
      const combined = path.join(ASSETS, 'hero-loop.mp4');
      execSync(`ffmpeg -y -f concat -safe 0 -i "${listFile}" -c:v libx264 -crf 18 -vf "scale=1280:720" "${combined}"`);

      // Extract frames
      const framesDir = path.join(ASSETS, 'frames');
      execSync(`rm -f "${framesDir}"/frame-*.jpg`);
      execSync(`ffmpeg -y -i "${combined}" -vf "fps=24" -q:v 4 "${path.join(framesDir, 'frame-%04d.jpg')}"`);
      const count = fs.readdirSync(framesDir).filter(f => f.endsWith('.jpg')).length;
      console.log(`\nDone! ${count} frames. Opening video...`);
      execSync(`open "${combined}"`);
      return;
    }
    if (s === 'failed') { console.error('Failed:', JSON.stringify(status)); process.exit(1); }
  }
})();
