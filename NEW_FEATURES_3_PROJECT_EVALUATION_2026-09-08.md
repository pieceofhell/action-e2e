# Avaliação das novas features — 3 projetos

Data: 2026-09-08  
Modelo: `qwen3.8-vl-27b-iq1m-64k`, via `llama.cpp` Vulkan, contexto configurado em 65.536 tokens  
Fluxo: operação integral pela interface gráfica do E2P — seleção do projeto, inspeção, exploração, revisão/aprovação do plano, geração Playwright e execução.  
Navegador externo: o conector da sessão disponibilizou apenas o navegador integrado, não o Firefox. O explorador isolado interno do E2P continuou usando Playwright/Chromium, conforme a implementação atual.

Projetos escolhidos:

1. Dopa — navegação e estados de catálogo/favoritos.
2. Expense Tracker — entrada, cálculo e persistência em `localStorage`.
3. Typing Game — temporização, cálculo, seleção e persistência.

## 1. Dopa

Run: `prototype-runs/dopa-2026-09-08T11-42-34-893Z`

### Exploração

- 2 ações concluídas: preenchimento de `Buscar produtos` e confirmação por Enter.
- 6 estados distintos observados.
- Encerramento: limite total de tempo.
- 10 tentativas de clique ficaram indisponíveis após a observação, evidenciando instabilidade entre a catalogação do DOM e a hidratação/atualização da aplicação.
- Relógio da aplicação isolado durante 12 decisões do modelo; 87.653 ms de latência do modelo não avançaram o tempo da aplicação.
- Cobertura QA: 3/5 objetivos cobertos, 1 parcial, 1 descoberto; score ponderado de 68%.
- Lacuna alta: `primary-activation`.

Objetivos marcados como cobertos: `input-interaction`, `input-commit` e `calculated-state`. O último precisa de auditoria: a transição de busca não representa necessariamente um cálculo funcional, embora números no texto tenham mudado. Esta run revelou risco de falso crédito na heurística numérica.

### Casos e execução

- O planejador gerou um fluxo de busca com duas ações observadas.
- Cobertura das oportunidades de ação no plano: 2/2 (100%).
- 1 teste Playwright gerado.
- Resultado: 0 aprovados, 1 falhou.
- Classe: `behavior-assertion`.
- Motivo objetivo: a aplicação exibiu um `vite-error-overlay`; o contrato de abertura exige ausência de overlay de desenvolvimento.

### Caça de bugs

Uma hipótese foi retida: `Unhandled TypeError in image optimization worker during page load`.

Evidência:

- erro visível `Cannot read properties of undefined (reading 'fetch')`;
- origem registrada em `worker/index.ts:35`, durante otimização de imagens;
- erro de console HTTP 500;
- mesma assinatura reproduzida em sessão limpa;
- três outras hipóteses foram rejeitadas pelo contrato de evidência.

Julgamento: candidato forte e coerente a defeito de runtime/configuração do Dopa no ambiente suportado pela run. Ainda não é correto chamá-lo de bug funcional confirmado da busca. A falha é independente das suposições do fluxo, é visível ao usuário e foi reproduzida, mas permanece marcada como hipótese até validação humana/execução em um ambiente de referência.

### Resultado parcial sobre as novas features

Houve ganho de transparência: a run distinguiu claramente cobertura QA, lacuna prioritária, falha do teste, erro de runtime e hipótese reproduzida. Ao mesmo tempo, revelou duas fragilidades concretas da implementação nova: o orçamento continua consumindo tempo de inferência mesmo quando o relógio da aplicação está pausado, e a detecção genérica de mudança numérica pode creditar `calculated-state` indevidamente.

## 2. Expense Tracker

Run: `prototype-runs/expense-tracker-2026-09-08T11-53-53-009Z`

### Exploração

- 4 ações concluídas: preencher `Text` com `a`, pressionar Enter, clicar `Add transaction` e recarregar a página.
- 2 estados distintos observados.
- Encerramento: ações seguras esgotadas.
- Relógio isolado em 4 decisões; 22.847 ms de latência do modelo não avançaram a aplicação.
- Cobertura QA: 4/7 objetivos cobertos, 3 parciais, nenhum totalmente descoberto; score ponderado de 76%.
- Cobertos: `input-interaction`, `input-commit`, `primary-activation`, `persistence-reload`.
- Parciais: `overlay-lifecycle`, `validation-boundary`, `calculated-state`.

A exploração encontrou corretamente, pela leitura do projeto, que cálculo e `localStorage` são capacidades centrais. Entretanto, a política atual considera `input[type=number]` inseguro. O campo `Amount` não entrou no catálogo utilizável, impedindo a criação válida de uma transação, a alteração de saldo e a persistência real.

### Casos e execução

- 2 fluxos gerados e aprovados automaticamente pela interface:
  - entrada/commit do texto;
  - recarga após a tentativa de adição.
- 2 testes Playwright gerados.
- Resultado: 2 aprovados, 0 falharam.

O teste de reload compilou e executou a nova ação corretamente. Porém, ele confirmou que o texto não submetido foi apagado e que os valores permaneceram em zero. Isso não verifica a capacidade documentada de persistir transações. O relatório do modelo chegou a dizer que a persistência foi validada, embora o próprio critério revele o contrário.

### Caça de bugs

- 0 hipóteses retidas.
- 1 hipótese rejeitada pelo contrato de evidência.
- Nenhum erro de runtime observado.

Julgamento: não há bug válido encontrado nesta run. Também não há base para concluir que o Expense Tracker esteja correto, porque seu fluxo central — texto + valor numérico + submissão + saldo + reload — não foi executado.

### Resultado parcial sobre as novas features

O ganho é real no mecanismo: o risco de persistência foi detectado, priorizado, executado, compilado e exibido no relatório. A qualidade semântica ainda é insuficiente. Duas correções são prioritárias:

1. permitir entradas numéricas ordinárias com limites seguros e valores gerados pelo E2P;
2. considerar `persistence-reload` coberto somente quando um estado de domínio muda antes do reload e o mesmo estado relevante é preservado depois dele. A mera execução de `reload` não basta.

## 3. Typing Game

Run: `prototype-runs/typing-game-2026-09-08T11-59-57-372Z`

### Exploração

- 6 ações concluídas: preencher parcialmente a palavra, pressionar Enter, selecionar dificuldade `hard`, abrir configurações, esperar 7 segundos e recarregar.
- 7 estados distintos observados.
- Encerramento: ações seguras esgotadas.
- Relógio isolado em 6 decisões; 37.594 ms de latência do modelo não avançaram o cronômetro.
- O estado `Time ran out` apareceu somente depois da espera explícita, demonstrando que o isolamento temporal funcionou como pretendido.
- Cobertura QA: 7/9 objetivos cobertos e 2 parciais; score ponderado de 88,3%.
- Cobertos: entrada, commit, seleção, ativação, limite temporal, reload/persistência e estado calculado.
- Parciais: lifecycle de overlay e limite de validação.

O crédito de `calculated-state` também é discutível aqui: a alteração numérica observada foi principalmente a contagem regressiva, não uma mudança de score produzida pela digitação correta. Isso confirma que a heurística numérica precisa distinguir o elemento/capacidade à qual o número pertence.

### Revisão humana dos casos

O modelo propôs 5 fluxos. Como um usuário/revisor real, foram aprovados somente 3:

- expiração do timer e game over;
- seleção de dificuldade;
- ativação do painel de configurações.

Foram rejeitados:

- input/commit de uma única letra, por não exercitar a mecânica central de acertar uma palavra;
- persistência/reload, porque exigia que a palavra aleatória seguinte fosse diferente e descrevia um clique no botão Reload embora a ação observada fosse uma recarga do navegador.

### Execução

- 3 testes Playwright gerados.
- Resultado: 3 aprovados, 0 falharam.
- O passo temporal foi compilado como `waitForTimeout(7000)` e executou com sucesso.

Apesar disso, o teste chamado `Timer Expiry and Game Over` terminou verificando apenas que o input ainda continha `w`. Ele não afirmou `Time ran out`, score final ou presença do botão Reload. Os testes de dificuldade e configurações também terminaram verificando o mesmo valor do input, não o estado semanticamente nomeado pelo fluxo.

Julgamento: o mecanismo de exploração temporal melhorou de forma material; a geração de asserções ainda perde o objetivo do caso ao preferir uma evidência fácil (`toHaveValue`) em vez do estado terminal que motivou o fluxo. Portanto, 3/3 aprovados não representam 3 objetivos funcionais devidamente verificados.

### Caça de bugs

Uma hipótese foi retida: `Timer does not stop when typing is incomplete`.

O comportamento observado é real e reproduzível: o timer continua e a letra parcial não aumenta o score. A expectativa inferida, entretanto, é inadequada. Em um jogo de digitação contra o relógio, é normal que o tempo continue enquanto o jogador ainda não completou a palavra. O código e a descrição do projeto suportam exatamente esse comportamento.

Julgamento: falso positivo claro. O replay reproduziu a observação, mas não validou a expectativa. O revisor conservador repetiu a mesma suposição do autor e não atuou como falsificador independente.

## Resultado consolidado

| Projeto | Ações | Estados | Cobertura QA | Testes | Hipóteses | Julgamento de bugs |
|---|---:|---:|---:|---:|---:|---|
| Dopa | 2 | 6 | 3/5, 68% | 0/1 passou | 1 | candidato forte de runtime, não confirmado |
| Expense Tracker | 4 | 2 | 4/7, 76,4% | 2/2 passaram | 0 | nenhum bug encontrado; fluxo central não exercitado |
| Typing Game | 6 | 7 | 7/9, 88,3% | 3/3 passaram | 1 | falso positivo claro |
| Total | 12 | 15 | 14 objetivos cobertos, 6 parciais, 1 descoberto | 5/6 passaram | 2 | 1 candidato válido, 1 falso positivo, 0 bugs confirmados |

O isolamento de tempo ocorreu em 22 decisões e impediu que aproximadamente 148 segundos de inferência alterassem silenciosamente os aplicativos.

## Conclusão: melhorou?

Sim, a exploração melhorou. Antes, o E2P frequentemente permanecia em jornadas superficiais; agora ele conseguiu descobrir e executar uma recarga baseada em `localStorage`, atravessar deliberadamente o limite de um cronômetro, variar um `select` e expor lacunas por prioridade. O Typing Game é a demonstração mais forte dessa melhoria.

Ainda não melhorou o suficiente na validade semântica dos testes e dos bugs. As métricas de cobertura concedem crédito pela presença de uma ação, não pela satisfação da intenção do objetivo. O compilador escolhe uma asserção observável fácil, mesmo quando não corresponde ao título/critério do fluxo. O crítico de bugs pode ratificar a mesma expectativa inventada pelo caçador.

### Prioridades resultantes desta avaliação

1. **Cobertura por efeito, não por ação:** persistência precisa comparar estado de domínio antes/depois; cálculo precisa associar o número alterado ao score/saldo/campo correspondente; seleção precisa verificar o valor selecionado após reload quando a persistência for o objetivo.
2. **Contrato entre caso e asserção:** o gerador deve provar que ao menos uma asserção corresponde ao estado e às palavras-chave verificáveis do critério. `Timer Expiry` não pode terminar afirmando somente o valor de um input.
3. **Entradas seguras tipadas:** permitir `number`, `date`, ranges e valores enumerados com limites determinísticos. Bloquear todo campo numérico torna inviáveis finanças, carrinhos, quantidades e calculadoras simples.
4. **Crítico adversarial com evidência negativa:** exigir que o crítico procure no README/código uma explicação normal para o comportamento antes de reter a hipótese. Replay de observação não deve aumentar a validade da expectativa.
5. **Orçamento separado:** medir e limitar tempo da aplicação, tempo de inferência e tempo total separadamente. No Dopa, 87,6 segundos foram corretamente isolados do app, mas ainda consumiram o teto global e reduziram a cobertura prática.
6. **Hidratação e recatalogação:** estabilizar controles antes de lhes atribuir IDs e utilizar uma estratégia de relocalização semântica quando frameworks substituem nós após a observação. O Dopa teve 10 ações indisponíveis.

## Veredito

A nova implementação agrega valor principalmente como mecanismo de exploração orientada a risco e como instrumento de transparência. Ela ainda não sustenta, sozinha, a afirmação de que um risco foi funcionalmente testado nem de que uma hipótese reproduzida é um bug válido. A run revelou um candidato plausível no Dopa, nenhum bug no Expense Tracker e um falso positivo no Typing Game.

