# Matriz função × execução

Referência: `diverse-contexts-functions-v1` (definida em 2026-11-07). Funções definidas a partir do código-fonte e da finalidade dos alvos (revisões fixadas por scripts/setup-evaluation-targets.cjs). Para a coleta de 20/10/2026 esta matriz é uma auditoria retroativa: a definição é posterior à coleta. Para coletas iniciadas depois de definedAt, ela é a referência congelada.

Legenda: **—** não tentada; **T** tentada; **E** exercitada com mudança de estado citada; **V** verificada por asserção gerada. Níveis são cumulativos. Contagens de ações ou de objetivos QA internos não entram nesta matriz.

### memory-cards

| Função | R1 | Exercitada em |
|---|---|---|
| Abrir formulário de cartão | T | 0/1 |
| Criar cartão (pergunta + resposta + adicionar) | T | 0/1 |
| Virar cartão para ver a resposta | — | 0/1 |
| Navegar entre cartões | — | 0/1 |
| Limpar coleção | E | 1/1 |
| Restaurar cartões após recarga | E | 1/1 |

R1 = `memory-cards-2026-11-08T01-19-59-899Z-99ecdf` (modelo e2p-vl-qwen3-4b-16k, 10 ações, testes gerados: sim).

## Totais por execução

| Run | Alvo | Funções | Tentadas | Exercitadas | Verificadas |
|---|---|---|---|---|---|
| `memory-cards-2026-11-08T01-19-59-899Z-99ecdf` | memory-cards | 6 | 4 | 2 | 0 |

