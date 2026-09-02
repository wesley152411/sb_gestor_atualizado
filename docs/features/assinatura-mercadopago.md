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

### 1.4b Cancelar e reativar dentro dos 90 dias

O `status` estava fazendo dois trabalhos — descrever a vida no Mercado Pago **e**
dizer qual linha o gate lê. Com o índice único preso à lista de status, este
caminho quebrava:

> Cancela no dia 10 de um período que vai até o dia 30. A linha fica `cancelada`,
> que estava **dentro** do índice porque ela ainda tem acesso. No dia 15 reativa:
> a linha nova nasce `pendente` (fora do índice), o INSERT passa, ela autoriza no
> MP — e ao marcar a nova como `ativa` são duas no índice. **Violação de
> unicidade, 500, depois de ela já ter pago.**

A coluna `vigente` separa as duas perguntas. O índice passa a ser
`UNIQUE (decorator_id) WHERE vigente`, e:

| | |
|---|---|
| Status da antiga | `cancelada`, com `periodo_fim` intacto. O status nunca mente sobre o MP |
| Linha nova ou reuso | **Sempre nova.** Uma preapproval cancelada não volta a valer, e sobrescrever linha de cobrança destrói o rastro de auditoria |
| A transição | Troca de `vigente` numa **única transação**: nunca há duas vigentes nem nenhuma |
| O período pago | A nova **herda o `periodo_fim`** se ainda estiver no futuro — ela não perde dias já pagos |

**E a cobrança não pode sair duas vezes no mesmo mês.** Reativando antes do
`periodo_fim`, a preapproval nova é criada com `start_date = periodo_fim`.
Validado em sandbox, no caminho real do Checkout Pro:

```
start_date daqui a 20 dias → aceito 2026-09-20 | next_payment_date 2026-09-20  ✓
start_date daqui a 45 dias → aceito 2026-10-15 | next_payment_date 2026-10-15  ✓
controle sem start_date    → next_payment_date = hoje
start_date + free_trial    → start 09-10, trial offset 30, next 09-30
```

A reativação segue pelo valor cheio e sem novo teste (Termos 6.3) — isso é
`beneficios_consumidos`, que nada disto toca.

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

**Guarda de sandbox obrigatória em todo script que escreve no Mercado Pago.**
Existem DOIS jeitos legítimos de estar em teste, e checar só um dá falso alarme:

| Modo | Token | `/users/me` |
|---|---|---|
| Credenciais de teste da própria aplicação | começa com `TEST-` | conta **real** (elas pertencem a ela, mas operam em teste) |
| Credenciais de um usuário de teste | `APP_USR-` | traz a tag `test_user` |
| **Produção** | `APP_USR-` | **sem** a tag → **abortar** |

Consequência prática que custou uma rodada de testes: com credenciais `TEST-` o
coletor é a conta real, então o **pagador não pode ser um usuário de teste** —
o MP recusa com *"Both payer and collector must be real or test users"*. Com
credenciais de usuário de teste, o pagador precisa ser outro usuário de teste.

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

### 2.1 Como ficou (etapa 2)

`src/lib/mercadopago-credencial.ts` — regras **puras**, sem segredo dentro e sem
`server-only`, para serem testáveis de verdade: modo pelo prefixo do token,
ambiente esperado, coerência entre os dois, e redação de segredos.

`src/lib/mercadopago.ts` — único ponto que toca o Access Token. `server-only` na
primeira linha, token lido **dentro** da função, `mpFetch` com timeout e chave de
idempotência, e tudo que sai (corpo de erro, exceção) passa por redação.

**A coerência é conferida nos dois sentidos**, porque os dois erros são caros e
silenciosos: credencial de produção em ambiente de teste cobraria de verdade;
credencial de teste em produção não cobraria ninguém, e nada reclamaria.
`MP_AMBIENTE` força o lado quando o `NODE_ENV` não basta (preview deploy).

A redação preserva de propósito o **id de preapproval** (32 hex) e apaga a
assinatura do webhook (64 hex) — log de cobrança precisa continuar legível.

Provas em `tests/static/`, todas verificadas contra a violação real:

| Prova | Violação encenada | Pegou |
|---|---|---|
| `server-only` na primeira linha | marca removida | ✅ |
| Nenhum componente cliente alcança o módulo | gate importando `mpFetch` | ✅ (achou o direto e o transitivo) |
| Nenhum `NEXT_PUBLIC_` em segredo de cobrança | `NEXT_PUBLIC_MP_ACCESS_TOKEN` | ✅ |
| Token não fica em escopo de módulo nem é exportado | — | — |
| Todo `console` do módulo passa por redação | — | — |

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

### 3.1 Como ficou (etapa 3)

Mesmo padrão da etapa 2 — núcleo puro separado do IO, porque `server-only` não
resolve no vitest e função que decide acesso precisa de teste de verdade.

`src/lib/assinatura-estado.ts` (puro) — `calcularEstado(mp, anterior, agora)`
traduz o estado remoto para o nosso, e `concedeAcesso()` é a pergunta que o gate
faz. Duas invariantes que valem mais que o resto:

- **O período já concedido nunca encurta.** Se o MP devolver uma data anterior à
  gravada, vale a gravada.
- **Cancelar não apaga o período.** O MP zera `next_payment_date` ao cancelar;
  sobrescrever com `null` cortaria acesso já pago (Termos 6.2).

`src/lib/beneficios-hash.ts` (puro) — HMAC das âncoras, pepper por parâmetro.
Recusa gerar hash sem pepper, em vez de produzir um hash reversível.

`src/lib/assinatura.ts` (`server-only`) — o IO: relê com `GET /preapproval/{id}`,
calcula, e grava **numa transação** que rebaixa a vigente anterior antes de
promover a nova. Registra o consumo do teste grátis no momento em que ele começa,
com `skipDuplicates` — reexecução não é erro, é o esperado.

`jaUsouTesteGratis()` **falha fechada**: sem pepper, nega o teste. Conceder por
engano é prejuízo recorrente; negar por engano é um suporte pontual.

| Regressão encenada | Pegou |
|---|---|
| Cancelar apagando o período pago | ✅ |
| Inadimplente perdendo o acesso do mês já pago | ✅ |
| Truncar centavos em vez de arredondar | ✅ *(só depois de corrigir o teste — ver abaixo)* |

> **O teste de dinheiro nasceu vazio.** A primeira versão checava só
> `reaisParaCentavos(149.9) === 14990`, e `Math.trunc` acerta esse caso por sorte
> (`14990.000000000002`). Passou com a regressão introduzida. Agora usa valores
> que caem para BAIXO do inteiro — `1.15 * 100 = 114.99999999999999` — onde
> truncar dá 114 e arredondar dá 115.

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

### 4.1 Como ficou (etapa 4) — e duas descobertas

Rotas: `POST /api/billing/subscribe`, `POST /api/billing/sync`,
`GET /api/billing/estado`. Telas: `/assinatura` e `/assinatura/retorno`.

**O `server-only` é barreira de verdade, não só prova estática.** Com um
componente cliente importando `@/lib/mercadopago`, o build de produção falha:

```
Build error occurred
Error: Turbopack build failed with 2 errors:
'server-only' cannot be imported from a Client Component module
exit code 1
```

As duas camadas têm papéis distintos: a prova estática falha em ~400ms com
mensagem clara no job rápido do PR; o build é a rede final.

**O Mercado Pago recusa `back_url` que não seja HTTPS pública.** Descoberto ao
rodar o fluxo real: `Invalid value for back_url, must be a valid URL` com
`http://localhost:3100`. Consequência: **desenvolvimento local exige túnel** — o
mesmo que o webhook vai precisar. `MP_BACK_URL_BASE` sobrescreve a origem da
requisição; sem HTTPS a rota recusa com 503 e log explicando, em vez de deixar o
MP devolver um 400 opaco.

Provas em `tests/billing-fluxo.test.ts` (8), contra o sandbox de verdade, com
guarda de credencial e `skipIf` quando não há chave (o CI não tem):

- cria a preapproval e devolve `init_point`;
- a linha nasce `pendente` e **não vigente** — nada de acesso antes da autorização;
- `sync` não libera acesso enquanto o MP não autorizar;
- `sync` é idempotente;
- **B não sincroniza a assinatura de A**, mesmo sabendo o id (404);
- `preapproval_id` ausente é 400, não 500;
- quem nunca assinou recebe a oferta de teste grátis.

A recusa de assinatura órfã agora deixa rastro: etiqueta `[ASSINATURA-ORFA]` com
o id, o status no MP e o `external_reference`. A faixa do dashboard consome isso
na etapa 5, junto do batimento do job.

### 4.2 Credenciais de sandbox: por que trocamos para usuário de teste

**O beco.** Com credenciais `TEST-` da aplicação real, o coletor é a conta real. O
Mercado Pago exige que pagador e coletor sejam ambos reais ou ambos de teste
(*"Both payer and collector must be real or test users"*). Logo o pagador precisa
ser real — e pagador real com cartão de teste é **recusado**. Nenhuma combinação
fecha. Comprovado por três caminhos independentes:

| Caminho | Resposta do MP |
|---|---|
| `PUT` com `card_token_id` + `status: authorized` | `404 Card token service not found` |
| `PUT` só com `status: authorized` | `400 You cannot authorize a preapproval, only the payer can` |
| Checkout no navegador, cartão de teste | pagamento recusado, sem registro de payment |

**A saída** é usar as credenciais da aplicação de um **usuário de teste**: coletor
e pagador ambos de teste, e aí o cartão de teste funciona.

**Consequência não óbvia — a guarda precisa mudar.** As credenciais de um usuário
de teste começam com `APP_USR-`, não `TEST-`, porque numa conta de teste as
credenciais "de produção" já SÃO de sandbox. E `modoDoToken()` decide só pelo
prefixo:

```ts
return token.startsWith('TEST-') ? 'teste' : 'producao';
```

Ou seja: `APP_USR-` num ambiente de teste é classificado como produção e
**recusado**. A troca de credenciais exige, junto, um ajuste no
`mercadopago-credencial.ts`. O ajuste NÃO pode ser só "aceitar APP_USR- quando
declararem que é teste" — isso viraria a porta pela qual credencial de produção
entra num ambiente de teste. Precisa de confirmação ONLINE pela tag `test_user`
(`verificarContaSandbox()` já faz essa consulta), com o declarativo servindo
apenas para dizer qual verificação aplicar.

**O webhook da etapa 5 herda isto.** `MP_WEBHOOK_SECRET` e a URL cadastrada passam
a ser os da aplicação **do usuário de teste**, não da conta real. Cada URL tem
segredo próprio, então trocar de aplicação troca o segredo.

**Preapprovals do coletor antigo viram inalcançáveis.** Elas pertencem ao coletor
que as criou; com a credencial nova, `GET /preapproval/{id}` responde 404. O
código não corrompe nada (404 → `nao_existe_no_mp`, sem alterar estado), mas as
linhas ficam `pendente` para sempre e o `sync` falha em todas. Elas devem ser
marcadas `expirada` — o mesmo estado terminal que a regra de 24h produziria —
preservando o rastro em vez de apagar linha de cobrança.

**Por que (a) e não (b):** a troca é o que transforma a autorização em sandbox num
**teste automatizado no CI**, em vez de um ritual manual a cada sessão. Esse é o
compromisso da etapa 5 — ainda NÃO cumprido no momento em que esta seção foi
escrita.

### 4.3 Notas de ambiente para testar por túnel

Repetem-se em toda sessão; custaram tempo até serem identificadas.

- **Use build de produção, não `next dev`.** O HMR do dev cria um WebSocket dentro
  de `hydrate()`; o `wss://` não sobe pelo quick tunnel e a hidratação não
  completa, deixando os formulários sem `onSubmit`. Não afeta produção.
- **`next start` roda com `NODE_ENV=production`** — sem `MP_AMBIENTE=teste` a
  guarda (corretamente) recusa a credencial de sandbox.
- **A conta de teste precisa de e-mail roteável.** `@sbgestor-test.local` é
  descartado pelo MP, e aí o checkout pede um e-mail que nunca casa com o dono da
  assinatura (`subscription-invalid-user`).
- **Bloqueadores de anúncio quebram o checkout do MP** (`ERR_BLOCKED_BY_CLIENT`) e
  podem barrar as chamadas ao Supabase a partir de um domínio de túnel, o que
  aparece disfarçado de erro de CORS.

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

---

## 9. O job de reconciliação: onde roda e como se sabe que parou

O job é a rede de segurança de tudo: reprocessa evento perdido, expira `pendente`
abandonada, vence período, suspende inadimplente, e **converge o valor** que o
`PUT` do MP perdeu. Se ele morre, nada quebra na hora — o sistema apenas para de
corrigir a si mesmo, em silêncio. É o pior tipo de falha.

### Onde roda: GitHub Actions, não Netlify Scheduled Functions

A diferença que decide é a notificação. **Workflow agendado que falha no GitHub
manda e-mail para o dono do repositório por padrão.** Scheduled Function da
Netlify falha para dentro do log — que é exatamente o cron vermelho há semanas
que ninguém viu.

O workflow é fino: chama `POST /api/billing/reconcile` no site, com um header de
segredo compartilhado (`RECONCILE_TOKEN`). A lógica fica no site, onde já existem
Prisma e Access Token; o Actions só puxa o gatilho e falha ruidosamente. De
quebra, **o endpoint pode ser chamado à mão** quando você quiser forçar.

Cadência: de hora em hora. Não há pressa — a folga até a próxima cobrança é de
dias — mas de hora em hora o desvio nunca envelhece muito.

### Como você descobre que parou

E-mail de falha resolve "rodou e deu erro". **Não resolve "deixou de rodar"** —
workflow desabilitado, arquivo renomeado, ou a regra do GitHub que **suspende
agendamentos após 60 dias sem atividade no repositório**. Nesses casos não há
falha: há ausência, e ausência não dispara nada.

Contra isso, um **batimento**: cada execução bem-sucedida grava o horário, e o
**próprio app avisa**. No topo do dashboard, se o último sucesso tem mais de 6
horas, aparece uma faixa:

> ⚠ A reconciliação de cobrança não roda desde 31/08 às 14h. Verifique o
> workflow `reconciliacao` no GitHub Actions.

É o mesmo espírito do lembrete semanal dos pedidos de exclusão: **usar um canal
que você já abre todo dia** em vez de construir um vigia que também pode morrer.
Só você vê a faixa (conta de operação), e ela não depende de e-mail, de serviço
externo, nem de alguém lembrar de olhar um painel.

Se um dia você quiser aviso por push sem abrir o app, o encaixe natural é um
dead-man's switch (healthchecks.io tem plano gratuito): o job dá um `curl` no fim
e o serviço te e-mail quando o ping não chega. É um serviço a mais — por isso
fica como opção, não como proposta.

## 10. Alerta de divergência persistente

`tentativas_sync` cresce a cada ciclo em que `valor_centavos_mp` continua
diferente de `valor_centavos`. Passando de **3 tentativas**, é dinheiro errado: o
MP está cobrando um valor que não é o que combinamos.

A forma mais simples que de fato funciona, sem nada novo: **o job termina com
código de saída diferente de zero.** O workflow fica vermelho e o GitHub te manda
e-mail — o mesmo caminho de notificação que já existe, sem serviço adicional,
sem integração, sem chave nova.

```
🛑 divergência persistente em 1 assinatura(s):
   decorator=9c1a32e6… preapproval=abc123 desejado=R$ 149,90 no_MP=R$ 99,90 tentativas=4
   → confira em https://www.mercadopago.com.br/subscriptions e force com
     POST /api/billing/reconcile
```

O job **continua processando as outras** antes de sair com erro: uma divergência
não pode impedir a reconciliação do resto. E a mesma linha sai no log com a
etiqueta `[COBRANCA-DIVERGENTE]`, para busca nos logs de Functions.

A divergência também aparece na faixa do dashboard, pelo mesmo motivo do batimento:
e-mail se perde, o app você abre.

## 8. Plano de implementação

| # | Etapa | Depende de |
|---|---|---|
| 0 | ~~Validar em sandbox~~ **concluído** — ver 1.5 | — |
| 1 | Migration no banco de **teste** + modelos Prisma | revisão deste documento |
| 2 | ~~`src/lib/mercadopago.ts` + provas estáticas das chaves~~ **concluída** | 1 |
| 3 | ~~`aplicarEstadoDaAssinatura()` — o coração idempotente~~ **concluída** | 2 |
| 4 | ~~`POST /api/billing/subscribe` + tela `/assinatura` + retorno com polling~~ **concluída** | 3 |
| 5 | Webhook: assinatura, idempotência, 200 rápido + harness que assina sozinho | 3 |
| 6 | `requireAssinaturaAtiva` + classificação das rotas em 3 camadas + teste estático | 3 |
| 7 | Cancelamento + oferta de retenção + volta ao valor cheio | 0, 3 |
| 8 | Job de reconciliação (seção 9) + batimento no dashboard + alerta de divergência (seção 10) | 3 |
| 9 | Migration em **produção** (após dump) e deploy | tudo verde |

Reembolso do primeiro mês (Termos 6.4) fica **manual via painel do MP** na
primeira versão: é raro, tem julgamento envolvido, e automatizar devolução de
dinheiro sem necessidade é risco à toa. O sistema só marca quem está na janela.
