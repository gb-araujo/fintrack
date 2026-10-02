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
          'Painel: dinheiro disponível, fluxo de caixa, saldos, mês, contas pendentes e compromissos futuros',
        description:
          'O valor de "disponível" é calculado no backend e devolvido junto com todos os componentes e o fluxo de caixa item a item. Horizonte padrão: último dia do mês corrente no fuso do usuário; `until` (data) ou `days` (hoje + N dias) mudam o horizonte.',
        security: [{ bearerAuth: [] }],
        querystring: dashboardQuerySchema,
        response: { 200: dashboardSchema },
      },
    },
    async (request) =>
      dashboardService.get(request.userId, request.query.until, request.query.days),
  );

  done();
};
