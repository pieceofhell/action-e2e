# Relatório resumido — E2P, caça de bugs e Qwen 3.8 27B

> **Atualização posterior:** a configuração Q4_K_M/Ollama descrita historicamente neste relatório foi substituída e removida do computador. A configuração vigente usa `llama.cpp` Vulkan com Unsloth `UD-IQ1_M`; veja o [relatório de otimização](./RELATORIO_QWEN38_LLAMA_CPP_2026-09-05.md).

**Data:** 5 de setembro de 2026  
**Escopo encerrado:** Dopa, Janvas e 21 aplicações de `vanillawebprojects`; nenhuma nova aplicação foi iniciada após a solicitação de interrupção.

## Veredito executivo

O E2P já é útil como **orquestrador de exploração, registro de evidências e gerador de smoke tests**, mas a amostra original mostrou que ainda não era confiável como caçador e juiz autônomo de bugs. Em 23 projetos auditados, 19 runs terminaram e 4 pararam por ausência de uma ação compatível. O caçador reteve 17 hipóteses; a revisão manual classificou todas como falsos positivos. Em paralelo, foram confirmados manualmente 33 bugs reais e nenhum deles havia sido corretamente retido pelo caçador original.

Esse resultado não significa que o modelo nunca encontra sinais úteis: Dopa, Janvas e Music Player continham evidência objetiva que a pipeline chegou a coletar. O problema central era a passagem de **evidência observada** para **expectativa normativa**, seguida por um crítico que frequentemente ratificava a narrativa do autor em vez de tentar refutá-la.

As mudanças implementadas melhoraram de forma clara os três cenários retestados:

| Cenário | Antes | Depois |
|---|---|---|
| Music Player / exceção real | 0 achados apesar do `TypeError` registrado | 1 diagnóstico válido, reproduzido duas vezes |
| Speech Text Reader / áudio não observado | 2 falsos positivos retidos | 6/6 candidatos rejeitados; 0 retidos |
| Typing Game / persistência | 3 falsos positivos retidos | execução final: 2/2 rejeitados; 0 retidos |

Portanto, **houve melhora real de precisão e de aproveitamento de diagnósticos**, mas ainda não há evidência suficiente de melhora global de recall. O bug temporal real do Typing Game continuou fora da jornada. A conclusão correta é “melhorou em alvos conhecidos e classes específicas”, não “o problema está resolvido”.

## O que a auditoria encontrou

Os bugs válidos apareceram principalmente fora das jornadas genéricas escolhidas pelo agente:

- exceções de execução ignoradas, como a falha do Music Player e o erro de hidratação do Janvas;
- combinações e fronteiras de estado, como validação de formulário e interação após `game over`;
- cálculos, persistência e conteúdo duplicado;
- injeção de HTML persistente em projetos que renderizam entrada do usuário;
- funções centrais inacessíveis por teclado ou sem nome acessível;
- falhas específicas de drag, scroll, tempo, áudio, voz, canvas e mídia;
- dependências externas instáveis, paginação quebrada e ausência de fixtures determinísticas.

Os falsos positivos tiveram padrões igualmente consistentes:

- expectativa inventada sem documentação ou convenção inequívoca;
- estado anterior ao submit julgado como se fosse o resultado final;
- “silêncio” deduzido apenas porque o DOM não mudou;
- drag ou persistência alegados sem a ação correspondente;
- evidência que contradizia a própria hipótese;
- reprodução que confirmava apenas a semelhança da tela, não a existência de um defeito;
- teste verde tratado implicitamente como cobertura ou qualidade do produto.

Minha avaliação é que eu conseguiria encontrar bugs em cada tipo de projeto explorado, mas não por “intuição de modelo” isolada. O método que funcionou foi combinar leitura do código e da documentação, exploração orientada por riscos e confirmação dirigida no navegador. Nenhum agente, humano ou automático, deve prometer busca exaustiva; o produto precisa medir o que foi e o que não foi exercitado.

## Mudanças já implementadas

O E2P agora:

1. promove exceções de página e erros acionáveis de console a candidatos determinísticos, filtrando ruído como `favicon`/404 genérico;
2. exige uma reprodução limpa e rejeita replay bloqueado, divergente ou sem recorrência do diagnóstico;
3. rejeita alegações de áudio, drag, scroll, hover e persistência quando a modalidade ou transição necessária não foi observada;
4. registra o valor selecionado em `select` e usa valores de campos para detectar contradições;
5. gera `toHaveValue` para inputs, usando o valor final realmente observado, em vez de procurar texto digitado no corpo da página;
6. classifica falha de valor como asserção de comportamento, não como erro de locator;
7. preserva cobertura útil quando o modelo toma uma decisão inválida tardiamente, sem mascarar falha precoce;
8. aceita contexto configurável de 4.096 a 262.144 tokens no provedor e reconhece perfis como `-64k` diretamente no nome do modelo.

A suíte completa após as alterações terminou com **79 testes aprovados e 0 falhas**.

## Fragilidades restantes, por etapa

### 1. Entendimento e planejamento

O contexto grande ainda é usado como depósito de informação, não como memória selecionada por risco. Isso aumenta latência e dilui sinais. Falta transformar README, código, rotas, eventos, cálculos e estados de ciclo de vida em um mapa de riscos rastreável.

### 2. Exploração

O vocabulário de ações é estreito. Clique e preenchimento não cobrem teclado global, drag-and-drop real, scroll incremental, relógio virtual, áudio, síntese/reconhecimento de voz, canvas, mídia e permissões. Uma página passiva ou multimodal pode parar antes de qualquer investigação útil. A exploração interna também permanece ligada ao Chromium, portanto abrir a interface do E2P no Firefox não equivale a testar o alvo no Firefox.

### 3. Criação da hipótese

O modelo tende a preencher lacunas com uma história plausível. A pipeline precisa guardar separadamente: fato observado, expectativa e fonte da expectativa, ação disparadora, oráculo compatível com a modalidade e resultado da reprodução. Sem todos esses campos, o item deve ficar como “observação”, nunca como “bug”.

### 4. Julgamento

Autor e crítico podem compartilhar os mesmos vieses. Um modelo maior pode produzir uma justificativa mais convincente para uma premissa errada. O crítico deve receber evidência mínima, trabalhar com gates factuais e ter como padrão rejeitar incerteza. Schemas rígidos e validação determinística são necessários; texto persuasivo não pode substituir um gate.

### 5. Reprodução e testes

Repetir a tela não valida uma expectativa. A reprodução precisa executar a ação mínima, observar a modalidade correta e comparar com um oráculo. Testes gerados também precisam informar cobertura: “4/4 passaram” sem informar propriedades não exercitadas é enganoso.

### 6. Ambiente e mensuração

APIs, relógio e aleatoriedade externos tornam resultados não reprodutíveis. Falta uma matriz real de Chromium/Firefox/WebKit, fixtures locais, relógio controlado, seeds e um benchmark com bugs conhecidos e mutantes. Sem isso, precisão e recall não podem ser acompanhados de forma confiável.

## Plano de ação recomendado

### P0 — tornar o julgamento seguro

- Adotar um **ledger de evidências tipado**: cada hipótese deve ligar ação, estado anterior/posterior, diagnóstico, modalidade, expectativa e fonte exata.
- Tornar os gates determinísticos obrigatórios antes e depois do crítico: ação executada, expectativa fundamentada, evidência suficiente, expectativa não satisfeita e reprodução compatível.
- Usar JSON Schema por chamada, saída curta, timeout, validação e no máximo uma correção. Se falhar, registrar “modelo inválido”, não tentar interpretar prosa.
- Separar os estados públicos `observação`, `hipótese`, `reproduzido` e `confirmado`; somente o último deve ser chamado de bug.
- Exibir sempre cobertura negativa: propriedades, modalidades, rotas e navegadores não testados.

### P1 — aumentar recall de maneira dirigida

- Criar planejadores por classe de risco: formulários (limites e combinações), jogos (tempo/estado terminal), CRUD (persistência/injeção), mídia (eventos e duração) e apps de API (erro, vazio, paginação e retry).
- Extrair do código uma lista de eventos, branches, timers, storage, sinks HTML, requests e handlers; usar isso para propor experimentos no navegador, sem declarar bug apenas pela leitura estática.
- Implementar ações e oráculos de teclado, drag, scroll, relógio, áudio/speech, canvas, mídia e permissões.
- Adicionar fixtures de rede, relógio virtual, RNG determinístico e matriz Chromium/Firefox/WebKit.

### P2 — avaliar e calibrar

- Montar um corpus versionado com bugs conhecidos, casos corretos e mutações; medir precisão, recall, custo, latência, taxa de JSON inválido e cobertura semântica.
- Manter um crítico independente quando o custo permitir e medir concordância entre modelos; desacordo deve ir para revisão humana.
- Priorizar candidatos por severidade, confiança e novidade de cobertura, com orçamento explícito por risco.
- Comparar modelos com o mesmo ledger e as mesmas jornadas. Um modelo não deve ganhar crédito por ter explorado um caminho diferente ou recebido mais evidência.

Fluxo-alvo: **mapa de riscos → exploração dirigida → ledger tipado → candidatos determinísticos/modelados → gates → reprodução mínima → oráculo da modalidade → confirmação ou rejeição**.

## Avaliação e implementação do Qwen 3.8 27B

Foi instalado o `qwen3.8:27b` Q4_K_M e criado o perfil local `qwen3.8-e2p:27b-64k`. O modelo oficial tem 27,3 bilhões de parâmetros e contexto nativo de 262.144 tokens; a família também oferece visão, ferramentas e modo de raciocínio. O perfil do E2P fixa **65.536 tokens**, acima do mínimo solicitado de 50k. Fontes: [Qwen oficial no Hugging Face](https://huggingface.co/Qwen/Qwen3.8-27B), [README oficial](https://github.com/QwenLM/Qwen3.8/blob/main/README.md) e [tag oficial no Ollama](https://ollama.com/library/qwen3.8:27b).

### Adequação à máquina

| Medida | Resultado observado |
|---|---|
| Quantização | Q4_K_M |
| Tamanho local listado | 17 GB; 19 GB carregado com contexto |
| Contexto confirmado por `ollama ps` | 65.536 tokens |
| Execução | híbrida, 45% CPU / 55% GPU |
| RAM física livre antes/depois do carregamento | 22,76 GB / 2,90 GB |
| Avaliação de prompt | 106,24 tokens/s no primeiro ensaio |
| Geração livre | 7,31 tokens/s; 900 tokens; terminou por limite |
| Geração com JSON Schema | 8,25 tokens/s; 175 tokens; término normal; 3/3 julgamentos corretos |
| Chamada real pelo adaptador E2P, modelo já carregado | JSON válido e correto em 3,394 s |

O modelo é **viável**, mas apertado: a quantização Q4_K_M é a escolha sensata para 16 GB de VRAM e 32 GB de RAM. Q8 ou BF16 não seriam opções confortáveis para este host, especialmente com contexto longo. O offload híbrido reduz a velocidade e deixa pouca margem de RAM para vários modelos simultâneos.

O primeiro teste também mostrou um risco operacional. Com apenas `format: json` e uma questão ambígua, o modelo entrou em autoexplicação, consumiu 900 tokens e devolveu JSON truncado. Quando a mesma decisão foi limitada por JSON Schema, produziu resultado correto e conciso. Isso confirma que o Qwen 3.8 pode melhorar análise, visão e planejamento, mas precisa ser tratado como componente não confiável na forma: schema, gates e limites continuam obrigatórios.

### Implementação entregue

- Modelfile versionado em `action-e2e/models/qwen3.8-27b-e2p-64k.Modelfile`;
- alias Ollama criado: `qwen3.8-e2p:27b-64k`;
- contexto configurável implementado em `src/services/llm-provider.js`;
- perfis `-64k` inferem automaticamente 65.536 tokens, evitando override silencioso para 16k;
- documentação de instalação/seleção incluída no README;
- teste automatizado incluído e suíte completa aprovada.

### Recomendação de uso

Use o Qwen 3.8 27B como explorador/autor em etapas de maior valor — leitura de contexto, seleção por risco, interpretação visual e elaboração de experimentos — e mantenha gates determinísticos entre ele e o resultado. Para julgamento, prefira schema rígido e um crítico independente ou revisão humana nas hipóteses de maior severidade. Não envie automaticamente 65k tokens: o perfil define capacidade, não obrigação; recupere apenas evidência relevante. Na máquina atual, carregue um modelo grande por vez para evitar disputa de memória.

## Conclusão

O E2P melhorou onde houve intervenção direta: agora aproveita exceções reais, bloqueia classes claras de falsos positivos e gera asserts de input coerentes. Entretanto, ele ainda não integra as três capacidades que explicaram os achados manuais — risco extraído do código/documentação, exploração especializada e oráculo da modalidade. O próximo ganho relevante virá dessa arquitetura, não apenas de trocar 7B por 27B.

O Qwen 3.8 27B em 64k ficou instalado, integrado e funcional neste hardware. Ele oferece mais capacidade e contexto, mas seu teste reforçou a tese principal da auditoria: **qualidade do julgamento depende mais do contrato de evidência e dos gates da pipeline do que da eloquência ou do tamanho do modelo**.
