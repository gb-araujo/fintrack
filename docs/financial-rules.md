# Regras financeiras do FINTRACK

> Documento **normativo**: o código do backend deve seguir exatamente estas regras. Qualquer mudança
> aqui exige um ADR e testes correspondentes. Status: definido na FASE 0; implementação a partir da
> FASE 2 (transações) e FASE 3 (dinheiro disponível).

## 1. Representação

- Dinheiro em **centavos inteiros** (`bigint` no banco, `number` inteiro em TS, `Long` em Kotlin).
  Nunca ponto flutuante. ([ADR 0001](./adr/0001-dinheiro-em-centavos.md))
- Valores sempre **positivos**; o sentido vem do tipo da movimentação (e da direção, em transferências).
- `transaction_date` é `date` (sem fuso). "Hoje" e "fim do mês" são calculados no fuso do usuário
  (`users.timezone`, padrão `America/Sao_Paulo`). Funções de domínio recebem `today` explicitamente.
- Saldo de conta é **calculado**: `saldo_inicial + Σ transações completed` da conta.
  Não existe coluna de saldo mutável. ([ADR 0002](./adr/0002-saldo-calculado.md))

## 2. Tipos de movimentação

| Tipo | Significado | Afeta saldo da conta | Conta como receita/despesa | Afeta patrimônio |
|---|---|---|---|---|
| `income` | Receita (salário, VR, …) | + | receita | + |
| `expense` | Despesa paga por conta (débito, pix, dinheiro) | − | despesa | − |
| `transfer` | Uma perna de transferência entre contas do usuário | − origem / + destino | **não** | 0 |
| `card_payment` | Pagamento de fatura de cartão a partir de uma conta | − conta pagadora | **não** (já contado nas parcelas) | 0 (quita passivo) |

Status: `pending` (prevista/agendada), `completed` (efetivada — única que afeta saldo), `cancelled`.

## 3. Onde cada evento é reconhecido (uma única vez)

| Evento | Saldo | Receita/Despesa (relatórios e orçamento) | Patrimônio |
|---|---|---|---|
| Receita completed | + conta | receita | + |
| Despesa completed | − conta | despesa na categoria | − |
| Transferência Inter → Mercado Pago | − Inter / + Mercado Pago | nada | 0 |
| Compra no Mercado Pago (saldo MP) | − Mercado Pago | despesa na categoria da compra | − |
| Compra no cartão R$ 900 em 3x | nada na hora | **despesa por parcela** (R$ 300) no mês de cada fatura | − (passivo) |
| Pagamento da fatura (`card_payment`) | − conta pagadora | nada | 0 |
| Aplicação em investimento | transferência para conta `investment` | nada | 0 |
| Resgate de investimento | transferência para conta líquida | nada (**não** é receita operacional) | 0 |
| Rendimento de investimento | **a definir na FASE 8** | não é receita operacional | + |
| Recorrência prevista (não confirmada) | nada | nada (apenas previsão) | nada |
| Recorrência confirmada | vira transação vinculada `(recurring_id, occurrence_date)` | como a transação | como a transação |

Regras derivadas:

- **Mercado Pago é uma conta** (`wallet`). "Inter → Mercado Pago" é transferência; a compra feita
  com o saldo do Mercado Pago é que é despesa. Nunca classificar "Mercado Pago" como despesa.
- Transferências nunca alteram o patrimônio total nem aparecem em receitas/despesas.
- Uma transferência gera **um** registro em `transfers` e **duas** transações `transfer` (out/in)
  na mesma transação SQL. ([ADR 0003](./adr/0003-transferencias-vinculadas.md))
- A despesa do cartão é reconhecida **por parcela, no período da fatura**; o pagamento da fatura só
  movimenta caixa. ([ADR 0004](./adr/0004-card-payment-e-faturas.md), [ADR 0005](./adr/0005-parcelas-no-periodo-da-fatura.md))
- Parcelas: soma das parcelas = total da compra; o resto dos centavos vai na **1ª parcela**
  (R$ 100,00 em 3x = 33,34 + 33,33 + 33,33).
- Investimentos não são despesas; resgates não são receitas operacionais.
  ([ADR 0006](./adr/0006-investimentos-como-movimentacao-entre-contas.md))

## 4. "Quanto posso gastar?" (dinheiro disponível) — FASE 3

Horizonte padrão: **de hoje até o último dia do mês corrente** (fuso do usuário). A API aceita
`?until=YYYY-MM-DD`.

```
disponivel =
    Σ saldo atual das contas líquidas (bank + wallet com include_in_available = true)
  + receitas pending em contas líquidas com data ≤ horizonte
  + ocorrências previstas de recorrências de receita (include_in_forecast, sem transação vinculada, ≤ horizonte)
  − despesas pending em contas líquidas com data ≤ horizonte (inclui atrasadas)
  − ocorrências previstas de recorrências de despesa (sem transação vinculada, ≤ horizonte)
  − Σ (parcelas − pagamentos) das faturas com vencimento ≤ horizonte
  ± transferências pending que cruzam a fronteira líquida (ex.: aplicação agendada = −)
```

**Não entram:** transferências entre contas líquidas (efeito líquido zero), saldo de investimentos,
compras de cartão diretamente (só via fatura), parcelas de faturas que vencem depois do horizonte
(essas aparecem em **Compromissos futuros**, um número separado).

**Anti-dupla-contagem:**

- Uma ocorrência virtual de recorrência é descartada se existir transação com o mesmo
  `(recurring_transaction_id, occurrence_date)` em **qualquer** status (`cancelled` = ocorrência pulada).
  Garantido também por `UNIQUE(recurring_transaction_id, occurrence_date)`.
- Recorrências pagas no cartão geram parcela na fatura, não despesa em conta.
- Recorrência de valor variável (ex.: Enel) usa o último valor confirmado ou a estimativa informada,
  sinalizada como "estimado" na interface.

A API retorna o valor **e a decomposição** de cada termo da fórmula.

## 5. Recorrências — FASE 4

- Uma recorrência gera **previsões** (ocorrências virtuais), não transações.
- A transação efetiva só é criada quando o usuário confirma — ou automaticamente se a recorrência
  tiver `auto_confirm = true`. ([ADR 0008](./adr/0008-recorrencias-como-previsao.md))

## 6. Importação — FASE 6

Fluxo: arquivo → parser → normalização → detecção de duplicidade → sugestão de categoria/tipo
(`merchant_rules`) → revisão → confirmação → banco.

- Fingerprint = conta + data + valor + descrição normalizada; OFX usa `FITID` quando existir.
- Possíveis duplicatas (janela de ± N dias) vão para revisão — **nunca** são descartadas silenciosamente.

## 7. Pendências conhecidas

- **Rendimentos de investimento** (FASE 8): decidir a representação preservando histórico,
  rentabilidade e evolução do patrimônio. Apenas atualizar o valor da posição **não** é suficiente.
