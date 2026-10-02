# ADR 0017 — Cartão de crédito: faturas, parcelas e pagamento

- **Status:** aceito (FASE 5) — detalha os ADRs [0004](./0004-card-payment-e-faturas.md) e
  [0005](./0005-parcelas-no-periodo-da-fatura.md).

## Contexto

Uma compra no cartão não sai da conta na hora: vira parcelas em faturas, e a fatura é paga depois por
uma conta. Os riscos são os de sempre — contar a compra duas vezes (na parcela **e** no pagamento) ou
deixar o dinheiro disponível de fora de um compromisso que já existe.

## Decisões

1. **O cartão não é uma conta.** Tabelas `credit_cards`, `credit_card_invoices`,
   `credit_card_transactions` (a compra) e `credit_card_installments`. A compra cria as parcelas e, se
   preciso, as faturas, numa única transação SQL. Cartões são arquivados; compras são canceladas
   (estorno), nunca apagadas.
2. **Parcelas:** valor em centavos inteiros; a soma é sempre o total e o resto dos centavos vai na
   **primeira** parcela (R$ 100 em 3x = 33,34 + 33,33 + 33,33). Isso é garantido também no banco por um
   constraint trigger deferido (`credit_card_installments`: N parcelas numeradas de 1 a N somando o
   total). Chaves compostas `(fatura, cartão, usuário)` impedem prender uma parcela à fatura de outro
   cartão ou de outro usuário.
3. **Qual fatura recebe a compra:** o fechamento do mês é o dia `closingDay` (meses curtos usam o último
   dia); compra **até o dia do fechamento, inclusive**, entra na fatura que fecha no mês, depois vai para
   a do mês seguinte. O vencimento fica no mês do fechamento se `dueDay > closingDay` (dias
   configurados), senão no mês seguinte. A parcela *k* cai na fatura *k − 1* meses depois da primeira.
   A regra é uma função pura testada contra um oráculo dia a dia (3 anos, inclusive ano bissexto) e
   garante que fechamentos consecutivos têm sempre meses de vencimento distintos.
4. **Mês de referência = mês do vencimento** (`reference_month`), não o do fechamento nem o da compra:
   é o mês em que o dinheiro sai (ADR 0005). A despesa das parcelas é reconhecida nele — no orçamento,
   em "Despesas do mês" (`month.cardExpenseCents`, já incluído em `expenseCents`) e nos relatórios.
   Uma compra feita hoje é despesa **de fato** (a compra já aconteceu); não existe parcela "pendente".
5. **Status da fatura é derivado, não gravado** (desvio consciente do desenho original, que previa uma
   coluna `status`): `open` (hoje ≤ fechamento), `closed` (fechada com valor em aberto) ou `paid`, mais
   `overdue`. Uma coluna poderia divergir do histórico de parcelas e pagamentos; derivar é o mesmo
   princípio do saldo (ADR 0002). `closing_date` e `due_date` ficam gravadas: mudar o dia de fechamento
   do cartão só vale para faturas **novas**.
6. **Valores da fatura** (uma única definição em SQL, `invoice-sql.ts`, usada pelos cartões, pelo painel
   e pelos orçamentos): total = Σ parcelas das compras não canceladas; pago = Σ `card_payment` efetivados;
   agendado = Σ `card_payment` pendentes; em aberto = total − pago (negativo = **crédito**, ex.: estorno
   depois de pago).
7. **Pagamento** = transação `card_payment` (ADR 0004): sai da conta pagadora, **não é despesa** (não
   entra em orçamento nem em "despesas do mês"), exige a fatura (CHECK) e não tem categoria. A conta
   pagadora é banco ou carteira, ativa (investimento → `422`). O valor padrão é o que resta pagar sem
   agendamento; **não se paga nem agenda mais que `total − pago − agendado`** (`422`). A verificação é
   feita com a fatura travada (`SELECT … FOR UPDATE`): pagamentos simultâneos não passam do devido.
   Data futura vira pagamento agendado (`pending`), como em qualquer lançamento; efetivar e cancelar
   usam as rotas de transações (`/transactions/:id/complete|cancel`); editar um pagamento → `409`
   (cancele e pague de novo).
8. **Limite:** usado = Σ parcelas das compras não canceladas − Σ pagamentos efetivados (piso 0);
   disponível = limite − usado. Ultrapassar o limite **não bloqueia** a compra (quem manda é o banco):
   a API devolve o número negativo e os clientes avisam.
9. **Dinheiro disponível (ADR 0014):** subtrai `invoicesCents` = valor em aberto das faturas com
   vencimento **até o horizonte** (inclui as vencidas e as ainda abertas), qualquer que seja a conta que
   vá pagá-las. Pagar a fatura tira o mesmo valor da conta e da fatura: o disponível **não muda** ao
   pagar (teste de "sem dupla contagem"). Crédito (fatura negativa) não vira dinheiro disponível. Faturas
   com vencimento **depois** do horizonte aparecem em "Compromissos futuros" (todas, sem janela), não
   reduzem o disponível agora.
10. **Painel:** as faturas a vencer entram em "Contas pendentes" (`kind: "invoice"`); o patrimônio passa a
    ser `Σ saldos − cardLiabilitiesCents` (valor em aberto de **todas** as faturas, inclusive parcelas
    futuras — compra no cartão é passivo).
11. **Estorno:** cancelar a compra inteira tira as parcelas da fatura, do limite e do orçamento
    (estorno parcial não é suportado; lance o ajuste como nova compra/estorno futuramente). Descrição e
    categoria da compra podem ser corrigidas; valor, data e parcelas não.

## Consequências

- Não há dupla contagem por construção: só a parcela é despesa; o pagamento só move caixa.
- Recorrências pagas no cartão (assinaturas) ficam para a FASE 9: hoje a recorrência é de uma conta.
- A data da compra não pode ser futura (nada é registrado antes de acontecer); compras parceladas já
  criam as parcelas futuras.
