import { dashboardQuerySchema, dashboardSchema } from '@fintrack/shared';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import type { DashboardService } from './dashboard.service.js';

export interface DashboardRoutesOptions {
  dashboardService: DashboardService;
}

export const dashboardRoutes: FastifyPluginCallbackZod<DashboardRoutesOptions> = (
  app,
  { dashboardService },
  done,
) => {
  app.addHook('onRequest', app.authenticate);

  app.get(
    '/dashboard',
    {
      schema: {
        tags: ['dashboard'],
        summary:
          'Painel: "Quanto posso gastar?", saldos, mês, contas pendentes e compromissos futuros',
        description:
          'O valor de "disponível" é calculado no backend e devolvido junto com todos os componentes. Horizonte padrão: último dia do mês corrente no fuso do usuário.',
        security: [{ bearerAuth: [] }],
        querystring: dashboardQuerySchema,
        response: { 200: dashboardSchema },
      },
    },
    async (request) => dashboardService.get(request.userId, request.query.until),
  );

  done();
};
