# Relatório de instalação e avaliação local — Ollama + Action E2E (E2P)

Data da execução: 2 de setembro de 2026, aproximadamente 18:00–18:25 (America/Sao_Paulo)

## 1. Resumo executivo

O Ollama não estava instalado e nenhum modelo local havia sido usado na tentativa inicial. Nesta rodada foram instalados o Ollama 0.33.2 e o Node.js LTS 24.19.0, baixados os dois modelos recomendados pela documentação atual do próprio E2P e executadas avaliações reais, com aceleração integral na Radeon RX 9070 XT.

Modelos instalados:

| Modelo | Papel recomendado no E2P | Arquitetura observada | Quantização | Tamanho local | Contexto anunciado |
| --- | --- | ---: | --- | ---: | ---: |
| `qwen2.5vl:7b` | autor/explorador visual | Qwen2.5-VL, 8,3 B parâmetros | Q4_K_M | 6,0 GB | 128.000 tokens |
| `gemma3:12b` | revisor conservador independente | Gemma 3, 12,2 B parâmetros | Q4_K_M | 8,1 GB | 131.072 tokens |

Principais resultados:

- ambos os modelos foram carregados com `100% GPU`; não houve descarregamento de camadas para CPU nas medições isoladas;
- o Qwen atingiu aproximadamente 99,4 tokens/s e o Gemma 59,8 tokens/s no ensaio controlado com contexto configurado em 16.384 tokens;
- os dois respeitaram o formato JSON e rejeitaram corretamente uma alegação contradita pelas evidências quando a regra do veredito foi explicitada;
- na configuração oficial (`qwen2.5vl:7b` autor + `gemma3:12b` revisor), o TodoMVC foi concluído de ponta a ponta: 5 ações, 4 estados, 4 fluxos gerados e 4/4 testes Playwright aprovados;
- com os papéis invertidos para comparação, o Gemma também concluiu o TodoMVC: 5 ações, 5 estados, 4 fluxos e 4/4 testes aprovados;
- no MDN To-do Notifications, o Qwen falhou de forma reproduzível em duas rodadas no segundo passo, escolhendo uma opção ausente do controle `select`. O E2P interrompeu corretamente a execução em vez de fabricar um fluxo alternativo;
- nenhuma das hipóteses de defeito propostas para o TodoMVC sobreviveu ao contrato determinístico de evidência. Portanto, nenhum defeito do aplicativo foi confirmado e o revisor separado não precisou decidir um candidato elegível;
- a suíte interna do E2P terminou com 74 testes aprovados e 0 falhas.

Conclusão: o par escolhido é adequado à máquina e ao protocolo do projeto. O Qwen foi mais rápido e mais estável no teste semântico curto; o Gemma foi mais lento, mas conseguiu agir e gerar testes de ponta a ponta quando usado fora de seu papel normal. A principal limitação observada foi a fragilidade do Qwen diante dos `selects` ricos do candidato MDN, não falta de capacidade de hardware.

## 2. Escopo e fontes

Código avaliado:

- Action E2E: `pieceofhell/action-e2e`, snapshot do `main` em `1888cf422107608ac8c76865b74c76aadd08be80` (baixado como arquivo do GitHub; por isso a cópia local não contém `.git`);
- MDN DOM Examples: `mdn/dom-examples`, revisão `5419e769b8cae4f94e6634668cdaa3c33b0127cb`, diretório `to-do-notifications`;
- TodoMVC React: `tastejs/todomvc`, revisão `ff43b02e59dfa604386bb382034b2cd07c2bcd8a`, diretório `examples/react`.

Referências oficiais consultadas:

- Ollama no Windows: https://docs.ollama.com/windows
- suporte de GPU do Ollama: https://docs.ollama.com/gpu
- Qwen2.5-VL no Ollama: https://ollama.com/library/qwen2.5vl/tags
- Gemma 3 no Ollama: https://ollama.com/library/gemma3
- RX 9070 XT: https://www.amd.com/en/products/graphics/desktops/radeon/9000-series/amd-radeon-rx-9070xt.html

## 3. Ambiente observado

| Componente | Resultado observado |
| --- | --- |
| Sistema | Windows 11 Pro, versão 10.0.26200, build 26200 |
| CPU | AMD Ryzen 7 7800X3D, 8 núcleos; o Windows expôs 8 processadores lógicos nesta sessão |
| RAM | 2 × 16 GB Corsair; 31,1 GiB utilizáveis; 6000 MT/s configurados |
| GPU discreta | AMD Radeon RX 9070 XT, driver 32.0.31041.1004 |
| VRAM vista pelo Ollama | 15,9 GiB totais; dispositivo `gfx1201` / `ROCm0` |
| iGPU | AMD Radeon(TM) Graphics, driver 32.0.21045.5002 |
| Firefox | 155.0 |
| Ollama | 0.33.2; API em `http://127.0.0.1:11434` |
| Node.js / npm | 24.19.0 / 11.17.0 |
| Playwright | 1.62.1 |
| E2P | servidor local respondeu HTTP 200 em `http://127.0.0.1:4318` |

O disco C: tinha aproximadamente 84,1 GB livres antes dos modelos e 66,3 GB ao fim. A diferença inclui cerca de 14,1 GB de modelos, Ollama, Node.js, 614 pacotes do TodoMVC e artefatos de execução.

## 4. Instalação e justificativa da escolha

O Ollama 0.33.2 foi obtido pelo pacote oficial `Ollama.Ollama`. O instalador iniciou o servidor local em segundo plano. Como o TodoMVC depende do comando comum `npm`, o Node.js LTS 24.19.0 também foi instalado; o runtime privado que já existia no Codex não era visível aos subprocessos iniciados pelo E2P.

A documentação do E2P recomenda explicitamente:

- `qwen2.5vl:7b` como autor/explorador, porque recebe capturas locais e oferece visão e comportamento agentivo;
- `gemma3:12b` como crítico independente e conservador;
- alternativas menores (`qwen2.5vl:3b` e `gemma3:4b`) apenas para máquinas com menos memória, deixando claro que formam outra condição experimental.

Com 16 GB de VRAM, as variantes Q4_K_M selecionadas cabem individualmente com contexto de 16K. As variantes maiores não foram escolhidas:

- Qwen2.5-VL 32B Q4: cerca de 21 GB, acima da VRAM;
- Qwen2.5-VL 7B FP16: cerca de 17 GB, já acima da VRAM sem contar KV cache e buffers;
- Gemma 3 27B: cerca de 17 GB, também acima da VRAM antes do contexto.

Usar versões maiores implicaria descarregamento para os 32 GB de RAM, menor velocidade e uma condição diferente daquela documentada pelo projeto.

## 5. Verificação da aceleração da RX 9070 XT

O comando de estado do Ollama reportou `100% GPU` para os dois modelos. Os logs confirmaram:

| Modelo | Evidência de offload | Buffer do modelo na GPU | KV cache a 16K | Outros buffers relevantes |
| --- | --- | ---: | ---: | ---: |
| Qwen2.5-VL | 29/29 camadas na `ROCm0` | 4168 MiB | 896 MiB | compute 148–296 MiB; CLIP/visão 705 MiB |
| Gemma 3 | 49/49 camadas na `ROCm0` | 6952 MiB | 1024 MiB + 480 MiB do componente de visão | compute 131 MiB; CLIP/visão 121 MiB |

O Ollama identificou explicitamente `AMD Radeon RX 9070 XT (16304 MiB)` no barramento PCIe e selecionou o backend ROCm. Não foi necessário ativar o caminho Vulkan experimental.

Alerta técnico: o log registrou mensagens `Could not load TensileLibrary_lazy_gfx1201.dat` do rocBLASLt. Elas não impediram o carregamento, o offload integral, a visão nem qualquer uma das execuções. Ainda assim, indicam que o pacote não contém uma biblioteca Tensile otimizada específica para `gfx1201`; uma atualização futura do Ollama/ROCm pode melhorar ou estabilizar ainda mais o desempenho.

## 6. Ensaio controlado de inferência

### Protocolo

Os dois modelos receberam as mesmas evidências textuais: antes, o campo de todo estava vazio; depois de digitar `A` e pressionar Enter, apareceu um todo ativo `A` e o contador mostrou `1 item left`. A alegação a julgar dizia que Enter não criou o item. A regra dizia explicitamente: aceitar somente se as evidências sustentassem a alegação; caso contrário, rejeitar. A resposta deveria ser apenas JSON.

Configuração: temperatura 0, limite de 192 tokens de saída e `num_ctx=16384`. Cada medição final carregou somente o modelo avaliado.

| Modelo | Veredito | JSON válido | Tempo total | Carregamento | Prompt | Geração | Tokens gerados |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| `qwen2.5vl:7b` | `reject`, correto | sim | 6,397 s | 5,324 s | 2014,7 tok/s | 99,4 tok/s | 100 |
| `gemma3:12b` | `reject`, correto | sim | 9,920 s | 8,728 s | 1023,9 tok/s | 59,8 tok/s | 64 |

### Sensibilidade de instrução

Numa primeira formulação que apenas pedia `verdict (accept or reject)`, sem dizer explicitamente que o veredito incidia sobre a alegação, o Qwen respondeu corretamente. O Gemma respondeu `accept`, mas justificou que o item havia sido criado — contradição interna. A mesma saída se repetiu com temperatura 0. Ao tornar a regra do veredito inequívoca, o Gemma corrigiu para `reject`.

Interpretação: isso não prova baixa qualidade geral do Gemma, mas mostra maior sensibilidade ao enquadramento do campo de decisão. Para uso como crítico, o prompt deve definir precisamente o objeto do veredito e os critérios de aceitação — exatamente o tipo de guardrail que o E2P tenta impor.

## 7. Avaliação E2P de ponta a ponta

### Matriz de resultados

| Execução | Candidato | Autor | Revisor configurado | Status | Tempo | Ações | Estados | Decisões inválidas | Fluxos | Testes |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `to-do-notifications-2026-09-02T21-11-11-784Z` | MDN To-do Notifications | Qwen | Gemma | interrompida na exploração | 24,8 s | 1 | 2 | 1 terminal | 0 | não alcançado |
| `to-do-notifications-2026-09-02T21-11-55-208Z` | MDN To-do Notifications | Qwen | Gemma | interrompida na exploração | 12,2 s | 1 | 2 | 1 terminal | 0 | não alcançado |
| `react-2026-09-02T21-14-33-294Z` | TodoMVC React | Qwen | Gemma | concluída | 109,4 s | 5 | 4 | 0 | 4 | **4/4 aprovados** |
| `react-2026-09-02T21-16-48-898Z` | TodoMVC React | Gemma | Qwen | concluída | 132,7 s | 5 | 5 | 0 | 4 | **4/4 aprovados** |

Houve ainda uma tentativa TodoMVC de 5,0 s, excluída da comparação de modelos: o E2P identificou a aplicação e tentou iniciá-la, mas `npm` ainda não estava disponível no PATH. Ela é uma falha de infraestrutura anterior à instalação do Node, não um resultado de IA.

### 7.1 MDN To-do Notifications

O E2P detectou corretamente uma aplicação web estática, centrada em formulário, com IndexedDB, notificações e vibração. A página inicial expôs 2 ações principais e 7 controles.

Nas duas repetições, o Qwen:

1. escolheu o campo `Task title` e inicialmente violou a regra de sonda de fronteira;
2. aceitou a correção do E2P e preencheu exatamente um caractere (`A`);
3. no segundo passo, escolheu um `select` sem valor seguro;
4. após a tentativa de correção, selecionou uma opção que não constava entre as opções expostas pelo controle.

Erro terminal idêntico nas duas rodadas: `The model selected an option that was not exposed by the current select control.`

Resultado: falha sistemática/reproduzível para este candidato e configuração. O comportamento correto do E2P foi interromper no contrato violado. Não houve planejamento, geração de teste ou revisão de hipótese depois da falha; esses zeros não devem ser interpretados como desempenho do Gemma.

### 7.2 TodoMVC — configuração recomendada

Autor `qwen2.5vl:7b`, revisor `gemma3:12b`.

- aplicação detectada como React/JavaScript e iniciada com `npm run dev` em `http://localhost:8080`;
- visão local ativa;
- 5 ações executadas: preencher o novo todo, pressionar Enter e visitar os filtros All, Active e Completed;
- 4 estados únicos; 3 transições visivelmente diferentes; 0 decisões inválidas; 0 ações falhas;
- 1 hipótese autoral (`Todo List Filtering Not Working`) foi rejeitada pelo contrato determinístico porque a documentação citada não sustentava a expectativa específica;
- 4 fluxos aprovados e 4 testes compilados a partir da jornada observada;
- validação dos localizadores aprovada para todos os testes;
- execução Playwright: 4 aprovados, 0 falhas, 0 ignorados; duração consolidada de 7,956 s;
- cada teste produziu screenshot, vídeo e trace.

Os quatro testes foram:

- Adding and Filtering Todos;
- Submit New Todo Item;
- User Navigates to TodoMVC: React;
- Filtering Todos to Active.

### 7.3 TodoMVC — papéis invertidos para comparação

Autor `gemma3:12b`, revisor `qwen2.5vl:7b`. Esta não é a configuração oficial; foi executada para avaliar o Gemma também como agente principal.

- 5 ações, 5 estados únicos, 4 transições diferentes;
- 0 decisões inválidas e 0 ações falhas;
- 2 hipóteses autorais foram deduplicadas em 1 (`New todo item not created on Enter press`) e rejeitadas pelo contrato determinístico como expectativa inferida sem evidência suficiente;
- 4 fluxos e 4 testes compilados;
- Playwright: 4 aprovados, 0 falhas, 0 ignorados; duração consolidada de 7,788 s;
- screenshots de exploração verificadas visualmente e coerentes com a jornada (todo `a`, contador `1 item left` e filtros).

Os quatro testes foram:

- Add a todo item via input;
- Submit a todo item via Enter key;
- Verify Active filter functionality;
- Verify Completed filter functionality.

### 7.4 Defeitos e diagnósticos

Nenhum defeito do TodoMVC foi confirmado. Nos dois casos, os candidatos foram barrados antes de chegar ao revisor de modelo. Isso é um resultado positivo de controle de falso positivo, mas significa que esta amostra não mede a capacidade do Gemma de falsificar uma hipótese elegível dentro do pipeline completo.

As duas explorações TodoMVC registraram um único erro de console `404 Not Found` associado ao endereço raiz. Não houve `pageErrors`, os testes passaram e a interface permaneceu funcional; a causa provável é um recurso auxiliar ausente, como favicon. Não há evidência suficiente para classificá-lo como defeito funcional.

## 8. Execução em Firefox versus navegador do benchmark

O Firefox 155.0 é o navegador padrão observado. O comando normal do TodoMVC é `webpack serve --open --config webpack.dev.js`; ele abriu uma janela intitulada `TodoMVC: React — Mozilla Firefox`, reproduzindo a inicialização típica de um usuário.

Contudo, a jornada mensurada e os testes gerados pelo E2P rodam por desenho em uma instância isolada do Chromium controlada pelo Playwright. A automação direta da interface do Firefox não pôde ser usada nesta sessão porque o mecanismo de controle do Windows informou que ainda não oferece fiscalização da política de URL para esse navegador. Portanto:

- a aplicação foi efetivamente aberta no Firefox padrão;
- a execução funcional comparável e os artefatos vieram do navegador isolado oficial do E2P;
- os resultados não devem ser apresentados como cobertura específica do motor Gecko.

## 9. Validação do próprio E2P

A suíte interna foi executada depois das instalações:

- 74 testes;
- 74 aprovados;
- 0 falhas, 0 cancelados, 0 ignorados;
- duração: 19,56 s.

O E2P foi instalado com versões compatíveis de Playwright 1.62.1, Cheerio 1.2.0 e Express 4.22.2. O diretório `node_modules` contém resíduos/extraneous de uma instalação inicial por npm seguida de pnpm; isso não afetou a suíte, mas uma reprodução totalmente limpa deve escolher apenas um gerenciador.

O TodoMVC exigiu 614 pacotes. A auditoria do snapshot registrou 20 vulnerabilidades de dependência (2 baixas, 7 moderadas, 9 altas e 2 críticas). Elas pertencem ao candidato e foram mantidas sem `audit fix` para não alterar a revisão experimental. Este relatório não investigou explorabilidade dessas dependências.

## 10. Avaliação dos modelos

### Qwen2.5-VL 7B

Pontos fortes observados:

- aproximadamente 100 tokens/s nesta GPU;
- JSON consistente nos ensaios controlados;
- veredito semântico correto mesmo na formulação inicialmente ambígua;
- conclusão integral do TodoMVC com quatro testes aprovados;
- uso efetivo de visão e capturas locais.

Limitações observadas:

- falha repetível ao escolher valores válidos de `select` no MDN;
- precisou da correção automática do protocolo na primeira entrada de texto;
- a hipótese sobre filtragem do TodoMVC não tinha fundamento documental suficiente.

Avaliação: melhor escolha como autor/explorador para esta máquina e para a condição oficial do projeto, mas ainda requer contrato rígido de ações e repetição estatística em formulários ricos.

### Gemma 3 12B

Pontos fortes observados:

- 100% GPU e quase 60 tokens/s isoladamente;
- JSON válido;
- concluiu o TodoMVC como agente principal, com quatro testes aprovados;
- produziu fluxos claros e específicos para entrada e filtros.

Limitações observadas:

- carregamento e geração mais lentos que o Qwen;
- mostrou sensibilidade à formulação do campo `verdict`, chegando a contradizer rótulo e justificativa no primeiro ensaio;
- quando autor, propôs a hipótese incorreta de que Enter não criara o item;
- não recebeu um candidato elegível para exercer seu papel oficial de crítico nesta amostra.

Avaliação: apropriado como revisor conservador de segunda opinião, desde que o schema defina inequivocamente o sentido do veredito. A execução comparativa mostra que também consegue agir, mas não há vantagem observada que justifique trocar os papéis padrão.

## 11. Recomendações

1. Manter `qwen2.5vl:7b` como autor e `gemma3:12b` como crítico. É a condição documentada e cabe confortavelmente na máquina.
2. Deixar o Ollama administrar um modelo por vez durante runs longas. Embora ambos tenham aparecido residentes em uma observação, o scheduler também precisou despejar um modelo ao prever pressão de memória com contexto 16K.
3. No protocolo do crítico, usar formulação explícita: “aceite a alegação somente se todos os fatos citados a sustentarem; caso contrário, rejeite”.
4. Adicionar ao E2P um teste/regressão específico para decisões de `select`, incluindo normalização de zero à esquerda (`01`) e validação do valor após a correção do modelo.
5. Repetir cada candidato pelo menos 5 vezes antes de comparar taxas de conclusão. Duas falhas idênticas no MDN já apontam um problema estável, mas ainda não formam uma estimativa estatística robusta.
6. Acompanhar futuras versões do Ollama/ROCm que incluam a biblioteca Tensile otimizada para `gfx1201`.
7. Se cobertura específica de Firefox/Gecko for necessária, executar adicionalmente os testes gerados com o projeto Playwright configurado para Firefox; a rodada atual prova funcionalidade no Chromium isolado e apenas abertura manual no Firefox.

## 12. Artefatos locais

Raiz do projeto:

- `C:\Users\henri\Documents\Codex\E2P\action-e2e`

Resultados MDN:

- `prototype-runs\to-do-notifications-2026-09-02T21-11-11-784Z\results\blind-evaluation.json`
- `prototype-runs\to-do-notifications-2026-09-02T21-11-55-208Z\results\blind-evaluation.json`

TodoMVC, Qwen autor / Gemma revisor:

- `prototype-runs\react-2026-09-02T21-14-33-294Z\results\blind-evaluation.json`
- `prototype-runs\react-2026-09-02T21-14-33-294Z\results\potential-bugs.json`
- `prototype-runs\react-2026-09-02T21-14-33-294Z\results\test-artifacts`

TodoMVC, Gemma autor / Qwen revisor:

- `prototype-runs\react-2026-09-02T21-16-48-898Z\results\blind-evaluation.json`
- `prototype-runs\react-2026-09-02T21-16-48-898Z\results\potential-bugs.json`
- `prototype-runs\react-2026-09-02T21-16-48-898Z\results\test-artifacts`

Modelos instalados pelo Ollama:

- `C:\Users\henri\.ollama\models`

Logs consultados:

- `C:\Users\henri\AppData\Local\Ollama\server.log`

## 13. Limites da conclusão

Esta foi uma avaliação local exploratória com dois candidatos e quatro runs de modelo válidas, não um ranking universal. Um teste aprovado demonstra que a jornada observada foi executável e que suas asserções passaram; não prova ausência de defeitos no aplicativo. A comparação com papéis invertidos usa prompts e funções diferentes e não é um benchmark científico de qualidade geral. O resultado mais sólido é operacional: a máquina executa ambos os modelos integralmente na RX 9070 XT, o par oficial completa o TodoMVC, e a falha do MDN é reproduzível e corretamente preservada pelo mecanismo fail-fast.
