# ADR 0009 — Android em desenvolvimento via `adb reverse`

- **Status:** aceito (FASE 0)

## Contexto

O caminho tradicional para o emulador alcançar a API local é `http://10.0.2.2:3333`. Na verificação
da FASE 0, o app (targetSdk 37 / Android 17) **não conseguia conectar** em `10.0.2.2` (timeout),
enquanto o shell do emulador conseguia. Causa: a proteção de rede local do Android 17 exige a
permissão de runtime `ACCESS_LOCAL_NETWORK` para que apps acessem endereços de rede privada.

## Decisão

- O build **debug** usa `http://localhost:3333/` (propriedade Gradle `fintrack.debugApiBaseUrl`)
  com `adb reverse tcp:3333 tcp:3333`. Loopback não é "rede local", então nenhuma permissão extra é
  necessária — e funciona do mesmo jeito no emulador e em celular físico via USB.
- O app **não** declara `ACCESS_LOCAL_NETWORK`: em produção ele fala apenas com a API HTTPS pública.
- Network security config: release só HTTPS; debug libera HTTP apenas para `localhost`/`127.0.0.1`.

## Consequências

- É preciso rodar `adb reverse tcp:3333 tcp:3333` sempre que o dispositivo conectar (documentado no
  README).
