# Inventário de dados pessoais — SB Gestor

> Lista CRUA para redigir política de privacidade e termos. Sem redação jurídica.
> Gerado a partir do schema (`prisma/schema.prisma`), dos logs e da infra em 2026-08-28.
> **Dois titulares distintos:** a **decoradora** (cliente do SB Gestor) e a **cliente
> final** dela (quem contrata a festa). O SB Gestor é operador dos dados da cliente
> final em nome da decoradora.

## 1. Campos de dado pessoal por tabela

### Dados da DECORADORA (usuária do sistema)
- **`decorators`**: `name` (nome/empresa), `location` (cidade-UF), `instagram`,
  `whatsapp`, `phone`, `about` (texto livre), `avatar_url`, `cover_url`, `logo_url`
  (URLs de fotos no Storage). *(Não pessoais: membership_level, reach, contact_rate,
  positive_reviews, is_internal, promo_message_template.)*
- **`auth.users`** (Supabase Auth, FORA do Prisma): `email` (login), `encrypted_password`,
  e `raw_user_meta_data` com **`name`, `company_name`, `location`, `cnpj`, `phone`**.
  ⚠️ **CNPJ e company_name existem SÓ aqui** — não há coluna deles em `decorators`.
- **`forum_posts`**: `title`, `content` (conteúdo escrito pela decoradora; pode conter
  dado pessoal se ela digitar). `author_id` = decoradora.
- **`rental_orders` / `rental_order_items`**: relação B2B entre decoradoras
  (`owner_id`/`renter_id`), `total_value`, `observation`. Sem dado da cliente final.

### Dados da CLIENTE FINAL (da decoradora)
- **`clients`**: `name`, `phone`, `email`, `cpf`, `address`. *(decorator_id = dona.)*
- **`party_events`** (orçamento/evento): `client_name`, `phone`, `address` — **duplicados**
  do formulário público que a cliente preenche. Também `theme`, `event_date`,
  `observation`, `items` (JSON com itens do orçamento — não pessoal). `public_token`
  (link do orçamento).
- **`client_promo_messages`**: `phone` (da cliente), `message` (texto enviado no
  WhatsApp), `sent_at`. Histórico de reativação.

### Coletados transitoriamente (NÃO armazenados crus)
- **Geolocalização (GPS)**: usada no cadastro/configurações para derivar "Cidade - UF";
  só o rótulo textual é salvo em `decorators.location`. As coordenadas não são gravadas.
- **Foto de perfil / imagens de item**: enviadas ao Supabase Storage (ver §4).

## 2. Terceiros que recebem/processam os dados + país dos servidores

| Terceiro | O que processa | Servidores / país |
|---|---|---|
| **Supabase** (Postgres + Auth + Storage) | TODOS os dados das tabelas, e-mail/senha de login, `user_metadata` (CNPJ etc.), fotos | AWS **us-west-2 = Oregon, EUA**. Empresa: Supabase Inc. (EUA) |
| **Netlify** (hospedagem + Functions) | Serve o app; as Functions processam as requisições (recebem os dados em trânsito) + **logs com IP** | AWS, **EUA** (Functions provavelmente us-east-1 — confirmar no painel); CDN global |
| **Cloudflare Turnstile** (CAPTCHA) | Sinais do navegador da pessoa no login/cadastro/recuperação (não recebe e-mail/senha) | Edge **global** da Cloudflare; empresa nos **EUA** |
| **Upstash** (Redis — rate limiting) | **Endereço IP** de quem acessa rotas públicas (chave de contagem, com TTL de 1 min/1 h) | Primário em **São Paulo (sa-east-1), Brasil**, tipo "Global" (replicado); empresa nos EUA |
| **Mercado Pago** (pagamentos — QUANDO ENTRAR) | Dados de pagamento da decoradora (cartão/CPF/cobrança) — a definir na integração | América Latina (Argentina/Brasil) |

## 3. Exclusão de uma decoradora — o que cai em cascata e o que sobra

Apagar a linha em `decorators` **apaga em cascata** (FK `onDelete: Cascade`):
- `clients`, `party_events`, `kits`, `inventory_items`, `consumables`, `forum_posts`
- `chat_messages` (como remetente E destinatário)
- `rental_orders` (como owner E renter) → e `rental_order_items` junto
- `client_promo_messages`
- ⇒ **os dados da cliente final gravados em `party_events` (client_name/phone/address)
  também são apagados**, porque `party_events.decorator_id` é Cascade.

**O que NÃO é apagado (sobra):**
- **`auth.users`** — a linha de login da decoradora (**e-mail, senha criptografada,
  `user_metadata` com CNPJ/nome/telefone**) **fica órfã**. Não há FK de `decorators`
  para `auth.users`; apagar `decorators` não apaga o login. *(É o mesmo motivo pelo qual
  as não confirmadas acumulam — ver `scripts/cleanup-unconfirmed.cjs`.)*
- **Arquivos no Supabase Storage** — avatar, capa, logo e imagens de itens **permanecem**
  nos buckets (Storage é separado do banco; sem cascata).
- **Logs e chaves externas** (ver §4) — não são apagados pela exclusão da decoradora.

> Nuance: apagar só um **`clients`** (não a decoradora) faz `party_events.client_id`
> virar NULL (SetNull), mas o evento **permanece** com `client_name/phone/address`
> embutidos. Ou seja, apagar o cliente NÃO apaga o dado dele nos orçamentos.

## 4. Dado pessoal FORA das tabelas principais

- **Supabase Auth (`auth.users`)**: e-mail, senha criptografada, `user_metadata`
  (nome, company_name, CNPJ, telefone, location). É o repositório de login — não é uma
  "tabela do app", mas guarda dado pessoal.
- **Supabase Storage** (buckets **`avatars`** e **`inventory`**): fotos de perfil da
  decoradora e imagens dos itens do acervo. URLs públicas.
- **Logs das Netlify Functions**: o proxy loga o **IP** de quem acessa rotas públicas
  (`/api/public/*`) — inclui o **IP da cliente final** ao abrir o link de orçamento.
  Linhas `[rate-limit] … ip=…` em `src/proxy.ts`. Retidas conforme a política de logs
  da Netlify (verificar o prazo no plano).
- **Upstash Redis**: guarda o **IP** como chave de rate limit (`rl:pub:get:<ip>` etc.),
  com **TTL curto** (expira em 1 min / 1 h). É dado pessoal transitório.
- **Logs do Supabase Auth**: registram **IP e e-mail** em eventos de login/cadastro
  (retenção conforme o plano do Supabase).
- **Cloudflare Turnstile**: processa sinais do navegador/IP para decidir o desafio;
  retenção conforme a Cloudflare (não recebe e-mail/senha do formulário).

## 4b. Exclusão total — como é feita hoje (fecha o gap do §3)

Rotina: **`scripts/delete-decorator.cjs`** (dry-run por padrão, `--expect-ref`, nunca
automático — sempre acionada manualmente). Um comando cobre as três camadas:
1. **Tabelas** — apaga a linha em `decorators`; o FK leva o resto em cascata (§3).
2. **Login** — `DELETE FROM auth.users` (leva e-mail, senha e o `raw_user_meta_data`
   com **CNPJ e company_name**).
3. **Storage** — remove os objetos dos buckets `avatars` e `inventory` sob `<id>/`
   via API de Storage (exige `SUPABASE_SERVICE_ROLE_KEY` de prod — sem ela o passo é
   recusado, para a exclusão não ficar incompleta e silenciosa).

O que **permanece** e **não temos como apagar** (limitação declarável na política):

| Terceiro | O que fica | Retenção (auto-expira) |
|---|---|---|
| **Netlify** (logs de função) | IP em `[rate-limit] … ip=…` | curta, ~dias; sem Log Drain não é exportada — **confirmar o prazo no plano** |
| **Supabase Auth** (logs) | IP + e-mail de eventos de login/cadastro | por plano: **Free ≈ 1 dia**, Pro ≈ 7 dias |
| **Upstash** (rate limit) | IP como chave | **≤ 1 h** pelo TTL (janelas de 1 min / 1 h) — some sozinho |

Ou seja: após a exclusão, os dados nas tabelas + login + fotos somem na hora; nos
logs de terceiros o IP/e-mail residual **expira sozinho** nos prazos acima e não há
purge manual. Isso é o que entra na política como limitação.

## 5. Pontos de atenção para os documentos (crus)
- Transferência internacional: a maior parte dos dados vai para os **EUA** (Supabase,
  Netlify, Cloudflare). O Redis (IPs) fica no **Brasil**. Mercado Pago, América Latina.
- Exclusão não é completa hoje: **login (auth.users) e fotos (Storage) sobram** após
  apagar a decoradora — precisa de rotina/decisão se a política prometer exclusão total.
- IP é dado pessoal (LGPD) e aparece em logs (Netlify/Supabase) e no Upstash.
- CNPJ vive só no `user_metadata` do Auth — lembrar disso em qualquer pedido de exclusão/
  portabilidade.
