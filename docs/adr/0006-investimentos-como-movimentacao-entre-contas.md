# ADR 0006 — Investimentos como movimentação entre contas

- **Status:** aceito (FASE 0); **representação de rendimentos resolvida na ADR 0020 (FASE 8)**

## Contexto

Aplicar R$ 1.000 em um CDB não é gastar R$ 1.000; resgatar não é ganhar R$ 1.000. Tratar essas
operações como despesa/receita distorce relatórios e cria patrimônio artificial.

## Decisão

- Investimentos ficam em contas do tipo `investment`.
- **Aplicação** = transferência (ADR 0003) de uma conta líquida para a conta de investimento.
- **Resgate** = transferência da conta de investimento para uma conta líquida. Não é receita operacional.
- Contas `investment` não entram no "Quanto posso gastar?", mas entram no patrimônio.
- A tabela `investment_details` registra instituição/produto da posição (FASE 8, ADR 0020).

## Rendimentos (resolvido — ver ADR 0020)

Apenas atualizar o valor da posição, sem histórico, dificultava o cálculo de rentabilidade e da
evolução do patrimônio ao longo do tempo. Resolvido na FASE 8 com uma tabela de **avaliações**
(`investment_valuations` — snapshots periódicos de valor de mercado, nunca sobrescritos) e
rendimento sempre **derivado** dessas avaliações, nunca armazenado — detalhes na ADR 0020.
