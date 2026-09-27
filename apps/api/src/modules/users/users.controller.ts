import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { toUserResponse, userSchema } from './users.schema.js';
import type { UsersService } from './users.service.js';

export interface UsersRoutesOptions {
  usersService: UsersService;
}

export const usersRoutes: FastifyPluginCallbackZod<UsersRoutesOptions> = (
  app,
  { usersService },
  done,
) => {
  // Todas as rotas deste módulo exigem autenticação.
  app.addHook('onRequest', app.authenticate);

  app.get(
    '/users/me',
    {
      schema: {
        tags: ['users'],
        summary: 'Dados do usuário autenticado',
        security: [{ bearerAuth: [] }],
        response: { 200: userSchema },
      },
    },
    async (request) => toUserResponse(await usersService.getMe(request.userId)),
  );
  done();
};
