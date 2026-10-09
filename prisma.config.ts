import { defineConfig } from 'prisma/config';

// Intentionally no dotenv loader: supply DATABASE_URL through a protected process
// environment/secret manager. Validation works without a URL; DB commands do not.
const connectionUrl = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
connectionUrl?.searchParams.set('schema', 'private');

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: connectionUrl?.href },
});
