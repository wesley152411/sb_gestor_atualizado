# Testes de isolamento multi-conta

Provam, de forma automática, que uma conta não lê/escreve dados de outra — validando
o **caminho logado** (cookie de sessão real do Supabase), que antes só dava para testar
manualmente no navegador.

## Como rodar

1. Suba o app localmente (as rotas precisam estar no ar):
   ```
   npm run dev
   ```
2. Em outro terminal:
   ```
   npm test
   ```
   (Opcional: `TEST_BASE_URL=https://sbgestor.netlify.app npm test` para rodar contra produção.)

O harness lê `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` e `DATABASE_URL`
do `.env.local`.

## Como funciona

- Cria contas de teste reais (`signUp` auto-confirma) e obtém o **cookie de sessão** usando
  o mesmo `@supabase/ssr` do servidor — então o teste bate nas rotas exatamente como um
  usuário logado.
- Exercita as rotas e afirma o isolamento: 401 sem sessão, A não vê B, parâmetro forjado
  rejeitado, chat só para participantes, DELETE só do dono, feed do Marketplace só público.
- No fim, **apaga as linhas de decoradora de teste** (cascata limpa clientes, eventos,
  itens, kits, pedidos e chats).

## Limitações (sem service_role)

- Não há um projeto Supabase de teste separado: as contas são criadas no **mesmo banco**
  e limpas depois.
- Sem `service_role`, os **usuários de Auth** de teste não podem ser apagados — ficam
  órfãos (sem linha de decoradora, portanto invisíveis no app), mas **acumulam** a cada run.
- Recomendado a médio prazo: um projeto Supabase de teste **ou** uma `service_role` (só em
  ambiente de teste/CI, nunca no bundle do cliente) para permitir `admin.deleteUser` na limpeza.
