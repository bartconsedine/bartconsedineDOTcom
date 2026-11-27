// Run on the trusted operator machine through the host-key-pinned SSH tunnel.
import pg from 'pg';
import { backup, deployMigrations, migrationState } from '../../scripts/database.mjs';
import { connection } from '../../scripts/database-connection.mjs';

const target = 'aws-bart-site';
async function main() {
  const operation = process.argv[2];
  if (!['state', 'backup', 'deploy'].includes(operation)) throw Error('Unsupported operation');
  const db = connection(process.env.DATABASE_URL);
  if (!db.local || db.host !== '127.0.0.1' || db.port !== '55432' ||
      db.database !== 'postgres' || db.user !== 'postgres') {
    throw Error('Use the verified AWS SSH tunnel on 127.0.0.1:55432');
  }
  const probe = new pg.Client({
    host: db.host, port: Number(db.port), database: db.database,
    user: db.user, password: db.password, connectionTimeoutMillis: 5000,
  });
  await probe.connect();
  try {
    const {rows} = await probe.query(`select
      current_setting('bartsite.restore_target', true) = 'aws-lightsail'
      and current_setting('bartsite.operator_active', true) = 'on' as active`);
    if (rows[0]?.active !== true) throw Error('The AWS destination is inactive');
  } finally {
    await probe.end();
  }
  db.backupSource = target;
  if (operation === 'state') console.log(await migrationState(db));
  if (operation === 'backup') await backup(db);
  if (operation === 'deploy') {
    if (process.env.CONFIRM_AWS_DATABASE_DEPLOY !== target) throw Error('Missing target confirmation');
    await deployMigrations(db);
  }
}

main().catch(() => {
  console.error('AWS database operation did not complete. Check the verified SSH tunnel, active database, protected backup directory and reviewed migration state.');
  process.exitCode = 1;
});
