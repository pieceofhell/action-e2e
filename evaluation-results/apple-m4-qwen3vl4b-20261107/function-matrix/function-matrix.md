# Matriz função × execução

Referência: `diverse-contexts-functions-v1` (definida em 2026-11-07). Funções definidas a partir do código-fonte e da finalidade dos alvos (revisões fixadas por scripts/setup-evaluation-targets.cjs). Para a coleta de 20/10/2026 esta matriz é uma auditoria retroativa: a definição é posterior à coleta. Para coletas iniciadas depois de definedAt, ela é a referência congelada.

Legenda: **—** não tentada; **T** tentada; **E** exercitada com mudança de estado citada; **V** verificada por asserção gerada. Níveis são cumulativos. Contagens de ações ou de objetivos QA internos não entram nesta matriz.

### form-validator

| Função | R1 | R2 | Exercitada em |
|---|---|---|---|
| Validar nome de usuário | E | E | 2/2 |
| Validar e-mail | — | — | 0/2 |
| Validar comprimento da senha | — | — | 0/2 |
| Conferir confirmação de senha | — | — | 0/2 |
| Submeter e exibir mensagens | E | E | 2/2 |

R1 = `form-validator-2026-11-08T00-55-59-588Z-f2fb5d` (modelo e2p-vl-qwen3-4b-16k, 2 ações, testes gerados: não); R2 = `form-validator-2026-11-08T01-06-19-304Z-86db46` (modelo e2p-vl-qwen3-4b-16k, 2 ações, testes gerados: não).

### music-player

| Função | R1 | R2 | Exercitada em |
|---|---|---|---|
| Reproduzir/pausar | T | T | 0/2 |
| Avançar faixa | — | — | 0/2 |
| Voltar faixa | E | E | 2/2 |
| Buscar posição na barra de progresso | T | T | 0/2 |

R1 = `music-player-2026-11-08T00-57-45-113Z-724262` (modelo e2p-vl-qwen3-4b-16k, 3 ações, testes gerados: não); R2 = `music-player-2026-11-08T01-09-00-125Z-b1896c` (modelo e2p-vl-qwen3-4b-16k, 3 ações, testes gerados: não).

### memory-cards

| Função | R1 | R2 | Exercitada em |
|---|---|---|---|
| Abrir formulário de cartão | T | T | 0/2 |
| Criar cartão (pergunta + resposta + adicionar) | T | T | 0/2 |
| Virar cartão para ver a resposta | — | — | 0/2 |
| Navegar entre cartões | — | — | 0/2 |
| Limpar coleção | E | E | 2/2 |
| Restaurar cartões após recarga | E | E | 2/2 |

R1 = `memory-cards-2026-11-08T00-59-33-922Z-08c653` (modelo e2p-vl-qwen3-4b-16k, 7 ações, testes gerados: não); R2 = `memory-cards-2026-11-08T01-10-54-237Z-e478bc` (modelo e2p-vl-qwen3-4b-16k, 10 ações, testes gerados: não).

### todomvc-react

| Função | R1 | R2 | Exercitada em |
|---|---|---|---|
| Criar tarefa | E | E | 2/2 |
| Concluir tarefa | — | — | 0/2 |
| Concluir todas | — | — | 0/2 |
| Excluir tarefa | — | — | 0/2 |
| Filtrar Active/Completed | E | E | 2/2 |
| Limpar concluídas | — | — | 0/2 |

R1 = `react-2026-11-08T01-02-50-803Z-c229fe` (modelo e2p-vl-qwen3-4b-16k, 5 ações, testes gerados: não); R2 = `react-2026-11-08T01-14-53-148Z-d24578` (modelo e2p-vl-qwen3-4b-16k, 5 ações, testes gerados: não).

## Totais por execução

| Run | Alvo | Funções | Tentadas | Exercitadas | Verificadas |
|---|---|---|---|---|---|
| `form-validator-2026-11-08T00-55-59-588Z-f2fb5d` | form-validator | 5 | 2 | 2 | n/d |
| `form-validator-2026-11-08T01-06-19-304Z-86db46` | form-validator | 5 | 2 | 2 | n/d |
| `memory-cards-2026-11-08T00-59-33-922Z-08c653` | memory-cards | 6 | 4 | 2 | n/d |
| `memory-cards-2026-11-08T01-10-54-237Z-e478bc` | memory-cards | 6 | 4 | 2 | n/d |
| `music-player-2026-11-08T00-57-45-113Z-724262` | music-player | 4 | 3 | 1 | n/d |
| `music-player-2026-11-08T01-09-00-125Z-b1896c` | music-player | 4 | 3 | 1 | n/d |
| `react-2026-11-08T01-02-50-803Z-c229fe` | todomvc-react | 6 | 2 | 2 | n/d |
| `react-2026-11-08T01-14-53-148Z-d24578` | todomvc-react | 6 | 2 | 2 | n/d |

