const fs = require('fs');
const path = require('path');

const KEY = process.env.GOOGLE_AI_STUDIO_KEY;
const OUT = path.join(__dirname, 'assets');

const prompt = `Cinematic luxury product photography. Bird's eye view looking straight down from directly overhead.

The ONLY object in the frame: A large matte black keepsake box — CLOSED — centered perfectly on dark obsidian velvet. The closed lid faces upward with three lines of gold foil text centered on it:
1. A gold foil embossed tree of life logo (large, detailed spreading tree with full canopy of delicate branches) at the top
2. The brand name "EverStories" in elegant large gold foil serif lettering beneath the tree
3. The tagline "A Lifetime of Memories, Brought to Life." in smaller elegant gold foil italic serif lettering beneath "EverStories"

Matte black soft-touch finish with subtle gold foil edge trim. The box takes up most of the frame. Nothing else in the frame. No other objects.

Single dramatic warm light source from upper-left casting a deep shadow to the lower-right. The gold foil tree, "EverStories" and tagline all gleam warmly. Background pure black. Film grain, cinematic color grade — deep blacks, warm gold highlights. 16:9 landscape. Ultra-realistic luxury commercial photography.`;

async function generate() {
  console.log('Generating hero — closed box with all products...');

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
  if (!b64) { console.error('Failed:', JSON.stringify(data).slice(0, 400)); process.exit(1); }

  const outPath = path.join(OUT, 'hero-source-v14.jpg');
  fs.writeFileSync(outPath, Buffer.from(b64, 'base64'));
  console.log(`Saved → ${outPath}`);
}

generate();
