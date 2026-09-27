import {
  confirmImportResponseSchema,
  dashboardSchema,
  importDetailSchema,
  merchantRuleListResponseSchema,
  merchantRuleSchema,
  type ImportDetail,
  type ImportRow,
  type MerchantRule,
  type Purchase,
  type Transaction,
} from '@fintrack/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createLedgerTestEnv,
  databaseUrl,
  registerUser,
  type LedgerTestEnv,
  type TestClient,
} from '../../test/ledger-client.js';

/** "2026-09-27" → "27/09/2026" (formato dos extratos brasileiros). */
const br = (date: string) => date.split('-').reverse().join('/');

describe.skipIf(!databaseUrl)('importação de extratos (integração)', () => {
  let env: LedgerTestEnv;

  beforeAll(async () => {
    env = await createLedgerTestEnv();
  });
  afterAll(async () => {
    await env.close();
  });

  const header = 'Data Lançamento;Histórico;Descrição;Valor;Saldo';
  const statement = (user: TestClient, lines: [number, string, string][]) =>
    [
      'Extrato Conta Corrente',
      '',
      header,
      ...lines.map(
        ([offset, description, value]) =>
          `${br(user.today(offset))};Movimentação;${description};${value};0,00`,
      ),
    ].join('\n');

  const upload = (user: TestClient, accountId: string, content: string, extra: object = {}) =>
    user.post('/imports', { accountId, filename: 'extrato.csv', content, ...extra });
  const createImport = async (user: TestClient, accountId: string, content: string) =>
    importDetailSchema.parse(await user.ok(upload(user, accountId, content), 201));
  const detail = async (user: TestClient, id: string) =>
    importDetailSchema.parse(await user.ok(user.get(`/imports/${id}`)));
  const confirm = (user: TestClient, id: string, decisions: object[] = []) =>
    user.post(`/imports/${id}/confirm`, { decisions });
  const confirmOk = async (user: TestClient, id: string, decisions: object[] = []) =>
    confirmImportResponseSchema.parse(await user.ok(confirm(user, id, decisions)));
  const dashboard = async (user: TestClient) =>
    dashboardSchema.parse(await user.ok(user.get('/dashboard')));
  const rowBy = (view: ImportDetail, text: string): ImportRow => {
    const row = view.rows.find((item) => item.description.includes(text));
    if (!row) throw new Error(`Linha não encontrada: ${text}`);
    return row;
  };

  describe('revisão (nada é criado antes de confirmar)', () => {
    it('lê o extrato, sugere categoria e tipo e NÃO cria lançamentos nem mexe em saldos', async () => {
      const user = await registerUser(env.app);
      const inter = await user.createAccount({ name: 'Banco Inter', initialBalanceCents: 100_000 });

      const view = await createImport(
        user,
        inter.id,
        statement(user, [
          [-5, 'TELEFONICA BRAS', '-90,99'],
          [-4, 'SALARIO EMPRESA X', '5.000,00'],
          [-3, 'PADARIA DO ZE', '-12,50'],
        ]),
      );

      expect(view.status).toBe('review');
      expect(view.rowsCount).toBe(3);
      expect(view.detected).toMatchObject({
        delimiter: ';',
        mapping: {
          date: 'Data Lançamento',
          description: ['Histórico', 'Descrição'],
          amount: 'Valor',
        },
      });
      const internet = await user.categoryId('Internet', 'expense');
      const salary = await user.categoryId('Salário', 'income');
      expect(rowBy(view, 'TELEFONICA')).toMatchObject({
        amountCents: 9_099,
        direction: 'out',
        suggestedType: 'expense',
        suggestedCategoryId: internet,
        suggestionSource: 'default_rule',
        duplicate: null,
        defaultAction: 'import',
        status: 'pending',
      });
      expect(rowBy(view, 'SALARIO')).toMatchObject({
        direction: 'in',
        suggestedType: 'income',
        suggestedCategoryId: salary,
      });
      expect(rowBy(view, 'PADARIA')).toMatchObject({
        suggestedCategoryId: null,
        suggestionSource: 'none',
      });
      expect(await user.listAll()).toEqual([]);
      expect(await user.balanceOf(inter.id)).toBe(100_000);
      expect((await dashboard(user)).month).toMatchObject({ incomeCents: 0, expenseCents: 0 });
    });

    it('linhas que não viraram item são REPORTADAS com o motivo (nada some em silêncio)', async () => {
      const user = await registerUser(env.app);
      const inter = await user.createAccount({ name: 'Banco Inter' });
      const content = [
        header,
        `${br(user.today(-2))};x;PADARIA;-5,00;0`,
        'Saldo final;;;;100,00',
        `${br(user.today(-1))};x;ZERO;0,00;0`,
        `${br(user.today(-1))};x;RUIM;abc;0`,
      ].join('\n');

      const view = await createImport(user, inter.id, content);

      expect(view.rowsCount).toBe(1);
      expect(view.ignoredRowsCount).toBe(3);
      expect(view.ignoredRows.map((item) => item.reason)).toEqual([
        'Data não reconhecida: "Saldo final".',
        'Valor zero.',
        'Valor não reconhecido: "abc".',
      ]);
    });

    it('dois lançamentos idênticos no mesmo arquivo NÃO são duplicatas um do outro', async () => {
      const user = await registerUser(env.app);
      const inter = await user.createAccount({ name: 'Banco Inter', initialBalanceCents: 10_000 });

      const view = await createImport(
        user,
        inter.id,
        statement(user, [
          [-2, 'CAFE DO CENTRO', '-5,00'],
          [-2, 'CAFE DO CENTRO', '-5,00'],
        ]),
      );
      const result = await confirmOk(user, view.id);

      expect(view.rows.every((row) => row.duplicate === null)).toBe(true);
      expect(result.imported).toBe(2);
      expect(await user.balanceOf(inter.id)).toBe(9_000);
    });

    it('mapeamento manual quando as colunas têm nomes incomuns; erro devolve os cabeçalhos', async () => {
      const user = await registerUser(env.app);
      const inter = await user.createAccount({ name: 'Banco Inter' });
      const content = `Quando;Onde;Quanto\n${br(user.today(-1))};Padaria;-12,50`;

      const failure = await upload(user, inter.id, content);
      const ok = importDetailSchema.parse(
        await user.ok(
          upload(user, inter.id, content, {
            mapping: { date: 'Quando', description: ['Onde'], amount: 'Quanto' },
          }),
          201,
        ),
      );

      expect(failure.statusCode).toBe(422);
      expect(
        failure.json<{ error: { details: { headers: string[] } } }>().error.details.headers,
      ).toEqual(['Quando', 'Onde', 'Quanto']);
      expect(ok.rows[0]).toMatchObject({ amountCents: 1_250, description: 'Padaria' });
    });

    it('rejeita conta de investimento, arquivada, de outro usuário, formato não suportado e arquivo vazio', async () => {
      const user = await registerUser(env.app);
      const other = await registerUser(env.app);
      const invest = await user.createAccount({ name: 'CDB', type: 'investment' });
      const archived = await user.createAccount({ name: 'Velha' });
      await user.ok(user.post(`/accounts/${archived.id}/archive`));
      const foreign = await other.createAccount({ name: 'Dela' });
      const inter = await user.createAccount({ name: 'Banco Inter' });
      const content = statement(user, [[-1, 'X', '-1,00']]);

      expect((await upload(user, invest.id, content)).statusCode).toBe(422);
      expect((await upload(user, archived.id, content)).statusCode).toBe(409);
      expect((await upload(user, foreign.id, content)).statusCode).toBe(404);
      expect((await upload(user, inter.id, content, { source: 'ofx' })).statusCode).toBe(422);
      expect((await upload(user, inter.id, '')).statusCode).toBe(400);
    });
  });

  describe('confirmação', () => {
    it('cria receitas e despesas com categoria; saldos e despesas do mês refletem só o aprovado', async () => {
      const user = await registerUser(env.app);
      const inter = await user.createAccount({ name: 'Banco Inter', initialBalanceCents: 100_000 });
      const view = await createImport(
        user,
        inter.id,
        statement(user, [
          [-5, 'TELEFONICA BRAS', '-90,99'],
          [-4, 'SALARIO EMPRESA X', '5.000,00'],
          [-3, 'PADARIA DO ZE', '-12,50'],
        ]),
      );

      const result = await confirmOk(user, view.id, [
        { rowId: rowBy(view, 'PADARIA').id, action: 'skip' },
        { rowId: rowBy(view, 'SALARIO').id, action: 'import', description: 'Salário setembro' },
      ]);

      expect(result).toMatchObject({ imported: 2, skipped: 1, transfers: 0, cardPayments: 0 });
      expect(await user.balanceOf(inter.id)).toBe(100_000 - 9_099 + 500_000);
      const created = await user.listAll();
      expect(created.map((t) => [t.description, t.type, t.amountCents]).sort()).toEqual(
        [
          ['Salário setembro', 'income', 500_000],
          ['Movimentação - TELEFONICA BRAS', 'expense', 9_099],
        ].sort(),
      );
      const internet = await user.categoryId('Internet', 'expense');
      expect(created.find((t) => t.type === 'expense')?.categoryId).toBe(internet);
      const after = await detail(user, view.id);
      expect(after.status).toBe('confirmed');
      expect(after.importedCount).toBe(2);
      expect(after.skippedCount).toBe(1);
      expect(after.rows.map((row) => row.status).sort()).toEqual([
        'imported',
        'imported',
        'skipped',
      ]);
    });

    it('decisões: troca de categoria e de tipo respeitam o sentido do dinheiro', async () => {
      const user = await registerUser(env.app);
      const inter = await user.createAccount({ name: 'Banco Inter', initialBalanceCents: 10_000 });
      const food = await user.categoryId('Alimentação', 'expense');
      const view = await createImport(
        user,
        inter.id,
        statement(user, [
          [-3, 'PADARIA DO ZE', '-12,50'],
          [-2, 'PIX RECEBIDO JOAO', '30,00'],
        ]),
      );

      const result = await confirmOk(user, view.id, [
        { rowId: rowBy(view, 'PADARIA').id, action: 'import', categoryId: food },
      ]);

      expect(result.imported).toBe(2);
      const created = await user.listAll();
      expect(created.find((t) => t.description.includes('PADARIA'))?.categoryId).toBe(food);
      expect(created.find((t) => t.description.includes('JOAO'))).toMatchObject({ type: 'income' });
    });

    it('recusa decisões incoerentes (com o número da linha) e não cria NADA', async () => {
      const user = await registerUser(env.app);
      const other = await registerUser(env.app);
      const inter = await user.createAccount({ name: 'Banco Inter' });
      const salary = await user.categoryId('Salário', 'income');
      const view = await createImport(
        user,
        inter.id,
        statement(user, [
          [-3, 'PADARIA DO ZE', '-12,50'],
          [-2, 'PIX RECEBIDO JOAO', '30,00'],
        ]),
      );
      const padaria = rowBy(view, 'PADARIA');
      const joao = rowBy(view, 'JOAO');
      const wrong = async (decisions: object[]) => {
        const res = await confirm(user, view.id, decisions);
        return {
          status: res.statusCode,
          message: res.json<{ error: { message: string } }>().error.message,
        };
      };

      const incomeOnOutflow = await wrong([
        { rowId: padaria.id, action: 'import', type: 'income' },
      ]);
      const expenseOnInflow = await wrong([{ rowId: joao.id, action: 'import', type: 'expense' }]);
      const transferWithoutTarget = await wrong([
        { rowId: padaria.id, action: 'import', type: 'transfer' },
      ]);
      const transferToSelf = await wrong([
        { rowId: padaria.id, action: 'import', type: 'transfer', targetAccountId: inter.id },
      ]);
      const paymentWithoutInvoice = await wrong([
        { rowId: padaria.id, action: 'import', type: 'card_payment' },
      ]);
      const wrongKind = await wrong([{ rowId: padaria.id, action: 'import', categoryId: salary }]);
      const foreignRow = await wrong([{ rowId: crypto.randomUUID(), action: 'skip' }]);
      const twice = await wrong([
        { rowId: padaria.id, action: 'skip' },
        { rowId: padaria.id, action: 'import' },
      ]);
      const foreignUser = await other.post(`/imports/${view.id}/confirm`, { decisions: [] });

      expect(incomeOnOutflow).toMatchObject({ status: 422 });
      expect(incomeOnOutflow.message).toMatch(/^Linha \d+: é uma saída/);
      expect(expenseOnInflow.status).toBe(422);
      expect(transferWithoutTarget.status).toBe(422);
      expect(transferToSelf.status).toBe(422);
      expect(paymentWithoutInvoice.status).toBe(422);
      expect(wrongKind.status).toBe(422);
      expect(foreignRow.status).toBe(422);
      expect(twice.status).toBe(422);
      expect(foreignUser.statusCode).toBe(404);
      expect(await user.listAll()).toEqual([]);
      expect((await detail(user, view.id)).status).toBe('review');
    });

    it('é tudo ou nada: uma linha inválida no meio desfaz o que já tinha sido criado', async () => {
      const user = await registerUser(env.app);
      const inter = await user.createAccount({ name: 'Banco Inter', initialBalanceCents: 100_000 });
      const mp = await user.createAccount({ name: 'Mercado Pago', type: 'wallet' });
      const view = await createImport(
        user,
        inter.id,
        statement(user, [
          [-4, 'PADARIA', '-10,00'],
          [-3, 'FARMACIA', '-20,00'],
          [-2, 'SUPERMERCADO', '-30,00'],
        ]),
      );
      await user.ok(user.post(`/accounts/${mp.id}/archive`));

      // A 3ª linha aponta para uma conta arquivada: falha DEPOIS de duas linhas já processadas.
      const res = await confirm(user, view.id, [
        {
          rowId: rowBy(view, 'SUPERMERCADO').id,
          action: 'import',
          type: 'transfer',
          targetAccountId: mp.id,
        },
      ]);

      expect(res.statusCode).toBe(422);
      expect(res.json<{ error: { message: string } }>().error.message).toMatch(/^Linha \d+:/);
      expect(await user.listAll()).toEqual([]);
      expect(await user.balanceOf(inter.id)).toBe(100_000);
      expect((await detail(user, view.id)).status).toBe('review');
      expect((await detail(user, view.id)).importedCount).toBe(0);
    });

    it('confirmar duas vezes (ou em paralelo) cria os lançamentos uma vez só', async () => {
      const user = await registerUser(env.app);
      const inter = await user.createAccount({ name: 'Banco Inter', initialBalanceCents: 100_000 });
      const view = await createImport(
        user,
        inter.id,
        statement(user, [
          [-3, 'PADARIA', '-10,00'],
          [-2, 'FARMACIA', '-20,00'],
        ]),
      );

      const results = await Promise.all([
        confirm(user, view.id),
        confirm(user, view.id),
        confirm(user, view.id),
      ]);
      const again = await confirm(user, view.id);

      expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409, 409]);
      expect(again.statusCode).toBe(409);
      expect(await user.listAll()).toHaveLength(2);
      expect(await user.balanceOf(inter.id)).toBe(97_000);
    });

    it('cancelar descarta a revisão sem criar nada; depois não confirma mais', async () => {
      const user = await registerUser(env.app);
      const inter = await user.createAccount({ name: 'Banco Inter' });
      const view = await createImport(user, inter.id, statement(user, [[-1, 'PADARIA', '-10,00']]));

      const cancelled = importDetailSchema.parse(
        await user.ok(user.post(`/imports/${view.id}/cancel`)),
      );
      const late = await confirm(user, view.id);

      expect(cancelled.status).toBe('cancelled');
      expect(late.statusCode).toBe(409);
      expect(await user.listAll()).toEqual([]);
    });
  });

  describe('duplicidade (nunca descarta em silêncio)', () => {
    it('reimportar o mesmo arquivo: linhas exatas, padrão "pular", visíveis; nada em dobro', async () => {
      const user = await registerUser(env.app);
      const inter = await user.createAccount({ name: 'Banco Inter', initialBalanceCents: 100_000 });
      const content = statement(user, [
        [-3, 'PADARIA', '-10,00'],
        [-2, 'FARMACIA', '-20,00'],
      ]);
      const first = await createImport(user, inter.id, content);
      await confirmOk(user, first.id);

      const second = await createImport(user, inter.id, content);
      const result = await confirmOk(user, second.id);

      expect(second.rows.map((row) => row.duplicate?.kind)).toEqual(['exact', 'exact']);
      expect(second.rows.every((row) => row.defaultAction === 'skip')).toBe(true);
      expect(second.rows.every((row) => typeof row.duplicate?.transactionId === 'string')).toBe(
        true,
      );
      expect(result).toMatchObject({ imported: 0, skipped: 2 });
      expect(await user.listAll()).toHaveLength(2);
      expect(await user.balanceOf(inter.id)).toBe(97_000);
    });

    it('o usuário pode decidir o contrário e importar mesmo assim', async () => {
      const user = await registerUser(env.app);
      const inter = await user.createAccount({ name: 'Banco Inter', initialBalanceCents: 100_000 });
      const content = statement(user, [[-3, 'PADARIA', '-10,00']]);
      const first = await createImport(user, inter.id, content);
      await confirmOk(user, first.id);
      const second = await createImport(user, inter.id, content);

      const result = await confirmOk(user, second.id, [
        { rowId: second.rows[0]?.id, action: 'import' },
      ]);

      expect(result.imported).toBe(1);
      expect(await user.listAll()).toHaveLength(2);
    });

    it('lançamento manual parecido (mesmo valor, ± 3 dias) vira POSSÍVEL duplicata apontando para ele', async () => {
      const user = await registerUser(env.app);
      const inter = await user.createAccount({ name: 'Banco Inter', initialBalanceCents: 100_000 });
      const manual = await user.addTransaction({
        accountId: inter.id,
        type: 'expense',
        amountCents: 9_099,
        transactionDate: user.today(-4),
        description: 'Internet',
      });

      const view = await createImport(
        user,
        inter.id,
        statement(user, [
          [-3, 'TELEFONICA BRAS', '-90,99'], // 1 dia depois do manual
          [-3, 'OUTRA COISA', '-77,00'], // valor diferente: não é duplicata
        ]),
      );

      expect(rowBy(view, 'TELEFONICA').duplicate).toEqual({
        kind: 'possible',
        transactionId: manual.id,
      });
      expect(rowBy(view, 'TELEFONICA').defaultAction).toBe('skip');
      expect(rowBy(view, 'OUTRA').duplicate).toBeNull();
      const result = await confirmOk(user, view.id);
      expect(result).toMatchObject({ imported: 1, skipped: 1 });
      expect(await user.listAll()).toHaveLength(2);
    });

    it('fora da janela de 3 dias, valor igual não é duplicata', async () => {
      const user = await registerUser(env.app);
      const inter = await user.createAccount({ name: 'Banco Inter', initialBalanceCents: 100_000 });
      await user.addTransaction({
        accountId: inter.id,
        type: 'expense',
        amountCents: 9_099,
        transactionDate: user.today(-10),
      });

      const view = await createImport(
        user,
        inter.id,
        statement(user, [[-3, 'TELEFONICA BRAS', '-90,99']]),
      );

      expect(view.rows[0]?.duplicate).toBeNull();
    });

    it('lançamento cancelado não conta como duplicata; desfazer libera as linhas para importar de novo', async () => {
      const user = await registerUser(env.app);
      const inter = await user.createAccount({ name: 'Banco Inter', initialBalanceCents: 100_000 });
      const content = statement(user, [[-3, 'PADARIA', '-10,00']]);
      const first = await createImport(user, inter.id, content);
      await confirmOk(user, first.id);

      const reverted = importDetailSchema.parse(
        await user.ok(user.post(`/imports/${first.id}/revert`)),
      );
      const again = await createImport(user, inter.id, content);

      expect(reverted.status).toBe('reverted');
      expect(await user.balanceOf(inter.id)).toBe(100_000);
      expect(again.rows[0]?.duplicate).toBeNull();
      expect(again.rows[0]?.defaultAction).toBe('import');
    });

    it('duplicatas de OUTRO usuário não interferem', async () => {
      const first = await registerUser(env.app);
      const second = await registerUser(env.app);
      const a = await first.createAccount({ name: 'Banco Inter', initialBalanceCents: 1_000 });
      const b = await second.createAccount({ name: 'Banco Inter', initialBalanceCents: 1_000 });
      const stmt = (user: TestClient) => statement(user, [[-3, 'PADARIA', '-10,00']]);
      await confirmOk(first, (await createImport(first, a.id, stmt(first))).id);

      const view = await createImport(second, b.id, stmt(second));

      expect(view.rows[0]?.duplicate).toBeNull();
    });
  });

  describe('transferências entre contas (Inter ↔ Mercado Pago)', () => {
    it('"PIX ENVIADO MERCADO PAGO" é sugerido como TRANSFERÊNCIA e não vira despesa', async () => {
      const user = await registerUser(env.app);
      const inter = await user.createAccount({ name: 'Banco Inter', initialBalanceCents: 100_000 });
      const mp = await user.createAccount({ name: 'Mercado Pago', type: 'wallet' });
      const view = await createImport(
        user,
        inter.id,
        statement(user, [[-3, 'PIX ENVIADO MERCADO PAGO', '-300,00']]),
      );

      const row = view.rows[0] as ImportRow;
      expect(row).toMatchObject({
        suggestedType: 'transfer',
        suggestedTargetAccountId: mp.id,
        suggestionSource: 'own_account',
        suggestedCategoryId: null,
      });
      const before = await dashboard(user);
      const result = await confirmOk(user, view.id);

      expect(result).toMatchObject({ imported: 1, transfers: 1 });
      expect(await user.balanceOf(inter.id)).toBe(70_000);
      expect(await user.balanceOf(mp.id)).toBe(30_000);
      const after = await dashboard(user);
      expect(after.month.expenseCents).toBe(0);
      expect(after.netWorthCents).toBe(before.netWorthCents);
      const legs = await user.listAll('&type=transfer');
      expect(legs.map((t) => t.transfer?.direction).sort()).toEqual(['in', 'out']);
    });

    it('SEM DUPLA CONTAGEM: importar depois o extrato do Mercado Pago marca a entrada como duplicata', async () => {
      const user = await registerUser(env.app);
      const inter = await user.createAccount({ name: 'Banco Inter', initialBalanceCents: 100_000 });
      const mp = await user.createAccount({ name: 'Mercado Pago', type: 'wallet' });
      await confirmOk(
        user,
        (
          await createImport(
            user,
            inter.id,
            statement(user, [[-3, 'PIX ENVIADO MERCADO PAGO', '-300,00']]),
          )
        ).id,
      );

      const mpView = await createImport(
        user,
        mp.id,
        statement(user, [
          [-3, 'PIX RECEBIDO INTER', '300,00'],
          [-2, 'PAGAMENTO PADARIA', '-24,90'],
        ]),
      );
      const result = await confirmOk(user, mpView.id);

      expect(rowBy(mpView, 'RECEBIDO').duplicate?.kind).toBe('possible');
      expect(rowBy(mpView, 'RECEBIDO').defaultAction).toBe('skip');
      expect(rowBy(mpView, 'PADARIA').duplicate).toBeNull();
      expect(result).toMatchObject({ imported: 1, skipped: 1 });
      expect(await user.balanceOf(mp.id)).toBe(30_000 - 2_490);
      expect(await user.balanceOf(inter.id)).toBe(70_000);
      expect(await user.totalBalance()).toBe(100_000 - 2_490);
    });

    it('entrada vinda de outra conta é transferência DA outra conta PARA a do extrato', async () => {
      const user = await registerUser(env.app);
      const inter = await user.createAccount({ name: 'Banco Inter', initialBalanceCents: 100_000 });
      const mp = await user.createAccount({ name: 'Mercado Pago', type: 'wallet' });
      const view = await createImport(
        user,
        mp.id,
        statement(user, [[-3, 'PIX RECEBIDO INTER', '300,00']]),
      );

      await confirmOk(user, view.id);

      expect(await user.balanceOf(inter.id)).toBe(70_000);
      expect(await user.balanceOf(mp.id)).toBe(30_000);
    });
  });

  describe('pagamento de fatura de cartão (nunca é despesa)', () => {
    async function withCardInvoice(user: TestClient) {
      const card = await user.ok<{ id: string }>(
        user.post('/credit-cards', {
          name: 'Nubank',
          limitCents: 500_000,
          closingDay: 28,
          dueDay: 5,
        }),
        201,
      );
      // Compra antiga: cai numa fatura fechada de R$ 900 (vence neste mês).
      const oldDate = new Date(
        Date.UTC(Number(user.today().slice(0, 4)), Number(user.today().slice(5, 7)) - 1, 1),
      );
      oldDate.setUTCDate(oldDate.getUTCDate() - 5);
      const purchase = await user.ok<Purchase>(
        user.post(`/credit-cards/${card.id}/purchases`, {
          description: 'Notebook',
          purchaseDate: oldDate.toISOString().slice(0, 10),
          totalAmountCents: 90_000,
        }),
        201,
      );
      return { card, invoiceId: purchase.installments[0]?.invoiceId as string };
    }

    it('vira card_payment vinculado à fatura de mesmo valor; despesa do mês não aumenta', async () => {
      const user = await registerUser(env.app);
      const inter = await user.createAccount({ name: 'Banco Inter', initialBalanceCents: 500_000 });
      const { invoiceId } = await withCardInvoice(user);
      const before = await dashboard(user);
      const view = await createImport(
        user,
        inter.id,
        statement(user, [[-1, 'PAGAMENTO FATURA NUBANK', '-900,00']]),
      );

      const row = view.rows[0] as ImportRow;
      expect(row).toMatchObject({
        suggestedType: 'card_payment',
        suggestedInvoiceId: invoiceId,
        suggestionSource: 'card_invoice',
        defaultAction: 'import',
      });
      const result = await confirmOk(user, view.id);

      expect(result).toMatchObject({ imported: 1, cardPayments: 1 });
      const [payment] = await user.listAll('&type=card_payment');
      expect(payment).toMatchObject({
        type: 'card_payment',
        amountCents: 90_000,
        creditCardInvoiceId: invoiceId,
      });
      expect(await user.balanceOf(inter.id)).toBe(410_000);
      const invoice = await user.ok<{ status: string; remainingCents: number }>(
        user.get(`/invoices/${invoiceId}`),
      );
      expect(invoice).toMatchObject({ status: 'paid', remainingCents: 0 });
      const after = await dashboard(user);
      expect(after.month.expenseCents).toBe(before.month.expenseCents);
      expect(after.availableToSpend.amountCents).toBe(before.availableToSpend.amountCents);
    });

    it('sem fatura correspondente: começa como "pular" (evita contar a compra duas vezes)', async () => {
      const user = await registerUser(env.app);
      const inter = await user.createAccount({ name: 'Banco Inter', initialBalanceCents: 500_000 });
      const view = await createImport(
        user,
        inter.id,
        statement(user, [[-1, 'PGTO FATURA CARTAO', '-321,00']]),
      );

      const result = await confirmOk(user, view.id);

      expect(view.rows[0]).toMatchObject({
        suggestedType: 'card_payment',
        suggestedInvoiceId: null,
        defaultAction: 'skip',
      });
      expect(result).toMatchObject({ imported: 0, skipped: 1 });
      expect(await user.listAll()).toEqual([]);
    });

    it('pagamento maior que o em aberto derruba a importação inteira (422, nada criado)', async () => {
      const user = await registerUser(env.app);
      const inter = await user.createAccount({ name: 'Banco Inter', initialBalanceCents: 500_000 });
      const { invoiceId } = await withCardInvoice(user);
      const view = await createImport(
        user,
        inter.id,
        statement(user, [
          [-3, 'PADARIA', '-10,00'],
          [-1, 'PAGAMENTO FATURA NUBANK', '-950,00'],
        ]),
      );

      const res = await confirm(user, view.id, [
        { rowId: rowBy(view, 'FATURA').id, action: 'import', type: 'card_payment', invoiceId },
      ]);

      expect(res.statusCode).toBe(422);
      expect(res.json<{ error: { message: string } }>().error.message).toMatch(
        /passa do que resta pagar/,
      );
      expect(await user.listAll()).toEqual([]);
      expect(await user.balanceOf(inter.id)).toBe(500_000);
    });

    it('lista as faturas com valor a pagar (para escolher na revisão)', async () => {
      const user = await registerUser(env.app);
      const other = await registerUser(env.app);
      const { invoiceId } = await withCardInvoice(user);

      const mine = await user.ok<{
        items: { id: string; cardName: string; payableCents: number }[];
      }>(user.get('/invoices/payable'));
      const theirs = await other.ok<{ items: unknown[] }>(other.get('/invoices/payable'));

      expect(mine.items).toEqual([
        expect.objectContaining({ id: invoiceId, cardName: 'Nubank', payableCents: 90_000 }),
      ]);
      expect(theirs.items).toEqual([]);
    });
  });

  describe('regras de comerciante', () => {
    it('cria (normaliza o texto), lista, é idempotente e remove', async () => {
      const user = await registerUser(env.app);
      const food = await user.categoryId('Alimentação', 'expense');

      const created = merchantRuleSchema.parse(
        await user.ok(
          user.post('/merchant-rules', {
            pattern: ' Padaria do Zé ',
            suggestedType: 'expense',
            categoryId: food,
          }),
          201,
        ),
      );
      const again = merchantRuleSchema.parse(
        await user.ok(
          user.post('/merchant-rules', {
            pattern: 'PADARIA DO ZE',
            suggestedType: 'expense',
            categoryId: food,
            priority: 5,
          }),
          201,
        ),
      );
      const listed = merchantRuleListResponseSchema.parse(
        await user.ok(user.get('/merchant-rules')),
      );

      expect(created).toMatchObject({
        pattern: 'PADARIA DO ZE',
        matchType: 'contains',
        categoryId: food,
      });
      expect(again.id).toBe(created.id);
      expect(listed.items).toHaveLength(1);
      expect(listed.items[0]?.priority).toBe(5);
      expect((await user.delete(`/merchant-rules/${created.id}`)).statusCode).toBe(204);
      expect((await user.delete(`/merchant-rules/${created.id}`)).statusCode).toBe(404);
    });

    it('validações: transferência precisa de conta; categoria do tipo certo; recursos de outro usuário', async () => {
      const user = await registerUser(env.app);
      const other = await registerUser(env.app);
      const salary = await user.categoryId('Salário', 'income');
      const foreignCategory = await other.categoryId('Alimentação', 'expense');
      const foreignAccount = await other.createAccount({ name: 'Dela' });
      const post = (body: object) => user.post('/merchant-rules', body);

      expect((await post({ pattern: 'X1', suggestedType: 'transfer' })).statusCode).toBe(400);
      expect(
        (
          await post({
            pattern: 'X1',
            suggestedType: 'expense',
            targetAccountId: foreignAccount.id,
          })
        ).statusCode,
      ).toBe(400);
      expect(
        (await post({ pattern: 'X1', suggestedType: 'expense', categoryId: salary })).statusCode,
      ).toBe(422);
      expect(
        (await post({ pattern: 'X1', suggestedType: 'expense', categoryId: foreignCategory }))
          .statusCode,
      ).toBe(404);
      expect(
        (
          await post({
            pattern: 'X1',
            suggestedType: 'transfer',
            targetAccountId: foreignAccount.id,
          })
        ).statusCode,
      ).toBe(404);
      expect((await post({ pattern: 'a', suggestedType: 'expense' })).statusCode).toBe(400);
      expect((await post({ pattern: '!!', suggestedType: 'expense' })).statusCode).toBe(422);
    });

    it('a regra do usuário vence a padrão e é aplicada na próxima importação', async () => {
      const user = await registerUser(env.app);
      const inter = await user.createAccount({ name: 'Banco Inter' });
      const leisure = await user.categoryId('Lazer', 'expense');
      await user.ok(
        user.post('/merchant-rules', {
          pattern: 'Enel',
          suggestedType: 'expense',
          categoryId: leisure,
        }),
        201,
      );

      const view = await createImport(
        user,
        inter.id,
        statement(user, [[-2, 'ENEL DISTRIBUICAO', '-187,35']]),
      );

      expect(view.rows[0]).toMatchObject({
        suggestedCategoryId: leisure,
        suggestionSource: 'user_rule',
      });
    });

    it('"salvar regra" na confirmação aprende com a escolha para as próximas importações', async () => {
      const user = await registerUser(env.app);
      const inter = await user.createAccount({ name: 'Banco Inter', initialBalanceCents: 10_000 });
      const food = await user.categoryId('Alimentação', 'expense');
      const first = await createImport(
        user,
        inter.id,
        statement(user, [[-3, 'PADARIA DO ZE 1234', '-12,50']]),
      );

      const result = await confirmOk(user, first.id, [
        { rowId: first.rows[0]?.id, action: 'import', categoryId: food, saveRule: true },
      ]);
      const second = await createImport(
        user,
        inter.id,
        statement(user, [[-1, 'PADARIA DO ZE 9999', '-8,00']]),
      );

      expect(result.rulesSaved).toBe(1);
      const rules = merchantRuleListResponseSchema.parse(
        await user.ok(user.get('/merchant-rules')),
      );
      expect(rules.items[0]).toMatchObject({
        pattern: 'MOVIMENTACAO PADARIA DO ZE',
        categoryId: food,
      });
      expect(second.rows[0]).toMatchObject({
        suggestedCategoryId: food,
        suggestionSource: 'user_rule',
      });
    });

    it('regras são isoladas por usuário', async () => {
      const owner = await registerUser(env.app);
      const intruder = await registerUser(env.app);
      const food = await owner.categoryId('Alimentação', 'expense');
      const rule = merchantRuleSchema.parse(
        await owner.ok(
          owner.post('/merchant-rules', {
            pattern: 'PADARIA',
            suggestedType: 'expense',
            categoryId: food,
          }),
          201,
        ),
      );

      expect((await intruder.delete(`/merchant-rules/${rule.id}`)).statusCode).toBe(404);
      expect(
        (await intruder.ok<{ items: MerchantRule[] }>(intruder.get('/merchant-rules'))).items,
      ).toEqual([]);
    });
  });

  describe('desfazer', () => {
    it('cancela lançamentos, transferências e pagamentos criados (nada é apagado) e restaura os saldos', async () => {
      const user = await registerUser(env.app);
      const inter = await user.createAccount({ name: 'Banco Inter', initialBalanceCents: 100_000 });
      const mp = await user.createAccount({ name: 'Mercado Pago', type: 'wallet' });
      const view = await createImport(
        user,
        inter.id,
        statement(user, [
          [-4, 'PADARIA', '-10,00'],
          [-3, 'SALARIO EMPRESA', '1.000,00'],
          [-2, 'PIX ENVIADO MERCADO PAGO', '-300,00'],
        ]),
      );
      await confirmOk(user, view.id);
      expect(await user.balanceOf(inter.id)).toBe(100_000 - 1_000 + 100_000 - 30_000);

      const reverted = importDetailSchema.parse(
        await user.ok(user.post(`/imports/${view.id}/revert`)),
      );

      expect(reverted.status).toBe('reverted');
      expect(await user.balanceOf(inter.id)).toBe(100_000);
      expect(await user.balanceOf(mp.id)).toBe(0);
      const all: Transaction[] = await user.listAll('&includeCancelled=true');
      expect(all).toHaveLength(4); // 2 lançamentos + 2 pernas, todos preservados
      expect(all.every((t) => t.status === 'cancelled')).toBe(true);
      expect((await user.post(`/imports/${view.id}/revert`)).statusCode).toBe(409);
    });

    it('só desfaz importação confirmada; outro usuário não consegue', async () => {
      const owner = await registerUser(env.app);
      const intruder = await registerUser(env.app);
      const inter = await owner.createAccount({ name: 'Banco Inter' });
      const view = await createImport(
        owner,
        inter.id,
        statement(owner, [[-1, 'PADARIA', '-10,00']]),
      );

      const inReview = await owner.post(`/imports/${view.id}/revert`);
      await confirmOk(owner, view.id);
      const others = await Promise.all([
        intruder.post(`/imports/${view.id}/revert`),
        intruder.get(`/imports/${view.id}`),
        intruder.post(`/imports/${view.id}/cancel`),
      ]);

      expect(inReview.statusCode).toBe(409);
      expect(others.map((r) => r.statusCode)).toEqual([404, 404, 404]);
    });
  });

  describe('histórico e isolamento', () => {
    it('lista o histórico do usuário com contagens; outro usuário não vê', async () => {
      const owner = await registerUser(env.app);
      const intruder = await registerUser(env.app);
      const inter = await owner.createAccount({ name: 'Banco Inter', initialBalanceCents: 10_000 });
      const view = await createImport(
        owner,
        inter.id,
        statement(owner, [
          [-2, 'PADARIA', '-10,00'],
          [-1, 'FARMACIA', '-20,00'],
        ]),
      );
      await confirmOk(owner, view.id, [{ rowId: view.rows[0]?.id, action: 'skip' }]);

      const mine = await owner.ok<{
        items: {
          id: string;
          status: string;
          rowsCount: number;
          importedCount: number;
          skippedCount: number;
        }[];
      }>(owner.get('/imports'));
      const theirs = await intruder.ok<{ items: unknown[] }>(intruder.get('/imports'));

      expect(mine.items).toEqual([
        expect.objectContaining({
          id: view.id,
          status: 'confirmed',
          rowsCount: 2,
          importedCount: 1,
          skippedCount: 1,
        }),
      ]);
      expect(theirs.items).toEqual([]);
    });

    it('exige autenticação', async () => {
      const response = await env.app.inject({ method: 'GET', url: '/api/v1/imports' });

      expect(response.statusCode).toBe(401);
    });
  });
});
