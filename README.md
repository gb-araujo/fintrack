# FinTrack

Controle financeiro pessoal — **Web, Android e API REST** — que calcula o **dinheiro disponível**:
quanto do saldo está realmente livre depois de reservar as contas a pagar, as faturas de cartão, as
parcelas e os compromissos recorrentes, sem contar nenhuma movimentação duas vezes.

![Página inicial do FinTrack](docs/screenshots/inicio.png)

> Capturas feitas com o usuário de demonstração (dados fictícios).

## Funcionalidades

- **Painel de planejamento** — dinheiro disponível hoje, quanto reservar para as contas e o que vai
  entrar, num horizonte configurável (fim do mês, 30 ou 60 dias, ou uma data escolhida).
- **Lançamentos** — receitas, despesas e transferências entre contas. Lançamentos pendentes funcionam
  como previsão e só alteram o saldo quando efetivados.
- **Recorrências** — contas fixas e recebimentos entram na previsão sem gerar lançamentos duplicados;
  contas de valor variável (como energia) usam uma estimativa sinalizada.
- **Cartão de crédito** — faturas, parcelas e limite. Pagar a fatura não altera o dinheiro
  disponível, porque as compras já foram consideradas pela fatura.
- **Orçamentos mensais** por categoria.
- **Importação de extratos CSV** (Banco Inter e Mercado Pago) com revisão linha a linha, sugestão de
  categoria, reconhecimento de transferências entre contas próprias e detecção de duplicatas.
- **Relatórios** — despesas por categoria, conta e cartão, receitas × despesas, evolução mensal,
  fluxo de caixa, orçamento, patrimônio e investimentos.
- **Investimentos** tratados como movimentação entre contas, com rendimento calculado a partir de
  avaliações periódicas.
- **App Android nativo** (Kotlin + Jetpack Compose) consumindo a mesma API.

## Capturas de tela

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/transacoes.png" alt="Lista de transações com filtros"><br><sub><b>Transações</b> — filtros por conta, tipo, situação e período.</sub></td>
    <td width="50%"><img src="docs/screenshots/cartao-fatura.png" alt="Cartão de crédito com faturas e compras parceladas"><br><sub><b>Cartão de crédito</b> — limite, faturas e compras parceladas.</sub></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/importacao-revisao.png" alt="Revisão de um extrato CSV importado"><br><sub><b>Importação</b> — revisão com sugestões; a possível duplicata começa desmarcada.</sub></td>
    <td><img src="docs/screenshots/orcamentos.png" alt="Orçamentos mensais por categoria"><br><sub><b>Orçamentos</b> — limite mensal e acompanhamento por categoria.</sub></td>
  </tr>
  <tr>
    <td colspan="2"><img src="docs/screenshots/relatorio-fluxo-de-caixa.png" alt="Relatório de fluxo de caixa"><br><sub><b>Relatórios</b> — fluxo de caixa do período, conciliando saldo inicial e final.</sub></td>
  </tr>
</table>

## Como o dinheiro disponível é calculado

O saldo bancário sozinho não mostra quanto dinheiro está livre. O FinTrack parte do saldo das contas
do dia a dia e aplica tudo o que já está previsto até o horizonte escolhido:

```
dinheiro disponível =
    saldo das contas líquidas (conta corrente e carteira)
  + receitas pendentes e recebimentos recorrentes previstos
  − despesas pendentes e contas recorrentes previstas
  − valor em aberto das faturas que vencem no período
  ± transferências agendadas que entram ou saem dessas contas (ex.: aplicações)
```

**Disponível hoje** é o menor saldo projetado no período: o valor que pode sair hoje sem que o saldo
fique negativo em nenhum dia, mesmo quando uma conta vence antes de um recebimento.

Princípios que sustentam o cálculo:

- Valores monetários em **centavos inteiros**, nunca em ponto flutuante
  ([ADR 0001](docs/adr/0001-dinheiro-em-centavos.md)).
- Saldos **sempre calculados** a partir dos lançamentos, nunca armazenados
  ([ADR 0002](docs/adr/0002-saldo-calculado.md)).
- **Sem dupla contagem**: transferências são pares vinculados, recorrências confirmadas saem da
  previsão e compras no cartão entram apenas pela fatura.
- O cálculo acontece **só no backend**; web e Android exibem o resultado com a decomposição de cada
  termo.

Regras completas em [docs/financial-rules.md](docs/financial-rules.md) e no
[ADR 0014](docs/adr/0014-dinheiro-disponivel.md).

## Arquitetura

```
fintrack/
├── apps/
│   ├── api/        # API REST (Fastify + Drizzle + PostgreSQL)
│   ├── web/        # SPA React
│   └── android/    # App nativo Kotlin (projeto Gradle independente)
├── packages/
│   └── shared/     # Schemas Zod, enums e utilitários de dinheiro (API e web)
├── database/       # Migrations SQL, seeds e init do PostgreSQL
└── docs/           # Arquitetura, regras financeiras, convenções da API e ADRs
```

- **Contratos compartilhados**: os schemas Zod de `packages/shared` validam as requisições na API e
  tipam as respostas na web.
- **Integridade no banco**: além das validações da API, triggers do PostgreSQL garantem a consistência
  de transferências e parcelas ([ADR 0013](docs/adr/0013-integridade-de-transferencias-no-banco.md)).
- **Autenticação**: access token JWT de curta duração e refresh token rotativo em cookie `httpOnly`
  ([ADR 0007](docs/adr/0007-autenticacao-jwt-refresh-rotativo.md)).
- **API documentada** com OpenAPI (Swagger UI em `/docs` no ambiente de desenvolvimento).
- **Decisões registradas** em [20 ADRs](docs/adr/README.md).

## Stack

| Parte                             | Tecnologias                                                                                     |
| --------------------------------- | ----------------------------------------------------------------------------------------------- |
| API (`apps/api`)                  | Node 24, TypeScript 6, Fastify 5, Zod 4, Drizzle ORM, PostgreSQL 17, Vitest                     |
| Web (`apps/web`)                  | Vite 8, React 19, TypeScript, Tailwind CSS 4, React Router, TanStack Query, Zod, Vitest         |
| Android (`apps/android`)          | Kotlin 2.4, Jetpack Compose, Coroutines, Retrofit 3, OkHttp 5, JUnit (compile/target SDK 37, min 26) |
| Compartilhado (`packages/shared`) | Schemas Zod, enums e utilitários de dinheiro usados por API e web                               |
| Infra                             | Docker, docker compose, GitHub Actions, Railway                                                 |

## Rodando localmente

Pré-requisitos: **Node.js 24** e npm 11 (`.nvmrc`) e **Docker** (para o PostgreSQL). Para o app
Android: **JDK 17** e Android SDK com a plataforma 37.

```bash
# 1. Dependências de todos os workspaces
npm install

# 2. Variáveis de ambiente (valores locais de desenvolvimento)
cp .env.example .env
#    Recomendado: defina JWT_SECRET no .env (sem ele, as sessões caem a cada restart da API)
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"

# 3. PostgreSQL local (também cria o banco fintrack_test)
npm run db:up

# 4. Migrations e dados de demonstração
npm run db:migrate
npm run db:seed

# 5. API (http://localhost:3333) + web (http://localhost:5173)
npm run dev
```

Acesse <http://localhost:5173> e entre com o usuário de demonstração **`demo@fintrack.dev`** / senha
**`demo-fintrack-123`**, ou crie uma conta. O seed cria contas, lançamentos, transferências,
recorrências, um cartão com compras parceladas e orçamentos de exemplo
([database/seeds](database/seeds/README.md)). Para testar a importação, use os extratos de
`database/seeds/samples/`.

| Endereço                         | O que é                       |
| -------------------------------- | ----------------------------- |
| <http://localhost:5173>          | Aplicação web                 |
| <http://localhost:3333/health>   | Status da API e do banco      |
| <http://localhost:3333/docs>     | Documentação OpenAPI          |

Em desenvolvimento a web chama a API pela mesma origem (proxy do Vite para `/api` e `/health`), então
o cookie de sessão funciona sem configurar CORS.

<details>
<summary>PostgreSQL local e migrations</summary>

| Item            | Valor padrão                                                         |
| --------------- | -------------------------------------------------------------------- |
| Host / porta    | `localhost:5432` (`POSTGRES_PORT` para mudar)                        |
| Usuário / senha | `fintrack` / `fintrack`                                              |
| Bancos          | `fintrack` (desenvolvimento), `fintrack_test` (testes de integração) |

```bash
docker compose exec db psql -U fintrack -d fintrack   # console SQL
npm run db:down                                        # para os containers (dados preservados no volume)
docker compose down -v                                 # remove também os dados
npm run db:generate                                    # gera migration a partir do schema (drizzle-kit)
npm run db:migrate                                     # aplica migrations pendentes (idempotente)
```

O schema fica em `apps/api/src/db/schema`; as migrations SQL geradas ficam versionadas em
`database/migrations`.

</details>

## Testes e qualidade

```bash
npm run lint           # ESLint (type-aware) em shared, api e web
npm run typecheck      # tsc --noEmit
npm run format:check   # Prettier
npm test               # Vitest em shared, api e web
npm run build          # build de shared, api e web
```

Os testes de integração da API rodam contra um PostgreSQL real quando `TEST_DATABASE_URL` está
definido:

```bash
TEST_DATABASE_URL=postgres://fintrack:fintrack@localhost:5432/fintrack_test npm test -w @fintrack/api
```

O CI (GitHub Actions) executa formatação, lint, typecheck, migrations, testes de integração e build;
gera as imagens Docker; e roda testes, lint e build do app Android.

## Android

Projeto Gradle independente em `apps/android` (abra essa pasta no Android Studio).

```bash
cd apps/android
./gradlew testDebugUnitTest     # testes JUnit (ViewModels, casos de uso, repositórios com MockWebServer)
./gradlew lintDebug             # Android lint
./gradlew assembleDebug         # APK debug
```

Para conectar o app à API local (emulador ou celular via USB):

```bash
npm run dev:api                     # na raiz do monorepo
adb reverse tcp:3333 tcp:3333       # repita sempre que o dispositivo reconectar
```

O build debug usa `http://localhost:3333/`. Não use `10.0.2.2`: no Android 17 (targetSdk 37) o acesso
a IPs da rede local exige uma permissão de runtime — veja o
[ADR 0009](docs/adr/0009-android-dev-adb-reverse.md).

## Deploy

API e web têm imagens Docker próprias. O passo a passo para publicar no Railway, com ou sem domínio
próprio, está em [docs/deploy.md](docs/deploy.md). Todas as variáveis de ambiente estão documentadas
em [.env.example](.env.example); a API valida a configuração no boot e não sobe se algo estiver
inválido.

## Documentação

- [Arquitetura](docs/architecture.md) — camadas, monorepo, segurança, schema e endpoints
- [Regras financeiras](docs/financial-rules.md) — o que entra (e o que não entra) em cada cálculo
- [Convenções da API](docs/api-conventions.md) — formatos, erros, paginação e autenticação
- [Decisões de arquitetura (ADRs)](docs/adr/README.md)
- [Deploy](docs/deploy.md)
