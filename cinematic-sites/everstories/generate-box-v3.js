const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const WAVESPEED_KEY = process.env.WAVESPEED_API_KEY;
const ASSETS = path.join(__dirname, 'assets');
const SOURCE = path.join(ASSETS, 'hero-source-v14.jpg');

const PROMPT = `Cinematic camera sequence over 8 seconds. FIRST 4 SECONDS: Camera starts directly overhead — bird's eye view of a closed matte black luxury keepsake box on dark obsidian velvet with gold foil "EverStories" logo and tagline on the lid. Camera quickly descends and tilts to eye level, the box lid swings open revealing a classic matte black rectangular picture frame lying flat in plush black velvet inside the box — NOT a tablet, NOT an iPad — a traditional picture frame. The frame displays a black and white vintage wedding photograph of a couple: a bride in a white gown with a veil, a groom in a dark suit, both smiling at each other. Camera zooms into the frame until the photo fills the entire screen.

FINAL 4 SECONDS: The black and white wedding photograph comes alive. BOTH the bride AND the groom begin to move simultaneously — the bride turns her head and laughs, her veil lifts in a warm breeze, the groom squeezes her hand and leans in smiling. Warm golden color floods the scene — ivory white dress, rich charcoal suit, golden afternoon light. The memory is fully alive, both people moving, breathing, radiant. Film grain, cinematic color grade.`;

(async () => {
  const resized = path.join(ASSETS, 'hero-source-v14-1080p.jpg');
  execSync(`ffmpeg -y -i "${SOURCE}" -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2" -q:v 2 "${resized}" 2>/dev/null`);
  console.log('Resized to 1080p');

  console.log('Uploading to litterbox...');
  const imageData = fs.readFileSync(resized);
  const formData = new FormData();
  formData.append('reqtype', 'fileupload');
  formData.append('time', '24h');
  formData.append('fileToUpload', new Blob([imageData], { type: 'image/jpeg' }), 'hero.jpg');
  const uploadRes = await fetch('https://litterbox.catbox.moe/resources/internals/api.php', { method: 'POST', body: formData });
  const imageUrl = (await uploadRes.text()).trim();
  console.log('Image URL:', imageUrl);

  const submitRes = await fetch('https://api.wavespeed.ai/api/v3/kwaivgi/kling-video-o3-pro/image-to-video', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${WAVESPEED_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: imageUrl, prompt: PROMPT, duration: 8, cfg_scale: 0.5, sound: false })
  });

  const submitted = await submitRes.json();
  const predId = submitted?.data?.id;
  if (!predId) { console.error('Submit failed:', JSON.stringify(submitted)); process.exit(1); }
  console.log('Prediction ID:', predId);

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
      const boxClip = path.join(ASSETS, 'box-v4.mp4');
      const videoRes = await fetch(videoUrl);
      fs.writeFileSync(boxClip, Buffer.from(await videoRes.arrayBuffer()));
      console.log(`Saved → ${boxClip}`);
      execSync(`open "${boxClip}"`);
      return;
    }
    if (s === 'failed') { console.error('Failed:', JSON.stringify(status)); process.exit(1); }
  }
  console.error('Timed out');
})();
