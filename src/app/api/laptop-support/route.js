import { createSupportWebhook, supportConfig } from '@/private-apps/laptop-sales/support';

export async function POST(request) {
  return createSupportWebhook({ config: supportConfig(process.env) })(request);
}
