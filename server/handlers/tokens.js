import { notFound, unprocessable } from '../errors.js';
import { validateTokenInput } from '../validators.js';

// API tokens for scripts and integrations. The token itself is shown once, in
// the response to the request that creates it.
export function registerTokenRoutes(router, { auth }) {
  router.get('/api/tokens', async () => ({ body: { tokens: auth.listApiTokens() } }));

  router.post('/api/tokens', async (ctx) => {
    const { value, errors } = validateTokenInput(await ctx.readBody());
    if (errors.length > 0) throw unprocessable(errors);
    const { token, record } = auth.createApiToken({ ...value, createdBy: ctx.user.id });
    ctx.audit('token.create', record.id, { name: record.name, role: record.role });
    return { status: 201, body: { token, record } };
  });

  router.delete('/api/tokens/:id', async (ctx) => {
    if (!auth.revokeApiToken(ctx.params.id)) throw notFound(`token ${ctx.params.id} not found`);
    ctx.audit('token.revoke', ctx.params.id);
    return { status: 204 };
  });
}
