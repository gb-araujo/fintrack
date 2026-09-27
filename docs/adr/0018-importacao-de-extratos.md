# ADR 0018 — Importação de extratos (CSV): revisão, duplicidade e sugestões

- **Status:** aceito (FASE 6)

## Contexto

Importar extrato é o ponto onde mais fácil se conta a mesma movimentação duas vezes: o mesmo arquivo
importado de novo, um lançamento manual que o banco também exporta, uma transferência que aparece nos
extratos das duas contas, o pagamento da fatura que já foi contado nas parcelas. As descrições dos bancos
também variam ("Pix enviado – José" × "PIX ENVIADO JOSE").

## Decisão

1. **Fluxo em duas etapas, com revisão obrigatória.** `POST /imports` lê o arquivo e cria uma
   importação `review` com uma linha (`imported_transactions`) por movimentação, já com sugestões e
   marcas de duplicidade — **não cria lançamentos, não mexe em saldo, painel nem orçamento**. Só
   `POST /imports/:id/confirm` cria lançamentos, e o faz pelos **mesmos services** do resto do sistema
   (mesmas regras de data, conta, categoria, transferência e fatura), numa **única transação SQL**:
   tudo o que foi aprovado entra, ou nada (uma linha inválida derruba o lote inteiro, apontando o
   número da linha). O lote é travado (`FOR UPDATE`): confirmações simultâneas criam uma vez só.
2. **Parser tolerante, sem adivinhar em silêncio.** CSV com aspas, `;`/`,`/tab/`|` (detectado pelo
   padrão consistente de colunas), BOM, CRLF e título antes do cabeçalho (o cabeçalho é procurado nas
   primeiras 40 linhas). Colunas reconhecidas por sinônimos (Inter: "Data Lançamento; Histórico;
   Descrição; Valor"; Mercado Pago: "RELEASE_DATE; TRANSACTION_TYPE; TRANSACTION_NET_AMOUNT"; débito/crédito
   separados). Se não reconhecer, responde `422` **com os cabeçalhos** para o usuário informar o
   mapeamento. Valores em centavos inteiros (sem ponto flutuante; `1.234,56`, `1,234.56`, `(45,90)`,
   `45,90-`); datas dia/mês/ano ou ISO. Linhas que não viram movimentação (totais, data/valor inválidos,
   valor zero) são **devolvidas com o motivo** (`ignoredRows`, com a contagem total) — nada some sem aviso.
   Arquivos em Windows-1252 são lidos pelo cliente (UTF-8 estrito, senão Windows-1252). Limites: 5.000
   linhas e ~3 MB por arquivo. OFX/PDF: a interface de parser e o campo `source` já os comportam; só CSV
   está implementado. Fatura de cartão em CSV (compras) fica para a FASE 9.
3. **Duplicidade nunca descarta.** Cada linha recebe:
   - **exata** — sua impressão digital (conta + data + valor com sinal + descrição normalizada + ordinal
     entre linhas idênticas do mesmo arquivo) já foi importada e confirmada antes (lote não desfeito).
     O ordinal evita chamar de duplicata dois cafés iguais no mesmo dia;
   - **possível** — existe um lançamento não cancelado **na mesma conta**, mesmo valor e sentido, a até
     ±3 dias (`DUPLICATE_WINDOW_DAYS`), de qualquer origem (manual, recorrência, importação, perna de
     transferência). Cada lançamento existente é reivindicado por **uma** linha (pares de menor
     distância de data e maior similaridade de descrição), então dois cafés e um lançamento geram um
     possível duplicado e um item novo.
   Duplicatas começam com ação **"pular"**, mas continuam na revisão, visíveis, e o usuário pode marcar
   "importar mesmo assim". Lotes cancelados/desfeitos deixam de contar como "já importados".
4. **Sugestões, na ordem** (a primeira que casa vence): (a) regras do próprio usuário (`merchant_rules`,
   maior prioridade e padrão mais longo primeiro); (b) **pagamento de fatura** ("PAGAMENTO FATURA…") →
   tipo `card_payment` (nunca despesa: já foi contado nas parcelas), ligado à fatura em aberto de mesmo
   valor; sem fatura correspondente, a linha começa como **"pular"**; (c) descrição que cita **outra
   conta do usuário** ("PIX ENVIADO MERCADO PAGO" a partir do Inter) → **transferência** para/de essa
   conta — a conta é reconhecida pela parte distintiva do nome ("Banco Inter" → "INTER"); (d) regras padrão
   por palavra inteira (TELEFONICA BRAS → Internet, TIM S A → Celular, SABESP → Água, ENEL → Energia,
   assinaturas, transporte…), só se a categoria existir com esse nome; (e) sem sugestão: receita/despesa
   sem categoria. Regra só vale se o tipo combina com o sentido do dinheiro (receita só entra).
   Regras `regex` **não** são suportadas (ReDoS por padrão de usuário): só `contains` e `starts_with`.
5. **Transferência entre contas sem dupla contagem:** aparece nos dois extratos, mas cria uma única
   transferência (as duas pernas). O extrato da outra conta, importado depois, tem a linha correspondente
   marcada como **possível duplicata** da perna já existente (e vice-versa).
6. **Confirmação validada:** receita só em entrada; despesa e pagamento de fatura só em saída;
   transferência exige outra conta (diferente da do extrato); pagamento de fatura exige a fatura e não
   pode passar do valor em aberto; a categoria precisa ser do tipo certo. "Lembrar esta escolha" grava
   (ou atualiza, sem duplicar) uma regra a partir do texto normalizado sem números soltos.
7. **Desfazer:** `POST /imports/:id/revert` **cancela** os lançamentos, transferências e pagamentos que o
   lote criou (nada é apagado; saldos e faturas voltam), numa transação. Importações em revisão podem
   ser descartadas (`cancel`).

## Consequências

- O usuário sempre vê e decide antes de gravar; erros de mapeamento ou de sugestão não contaminam saldos.
- Importar dois extratos que se sobrepõem, ou o mesmo extrato duas vezes, não duplica lançamentos.
- A qualidade das sugestões melhora com o uso ("lembrar esta escolha") sem aprendizado opaco.
