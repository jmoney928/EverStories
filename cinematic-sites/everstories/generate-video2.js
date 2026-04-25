const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const KEY = process.env.GOOGLE_AI_STUDIO_KEY;
const WAVESPEED_KEY = process.env.WAVESPEED_API_KEY;
const ASSETS = path.join(__dirname, 'assets');

// Step 1: Generate the source image — open box, frame inside showing B&W wedding photo
async function generateSourceImage() {
  console.log('Generating source image — open box, frame showing B&W wedding photo...');

  const prompt = `Cinematic luxury product photography. Slightly elevated angle looking at an open matte black EverStories keepsake box. The box lid is open and pushed back, showing the gold foil tree of life logo and "EverStories" in gold serif lettering on the lid interior. Inside the box, nestled in a black velvet foam insert, is a sleek 10-inch digital photo frame with a matte black border. The frame screen is ON and displaying a vintage black and white photograph — a bride in a full white wedding gown and veil, a groom in a dark suit, holding hands and smiling outside a church. The photo is in classic black and white, sharp and detailed, with the couple centered on the frame screen. The frame glows softly with the image. Dark obsidian velvet surface, dramatic warm sidelight from upper-left, deep cinematic shadows. Film grain, deep blacks and warm gold. 16:9 landscape. Ultra-realistic luxury commercial photography.`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-ultra-generate-001:predict?key=${KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: { sampleCount: 1, aspectRatio: '16:9', outputMimeType: 'image/jpeg', personGeneration: 'allow_all' }
      })
    }
  );

  const data = await res.json();
  const b64 = data?.predictions?.[0]?.bytesBase64Encoded;
  if (!b64) { console.error('Image gen failed:', JSON.stringify(data).slice(0, 300)); process.exit(1); }

  const outPath = path.join(ASSETS, 'hero-frame-bw.jpg');
  fs.writeFileSync(outPath, Buffer.from(b64, 'base64'));
  console.log(`Source image saved → ${outPath}`);
  return outPath;
}

// Step 2: Animate with WaveSpeed — B&W photo comes to life in color
async function generateColorizeVideo(sourcePath) {
  console.log('\nAnimating — photo comes to life...');

  // Resize to 1080p
  const resized = path.join(ASSETS, 'hero-frame-bw-1080p.jpg');
  execSync(`ffmpeg -y -i "${sourcePath}" -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2" -q:v 2 "${resized}" 2>/dev/null`);

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
  const animPrompt = `The digital photo frame inside the open EverStories box displays a black and white vintage wedding photograph. Slowly, magically, warm color begins to bleed into the black and white image — starting from the center of the couple, spreading outward like a sunrise. The bride's veil becomes ivory white, her bouquet blooms with soft color, the groom's eyes warm, golden afternoon light bathes the scene. The black and white memory transforms into a full living color photograph on the frame screen. The couple seems to breathe, to live again. Subtle light from the frame illuminates the dark velvet interior of the box. The moment comes alive. Cinematic, emotional, reverent. Camera holds completely still.`;

  const submitRes = await fetch('https://api.wavespeed.ai/api/v3/kwaivgi/kling-video-o3-pro/image-to-video', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${WAVESPEED_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: imageUrl, prompt: animPrompt, duration: 8, cfg_scale: 0.7, sound: false })
  });

  const submitted = await submitRes.json();
  const predId = submitted?.data?.id;
  if (!predId) { console.error('WaveSpeed submit failed:', JSON.stringify(submitted)); process.exit(1); }
  console.log('Prediction ID:', predId);

  // Poll
  for (let i = 0; i < 80; i++) {
    await new Promise(r => setTimeout(r, 15000));
    console.log(`Polling... (${(i + 1) * 15}s)`);
    const poll = await fetch(`https://api.wavespeed.ai/api/v3/predictions/${predId}/result`, {
      headers: { 'Authorization': `Bearer ${WAVESPEED_KEY}` }
    });
    const status = await poll.json();
    const s = status?.data?.status;
    console.log('Status:', s);
    if (s === 'completed') {
      const videoUrl = status?.data?.outputs?.[0];
      const videoRes = await fetch(videoUrl);
      const outPath = path.join(ASSETS, 'hero-colorize.mp4');
      fs.writeFileSync(outPath, Buffer.from(await videoRes.arrayBuffer()));
      console.log(`Colorize video saved → ${outPath}`);
      return outPath;
    }
    if (s === 'failed') { console.error('Failed:', JSON.stringify(status)); process.exit(1); }
  }
  console.error('Timed out'); process.exit(1);
}

// Step 3: Concatenate both videos and re-extract frames
async function concatenateAndExtract(clip1, clip2) {
  console.log('\nConcatenating clips...');
  const listFile = path.join(ASSETS, 'concat.txt');
  fs.writeFileSync(listFile, `file '${clip1}'\nfile '${clip2}'\n`);

  const combined = path.join(ASSETS, 'hero-final.mp4');
  execSync(`ffmpeg -y -f concat -safe 0 -i "${listFile}" -c copy "${combined}"`);
  console.log(`Combined video → ${combined}`);

  // Clear old frames and re-extract
  console.log('Extracting frames from combined video...');
  const framesDir = path.join(ASSETS, 'frames');
  execSync(`rm -f "${framesDir}"/frame-*.jpg`);
  execSync(`ffmpeg -y -i "${combined}" -vf "fps=24,scale=1280:720" -q:v 4 "${path.join(framesDir, 'frame-%04d.jpg')}"`);
  const frameCount = fs.readdirSync(framesDir).filter(f => f.endsWith('.jpg')).length;
  console.log(`Extracted ${frameCount} frames → assets/frames/`);

  // Copy as hero-loop for reference
  fs.copyFileSync(combined, path.join(ASSETS, 'hero-loop.mp4'));
  console.log('\nDone! Ready to build the site.');
}

(async () => {
  const sourceImage = await generateSourceImage();
  const clip2 = await generateColorizeVideo(sourceImage);
  const clip1 = path.join(ASSETS, 'hero-loop.mp4');
  // Save original clip1 before overwriting
  const clip1backup = path.join(ASSETS, 'hero-clip1.mp4');
  fs.copyFileSync(clip1, clip1backup);
  await concatenateAndExtract(clip1backup, clip2);
})();
