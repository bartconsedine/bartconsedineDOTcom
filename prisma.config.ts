import { defineConfig } from 'prisma/config';
import { connection } from './scripts/database-connection.mjs';

// Intentionally no dotenv loader: supply DATABASE_URL through a protected process
// environment/secret manager. Validation works without a URL; DB commands do not.
const connectionUrl = process.env.DATABASE_URL ? connection(process.env.DATABASE_URL).url : null;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: connectionUrl?.href },
});
