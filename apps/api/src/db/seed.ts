import { addDaysToDate, todayInTimeZone, DEFAULT_TIMEZONE } from '@fintrack/shared';
import { buildDomain } from '../composition.js';
import { parseDatabaseEnv } from '../config/env.js';
import { loadEnvFile } from '../config/load-env-file.js';
import { hashPassword } from '../modules/auth/domain/password.js';
import { createDatabase } from './client.js';

/**
 * Seed de DESENVOLVIMENTO: um usuário de demonstração com contas, categorias padrão e lançamentos
 * de exemplo. Nunca roda em produção. Passa pelos mesmos services da API (mesmas regras de negócio).
 * Idempotente: se o usuário demo já existe, não faz nada.
 */
export const DEMO_EMAIL = 'demo@fintrack.dev';
export const DEMO_PASSWORD = 'demo-fintrack-123';

async function main(): Promise<void> {
  loadEnvFile();
  const { NODE_ENV, DATABASE_URL } = parseDatabaseEnv();
  if (NODE_ENV === 'production') {
    process.stderr.write('[seed] recusado: seeds não rodam em produção.\n');
    process.exit(1);
  }

  const database = createDatabase(DATABASE_URL, { maxConnections: 2 });
  try {
    const domain = buildDomain(database.db);
    if (await domain.usersRepository.findByEmailWithPassword(DEMO_EMAIL)) {
      process.stdout.write(`[seed] usuário ${DEMO_EMAIL} já existe — nada a fazer.\n`);
      return;
    }

    const user = await domain.usersRepository.create({
      email: DEMO_EMAIL,
      name: 'Usuário Demo',
      passwordHash: await hashPassword(DEMO_PASSWORD),
      timezone: DEFAULT_TIMEZONE,
    });
    const userId = user.id;
    const today = todayInTimeZone(DEFAULT_TIMEZONE);
    const day = (offset: number) => addDaysToDate(today, offset);

    const categories = await domain.categoriesService.list(userId, { includeArchived: false });
    const category = (name: string, kind: 'income' | 'expense') => {
      const found = categories.find((c) => c.name === name && c.kind === kind);
      if (!found) throw new Error(`Categoria padrão ausente: ${name}`);
      return found.id;
    };

    const inter = await domain.accountsService.create(userId, {
      name: 'Banco Inter',
      type: 'bank',
      initialBalanceCents: 120_000,
    });
    const mercadoPago = await domain.accountsService.create(userId, {
      name: 'Mercado Pago',
      type: 'wallet',
    });
    const dinheiro = await domain.accountsService.create(userId, {
      name: 'Dinheiro',
      type: 'wallet',
      initialBalanceCents: 15_000,
    });
    const investimentos = await domain.accountsService.create(userId, {
      name: 'Tesouro Selic',
      type: 'investment',
    });

    const add = (
      accountId: string,
      type: 'income' | 'expense',
      amountCents: number,
      description: string,
      categoryName: string,
      date: number,
      status?: 'pending',
    ) =>
      domain.transactionsService.create(userId, {
        accountId,
        type,
        amountCents,
        description,
        categoryId: category(categoryName, type),
        transactionDate: day(date),
        ...(status ? { status } : {}),
      });

    await add(inter.id, 'income', 500_000, 'Salário', 'Salário', -20);
    await add(inter.id, 'income', 90_000, 'VR', 'VR', -18);
    await add(inter.id, 'expense', 150_000, 'Aluguel', 'Moradia', -17);
    await add(inter.id, 'expense', 9_099, 'Vivo Fibra', 'Internet', -15);
    await add(inter.id, 'expense', 7_699, 'TIM', 'Celular', -15);
    await add(inter.id, 'expense', 31_248, 'Supermercado', 'Alimentação', -9);
    await add(mercadoPago.id, 'expense', 2_490, 'Uber', 'Transporte', -6);
    await add(inter.id, 'expense', 5_590, 'Netflix', 'Assinaturas', -4);
    await add(dinheiro.id, 'expense', 4_200, 'Padaria', 'Alimentação', -1);
    // Conta a vencer (lançamento pendente): não altera o saldo até ser marcada como paga.
    await add(inter.id, 'expense', 9_099, 'Vivo Fibra', 'Internet', 12, 'pending');

    // Recorrências: geram PREVISÕES (nada vira lançamento até confirmar). As datas de início ficam
    // logo após os lançamentos acima, para o seed não criar ocorrências "atrasadas" artificiais.
    const dayOfMonth = (offset: number) => Number(day(offset).slice(8, 10));
    await domain.recurringService.create(userId, {
      name: 'Aluguel',
      type: 'expense',
      amountCents: 150_000,
      accountId: inter.id,
      categoryId: category('Moradia', 'expense'),
      frequency: 'monthly',
      dayOfMonth: dayOfMonth(-17),
      startDate: day(-16),
    });
    await domain.recurringService.create(userId, {
      name: 'Salário',
      type: 'income',
      amountCents: 500_000,
      accountId: inter.id,
      categoryId: category('Salário', 'income'),
      frequency: 'monthly',
      dayOfMonth: dayOfMonth(-20),
      startDate: day(-19),
    });
    await domain.recurringService.create(userId, {
      name: 'Enel',
      type: 'expense',
      isVariableAmount: true,
      amountCents: 18_735,
      accountId: inter.id,
      categoryId: category('Energia', 'expense'),
      frequency: 'monthly',
      dayOfMonth: dayOfMonth(3),
      startDate: day(1),
    });

    // Cartão de crédito: compras viram parcelas em faturas; nada sai da conta até pagar a fatura.
    const nubank = await domain.creditCardsService.create(userId, {
      name: 'Nubank',
      limitCents: 600_000,
      closingDay: 25,
      dueDay: 5,
      paymentAccountId: inter.id,
    });
    await domain.creditCardsService.createPurchase(userId, nubank.id, {
      description: 'Notebook',
      purchaseDate: day(-12),
      totalAmountCents: 240_000,
      installmentsCount: 3,
    });
    await domain.creditCardsService.createPurchase(userId, nubank.id, {
      description: 'Restaurante',
      purchaseDate: day(-3),
      totalAmountCents: 18_990,
      installmentsCount: 1,
      categoryId: category('Alimentação', 'expense'),
    });

    // Orçamentos do mês corrente.
    const month = today.slice(0, 7);
    for (const [name, limitCents] of [
      ['Alimentação', 80_000],
      ['Transporte', 20_000],
      ['Assinaturas', 10_000],
      ['Lazer', 30_000],
    ] as const) {
      await domain.budgetsService.upsert(userId, {
        categoryId: category(name, 'expense'),
        month,
        limitCents,
      });
    }

    await domain.transfersService.create(userId, {
      fromAccountId: inter.id,
      toAccountId: mercadoPago.id,
      amountCents: 30_000,
      transferDate: day(-10),
      description: 'Saldo para compras',
    });
    await domain.transfersService.create(userId, {
      fromAccountId: inter.id,
      toAccountId: investimentos.id,
      amountCents: 50_000,
      transferDate: day(-8),
      description: 'Aplicação Tesouro Selic',
    });

    process.stdout.write(
      `[seed] criado: ${DEMO_EMAIL} / ${DEMO_PASSWORD} (4 contas, 12 lançamentos, 2 transferências, 3 recorrências, 1 cartão com 2 compras, 4 orçamentos)\n`,
    );
  } finally {
    await database.close();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(
    `[seed] falhou: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
});
