import { cpSync, mkdirSync, rmSync, copyFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const root = process.cwd();
const out = resolve(root, 'dist');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const file of [
  'index.html', 'styles.css', 'app.js', 'supabase-config.js',
  'supabase-client.js', 'supabase-live-chat.js', 'manifest.webmanifest', 'sw.js'
]) {
  const target = resolve(out, file);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(resolve(root, file), target);
}
cpSync(resolve(root, 'assets'), resolve(out, 'assets'), { recursive: true });
writeFileSync(resolve(out, '_headers'), `/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n\n/supabase-config.js\n  Cache-Control: no-cache\n`);
console.log(`Built static Sleep Reset app into ${out}`);
