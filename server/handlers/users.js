import { conflict, notFound, unprocessable } from '../errors.js';
import { validateUserInput, validateUserUpdate } from '../validators.js';

export function registerUserRoutes(router, { auth }) {
  router.get('/api/users', async () => ({ body: { users: auth.listUsers() } }));

  router.post('/api/users', async (ctx) => {
    const { value, errors } = validateUserInput(await ctx.readBody());
    if (errors.length > 0) throw unprocessable(errors);
    const user = await auth.createUser(value);
    ctx.audit('user.create', user.id, { email: user.email, role: user.role });
    return { status: 201, body: { user } };
  });

  router.patch('/api/users/:id', async (ctx) => {
    const { value, errors } = validateUserUpdate(await ctx.readBody());
    if (errors.length > 0) throw unprocessable(errors);
    // Nobody can lock themselves out or demote themselves by accident; another admin can.
    if (ctx.params.id === ctx.user.id && (value.disabled === true || (value.role && value.role !== ctx.user.role))) {
      throw conflict('you cannot disable or change the role of your own account');
    }
    const user = auth.updateUser(ctx.params.id, value);
    if (!user) throw notFound(`user ${ctx.params.id} not found`);
    ctx.audit('user.update', user.id, value);
    return { body: { user } };
  });
}
