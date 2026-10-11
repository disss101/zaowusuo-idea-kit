import { writeFile } from 'node:fs/promises';
import { catalog, plan } from '../lib/planner.mjs';
import { examples } from '../lib/examples.mjs';

const plans = Object.fromEntries(catalog.map(item => [item.id, plan({ idea: item.seed, starter: item.id, budget: 2000 })]));
const data = { catalog, plans, examples };
await writeFile(new URL('../docs/demo-data.json', import.meta.url), JSON.stringify(data));

