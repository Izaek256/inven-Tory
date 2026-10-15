/**
 * UI Lab coverage guard — every view and component source file must be
 * registered in uiLab/registry.tsx (LAB_ENTRIES `sources` field) so that
 * newly added components/designs always appear in the UI Lab.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LAB_ENTRIES, LAB_CATEGORIES, findLabEntry } from '../uiLab/registry';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../../..');

function tsxBasenames(dir: string): string[] {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.tsx') || f.endsWith('.ts'))
    .map((f) => f);
}

const LAB_SOURCES = new Set(LAB_ENTRIES.flatMap((e) => e.sources ?? []));

const TARGET_DIRS = [
  path.join(here, '..', 'views'),
  path.join(here, '..', 'components'),
  path.join(repoRoot, 'packages', 'ui', 'src', 'components'),
];

describe('UI Lab — coverage', () => {
  it('registers every view and component file in a LAB_ENTRIES entry', () => {
    const files = TARGET_DIRS.flatMap(tsxBasenames);
    expect(files.length).toBeGreaterThan(30);

    const missing = files.filter((f) => !LAB_SOURCES.has(f));
    expect(
      missing,
      `Unregistered view/component file(s): ${missing.join(', ')}. ` +
        'Add a LAB_ENTRIES entry in src/uiLab/registry.tsx listing these basenames in `sources`.',
    ).toEqual([]);
  });

  it('lists a category and a unique id for every entry', () => {
    const ids = LAB_ENTRIES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of LAB_ENTRIES) {
      expect(LAB_CATEGORIES).toContain(entry.category);
      expect(findLabEntry(entry.id)).toBe(entry);
      expect(typeof entry.render).toBe('function');
    }
  });
});
