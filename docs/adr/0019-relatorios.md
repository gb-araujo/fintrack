# ADR 0019 — Relatórios: mesmas definições do painel, do orçamento e das faturas

- **Status:** aceito (FASE 7)

## Contexto

Um relatório que discorda do painel (ou do orçamento, ou da fatura) mina a confiança no sistema
inteiro — o usuário passa a se perguntar qual número está certo. O risco cresce com 9 relatórios
diferentes, cada um agregando dados de formas distintas (por categoria, por mês, por conta…).

## Decisão

1. **Nenhuma definição financeira nova.** Os relatórios reutilizam, em SQL, exatamente as mesmas
   regras já estabelecidas: despesa = despesas `completed` em conta + parcelas de cartão reconhecidas
   no mês do **vencimento** da fatura de compras não canceladas (ADR 0005); conta líquida = banco/
   carteira, ativa, marcada como disponível (ADR 0014); patrimônio = caixa + investimentos − o que se
   deve nos cartões (FASE 5); transferência, pagamento de fatura e resgate nunca são despesa/receita.
   Onde a lógica é replicada em SQL (ex.: efeito no saldo, fronteira líquida), o comentário no código
   remete à função original (`balanceEffect`, `isLiquidForAvailable`) para as duas nunca divergirem.
2. **Nove relatórios, dois tipos de parâmetro:** por **período** (`from`/`to`, padrão o mês corrente
   no fuso do usuário, limite de ~5 anos) — despesas por categoria, receitas × despesas, despesas por
   conta, despesas por cartão, fluxo de caixa, investimentos; e por **quantidade de meses** (`months`,
   1–36, padrão 12, até `until`) — evolução mensal, histórico de orçamento, patrimônio. Todos exigem
   autenticação e filtram por `user_id` (inclusive nas junções).
3. **Despesas por categoria** soma a parte em conta e a parte em parcela de cartão por categoria
   (`accountCents` + `cardCents`), com percentual do total; sem categoria aparece separado
   ("Sem categoria"), nunca somado a outra. **Receitas × despesas** devolve o percentual de economia
   (`null` sem receita no período, nunca `NaN`/`Infinity`). **Fluxo de caixa** é uma decomposição só
   das contas líquidas: `fechamento = abertura + receitas + entradas − despesas − pagamentos de
   fatura − saídas`, sempre coerente com o saldo real (testado). **Despesas por cartão** separa o que
   é despesa reconhecida (parcelas do período) do que é só informativo (valor comprado no período,
   que nunca entra em soma de despesa). **Patrimônio** e **evolução mensal** são séries: o valor de
   cada mês passado é o saldo **na época** (não recalculado com o histórico de hoje).
4. **Sem novas tabelas.** Relatórios são somente leitura; nenhuma migration nesta fase.
5. **Web:** um gráfico simples (barras de magnitude para quebras por categoria/conta; linhas para
   séries temporais) sempre acompanhado da tabela com os valores exatos (a "Ver tabela" nunca é
   dispensada) — a cor nunca é a única forma de ler o número. **Android:** listas e barras de
   progresso equivalentes (sem gráfico de linha, para manter o escopo simples nesta fase); ambos os
   clientes só formatam o que o backend devolve.

## Consequências

- Um teste de integração por relatório usa exatamente os mesmos cenários (compra parcelada,
  transferência, pagamento de fatura, resgate) das FASES 2–6 para garantir que os números coincidem
  com o painel e o orçamento.
- Investimentos ainda não mostram rendimento (`netContributedCents` é só a base aplicada − resgatada);
  a representação de rendimento fica para a FASE 8, sem mudar o formato já publicado aqui.
