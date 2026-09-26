# ADR 0004 — Tipo `card_payment` e tabela de faturas

- **Status:** aceito (FASE 0) — desvio aprovado da lista original de tipos (income/expense/transfer)

## Contexto

A despesa de uma compra no cartão é reconhecida pelas parcelas (ADR 0005). Se o pagamento da fatura
fosse registrado como `expense`, a mesma compra seria contada duas vezes. Como `transfer`, faltaria
uma conta de destino (o cartão não é uma conta).

## Decisão

- Novo tipo de transação **`card_payment`**: reduz o saldo da conta pagadora, **não** é despesa,
  **não** entra em orçamento e referencia a fatura (`credit_card_invoice_id` obrigatório via CHECK).
- Nova tabela **`credit_card_invoices`** (`credit_card_id`, `reference_month`, `closing_date`,
  `due_date`, `status`), com `UNIQUE(credit_card_id, reference_month)`. Cada parcela pertence a
  uma fatura.
- Valor em aberto da fatura = Σ parcelas − Σ `card_payment` completed da fatura.

## Consequências

- Pagamentos parciais e múltiplos pagamentos por fatura são suportados naturalmente.
- O "Quanto posso gastar?" desconta o valor em aberto das faturas que vencem no horizonte.
