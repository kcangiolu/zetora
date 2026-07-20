// public/privacy-policy.html is a plain static file (served as-is, outside
// Next's metadata/rendering pipeline), so it can't read env vars at request
// time like app/(content)/privacy-policy/page.tsx does. This regenerates it
// from the template on every dev/build so it stays in sync with the
// configured app URL and contact address instead of hardcoding a domain.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const templatePath = fileURLToPath(new URL('../public/privacy-policy.template.html', import.meta.url));
const outputPath = fileURLToPath(new URL('../public/privacy-policy.html', import.meta.url));

const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
const contactEmail = process.env.CONTACT_EMAIL || 'kenny@flowinit.fr';

const template = await readFile(templatePath, 'utf8');
const output = template.replaceAll('{{APP_URL}}', appUrl).replaceAll('{{CONTACT_EMAIL}}', contactEmail);

await writeFile(outputPath, output);
console.log(`[generate-static-pages] wrote ${outputPath}`);
