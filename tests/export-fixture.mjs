import { writeFileSync } from 'node:fs';
export async function exportFixture(db, path) {
  const tables = (
    await db
      .prepare(
        "SELECT name,sql FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%'",
      )
      .all()
  ).results;
  const quote = (v) =>
    v === null
      ? 'NULL'
      : typeof v === 'number'
        ? String(v)
        : "'" + String(v).replaceAll("'", "''") + "'";
  const snapshot = await db.batch(
    tables.map((t) =>
      db.prepare('SELECT * FROM "' + t.name.replaceAll('"', '""') + '"'),
    ),
  );
  const sql = ['PRAGMA foreign_keys=OFF;', 'BEGIN;'];
  tables.forEach((t, i) => {
    sql.push(t.sql + ';');
    for (const row of snapshot[i].results) {
      sql.push(
        'INSERT INTO "' +
          t.name +
          '" (' +
          Object.keys(row)
            .map((k) => '"' + k + '"')
            .join(',') +
          ') VALUES (' +
          Object.values(row).map(quote).join(',') +
          ');',
      );
    }
  });
  sql.push('COMMIT;', 'PRAGMA foreign_keys=ON;');
  writeFileSync(path, sql.join('\n'));
}
