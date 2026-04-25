const fs = require('fs');
const path = require('path');

const KEY = process.env.GOOGLE_AI_STUDIO_KEY;
const OUT = path.join(__dirname, 'assets');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const concepts = [
  {
    id: 'A',
    label: 'The Opening — box lid moment',
    prompt: 'Cinematic luxury product photography. A matte black keepsake gift box is photographed open on dark obsidian velvet. The lid of the box has a beautiful gold foil embossed tree of life logo — a decorative spreading tree with delicate branches and leaf clusters, the brand mark of EverStories. Inside the box, a sleek premium digital photo frame glows warmly displaying an intimate photograph of an elderly grandfather laughing with a young grandchild. Beside the open box, a premium matte black greeting card with elegant gold foil tree of life logo and the text "EverStories" rests open. Single dramatic sidelight from the right casting deep shadows, shallow depth of field, background fades to pure black. Warm amber and gold color grade, film grain, medium format cinematic quality. 16:9 landscape. Ultra-realistic, commercial photography.'
  },
  {
    id: 'B',
    label: 'The Frame — glowing portrait',
    prompt: 'Cinematic luxury product photography. A premium digital photo frame with matte black border sits on a dark wooden sideboard in a moody, softly lit room. The frame displays a beautiful warm portrait of an elderly woman smiling, bathed in golden hour light — the glow from the frame softly illuminates the surrounding dark surface. Beside the frame, a small matte black gift box with a gold foil embossed tree of life logo — a decorative spreading tree with delicate branches — and the brand name "EverStories" in elegant gold serif lettering. Extremely shallow depth of field, bokeh background with warm candlelight tones, cinematic color grade with deep blacks and amber highlights. Film grain, medium format quality. 16:9 landscape. Ultra-realistic.'
  },
  {
    id: 'C',
    label: 'The Collection — full product flat lay',
    prompt: 'Cinematic luxury product flat lay photography. The EverStories premium keepsake collection arranged elegantly on dark matte black surface: a large matte black gift box with magnetic closure — its lid featuring a gold foil embossed tree of life logo with spreading branches and the text "EverStories" in gold serif font — open at center, a sleek digital photo frame showing a warm family portrait inside, a matte black premium greeting card with matching gold foil tree logo open beside it, a small leather-bound photo booklet. Overhead shot, dramatic single-source lighting from upper-left, deep shadows, warm gold highlights on the foil tree embossing. Commercial luxury photography, medium format, film grain, 16:9 landscape. Ultra-realistic, aspirational.'
  }
];

async function generateImage(concept) {
  console.log(`\nGenerating Concept ${concept.id}: ${concept.label}...`);

  // Try Imagen 4 Ultra first (predict endpoint), fall back to Nano Banana Pro (generateContent)
  let b64 = null;

  // Attempt 1: Imagen 4 Ultra
  const res1 = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-ultra-generate-001:predict?key=${KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instances: [{ prompt: concept.prompt }],
        parameters: { sampleCount: 1, aspectRatio: '16:9', outputMimeType: 'image/jpeg', personGeneration: 'allow_all' }
      })
    }
  );
  if (res1.ok) {
    const d = await res1.json();
    b64 = d?.predictions?.[0]?.bytesBase64Encoded;
    if (b64) console.log(`  → Imagen 4 Ultra`);
  }

  // Attempt 2: Nano Banana Pro (generateContent)
  if (!b64) {
    const res2 = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/nano-banana-pro-preview:generateContent?key=${KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: concept.prompt }] }],
          generationConfig: { responseModalities: ['TEXT', 'IMAGE'] }
        })
      }
    );
    if (res2.ok) {
      const d = await res2.json();
      const parts = d?.candidates?.[0]?.content?.parts || [];
      const imgPart = parts.find(p => p.inlineData?.mimeType?.startsWith('image/'));
      b64 = imgPart?.inlineData?.data;
      if (b64) console.log(`  → Nano Banana Pro`);
      else console.error(`Concept ${concept.id} Nano Banana failed:`, JSON.stringify(d).slice(0, 300));
    } else {
      console.error(`Concept ${concept.id} Nano Banana error:`, await res2.text());
    }
  }

  if (!b64) {
    console.error(`Concept ${concept.id}: all attempts failed`);
    return null;
  }

  const outPath = path.join(OUT, `hero-concept-${concept.id.toLowerCase()}.jpg`);
  fs.writeFileSync(outPath, Buffer.from(b64, 'base64'));
  console.log(`Concept ${concept.id} saved → ${outPath}`);
  return outPath;
}

(async () => {
  for (const concept of concepts) {
    await generateImage(concept);
  }
  console.log('\nAll done. Opening images...');
})();
