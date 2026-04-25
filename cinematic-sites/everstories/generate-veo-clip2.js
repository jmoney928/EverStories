const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const KEY = process.env.GOOGLE_AI_STUDIO_KEY;
const WAVESPEED_KEY = process.env.WAVESPEED_API_KEY;
const ASSETS = path.join(__dirname, 'assets');
const SOURCE = path.join(ASSETS, 'hero-frame-bw.jpg');

const PROMPT = `The digital photo frame inside the open EverStories box displays a black and white vintage wedding photograph. Slowly, magically, warm color begins to bleed into the black and white image — starting from the center of the couple, spreading outward like a sunrise. The bride's veil becomes ivory white, her bouquet blooms with soft color, the groom's eyes warm, golden afternoon light bathes the scene. The black and white memory transforms into a full living color photograph on the frame screen. The couple seems to breathe, to live again. Subtle light from the frame illuminates the dark velvet interior of the box. The moment comes alive. Cinematic, emotional, reverent. Camera holds completely still.`;

async function tryVeo() {
  console.log('Trying Veo 3.1...');
  const imageB64 = fs.readFileSync(SOURCE).toString('base64');

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/veo-3.1-generate-preview:predictLongRunning?key=${KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instances: [{
          prompt: PROMPT,
          image: { bytesBase64Encoded: imageB64, mimeType: 'image/jpeg' }
        }],
        parameters: {
          aspectRatio: '16:9',
          durationSeconds: 8,
          resolution: '1080p',
          personGeneration: 'allow_adult'
        }
      })
    }
  );

  if (!res.ok) {
    const err = await res.text();
    console.log('Veo failed:', err.slice(0, 400));
    return null;
  }

  const op = await res.json();
  console.log('Operation:', op.name);

  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 15000));
    console.log(`Polling... (${(i + 1) * 15}s)`);
    const poll = await fetch(`https://generativelanguage.googleapis.com/v1beta/${op.name}?key=${KEY}`);
    const status = await poll.json();
    if (status.done) {
      const uri = status.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
      if (!uri) { console.log('No URI:', JSON.stringify(status).slice(0, 300)); return null; }
      const videoRes = await fetch(`${uri}&key=${KEY}`);
      const out = path.join(ASSETS, 'hero-colorize.mp4');
      fs.writeFileSync(out, Buffer.from(await videoRes.arrayBuffer()));
      console.log(`Saved → ${out}`);
      return out;
    }
  }
  return null;
}

async function concatenateAndExtract(clip2) {
  console.log('\nConcatenating clips...');
  const clip1 = path.join(ASSETS, 'hero-clip1.mp4');
  // If clip1 backup doesn't exist, use hero-loop.mp4
  const c1 = fs.existsSync(clip1) ? clip1 : path.join(ASSETS, 'hero-loop.mp4');

  const listFile = path.join(ASSETS, 'concat.txt');
  fs.writeFileSync(listFile, `file '${c1}'\nfile '${clip2}'\n`);

  const combined = path.join(ASSETS, 'hero-final.mp4');
  execSync(`ffmpeg -y -f concat -safe 0 -i "${listFile}" -c copy "${combined}"`);
  console.log(`Combined → ${combined}`);

  const framesDir = path.join(ASSETS, 'frames');
  execSync(`rm -f "${framesDir}"/frame-*.jpg`);
  execSync(`ffmpeg -y -i "${combined}" -vf "fps=24,scale=1280:720" -q:v 4 "${path.join(framesDir, 'frame-%04d.jpg')}"`);
  const count = fs.readdirSync(framesDir).filter(f => f.endsWith('.jpg')).length;
  console.log(`Extracted ${count} frames`);
  fs.copyFileSync(combined, path.join(ASSETS, 'hero-loop.mp4'));
  console.log('\nDone! Ready to build the site.');
}

(async () => {
  const clip2 = await tryVeo();
  if (!clip2) {
    console.log('\nVeo unavailable. Please top up WaveSpeed at https://wavespeed.ai/billing ($5 gets ~10 videos) then run this script again.');
    process.exit(1);
  }
  await concatenateAndExtract(clip2);
})();
