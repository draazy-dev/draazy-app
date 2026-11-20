import { existsSync } from 'node:fs';
import { join } from 'node:path';

export function ogCard(root, kind, slug, alt, siteUrl) {
  const path = existsSync(join(root, 'public/og', kind, `${slug}.jpg`)) ? `/og/${kind}/${slug}.jpg` : '/og-image.jpg';
  return {
    image: `${siteUrl}${path}`,
    imageAlt: path === '/og-image.jpg' ? 'Draazy: broker-free homes in Pune' : alt,
    imageSize: [1200, 630],
  };
}
