import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, 'node_modules/@kfonts/nanum-gothic/src');
const target = resolve(root, 'public/fonts');

await mkdir(target, { recursive: true });
await Promise.all([
  copyFile(resolve(source, 'NanumGothic.ttf'), resolve(target, 'NanumGothic.ttf')),
  copyFile(resolve(source, 'NanumGothicBold.ttf'), resolve(target, 'NanumGothicBold.ttf')),
]);
