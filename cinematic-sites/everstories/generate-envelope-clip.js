const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const WAVESPEED_KEY = process.env.WAVESPEED_API_KEY;
const ASSETS = path.join(__dirname, 'assets');
const SOURCE = path.join(ASSETS, 'Wedding2.png');

const PROMPT = `A vintage black and white wedding photograph slowly comes to life. The still image begins to breathe — the couple gently begins to move. The bride in her white gown leans in closer to the groom, her veil catching a soft breeze. The groom smiles warmly and pulls her close. Warm golden color slowly bleeds into the scene — starting from the light behind them, spreading across their faces and clothing. The bride's dress becomes bright ivory white, the groom's suit becomes rich charcoal, soft golden afternoon light fills the scene. The background softly comes alive with gentle motion. The couple is radiant, alive, the moment eternal. Shallow depth of field, warm golden hour light, film grain, cinematic color grade. Camera holds completely still throughout.`;

(async () => {
  const resized = path.join(ASSETS, 'wedding2-1080p.jpg');
  execSync(`ffmpeg -y -i "${SOURCE}" -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,format=yuvj420p" -q:v 2 "${resized}" 2>/dev/null`);
  console.log('Resized to 1080p');

  console.log('Uploading to litterbox...');
  const imageData = fs.readFileSync(resized);
  const formData = new FormData();
  formData.append('reqtype', 'fileupload');
  formData.append('time', '24h');
  formData.append('fileToUpload', new Blob([imageData], { type: 'image/jpeg' }), 'envelope.jpg');
  const uploadRes = await fetch('https://litterbox.catbox.moe/resources/internals/api.php', { method: 'POST', body: formData });
  const imageUrl = (await uploadRes.text()).trim();
  console.log('Image URL:', imageUrl);

  const submitRes = await fetch('https://api.wavespeed.ai/api/v3/kwaivgi/kling-video-o3-pro/image-to-video', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${WAVESPEED_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: imageUrl, prompt: PROMPT, duration: 8, cfg_scale: 0.6, sound: false })
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
      const envelopeClip = path.join(ASSETS, 'envelope-clip.mp4');
      const videoRes = await fetch(videoUrl);
      fs.writeFileSync(envelopeClip, Buffer.from(await videoRes.arrayBuffer()));
      console.log(`Envelope clip saved → ${envelopeClip}`);
      execSync(`open "${envelopeClip}"`);
      return;
    }
    if (s === 'failed') { console.error('Failed:', JSON.stringify(status)); process.exit(1); }
  }
  console.error('Timed out');
})();
