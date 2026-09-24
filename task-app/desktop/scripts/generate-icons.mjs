// Renders assets/icon.svg into every icon the app and installer need.
//   npm run icons
import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const svg = await fs.readFile(path.join(root, 'assets/icon.svg'));
const png = (size) => sharp(svg, { density: 384 }).resize(size, size).png().toBuffer();

const out = async (rel, buf) => {
  await fs.writeFile(path.join(root, rel), buf);
  console.log('wrote', rel);
};

await out('assets/icon.png', await png(512));
const ico = await pngToIco(await Promise.all([16, 24, 32, 48, 64, 128, 256].map(png)));
await out('assets/icon.ico', ico);

await out('assets/tray.png', await png(32));
await out('assets/tray.ico', await pngToIco(await Promise.all([16, 20, 24, 32].map(png))));

// Taskbar overlay badge shown when there are unread notifications/messages.
const badge = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="14" fill="#ef4444" stroke="#ffffff" stroke-width="3"/></svg>',
);
await out('assets/badge.png', await sharp(badge).resize(32, 32).png().toBuffer());
