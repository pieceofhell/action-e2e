# Reteste do E2P com Qwen 3.8 27B quantizado

Data: 5 de setembro de 2026

## Objetivo desta avaliação

O objetivo do E2P não é apenas abrir uma página e gerar smoke tests. Para projetos web simples a moderados, a pipeline pretendida é:

1. entender o projeto e suas capacidades;
2. explorar a aplicação em execução;
3. derivar casos de teste da exploração;
4. gerar e executar testes automatizados;
5. caçar bugs e julgar se os achados são sustentados por evidência.

Esta rodada comparou o conjunto anterior, `qwen2.5vl:7b` como autor/explorador e `gemma3:12b` como crítico via Ollama, com `Qwen3.8-VL-27B-UD-IQ1_M` servido diretamente por `llama.cpp`, com 65.536 tokens de contexto. O modelo atual foi medido em aproximadamente 50 tokens/s em respostas curtas e 47–50 tokens/s nas chamadas desta rodada. A velocidade de geração, entretanto, não equivale à velocidade da pipeline inteira.

## Resumo executivo

O modelo atual demonstrou melhor capacidade para ler valores dinâmicos e escolher ações semanticamente relevantes, mas não demonstrou melhora consistente na taxa de bugs reais encontrados. Antes das correções de integração, duas das três pipelines pararam no planejamento por JSON inválido ou vazio. Depois das correções, Speech Text Reader e Typing Game completaram sem erros estruturados.

O ganho comprovado desta rodada veio principalmente da engenharia da pipeline:

- esquema JSON estrito no `llama.cpp`;
- limites de saída por estágio;
- agrupamento de controles visualmente equivalentes;
- revisão de dois estados por lote;
- remoção de advertências obsoletas entre estágios.

O resultado final é uma pipeline mais estável e uma exploração mais eficiente. Ainda não é possível afirmar que o novo modelo tornou o E2P um caçador autônomo de bugs mais competente. O único bug válido retido nos três projetos foi o erro de runtime do Music Player, promovido por uma regra determinística que já funcionava com o conjunto anterior.

## Comparação quantitativa

As linhas “anterior corrigido” usam a versão da pipeline após os gates determinísticos introduzidos na iteração anterior, para evitar comparar o novo modelo apenas contra bugs já corrigidos no E2P.

| Projeto e configuração | Ações / estados | Caça de bugs | Testes | Duração total |
|---|---:|---|---:|---:|
| Music Player — anterior corrigido | 2 / 2 | 1 diagnóstico real retido | 1/1 passou | 65,0 s |
| Music Player — Qwen 27B | 2 / 2 | 1 diagnóstico real retido; 1 candidato rejeitado; 1 lote com erro | 1/1 passou | 201,7 s |
| Speech Text Reader — anterior corrigido | 17 / 4 | 6 candidatos rejeitados; 0 retidos | 3/6 passaram na run; defeito do compilador corrigido depois | 144,0 s |
| Speech Text Reader — Qwen 27B, antes desta correção | 12 / 2 | 1 candidato rejeitado; 0 retidos | não gerados; planejamento parou | 442,4 s |
| Speech Text Reader — Qwen 27B, após correção | 5 / 3 | 2 candidatos rejeitados; 0 retidos; 0 erros de lote | 3/3 passaram | 264,5 s |
| Typing Game — anterior corrigido | 5 / 6 | 2 candidatos rejeitados; 0 retidos | 4/4 passaram | 99,5 s |
| Typing Game — Qwen 27B, antes desta correção | 5 / 5 | 0 candidatos; 2 lotes com JSON inválido | não gerados; planejamento parou | 252,7 s |
| Typing Game — Qwen 27B, após correção | 5 / 6 | 1 candidato rejeitado; 0 retidos; 0 erros de lote | 4/4 passaram | 180,9 s |

Os tempos não são uma comparação isolada de inferência: o conjunto anterior usava modelos menores, o atual usa visão em um 27B, e a pipeline faz várias chamadas sequenciais. Ainda assim, eles mostram que atingir 50 tokens/s não resolveu a latência de ponta a ponta. O custo dominante passou a ser quantidade de chamadas, tamanho dos prompts, imagens e quantidade de texto solicitada.

## Projeto 1 — Music Player

### Resultado atual

Execução: `action-e2e/prototype-runs/music-player-2026-09-05T14-54-16-295Z`

- 2 ações, 2 estados e 1 transição alterada;
- 1 fluxo e 1 teste, aprovado;
- 1 bug válido retido com confiança alta;
- 1 candidato narrativo rejeitado pelo gate de evidência.

O achado válido foi:

`Unhandled page error: Cannot set properties of null (setting 'innerHTML')`

A reprodução abriu uma sessão independente, repetiu duas ações, obteve similaridade de estado 1,0 e capturou a mesma exceção três vezes. Esse é um bug real: o código tenta atualizar elementos de tempo ausentes no HTML.

### Diferença para o conjunto anterior

O conjunto anterior já passou a detectar esse bug depois que diagnósticos de runtime foram promovidos deterministicamente. O Qwen 27B não aumentou o recall neste projeto. Ele escreveu um candidato adicional impreciso, corretamente rejeitado. A execução total foi aproximadamente três vezes mais lenta.

### Veredito

Empate em qualidade de achado, regressão de custo. O sucesso pertence principalmente ao coletor/reprodutor determinístico, não ao modelo.

## Projeto 2 — Speech Text Reader

### Primeira execução com o Qwen 27B

Execução: `action-e2e/prototype-runs/speech-text-reader-2026-09-05T14-58-06-723Z`

O agente consumiu 12 ações em cartões da mesma família e alcançou apenas 2 estados. Não abriu o painel de texto. Depois, o planejamento parou por JSON incompleto. Nenhuma hipótese de silêncio foi retida, o que é correto: a execução não captura áudio nem eventos de síntese.

### Execução após as correções

Execução: `action-e2e/prototype-runs/speech-text-reader-2026-09-05T15-15-46-294Z`

- 5 ações: um cartão, abrir painel, preencher `Hello`, acionar `Read Text` e fechar;
- 3 estados, 3 transições alteradas;
- 2 lotes de caça de bugs, sem erro de JSON;
- 2 candidatos rejeitados e 0 retidos;
- 3 fluxos específicos e 3/3 testes aprovados;
- pipeline completa.

O número de ações caiu de 12 cliques redundantes para uma jornada funcional de cinco passos. O esquema estrito eliminou a interrupção do planejamento. Os dois candidatos rejeitados ainda mostram que o autor confunde ausência de mudança no DOM com ausência de efeito; o gate impediu que isso virasse um bug reportado.

### Diferença para o conjunto anterior

Na run original do conjunto anterior, duas alegações de ausência de áudio foram falsamente retidas. Após os gates determinísticos, os seis candidatos foram rejeitados. Portanto, a precisão atual é boa, mas não há evidência de que venha do Qwen 27B. A contribuição clara do modelo atual foi usar o painel de texto de forma coerente quando o catálogo deixou de oferecer cartões equivalentes.

Os bugs reais conhecidos — controles centrais sem operabilidade por teclado e possível duplicação de vozes — continuam fora do resultado. Eles exigem auditoria de acessibilidade e instrumentação de `speechSynthesis`, que a pipeline ainda não possui.

### Veredito

Melhora forte de eficiência e estabilidade após a alteração do E2P; sem melhora comprovada de recall de bugs.

## Projeto 3 — Typing Game

### Primeira execução com o Qwen 27B

Execução: `action-e2e/prototype-runs/typing-game-2026-09-05T15-06-44-168Z`

O agente alcançou um estado compatível com o bug temporal conhecido: a tela mostrou `Score: 1`, `Time left: 4s`, `Time ran out` e `Your final score is 0` simultaneamente. Isso é evidência valiosa de estados incompatíveis. Mesmo assim, dois lotes da caça de bugs retornaram JSON inválido, nenhuma hipótese foi construída e o planejamento terminou com resposta vazia.

Essa execução mostra que o modelo atual explorou melhor do que julgou: chegou ao sinal de um bug real, mas a pipeline perdeu o achado na conversão de evidência para hipótese.

### Execução após as correções

Execução: `action-e2e/prototype-runs/typing-game-2026-09-05T15-24-19-101Z`

- 5 ações e 6 estados;
- digitou corretamente a palavra dinâmica `bad`, fazendo o placar passar de 0 para 1;
- alterou a dificuldade, acionou configurações, recarregou e pressionou Enter;
- 3 lotes de caça, sem erros estruturados;
- 1 candidato incorreto sobre recarga rejeitado;
- 4 fluxos e 4/4 testes aprovados.

A execução não combinou a palavra correta com o estado posterior a `Time ran out`, portanto não reproduziu o bug real de aceitar respostas após o fim. Também não mediu precisamente o bônus de tempo.

### Diferença para o conjunto anterior

O conjunto anterior corrigido também terminou com 0 falsos positivos retidos e 4/4 testes. O Qwen 27B mostrou melhor leitura do conteúdo dinâmico ao copiar a palavra sorteada e validar a transição de pontuação. Isso ainda não virou melhor caça de bugs porque faltou uma obrigação de cobertura temporal.

Há ainda um fator de contaminação: o contador continua avançando enquanto o modelo faz inferência. A latência do agente altera o alvo, de modo que estados podem expirar entre observação e ação. Esse problema independe de tokens por segundo e deve ser tratado com relógio controlado e avanços temporais explícitos.

### Veredito

Melhora qualitativa na ação central e na leitura dinâmica; empate no resultado de bugs; estabilidade corrigida; cobertura temporal ainda insuficiente.

## O que foi implementado nesta rodada

1. Respostas estruturadas do `llama.cpp` agora usam JSON Schema estrito nas decisões de exploração, plano de fluxos, caça de bugs e crítica.
2. Cada estágio recebeu um orçamento de saída adequado, evitando pedir 1.800 tokens para uma decisão de uma ação e permitindo mais espaço para planos com vários fluxos.
3. O retry duplicado do planejamento foi removido; antes, duas camadas de retry podiam gerar até quatro inferências completas.
4. Controles visuais da mesma família são esgotados após um exemplar não alterar o estado. Isso eliminou a sequência de 12 cartões equivalentes.
5. A revisão de bugs passou de um para dois estados por lote, reduzindo chamadas e permitindo comparação direta entre transições adjacentes.
6. Advertências geradas antes da exploração que alegam ausência de exploração ao vivo são removidas quando a exploração posteriormente completa.
7. Foram adicionados testes de regressão para o esquema do `llama.cpp` e para a invalidação de contexto obsoleto.
8. A suíte completa passou: 81/81 testes.

### Efeito medido das mudanças

- Speech Text Reader: de 12 ações redundantes, 2 estados e pipeline interrompida para 5 ações úteis, 3 estados e pipeline completa.
- Typing Game: de dois lotes com JSON inválido e pipeline interrompida para zero erros estruturados e pipeline completa.
- Os falsos positivos continuaram contidos: 0 hipóteses retidas nos dois projetos.
- O recall de bugs reais não melhorou de forma comprovada.

## Fragilidades mais importantes do E2P hoje

### 1. Exploração sem contrato de cobertura funcional

O agente escolhe a próxima ação, mas não recebe uma lista de capacidades obrigatórias com pré-condições, estados alcançados e lacunas. Isso permite concluir uma run sem testar o comportamento central ou suas fronteiras.

Mitigação viável: criar um inventário de capacidades a partir de README, código e DOM; transformar cada capacidade em objetivos de cobertura; usar um planejador de estados que selecione ações pelo ganho marginal e só finalize quando cada objetivo estiver coberto, bloqueado ou explicitamente marcado como não observável.

### 2. Oráculos fracos ou na modalidade errada

Um clique “não falhou” não prova que áudio tocou, dados persistiram, uma chamada ocorreu ou um cálculo está correto. O Speech Text Reader mostra isso diretamente.

Mitigação viável: instrumentar APIs observáveis (`speechSynthesis`, `localStorage`, `fetch`, WebSocket, console, navegação, downloads), capturar a árvore de acessibilidade e exigir que cada critério declare sua modalidade e o sensor que sustenta o resultado.

### 3. Julgamento normativo ainda depende demais de narrativa

O modelo pode descrever um comportamento como bug sem provar de onde veio a expectativa. Os gates atuais melhoraram muito a precisão, mas também rejeitam problemas plausíveis por falta de documentação e não recuperam bugs fora da jornada.

Mitigação viável: usar uma hierarquia de oráculos — especificação/documentação citada, invariantes extraídos do código, consistência entre estados, padrão de plataforma e, por último, inferência do modelo. “Inferência do modelo” não deveria produzir bug confirmado sem teste discriminatório adicional.

### 4. Tempo de inferência contamina aplicações temporais

No Typing Game, o relógio do produto avança enquanto o modelo decide. Isso mistura latência de infraestrutura com comportamento do usuário.

Mitigação viável: instalar o relógio controlado do Playwright antes da navegação, congelá-lo durante inferência e avançá-lo somente em passos declarados. Criar probes próprios para antes do fim, exatamente no fim e depois do fim.

### 5. A caça de bugs ocorre tarde e separada da exploração

O caçador recebe estados depois que a exploração acabou. Ao notar uma inconsistência, já não pode pedir uma ação adicional para distinguir bug de ambiguidade.

Mitigação viável: ciclo ativo `observar → formular hipótese → escolher teste discriminatório → executar → julgar`, mantendo o relatório pós-exploração apenas como consolidação.

### 6. Leitura de código e exploração ainda estão pouco conectadas

A pipeline entende o projeto, mas não converte de forma sistemática listeners, branches, armazenamento, timers e chamadas de API em riscos e ações. A auditoria humana encontrou bugs justamente combinando código, exploração e verificação dirigida.

Mitigação viável: produzir um mapa leve de risco estático — controles e listeners, branches, limites numéricos, persistência, timers, efeitos externos — e entregar esse mapa ao planejador sem revelar bugs conhecidos.

### 7. Testes verdes são apresentados com peso excessivo

Nos três projetos houve testes 100% verdes, mas bugs conhecidos continuaram fora das jornadas e dos oráculos. A taxa de aprovação mede estabilidade dos caminhos gerados, não saúde do produto.

Mitigação viável: separar no relatório `execução dos testes`, `cobertura de capacidades`, `força dos oráculos`, `hipóteses investigadas` e `risco residual`. Nunca converter “4/4 passou” em aprovação global.

### 8. Mesmo modelo como autor e crítico

No conjunto atual, o mesmo Qwen atua como explorador, autor e revisor. Isso favorece erros correlacionados. O conjunto anterior tinha modelos diferentes, mas o crítico ainda aceitava narrativas fracas.

Mitigação viável: manter gates determinísticos antes e depois do crítico; quando houver recursos, usar um crítico diferente; exigir que o crítico produza testes de falsificação, não apenas um parecer textual.

### 9. Matriz de navegador incompleta

Apesar do objetivo anterior de uso no Firefox, o caminho interno de exploração e execução continua centrado em Chromium. Bugs específicos de Firefox não foram medidos nesta comparação.

Mitigação viável: tornar `chromium`, `firefox` e `webkit` uma dimensão explícita da run, começando por exploração em um navegador escolhido e replay dos testes aprovados nos demais.

## Plano de ação recomendado

### Fase 1 — confiabilidade e observabilidade

- manter os esquemas JSON estritos e registrar tokens, latência, motivo de término e retries por estágio;
- controlar o relógio durante inferência;
- adicionar sensores para áudio, armazenamento, rede e acessibilidade;
- separar claramente falha da aplicação, falha do oráculo, falha do locator e falha do modelo;
- executar o navegador solicitado pelo usuário.

### Fase 2 — cobertura orientada a capacidades e riscos

- gerar inventário de capacidades antes da exploração;
- criar grafo de estados com pré-condições e objetivos não cobertos;
- compilar riscos do código em probes concretos;
- exigir happy path, boundary path e lifecycle path para cada capacidade importante;
- permitir que o caçador peça ações discriminatórias adicionais.

### Fase 3 — julgamento e validação

- associar cada expectativa a uma fonte citável;
- gerar invariantes determinísticos para valores, contagens, persistência e estados terminais;
- reproduzir em sessão limpa e, quando relevante, com relógio/semente controlados;
- usar criticagem independente e medir precisão/recall contra um benchmark com bugs conhecidos apenas para avaliação, nunca fornecidos ao agente durante a run.

### Fase 4 — avaliação contínua

- montar um conjunto de 10–20 projetos pequenos com categorias de bug anotadas;
- medir cobertura de capacidades, bugs reais encontrados, falsos positivos, custo e tempo;
- comparar modelos com a mesma versão da pipeline, mesma semente, mesmo navegador e mesmos orçamentos;
- aceitar mudança de modelo somente quando houver ganho repetível, não por uma execução isolada.

## Julgamento final

O Qwen 3.8 27B IQ1_M é utilizável na máquina e sua leitura multimodal/dinâmica é melhor do que a do modelo anterior em alguns passos. Porém, nesta amostra, ele não encontrou mais bugs reais. Sem as correções de contrato, foi menos confiável operacionalmente; com os esquemas e o agrupamento de ações, passou a concluir os projetos e a explorar com mais propósito.

A conclusão correta é:

- **modelo:** promissor para entendimento visual e escolha de ações, mas sem ganho comprovado de recall;
- **pipeline:** estabilidade e eficiência melhoraram de forma mensurável;
- **caça de bugs:** precisão está protegida pelos gates, porém o recall continua baixo;
- **viabilidade:** as dores mais importantes são mitigáveis, mas a prioridade deve sair de “trocar o LLM” e ir para cobertura por capacidades, sensores de modalidade, relógio controlado e testes discriminatórios;
- **estado atual do E2P:** bom protótipo de coleta de evidência e geração de jornadas; ainda não é um substituto autônomo para uma pipeline completa de QA em projetos simples a moderados.

