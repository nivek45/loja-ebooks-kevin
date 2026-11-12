import ts from 'typescript';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import {
  generateSQLiteDrizzleJson,
  generateSQLiteMigration,
} from 'drizzle-kit/api';
mkdirSync('work', { recursive: true });
mkdirSync('drizzle/meta', { recursive: true });
writeFileSync(
  'work/schema.cjs',
  ts.transpileModule(readFileSync('db/schema.ts', 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText,
);
const require = createRequire(import.meta.url),
  schema = require('../work/schema.cjs');
const journalPath = 'drizzle/meta/_journal.json';
const journal = existsSync(journalPath)
  ? JSON.parse(readFileSync(journalPath, 'utf8'))
  : { version: '7', dialect: 'sqlite', entries: [] };
const n = journal.entries.length;
const prev = n
  ? JSON.parse(
      readFileSync(
        `drizzle/meta/${String(n - 1).padStart(4, '0')}_snapshot.json`,
        'utf8',
      ),
    )
  : await generateSQLiteDrizzleJson({});
const next = await generateSQLiteDrizzleJson(schema, prev.id);
const statements = await generateSQLiteMigration(prev, next);
if (!statements.length) {
  console.log('Schema unchanged.');
  process.exit(0);
}
const tag = String(n).padStart(4, '0') + '_store';
writeFileSync(
  `drizzle/${tag}.sql`,
  statements.join('\n--> statement-breakpoint\n'),
);
writeFileSync(
  `drizzle/meta/${String(n).padStart(4, '0')}_snapshot.json`,
  JSON.stringify(next, null, 2),
);
journal.entries.push({
  idx: n,
  version: '6',
  when: Date.now(),
  tag,
  breakpoints: true,
});
writeFileSync(journalPath, JSON.stringify(journal, null, 2));
console.log(`Generated ${tag}: ${statements.length} statements.`);
