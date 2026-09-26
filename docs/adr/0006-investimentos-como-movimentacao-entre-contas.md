# ADR 0006 — Investimentos como movimentação entre contas

- **Status:** aceito (FASE 0); **representação de rendimentos pendente (FASE 8)**

## Contexto

Aplicar R$ 1.000 em um CDB não é gastar R$ 1.000; resgatar não é ganhar R$ 1.000. Tratar essas
operações como despesa/receita distorce relatórios e cria patrimônio artificial.

## Decisão

- Investimentos ficam em contas do tipo `investment`.
- **Aplicação** = transferência (ADR 0003) de uma conta líquida para a conta de investimento.
- **Resgate** = transferência da conta de investimento para uma conta líquida. Não é receita operacional.
- Contas `investment` não entram no "Quanto posso gastar?", mas entram no patrimônio.
- A tabela `investments` registra a posição (instituição, produto, conta).

## Pendente (FASE 8)

Como representar **rendimentos**. Apenas atualizar o valor da posição, sem histórico, dificulta o
cálculo de rentabilidade e da evolução do patrimônio ao longo do tempo. Opções a avaliar: tabela de
movimentos de investimento (aporte, resgate, rendimento, taxa/IR) e/ou snapshots periódicos de
valor de mercado.
