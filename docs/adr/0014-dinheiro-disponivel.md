# ADR 0014 — Definição do "dinheiro disponível" (Quanto posso gastar?)

- **Status:** aceito (FASE 3). Detalha o §4 de [financial-rules.md](../financial-rules.md).

## Contexto

O objetivo do sistema é responder "Quanto dinheiro eu realmente posso gastar?". O saldo bancário não
basta: é preciso considerar o que ainda vai entrar e sair, sem contar nada duas vezes.

## Decisão

```
disponível = saldo das contas líquidas
           + receitas pendentes até o horizonte
           + transferências pendentes que ENTRAM na fronteira líquida
           − despesas pendentes até o horizonte (inclui atrasadas)
           − transferências pendentes que SAEM da fronteira líquida
```

- **Conta líquida:** banco ou carteira, **ativa** e marcada "considerar no disponível". Contas de
  **investimento nunca** entram, mesmo se marcadas (saldo delas é patrimônio, não caixa).
- **Horizonte:** de hoje até o último dia do mês corrente no fuso do usuário; `?until=` opcional (nunca
  anterior a hoje → `422`). Depois do horizonte, despesas previstas aparecem como **compromissos futuros**
  (número separado).
- **Sem dupla contagem, por construção:** o saldo só reflete o que está `completed`; pendentes entram
  apenas nos termos próprios; transferência entre duas contas líquidas tem efeito líquido zero e não
  entra em nenhum termo; cancelados nunca entram; aplicação/resgate não são despesa/receita.
- **Receitas pendentes contam** (previsão de entrada até o horizonte). Quem preferir uma visão mais
  conservadora pode usar um horizonte menor. A decomposição completa é devolvida pela API e exibida na
  tela ("Como calculamos") para o usuário conferir cada parcela.
- O painel também devolve saldo total (bancos/carteiras), investimentos, receitas e despesas **efetivadas**
  do mês (transferências não contam), contas pendentes (total, vencidas e as próximas) e compromissos futuros.
- Termos das FASES 4 e 5 (ocorrências de recorrências e faturas de cartão) entram como novos componentes
  do mesmo cálculo, sem mudar a estrutura.

## Consequências

- Um teste de propriedade compara o resultado com um oráculo independente: para cada conta líquida,
  saldo inicial + Σ do efeito de tudo que não foi cancelado com data até o horizonte, em sequências
  aleatórias de receitas, despesas e transferências (efetivadas e pendentes, em contas líquidas e não líquidas).
- Web e Android apenas exibem os números do backend; nenhum cálculo financeiro nos clientes.
