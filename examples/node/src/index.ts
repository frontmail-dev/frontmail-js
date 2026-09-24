/**
 * Server-side example: single send, batch send, message status and history.
 *
 *   FRONTMAIL_PRIVATE_KEY=sk_… FRONTMAIL_TEMPLATE_ID=tpl_… FRONTMAIL_TO=you@example.com pnpm build && pnpm start
 */
import { Frontmail, isFrontmailError } from '@frontmail/node';

const templateId = process.env.FRONTMAIL_TEMPLATE_ID ?? 'tpl_contact';
const serviceId = process.env.FRONTMAIL_SERVICE_ID || undefined;
const to = process.env.FRONTMAIL_TO ?? 'you@example.com';

// Reads FRONTMAIL_PRIVATE_KEY and FRONTMAIL_API_URL from the environment.
const frontmail = new Frontmail();

async function main() {
  const single = await frontmail.send({
    serviceId,
    templateId,
    params: { name: 'Node example', email: to, message: 'Hello from @frontmail/node' },
  });
  console.log('send →', single.messageId, single.status);

  const results = await frontmail.sendBatch(
    ['Alice', 'Bob', 'Carol'].map((name) => ({
      serviceId,
      templateId,
      params: { name, email: to, message: `Batch message for ${name}` },
    })),
  );
  for (const r of results) {
    console.log(`batch[${r.index}] →`, r.ok ? `${r.messageId} ${r.status}` : `${r.error.code}: ${r.error.message}`);
  }

  const message = await frontmail.getMessage(single.messageId);
  console.log('status →', message.status, message.events.map((e) => e.type).join(' → '));

  let count = 0;
  for await (const item of frontmail.history({ limit: 25, templateId })) {
    console.log('history →', item.createdAt, item.messageId, item.status);
    if (++count >= 10) break;
  }
}

main().catch((err: unknown) => {
  if (isFrontmailError(err)) console.error(`${err.name} ${err.code} (${err.status}): ${err.message}\n${err.docsUrl}`);
  else console.error(err);
  process.exitCode = 1;
});
