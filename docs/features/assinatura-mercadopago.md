# Assinatura recorrente — Mercado Pago (Checkout Pro / Preapproval)

**Status:** desenho para revisão. Nada implementado, migration **não aplicada**.

Checkout Pro redireciona a decoradora para o Mercado Pago e a traz de volta. O
site nunca vê dado de cartão. A recorrência usa a API **Preapproval**, não
pagamento avulso.

---

## 0. As regras já estão nos Termos — e são mais detalhadas do que o combinado

Antes de desenhar eu li `docs/politicas/termo_de_uso.md`. As seções 5 e 6 **já
descrevem tudo** e acrescentam três coisas que não estavam no pedido e que o
código precisa honrar:

| | Termos | Consequência no desenho |
|---|---|---|
| §6.1 | "Após os 3 meses da oferta, o valor **volta a ser R$ 149,90**" | A oferta de retenção não é um plano permanente: precisa contar cobranças e voltar ao valor cheio |
| §5.3 | Falha de pagamento → aviso por e-mail, retentativa, "acesso **pode ser suspenso** até a regularização" | Existe estado `inadimplente` distinto de `suspensa` |
| §6.4 | Reembolso não vale "a assinaturas com a oferta de permanência já em vigor **por mais de um mês**" | A janela de reembolso depende do plano, não só da data |

Também confirmei que a **Política de Privacidade já lista o Mercado Pago** como
operador de pagamento (§5) e já prevê cobrança como base legal (§4). **Nenhum
bump de versão é necessário** para esta feature — o que é uma boa notícia, porque
bumpar re-gateia todas as decoradoras.

Uma ressalva registrada abaixo, na seção 6: os Termos dizem que o teste é "uma
única vez **por pessoa**", e o que dá para verificar de fato é **por CNPJ**.

---

## 1. O fluxo completo

### 1.1 Caminho feliz

```
[decoradora sem assinatura]
      │  gate devolve 402 SUBSCRIPTION_REQUIRED → tela /assinatura
      ▼
POST /api/billing/subscribe          (servidor)
      │  1. requireDecorator()  → sessão + e-mail + aceite legal
      │  2. elegível a teste?   → consulta beneficios_consumidos por hash do CNPJ
      │  3. expira 'pendente' velhas desta decoradora
      │  4. POST https://api.mercadopago.com/preapproval   [Access Token]
      │       external_reference = decorator_id
      │       back_url           = /assinatura/retorno
      │       auto_recurring     = { frequency: 1, frequency_type: 'months',
      │                              transaction_amount: 149.90, currency_id: 'BRL',
      │                              free_trial: { frequency: 1, frequency_type: 'months' } }
      │  5. INSERT subscriptions (status='pendente', mp_preapproval_id)
      ▼
redirect → init_point (Mercado Pago)
      ▼
[decoradora autoriza no MP]
      ▼
      ├──────────────► webhook  POST /api/billing/webhook
      │                          (pode chegar antes, depois, ou várias vezes)
      ▼
back_url → /assinatura/retorno?preapproval_id=...
      │  POST /api/billing/sync  → aplicarEstadoDaAssinatura(preapprovalId)
      ▼
[acesso liberado]
```

### 1.2 A decisão central: um único caminho, sempre relendo a verdade

Tanto o retorno do navegador quanto o webhook chamam **a mesma função**:

```ts
aplicarEstadoDaAssinatura(preapprovalId): Promise<Subscription>
```

Ela faz `GET /preapproval/{id}` na API do Mercado Pago com o Access Token e
grava o resultado. Ou seja:

- **Nunca confiamos no redirect.** Query param é controlado pelo navegador;
  `?status=approved` na URL não libera nada.
- **Nunca confiamos no corpo do webhook.** Ele é só um aviso de "algo mudou no
  recurso X"; quem diz o que mudou é a API.
- **É idempotente por construção.** Rodar dez vezes dá o mesmo resultado, porque
  a entrada é o estado remoto, não um delta.

Isso resolve de graça a corrida que você levantou: **se ela voltar antes do
webhook, o retorno já ativa**; se o webhook chegar antes, o retorno confirma o
que já está gravado.

### 1.3 Os caminhos infelizes

**Abandonou no meio (fechou a aba no MP).** Nada acontece. A linha fica
`pendente`. O job de reconciliação marca como `expirada` as `pendente` com mais
de 24h. Uma nova tentativa cria uma **preapproval nova** — nunca reaproveitamos
uma pendente velha, porque o estado dela no MP é desconhecido. O índice único
parcial exclui `pendente` justamente para permitir isso.

**Cartão recusado.** O MP mostra o erro na tela dele; a decoradora tenta outro
cartão sem sair do fluxo. Se desistir, cai no caso acima. Se a preapproval nascer
e depois for recusada, o `GET /preapproval/{id}` devolve status `pending` ou
`cancelled` e nós não liberamos nada. **Não inventamos mensagem de erro de
cartão** — não temos o motivo e adivinhar gera suporte.

**Voltou antes do webhook.** A tela `/assinatura/retorno` chama `/api/billing/sync`.
Se o MP ainda responder `pending`, ela repete com backoff (1s, 2s, 4s, 8s — teto
de ~15s) mostrando "confirmando seu pagamento". Esgotado, mostra "recebemos seu
pagamento e vamos liberar em instantes; avisamos por e-mail" e para. O
job de reconciliação e o webhook terminam o serviço. **A tela nunca fica presa
em spinner infinito.**

**O webhook nunca chega** (MP fora do ar, deploy no ar errado). O job de
reconciliação varre `subscriptions` com `proxima_cobranca` vencida ou `pendente`
recente e faz o `GET` de novo. É a rede de segurança que torna o webhook uma
otimização, não uma dependência.

### 1.4 Cancelamento e oferta de retenção

```
[clica em Cancelar]
   ├─ já usou a oferta (beneficios_consumidos)?  → vai direto para a confirmação
   └─ não usou → tela com a oferta: R$ 99,90/mês por 3 meses
        ├─ ACEITA  → PUT /preapproval/{id} { transaction_amount: 99.90 }
        │            plano='retencao', cobrancas_no_plano=0
        │            grava 'oferta_retencao' em beneficios_consumidos
        └─ RECUSA  → cancela NA MESMA TELA (Termos 6.1)
                     PUT /preapproval/{id} { status: 'cancelled' }
                     status='cancelada', periodo_fim preservado
```

Depois de 3 cobranças no plano `retencao`, o job devolve o valor a R$ 149,90 via
`PUT /preapproval/{id}`.

**Item 0 — RESOLVIDO em sandbox (31/08/2026).** Ver seção 1.5: o MP aceita
aumentar o valor, mas o `PUT` é perdível e isso muda como a atualização é escrita.

### 1.5 O que o sandbox mostrou (item 0)

Rodado contra o vendedor de teste `TESTUSER961973879958029343`, com preapprovals
autorizadas de verdade (via `card_token` + `status: authorized`, Visa de teste).

**A pergunta original: sim, dá.** `PUT /preapproval/{id}` altera
`auto_recurring.transaction_amount` numa assinatura `authorized`, para baixo e
para cima, **inclusive acima do valor original**, mantendo `status: authorized` e
sem exigir nova autorização da pagadora. A oferta de retenção com volta a R$
149,90 sobrevive como desenhada, e **nenhuma mudança nos Termos é necessária**.

**Mas o teste achou coisa pior do que procurava.** O `PUT` de valor é assíncrono
e silenciosamente perdível:

| Cenário | Resultado |
|---|---|
| Dois `PUT` de valor em rajada, sem pausa | **4 de 5 erraram** — o valor voltou sozinho ao ORIGINAL, com HTTP 200 nos dois |
| Mesmos valores, relendo entre os `PUT` | 0 de 3 erraram |
| `PUT` isolado, conferido após 8s e 25s | persistiu nas 3 mudanças |

Em duas das três execuções sequenciais, o valor intermediário **ainda não estava
visível 6 segundos depois** — ou seja, nem um read-after-write curto confirma.

**O cancelamento, esse, é confiável:** `PUT { status: 'cancelled' }` grudou em
**5 de 5**, inclusive disparado logo após outro `PUT`. É o resultado que mais
importa, porque cancelamento que não gruda é cobrança em quem cancelou. A perda
atinge só o `transaction_amount`.

Também confirmado de passagem: `free_trial` é nativo e volta como
`first_invoice_offset: 30` — o mês grátis não precisa ser simulado por nós.

**Consequências no desenho** (já refletidas no DDL):

1. `subscriptions` separa **desejado** (`valor_centavos`) de **confirmado**
   (`valor_centavos_mp`, `sincronizado_em`). "Eu mandei o PUT" não é "está
   valendo", e o banco tem que saber a diferença.
2. **Nunca dois `PUT` na mesma preapproval no mesmo ciclo de requisição.** O
   fluxo de aceitar a oferta faz UM `PUT` e termina.
3. O job de reconciliação é quem **converge**: lê o MP, e se o valor confirmado
   difere do desejado, reaplica um único `PUT` e confere no ciclo seguinte.
   `tentativas_sync` cresce; passando de um limite, **alerta** — divergência
   persistente é dinheiro errado.
4. Temos ~30 dias de folga entre a mudança e a próxima cobrança, então
   convergência eventual é aceitável **desde que o job realmente rode**.
5. A interface não promete o novo preço como fato consumado: mostra a oferta
   aplicada e o valor vigente confirmado.

**Ressalvas honestas.** As assinaturas do teste foram autorizadas via
`card_token`, não pelo redirect do Checkout Pro — mesmo recurso e mesmo status,
mas o caminho de autorização foi outro. A amostra é pequena (5 rajadas, 3
sequenciais, 5 cancelamentos). E **não verifiquei que a cobrança seguinte sai
pelo novo valor** — isso exigiria esperar um ciclo real de faturamento; o que
foi medido é o campo, não a fatura. O job de reconciliação cobre justamente a
diferença entre as duas coisas.

---

## 2. Onde cada chave entra — e como isso fica explícito

| Variável | Onde vive | Nunca |
|---|---|---|
| `MP_ACCESS_TOKEN` | só servidor: `src/lib/mercadopago.ts` | prefixo `NEXT_PUBLIC_`, log, resposta de API, mensagem de erro |
| `MP_WEBHOOK_SECRET` | só servidor: validação do `x-signature` | idem |
| `MP_PUBLIC_KEY` | **não usada** com Checkout Pro | — |
| `BENEFICIOS_PEPPER` | **novo**, só servidor: HMAC das âncoras | banco, log, repositório |

**Explícito no código, não implícito** — três mecanismos:

1. `src/lib/mercadopago.ts` abre com `import 'server-only'`. Qualquer import a
   partir de componente cliente vira erro de build. É a mesma marca que o teste
   estático do proxy já vigia.
2. O token é lido **dentro da função**, nunca em escopo de módulo, e passa por um
   `redigir()` antes de qualquer log. O módulo expõe `mpFetch(path, init)` — as
   rotas nunca tocam no token.
3. **Provas estáticas** em `tests/static/`, no mesmo formato que já provamos
   contra a regressão real:
   - nenhum arquivo do repositório contém `NEXT_PUBLIC_MP_` ou `NEXT_PUBLIC_BENEFICIOS_`;
   - `src/lib/mercadopago.ts` não contém `console.*` com o token no escopo;
   - nenhum componente cliente (`'use client'`) alcança `@/lib/mercadopago` no
     grafo de imports;
   - `.env.example` lista as chaves **sem valor**, para o próximo a clonar.

`MP_PUBLIC_KEY` só faria falta em Checkout Transparente/Bricks. Com Pro ela pode
ficar no `.env.local` sem uso — ou sair.

---

## 3. Modelo de dados

SQL completo em `supabase/migrations/20260901120000_assinaturas.sql`. Resumo:

**`subscriptions`** — estado por decoradora. FK com `ON DELETE CASCADE`.
`valor_centavos` é **integer**: dinheiro nunca em float, e a lição do
`Decimal → string` do Prisma já custou caro neste projeto. O campo que o gate lê
é `periodo_fim` — cancelar não corta acesso, apenas para a renovação.

Índice único **parcial** garante uma assinatura viva por decoradora, deixando
`pendente` de fora para não travar novas tentativas.

**`billing_events`** — a PK é o **id da notificação do MP**. É a idempotência:
`INSERT ... ON CONFLICT DO NOTHING`; se conflitou, já processamos.

**`beneficios_consumidos`** — **sem FK para `decorators`**, de propósito. Guarda
`(ancora_tipo, ancora_hash, beneficio)` com HMAC-SHA256 e pepper de ambiente.

RLS em todas: `subscriptions` com SELECT do próprio; as outras duas **sem policy
nenhuma** (não têm dono na aplicação). `REVOKE ALL` de `anon`/`authenticated` nas
três, seguindo o baseline. Isso leva o `rls-auth-test.mjs` de 12 para 15 tabelas.

---

## 4. Webhook

### 4.1 Validação da assinatura

Header `x-signature: ts=<epoch>,v1=<hex>` mais `x-request-id`. O manifesto é:

```
id:<data.id>;request-id:<x-request-id>;ts:<ts>;
```

HMAC-SHA256 com `MP_WEBHOOK_SECRET`, comparação em **tempo constante**
(`crypto.timingSafeEqual`). Além disso: `ts` com mais de 5 minutos é recusado
(anti-replay). Falhou → **401 e não grava nada**.

> **Pegadinha conhecida:** o `data.id` do manifesto é o da **query string**, não o
> do corpo, e há relatos de divergência de caixa entre sandbox e produção
> ([sdk-nodejs#318](https://github.com/mercadopago/sdk-nodejs/discussions/318)).
> Vamos logar manifesto e hash calculado (nunca o secret) na primeira semana.

### 4.2 Idempotência e resposta rápida

O MP espera **200/201 em até 22 segundos** e reenvia a cada 15 minutos. O handler:

1. valida a assinatura (rejeita em ~1ms se falhar);
2. `INSERT` em `billing_events` com `ON CONFLICT DO NOTHING`;
3. se conflitou → **200 imediato**, já processado;
4. senão, processa e responde 200.

Sobre "processamento pesado fora do caminho da resposta": **na Netlify não existe
background real depois da resposta** — a Function morre. As opções honestas são
Background Functions (mudam o formato da rota) ou um worker por cron. Como o
trabalho é **uma chamada `GET` ao MP e um `UPDATE`**, a proposta é processar
inline com orçamento estrito, e usar o **job de reconciliação como assíncrono de
verdade**: se o inline falhar ou estourar, a linha fica com `processado_em NULL`
e o job termina depois. Construir fila para 4 contas seria cerimônia.

### 4.3 Como testar sem pagamento real

Em ordem de valor:

1. **Harness que assina o próprio payload.** Temos `MP_WEBHOOK_SECRET`, então o
   teste monta o manifesto, calcula o HMAC e faz `POST` na rota. Cobre: assinatura
   válida → 200; assinatura inválida → 401 e nada gravado; `ts` velho → 401; **a
   mesma notificação duas vezes → um só processamento**; corpo desconhecido → 200
   sem quebrar. **Sem depender do Mercado Pago.** É o grosso da confiança.
2. **Sandbox do MP**: usuários de teste (vendedor + comprador) e cartões de teste
   com resultado determinístico (aprovado / recusado por saldo / recusado por
   código de segurança) — via `APRO`, `OTHE` etc. no nome do titular.
3. **"Simular notificação"** no painel do MP, para conferir a URL e o secret de
   ponta a ponta.
4. Túnel local (ngrok/cloudflared) apontando uma **URL de webhook separada**, com
   **secret próprio** — cada URL cadastrada no painel tem o seu.

---

## 5. Gate de acesso

Composto com o que já existe, **sem repetir o erro do Prisma no middleware**:
tudo em route handler, nada em `src/proxy.ts`.

```ts
// src/lib/api-auth.ts
requireDecorator()         // sessão + e-mail confirmado + aceite legal   (401/403)
requireAssinaturaAtiva()   // chama requireDecorator e soma a assinatura  (402)
```

Retorna **402 Payment Required** com `code: 'SUBSCRIPTION_REQUIRED'` — código
distinto do 403 legal para o cliente saber para qual tela mandar.

**Três camadas de acesso, não duas.** A decoradora sem assinatura precisa
continuar entrando para poder assinar, cancelar e sair com os dados:

| Camada | Rotas | Helper |
|---|---|---|
| Pública | `/api/public/*`, `/api/legal/documents` | nenhum |
| Autenticada | `/api/decorators/me`, `/api/legal/*`, `/api/billing/*` | `requireDecorator` |
| **Com assinatura** | clientes, eventos, acervo, kits, pedidos, agenda, chat, promo, orçamentos | `requireAssinaturaAtiva` |

Matriz status → acesso:

| Status | Acesso aos dados | Observação |
|---|---|---|
| `pendente` | não | vê só a tela de assinatura |
| `em_teste` | **sim** | dentro do mês grátis |
| `ativa` | **sim** | |
| `inadimplente` | **sim, até `periodo_fim`** | com aviso na interface (Termos 5.3) |
| `cancelada` | **sim, até `periodo_fim`** | Termos 6.2 |
| `suspensa` | não | inadimplência vencida |
| `expirada` | não | dados guardados 90 dias (Termos 6.3) |

Na prática o gate é `status IN (...) AND (periodo_fim IS NULL OR periodo_fim > now())`.
Igual ao gate legal, cacheia **só o positivo** por processo — e com TTL curto
aqui, porque assinatura **pode** virar negativa dentro do mesmo deploy (ao
contrário do aceite legal, que é monotônico).

`tests/static/api-gate.test.ts` ganha uma segunda lista: cada rota declara a que
camada pertence, e rota nova sem classificação quebra o CI.

---

## 6. A pergunta difícil: como saber que já usou o teste grátis

### O que dá para fazer, sem virar vigilância

**A âncora forte já está no cadastro: o CNPJ.** O signup exige CNPJ, valida
dígito verificador **no servidor** e grava em `decorators.cnpj`. É um número de
registro público de empresa, já coletado para nota fiscal — não é dado extra
arrancado da pessoa. E abrir um CNPJ novo custa tempo e dinheiro, o que é
exatamente a barreira que se quer.

**A segunda âncora chega sozinha: o `payer_id` do Mercado Pago.** Quem assina de
novo com a mesma conta MP é reconhecido. É dado que já recebemos para operar a
cobrança.

Guardamos **HMAC-SHA256 com pepper de ambiente**, nunca o valor em claro. O
detalhe que faz diferença: o espaço de CNPJs válidos é enumerável (~10¹²), então
**hash sem pepper secreto seria decorativo** — daria para reverter por força
bruta. O pepper mora em variável de ambiente e **nunca no banco**; se vazar junto
com um dump, a proteção cai.

A tabela guarda três coisas: tipo da âncora, hash, e qual benefício foi
consumido. Ela responde **uma única pergunta** — "este CNPJ já usou o teste?" — e
não serve para nada além disso: não dá para listar quem é, cruzar com outra base,
nem reconstruir histórico.

### O que fica de fora, de propósito

**IP, fingerprint de dispositivo, canvas, fonte instalada, cookie de rastreio.**
Isso é o que transformaria antifraude em vigilância, pegaria falso positivo
(duas decoradoras no mesmo coworking) e teria de ser declarado na política. O
ganho não paga.

### O que é aceitável deixar passar

- **Pessoa com um segundo CNPJ legítimo** ganha um segundo teste. Duas empresas,
  dois testes. Detectar isso exigiria ligar CNPJs por sócio via consulta externa
  à Receita — desproporcional para um mês de R$ 149,90.
- **CNPJ de terceiro** (do parente, do sócio). Passa. Detectar exigiria conferir
  titularidade, que não temos como fazer sem pedir documento.
- **Conta MP diferente + CNPJ diferente.** Passa — e nesse ponto a pessoa
  basicamente abriu outra empresa.

O alvo real é o abuso barato e repetido: apagar a conta e recriar com outro
e-mail em cinco minutos. Contra isso o CNPJ resolve, porque o e-mail muda de
graça e o CNPJ não.

### Duas consequências que precisam de decisão sua

1. **Os Termos dizem "por pessoa"; nós verificamos "por CNPJ".** Entregamos menos
   restrição do que o texto autoriza — não prejudica ninguém, então **não é
   urgente**. Sugiro corrigir para "uma única vez por CNPJ" no próximo bump de
   versão, junto de outra mudança, para não re-gatear todo mundo só por isso.
2. **A tabela sobrevive à exclusão da conta**, e a Política promete exclusão. Ela
   guarda hash, não CNPJ, e existe para impedir abuso recorrente — mas o texto
   atual não diz isso. A Política §6 já prevê retenção por obrigação fiscal; vale
   acrescentar uma linha sobre o registro de benefício consumido **no mesmo
   próximo bump**. Registrado para não passar em branco.

---

## 7. O que ajustar no painel do Mercado Pago

Sua seleção atual (**Planos e assinaturas** + **Order**) está **quase certa** —
melhor do que eu supunha quando você disse que tinha configurado pensando em
transparente:

| Evento | Situação |
|---|---|
| **Planos e assinaturas** | ✅ **manter** — é `subscription_preapproval` + `subscription_authorized_payment`, exatamente o que Preapproval precisa |
| **Pagamentos** | ➕ **marcar** — `payment`, traz o detalhe da cobrança, estorno e devolução |
| **Order (Mercado Pago)** | ➖ **pode desmarcar** — é da Orders API, produto diferente; não dispara para Preapproval |
| Alertas de fraude / contestações | ➕ **recomendado** — chargeback é o que justifica suspender acesso |
| Vinculação de aplicações, Repasses, Envios, Point | ❌ não se aplicam |

Além disso: cadastre **duas URLs** — produção e uma de teste (túnel local). Cada
uma tem **assinatura secreta própria**; a de produção vai nas variáveis da
Netlify, a de teste no `.env.local`.

---

## 8. Plano de implementação

| # | Etapa | Depende de |
|---|---|---|
| 0 | ~~Validar em sandbox~~ **concluído** — ver 1.5 | — |
| 1 | Migration no banco de **teste** + modelos Prisma | revisão deste documento |
| 2 | `src/lib/mercadopago.ts` (`mpFetch`, redação de log) + provas estáticas das chaves | 1 |
| 3 | `aplicarEstadoDaAssinatura()` — o coração idempotente | 2 |
| 4 | `POST /api/billing/subscribe` + tela `/assinatura` + retorno com polling | 3 |
| 5 | Webhook: assinatura, idempotência, 200 rápido + harness que assina sozinho | 3 |
| 6 | `requireAssinaturaAtiva` + classificação das rotas em 3 camadas + teste estático | 3 |
| 7 | Cancelamento + oferta de retenção + volta ao valor cheio | 0, 3 |
| 8 | Job de reconciliação (vencer, suspender, expirar, **convergir valor**) + alerta de divergência | 3 |
| 9 | Migration em **produção** (após dump) e deploy | tudo verde |

Reembolso do primeiro mês (Termos 6.4) fica **manual via painel do MP** na
primeira versão: é raro, tem julgamento envolvido, e automatizar devolução de
dinheiro sem necessidade é risco à toa. O sistema só marca quem está na janela.
