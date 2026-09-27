# Seeds

Dados de **exemplo para desenvolvimento** (usuário demo, contas, transações). Nunca rodam em produção
— `npm run db:seed` recusa executar com `NODE_ENV=production`.

- `npm run db:seed` cria o usuário demo (`demo@fintrack.dev`) com contas, lançamentos, recorrências, cartão com compras e orçamentos de exemplo.
- As **categorias padrão** (Salário, VR, VT, Moradia, Energia, …) **não** são seed: são criadas para
  cada usuário no cadastro, pela aplicação (FASE 2, junto com a tabela de categorias), para que
  cada usuário possa editá-las.

Execução: `npm run db:seed` (usa `DATABASE_URL` do `.env`).
