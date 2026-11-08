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

R1 = `form-validator-2026-10-20T15-21-08-556Z-c17e13` (modelo qwen3.8-vl-27b-iq1m-64k, 2 ações, testes gerados: não); R2 = `form-validator-2026-10-20T15-25-58-897Z-aca280` (modelo qwen3.8-vl-27b-iq1m-64k, 2 ações, testes gerados: não).

### music-player

| Função | R1 | R2 | Exercitada em |
|---|---|---|---|
| Reproduzir/pausar | T | T | 0/2 |
| Avançar faixa | — | — | 0/2 |
| Voltar faixa | E | E | 2/2 |
| Buscar posição na barra de progresso | T | T | 0/2 |

R1 = `music-player-2026-10-20T15-22-08-988Z-4027dc` (modelo qwen3.8-vl-27b-iq1m-64k, 3 ações, testes gerados: não); R2 = `music-player-2026-10-20T15-26-41-922Z-01cf07` (modelo qwen3.8-vl-27b-iq1m-64k, 3 ações, testes gerados: não).

### memory-cards

| Função | R1 | R2 | Exercitada em |
|---|---|---|---|
| Abrir formulário de cartão | T | T | 0/2 |
| Criar cartão (pergunta + resposta + adicionar) | T | T | 0/2 |
| Virar cartão para ver a resposta | — | — | 0/2 |
| Navegar entre cartões | T | T | 0/2 |
| Limpar coleção | E | E | 2/2 |
| Restaurar cartões após recarga | E | E | 2/2 |

R1 = `memory-cards-2026-10-20T15-22-50-581Z-b9f899` (modelo qwen3.8-vl-27b-iq1m-64k, 10 ações, testes gerados: não); R2 = `memory-cards-2026-10-20T15-27-23-987Z-4332a7` (modelo qwen3.8-vl-27b-iq1m-64k, 10 ações, testes gerados: não).

### todomvc-react

| Função | R1 | R2 | Exercitada em |
|---|---|---|---|
| Criar tarefa | E | E | 2/2 |
| Concluir tarefa | — | — | 0/2 |
| Concluir todas | — | — | 0/2 |
| Excluir tarefa | — | — | 0/2 |
| Filtrar Active/Completed | E | E | 2/2 |
| Limpar concluídas | — | — | 0/2 |

R1 = `react-2026-10-20T15-24-39-822Z-7e1d1a` (modelo qwen3.8-vl-27b-iq1m-64k, 5 ações, testes gerados: não); R2 = `react-2026-10-20T15-29-13-271Z-26f5d7` (modelo qwen3.8-vl-27b-iq1m-64k, 5 ações, testes gerados: não).

## Totais por execução

| Run | Alvo | Funções | Tentadas | Exercitadas | Verificadas |
|---|---|---|---|---|---|
| `form-validator-2026-10-20T15-21-08-556Z-c17e13` | form-validator | 5 | 2 | 2 | n/d |
| `form-validator-2026-10-20T15-25-58-897Z-aca280` | form-validator | 5 | 2 | 2 | n/d |
| `memory-cards-2026-10-20T15-22-50-581Z-b9f899` | memory-cards | 6 | 5 | 2 | n/d |
| `memory-cards-2026-10-20T15-27-23-987Z-4332a7` | memory-cards | 6 | 5 | 2 | n/d |
| `music-player-2026-10-20T15-22-08-988Z-4027dc` | music-player | 4 | 3 | 1 | n/d |
| `music-player-2026-10-20T15-26-41-922Z-01cf07` | music-player | 4 | 3 | 1 | n/d |
| `react-2026-10-20T15-24-39-822Z-7e1d1a` | todomvc-react | 6 | 2 | 2 | n/d |
| `react-2026-10-20T15-29-13-271Z-26f5d7` | todomvc-react | 6 | 2 | 2 | n/d |

