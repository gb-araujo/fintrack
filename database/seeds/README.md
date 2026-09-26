# Seeds

Dados de **exemplo para desenvolvimento** (usuário demo, contas, transações). Nunca rodam em produção
— `npm run db:seed` recusa executar com `NODE_ENV=production`.

- FASE 0: não há tabelas de domínio, então não há seeds (o comando apenas informa isso).
- As **categorias padrão** (Salário, VR, VT, Moradia, Energia, …) **não** são seed: são criadas para
  cada usuário no cadastro, pela aplicação (FASE 1/2), para que cada usuário possa editá-las.

Execução: `npm run db:seed` (usa `DATABASE_URL` do `.env`).
