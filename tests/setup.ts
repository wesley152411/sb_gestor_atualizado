// setupFile do Vitest: roda ANTES de qualquer teste. Importa os helpers (que
// carregam o .env) e então aplica a guarda — se o alvo não for o banco de teste,
// nenhum teste chega a rodar.
import './helpers'; // efeito colateral: loadEnv() popula process.env
import { assertTestDatabase } from './guard';

assertTestDatabase();
