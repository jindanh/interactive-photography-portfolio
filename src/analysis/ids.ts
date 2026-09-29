/** Lowercase ascii slug from a filename: extension dropped, hyphens, max 24 chars. */
export function slugify(filename: string): string {
  const base = filename.replace(/\.[^.]*$/, '');
  const s = base
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24)
    .replace(/-+$/g, '');
  return s || 'photo';
}

export function ordinalOf(id: string): number {
  const m = /^(\d+)-/.exec(id);
  return m ? parseInt(m[1], 10) : 0;
}

/**
 * Next id given the ids already in use: "NNN-slug" with NNN = max + 1.
 * If the slug is already taken by another id, a numeric suffix is appended.
 */
export function nextId(existing: Iterable<string>, filename: string): string {
  const ids = [...existing];
  const max = ids.reduce((m, id) => Math.max(m, ordinalOf(id)), 0);
  const slugs = new Set(ids.map((id) => id.replace(/^\d+-/, '')));
  const base = slugify(filename);
  let slug = base;
  for (let n = 2; slugs.has(slug); n++) {
    const suffix = `-${n}`;
    slug = base.slice(0, 24 - suffix.length) + suffix;
  }
  return `${String(max + 1).padStart(3, '0')}-${slug}`;
}
