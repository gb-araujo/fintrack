# Seeds

Dados de **exemplo para desenvolvimento** (usuário demo, contas, transações). Nunca rodam em produção
— `npm run db:seed` recusa executar com `NODE_ENV=production`.

- FASE 0 e 1: não há seeds (o único dado de domínio é o usuário, criado pelo cadastro).
- As **categorias padrão** (Salário, VR, VT, Moradia, Energia, …) **não** são seed: são criadas para
  cada usuário no cadastro, pela aplicação (FASE 2, junto com a tabela de categorias), para que
  cada usuário possa editá-las.

Execução: `npm run db:seed` (usa `DATABASE_URL` do `.env`).
