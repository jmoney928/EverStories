const fs = require('fs');
const path = require('path');

const KEY = process.env.GOOGLE_AI_STUDIO_KEY;
const WAVESPEED_KEY = process.env.WAVESPEED_API_KEY;
const ASSETS = path.join(__dirname, 'assets');
const SOURCE_IMAGE = path.join(ASSETS, 'hero-source-v13.jpg');

const ANIMATION_PROMPT = `The camera starts from directly overhead — a perfect bird's eye view looking straight down at the closed matte black EverStories keepsake box on dark velvet. The gold foil tree of life logo gleams on the lid. Slowly, the camera begins to descend and tilt forward, smoothly rotating from the overhead position down to eye level, coming to rest directly in front of the box. Then, the lid of the box slowly opens — the magnetic closure releases, the lid rises smoothly — revealing the interior: a sleek digital photo frame nestled in dark velvet, its screen glowing to life with warm golden light. On the frame, a vintage black and white wedding photograph appears — a bride in a white gown and veil, a groom in a dark suit, both smiling. Then, slowly and beautifully, warm color begins to bloom into the black and white image — ivory dress, warm skin tones, golden afternoon light spreading across the scene — the memory coming alive. Camera holds steady. Cinematic, reverent, emotional. Deep blacks, warm gold.`;

async function tryVeo() {
  console.log('Trying Veo 3.1...');
  const imageB64 = fs.readFileSync(SOURCE_IMAGE).toString('base64');

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/veo-3.1-generate-preview:predictLongRunning?key=${KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instances: [{
          prompt: ANIMATION_PROMPT,
          image: { bytesBase64Encoded: imageB64, mimeType: 'image/jpeg' }
        }],
        parameters: {
          aspectRatio: '16:9',
          durationSeconds: '8',
          resolution: '1080p',
          personGeneration: 'allow_all'
        }
      })
    }
  );

  if (!res.ok) {
    const err = await res.text();
    console.log('Veo failed:', err.slice(0, 300));
    return null;
  }

  const op = await res.json();
  console.log('Veo operation started:', op.name);

  // Poll every 15 seconds
  let result = null;
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 15000));
    console.log(`Polling... (${(i + 1) * 15}s)`);
    const poll = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${op.name}?key=${KEY}`
    );
    const status = await poll.json();
    if (status.done) { result = status; break; }
  }

  if (!result) { console.log('Veo timed out'); return null; }

  const videoUri = result.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
  if (!videoUri) { console.log('No video URI in response:', JSON.stringify(result).slice(0, 300)); return null; }

  // Download video
  const videoRes = await fetch(`${videoUri}&key=${KEY}`);
  const outPath = path.join(ASSETS, 'hero-loop.mp4');
  fs.writeFileSync(outPath, Buffer.from(await videoRes.arrayBuffer()));
  console.log(`Veo video saved → ${outPath}`);
  return outPath;
}

async function tryWaveSpeed() {
  console.log('\nFalling back to WaveSpeed (Kling O3 Pro)...');

  // Resize image to 1920x1080 first
  const { execSync } = require('child_process');
  const resized = path.join(ASSETS, 'hero-source-1080p.jpg');
  execSync(`ffmpeg -y -i "${SOURCE_IMAGE}" -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2" -q:v 2 "${resized}"`);
  console.log('Resized to 1080p');

  // Upload to litterbox (24h expiry)
  console.log('Uploading to litterbox...');
  const imageData = fs.readFileSync(resized);
  const formData = new FormData();
  formData.append('reqtype', 'fileupload');
  formData.append('time', '24h');
  formData.append('fileToUpload', new Blob([imageData], { type: 'image/jpeg' }), 'hero.jpg');

  const uploadRes = await fetch('https://litterbox.catbox.moe/resources/internals/api.php', {
    method: 'POST', body: formData
  });
  const imageUrl = await uploadRes.text();
  console.log('Image URL:', imageUrl.trim());

  // Submit to WaveSpeed
  const submitRes = await fetch('https://api.wavespeed.ai/api/v3/kwaivgi/kling-video-o3-pro/image-to-video', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${WAVESPEED_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image: imageUrl.trim(),
      prompt: ANIMATION_PROMPT,
      duration: 8,
      cfg_scale: 0.7,
      sound: false
    })
  });

  const submitted = await submitRes.json();
  const predId = submitted?.data?.id;
  if (!predId) { console.error('WaveSpeed submit failed:', JSON.stringify(submitted)); return null; }
  console.log('WaveSpeed prediction ID:', predId);

  // Poll every 15 seconds
  for (let i = 0; i < 80; i++) {
    await new Promise(r => setTimeout(r, 15000));
    console.log(`Polling WaveSpeed... (${(i + 1) * 15}s)`);
    const poll = await fetch(`https://api.wavespeed.ai/api/v3/predictions/${predId}/result`, {
      headers: { 'Authorization': `Bearer ${WAVESPEED_KEY}` }
    });
    const status = await poll.json();
    const s = status?.data?.status;
    console.log('Status:', s);
    if (s === 'completed') {
      const videoUrl = status?.data?.outputs?.[0];
      if (!videoUrl) { console.error('No video URL'); return null; }
      console.log('Downloading video...');
      const videoRes = await fetch(videoUrl);
      const outPath = path.join(ASSETS, 'hero-loop.mp4');
      fs.writeFileSync(outPath, Buffer.from(await videoRes.arrayBuffer()));
      console.log(`WaveSpeed video saved → ${outPath}`);
      return outPath;
    }
    if (s === 'failed') { console.error('WaveSpeed failed:', JSON.stringify(status)); return null; }
  }
  console.log('WaveSpeed timed out');
  return null;
}

(async () => {
  let videoPath = await tryVeo();
  if (!videoPath) videoPath = await tryWaveSpeed();
  if (!videoPath) { console.error('All video generation failed.'); process.exit(1); }

  // Extract frames
  console.log('\nExtracting frames...');
  const { execSync } = require('child_process');
  const framesDir = path.join(ASSETS, 'frames');
  if (!fs.existsSync(framesDir)) fs.mkdirSync(framesDir);
  execSync(`ffmpeg -y -i "${videoPath}" -vf "fps=24,scale=1280:720" -q:v 4 "${path.join(framesDir, 'frame-%04d.jpg')}"`);
  const frameCount = fs.readdirSync(framesDir).filter(f => f.endsWith('.jpg')).length;
  console.log(`Extracted ${frameCount} frames → assets/frames/`);
  console.log('\nDone! Ready to build the site.');
})();
