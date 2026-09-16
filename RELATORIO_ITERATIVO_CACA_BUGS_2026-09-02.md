# Relatório iterativo de execução e caça de bugs — E2P

**Relatório vivo — iniciado em 2 de setembro de 2026; atualizado em 5 de setembro de 2026**

## Resumo executivo

As execuções são incorporadas individualmente: cada alvo é executado, auditado e documentado antes do próximo. A coleção solicitada foi concluída: há dezenove runs completas e quatro runs interrompidas de forma informativa: **Hangman**, **New Year Countdown**, **Relaxer App** e **Speak Number Guess**, sem ações compatíveis com o modelo atual do E2P.

O resultado mais importante desta amostra é uma divergência entre a caça automática e a validação crítica:

- O modelo produziu dezessete hipóteses que passaram pelo crítico; as três mais recentes alegam que a dificuldade do jogo não persiste, embora a própria interface prove o contrário.
- Após confronto com o comportamento, documentação e código, **as dezessete são falsos positivos**.
- Foram confirmados trinta e três bugs reais nos vinte e três projetos auditados. Nenhum dos trinta e três foi corretamente retido como bug pelo subsistema de descoberta.
- No Dopa, o E2P viu um indício relacionado a `fetch`, mas o descartou por falta de evidência entre estados. Os testes gerados depois expuseram o erro real por meio da proteção contra overlays.
- No Janvas, o E2P registrou o erro de hidratação nos diagnósticos, mas o caçador não o transformou em hipótese.
- No Form Validator, a exploração não percorreu a combinação de dados necessária; uma leitura dirigida do código seguida de reprodução confirmou o defeito.

Na amostra original, antes das mudanças descritas ao fim deste documento, a precisão observada das hipóteses retidas foi **0/17**. Em relação ao conjunto de trinta e três bugs confirmados nesta auditoria, a descoberta automática reteve corretamente **0/33**. Essa segunda razão não é uma estimativa estatística de recall, pois a busca manual também não foi exaustiva.

## Escopo, ambiente e ressalva sobre o navegador

| Item | Configuração usada |
|---|---|
| CPU | AMD Ryzen 7 7800X3D |
| GPU | AMD Radeon RX 9070 XT, 16 GB |
| RAM | 32 GB DDR5-6000 |
| Ollama | 0.33.2, API local |
| Autor/explorador | `qwen2.5vl:7b`, 6,0 GB, Q4_K_M |
| Crítico | `gemma3:12b`, 8,1 GB, Q4_K_M |
| Aceleração | offload integral por ROCm verificado |
| E2P | snapshot de `pieceofhell/action-e2e`, commit `1888cf422107608ac8c76865b74c76aadd08be80` |

Os modelos escolhidos cabem simultaneamente no contexto da máquina e deixam margem de RAM do sistema. O `qwen2.5vl:7b` foi usado pela capacidade visual durante a exploração; o `gemma3:12b`, maior, foi usado como revisor independente.

Há uma ressalva importante: embora a aplicação possa ser aberta pelo usuário no Firefox, o motor interno atual do E2P lança **Chromium headless** diretamente em `src/services/live-explorer.js:69` e `src/services/authenticated-executor.js:41`. Portanto, os resultados abaixo são válidos para a execução automatizada no Chromium e **não constituem cobertura específica de Firefox**. Isso deve ser tratado como lacuna do projeto diante do requisito original.

## Quadro consolidado

| Projeto | Exploração | Testes gerados | Hipóteses retidas | Bugs válidos confirmados | Julgamento |
|---|---:|---:|---:|---:|---|
| Dopa | 2 ações, 3 estados | 0/2 passaram | 0 | 1 | Bug válido e bloqueante no fluxo local |
| Janvas | 6 ações, 4 estados | 2/2 passaram | 1 | 1 | Hipótese do modelo é falsa; bug de hidratação é real |
| Form Validator | 2 ações, 3 estados | 2/2 passaram | 3 | 1 | Três falsos positivos; bug lógico real foi perdido |
| Movie Seat Booking | 20 ações, 20 estados | 3/3 passaram | 0 | 1 | Funcionalmente correto no recorte; função principal inacessível por teclado/AT |
| Breakout Game | 2 ações, 2 estados | 2/2 passaram | 0 | 2 | Run cobriu apenas regras; jogo e drawer têm falhas de acessibilidade |
| Custom Video Player | 2 ações, 3 estados | 3/3 passaram | 0 | 2 | Timestamp mal formatado e controles sem nomes acessíveis |
| DOM Array Methods | 5 ações, 6 estados | 5/5 passaram | 2 | 1 | Duas alegações contradizem os próprios números; total é duplicado |
| Exchange Rate | 2 ações, 2 estados | 2/2 passaram | 0 | 2 | Não testa valores; campo direito é enganoso e controles são anônimos |
| Expense Tracker | 3 ações, 2 estados | 3/3 passaram | 0 | 1 | Run não cria transação; injeção HTML persistente confirmada |
| Hangman | 0 ações, 1 estado | não gerados | 0 | 1 | Pipeline parou; entrada global e estado do jogo não são modelados |
| Infinite Scroll Blog | 2 ações, 2 estados | 0/1 passou | 2 | 1 | Dois falsos positivos; teste confunde input com texto; filtro perde novos posts |
| Lyrics Search | 4 ações, 4 estados | 2/4 passaram | 0 | 1 | Busca funciona; asserts de input errados e paginação externa quebrada |
| Meal Finder | 5 ações, 5 estados | 4/4 passaram | 1 | 2 | Hipótese falsa sobre Random; resultado antigo permanece e botões são anônimos |
| Memory Cards | 9 ações, 4 estados | 0/5 passou | 1 | 2 | Hipótese contradiz estado; navegação vazia quebra e há injeção persistente |
| Modal Menu Slider | 8 ações, 4 estados | 4/5 passaram | 1 | 1 | Sign Up visível; teste de input incorreto; modal/navigation sem semântica adequada |
| Music Player | 2 ações, 2 estados | 1/1 passou | 0 | 2 | Page error foi ignorado; controles e progresso são inacessíveis |
| New Year Countdown | 0 ações, 1 estado | não gerados | 0 | 1 | Pipeline não aceita página passiva; contador fica negativo após a virada |
| Product Filtering | 3 ações, 2 estados | 3/3 passaram | 0 | 1 | Filtros funcionam; ações de carrinho são inacessíveis e botão se chama “0” |
| Relaxer App | 0 ações, 1 estado | não gerados | 0 | 1 | Ciclo funciona; pipeline para e animação não oferece redução/pausa |
| Sortable List | 10 ações, 1 estado | 6/6 passaram | 1 | 1 | Nenhum drag ocorreu; função principal indisponível sem mouse |

## 1. Dopa

### Identificação da execução

- Repositório: `pieceofhell/dopa`
- Commit: `93105f8fd2581199fb204b587ffa8b4eae17f256`
- Execução: `dopa-2026-09-02T23-03-41-744Z`
- Resultado E2P: `completed-with-test-failures`
- Exploração: 2 ações concluídas, 1 transição alterada, 3 estados únicos, 0 ações inválidas, 0 falhas de ação, 170,284 s
- Testes: 2 gerados, 0 aprovados, 2 reprovados, 11,303 s

### O que foi explorado

O agente interagiu principalmente com a busca de produtos: preencheu o campo e acionou Enter. A interface dinâmica causou várias renovações da lista de ações e a cobertura funcional ficou rasa.

### Bug válido: falha do otimizador de imagens no modo de desenvolvimento local

**Severidade:** alta no fluxo local documentado  
**Confiança:** alta  
**Status:** confirmado na execução

Ao rodar o projeto pelo fluxo local indicado, a página apresentou um overlay persistente do Vite com:

```text
Cannot read properties of undefined (reading 'fetch')
```

A pilha aponta para `worker/index.ts:35`, onde o manipulador de `/_vinext/image` chama `env.ASSETS.fetch(...)`. O mesmo bloco usa `env.IMAGES.input(...)`. Já a configuração local construída em `vite.config.ts:14` declara entradas D1/R2 opcionais, mas não fornece explicitamente esses bindings de imagem/asset.

Consequência observada: resposta HTTP 500 e overlay de erro, impedindo que os testes usem a interface limpa. Os dois testes falharam na proteção que exige ausência de `vite-error-overlay`.

Este achado é válido para o modo de desenvolvimento local testado. A evidência não permite afirmar que o ambiente publicado em Cloudflare também falha.

### Avaliação do caçador automático

O autor produziu uma hipótese vaga sobre erro relacionado a `fetch`. O filtro determinístico a rejeitou por não citar fatos cruzados de pelo menos dois estados. A rejeição respeita o contrato de evidência do E2P, mas o erro existia: a etapa de execução o confirmou independentemente.

Há também uma classificação enganosa no relatório: as duas falhas receberam `automation-locator`. O locator, porém, encontrou corretamente o overlay; quem falhou foi a aplicação alvo. Para triagem, a causa deveria ser classificada como erro de runtime do alvo, não como automação.

### Veredito

**Bug coerente e reproduzível.** Ele bloqueia o fluxo local normal e tem suporte simultâneo em screenshot, HTTP 500, stack trace e código.

### Eu conseguiria encontrar bugs neste projeto?

**Sim.** Este primeiro bug é detectável pela combinação de observação visual, console e rastreamento do binding ausente. Para explorar bugs de produto mais profundos, eu primeiro precisaria corrigir ou contornar o overlay local; enquanto ele persiste, toda navegação fica contaminada e a cobertura comportamental perde valor.

### Evidências

- Resultado completo: `action-e2e/prototype-runs/dopa-2026-09-02T23-03-41-744Z/results/blind-evaluation.json`
- Screenshot da falha: `action-e2e/prototype-runs/dopa-2026-09-02T23-03-41-744Z/results/test-artifacts/flow-1-Search-for-Products/test-failed-1.png`
- Chamada que falha: `candidates/dopa/worker/index.ts:35`
- Configuração local: `candidates/dopa/vite.config.ts:14`

## 2. Janvas

### Identificação da execução

- Repositório: `pieceofhell/canvas-wrapper-test`
- Commit: `d2d03eaf8fd6ea05e1a285e4fbd91aba6f222bca`
- Execução: `canvas-wrapper-test-2026-09-02T23-07-51-137Z`
- Resultado E2P: `completed`
- Exploração: 6 ações, 4 transições alteradas, 4 estados únicos, 0 ações inválidas, 0 falhas de ação, 23,318 s
- Testes: 2 gerados, 2 aprovados, 0 reprovados, 8,972 s

### O que foi explorado

Foram percorridos: tela de boas-vindas, CTA “Start with Janvas”, preenchimento da URL do Canvas, alternância de visibilidade da chave e política de privacidade. O conteúdo autenticado do Canvas não foi exercitado porque não havia uma credencial/fixture segura.

### Falso positivo: “Start with Janvas não leva ao dashboard”

**Status:** falso positivo com alta confiança

O modelo esperou que o CTA abrisse diretamente um dashboard ou showcase e considerou defeito a abertura da tela “Connect your Canvas account”. Essa expectativa contradiz o próprio projeto:

- A documentação diz que o usuário conecta sua URL e seu token pela interface.
- A tradução define o CTA de boas-vindas e, separadamente, a tela de conexão.
- Em `home-client.tsx:420`, quando não existem dados, o CTA apenas marca a introdução como vista; em seguida, a interface correta é o formulário de conexão.

A reprodução limpa provou somente que o mesmo estado foi alcançado de novo. Ela não provou que a expectativa inventada pelo modelo era válida.

### Bug válido: incompatibilidade de hidratação entre servidor e cliente

**Severidade:** média-baixa  
**Confiança:** alta quanto à causa; impacto funcional limitado na jornada testada  
**Status:** confirmado por diagnóstico e sustentado pelo código

O E2P capturou um erro de página do React informando que o HTML produzido no servidor não coincidia com o primeiro render do cliente e que a árvore seria regenerada.

A causa é direta em `apps/web/src/app/home-client.tsx:247`:

- no servidor, o inicializador de `hasSeenWelcome` retorna `true`;
- no cliente novo, sem a chave no `localStorage`, retorna `false`;
- em `home-client.tsx:420`, esses valores escolhem árvores visuais diferentes: conexão no servidor e boas-vindas no cliente.

Consequências possíveis: flash de conteúdo incorreto, trabalho extra de renderização, ruído no console e riscos de inconsistência de eventos/estado. A jornada final permaneceu utilizável e os dois testes passaram, portanto não classifico o impacto como alto.

O erro `net::ERR_BLOCKED_BY_CLIENT.Inspector` visto em outra requisição foi causado pela política do ambiente de inspeção e **não** foi atribuído ao Janvas.

### Avaliação do caçador automático

O caçador reteve o falso positivo do CTA, mas ignorou o erro real que já estava presente em seus próprios diagnósticos. Houve também uma falha de parsing JSON em um lote da análise; a execução continuou, mas a descoberta foi parcialmente degradada.

### Veredito

- Hipótese do CTA: **inválida e incoerente com o requisito real**.
- Hydration mismatch: **bug real**, com causa localizada e impacto moderado/baixo na jornada observada.

### Eu conseguiria encontrar bugs neste projeto?

**Sim.** O bug de hidratação foi identificável com diagnóstico e leitura do fluxo de estado. Eu também conseguiria explorar validação de URL/token, persistência, navegação e estados de erro usando um servidor Canvas simulado. Sem fixture ou credencial, não seria responsável afirmar cobertura da área autenticada.

### Evidências

- Resultado completo: `action-e2e/prototype-runs/canvas-wrapper-test-2026-09-02T23-07-51-137Z/results/blind-evaluation.json`
- Inicialização divergente: `candidates/canvas-wrapper-test/apps/web/src/app/home-client.tsx:247`
- Seleção da árvore visual: `candidates/canvas-wrapper-test/apps/web/src/app/home-client.tsx:420`

## 3. Vanilla Web Projects — Form Validator

### Identificação da execução

- Repositório: `bradtraversy/vanillawebprojects`
- Commit: `adc66a181a67049fb413c8862181ddc6c45ba22b`
- Subprojeto: `form-validator`
- Execução: `form-validator-2026-09-02T23-13-11-510Z`
- Resultado E2P: `completed`
- Exploração: 2 ações, 2 transições alteradas, 3 estados únicos, 0 ações inválidas, 0 falhas de ação, 19,345 s
- Testes: 2 gerados, 2 aprovados, 0 reprovados, 6,770 s

### O que foi explorado

O agente preencheu somente o username com `testuser` e pressionou Enter. O estado seguinte exibiu corretamente:

- `Email is not valid`
- `Password must be at least 6 characters`
- `Password2 is required`

### Três falsos positivos retidos

O modelo reteve “Password Field Validation”, “Email Field Validation” e “Password Match Validation”. Todas usam como evidência o estado anterior ao submit, no qual os campos estavam vazios e ainda não havia mensagens.

Isso é comportamento esperado: o código valida no evento `submit`, não ao simplesmente preencher o primeiro campo. O próprio estado posterior à tecla Enter mostra que as mensagens foram exibidas. O crítico analisou uma fotografia intermediária como se fosse o resultado final da ação e, por isso, aprovou três hipóteses incoerentes.

### Bug válido: validações avançadas são puladas quando todos os campos estão preenchidos

**Severidade:** média  
**Confiança:** alta  
**Status:** confirmado por reprodução dirigida

Em `form-validator/script.js:79`, as verificações de tamanho, e-mail e correspondência de senhas só rodam dentro de:

```js
if (checkRequired([username, email, password, password2])) {
  // validações adicionais
}
```

Mas `checkRequired`, em `script.js:32`, retorna `true` quando encontra pelo menos um campo vazio. Se todos estiverem preenchidos, retorna `false`, marca cada campo como sucesso e impede justamente as validações adicionais.

Reprodução validada:

1. Username: `validname`
2. E-mail: `not-an-email`
3. Senha: `123`
4. Confirmação: `different`
5. Submit

Resultado: os quatro controles receberam a classe visual `success`; nenhum erro de e-mail, tamanho ou correspondência ficou visível. Portanto, entradas simultaneamente inválidas são aceitas visualmente como válidas.

### Avaliação do caçador automático

Este é o caso mais claro de falha metodológica:

- três falsos positivos foram retidos;
- o defeito real estava em uma ramificação simples e facilmente testável;
- a exploração parou após preencher apenas um de quatro campos;
- os dois testes gerados passaram, mas cobriram somente a jornada superficial observada.

### Veredito

**Bug válido, coerente e reproduzível.** A condição do `if` está invertida em relação à intenção evidente da validação.

### Eu conseguiria encontrar bugs neste projeto?

**Sim, e encontrei um que o E2P não encontrou.** Este tipo de formulário favorece exploração por classes de equivalência e limites: vazio, tamanho mínimo/máximo, formato de e-mail, senhas iguais/diferentes e combinações. Uma matriz pequena desses casos teria revelado o defeito rapidamente.

### Evidências

- Resultado completo: `action-e2e/prototype-runs/form-validator-2026-09-02T23-13-11-510Z/results/blind-evaluation.json`
- Screenshot após submit parcial: `action-e2e/prototype-runs/form-validator-2026-09-02T23-13-11-510Z/artifacts/exploration/state-3-viewport-1.jpg`
- Condição defeituosa: `candidates/vanillawebprojects/form-validator/script.js:79`
- Função requerida: `candidates/vanillawebprojects/form-validator/script.js:32`
- Reprodução dirigida: `manual-audit-completed.cjs`

## 4. Vanilla Web Projects — Movie Seat Booking

### Identificação da execução

- Repositório: `bradtraversy/vanillawebprojects`
- Commit: `adc66a181a67049fb413c8862181ddc6c45ba22b`
- Subprojeto: `movie-seat-booking`
- Execução completa: `movie-seat-booking-2026-09-03T02-28-45-688Z`
- Resultado E2P: `completed`
- Exploração: 20 ações, 19 transições alteradas, 20 estados únicos, 84,335 s
- Testes: 3 gerados, 3 aprovados, 0 reprovados, 10,025 s

A tentativa `movie-seat-booking-2026-09-03T02-28-08-495Z` parou ainda na inspeção porque a API local do Ollama estava indisponível. Ela é falha ambiental, não resultado do alvo. A execução parcial anterior (`2026-09-02T23-15-57-497Z`) também permanece apenas como registro histórico.

### O que foi explorado

O E2P selecionou o filme e depois consumiu quase todo o orçamento clicando sucessivamente em assentos disponíveis. Isso comprovou que o detector visual consegue transformar `div.seat` sem semântica em ação interna, mas não cobriu bem desseleção, assentos ocupados, persistência nem mudanças de preço.

O autor produziu duas hipóteses — “Movie Selection and Seat Selection Conflict” e “Seat Selection Confusion” — e o filtro determinístico rejeitou ambas porque a ação alegada não havia sido concluída na transição citada. As rejeições foram corretas.

### Verificação funcional dirigida

Uma sessão complementar no navegador confirmou:

- selecionar um assento: contador `1`, total `$10`;
- mudar para Joker: contador `1`, total `$12`;
- recarregar: filme, contador, total e assento selecionado persistem;
- desselecionar: contador `0`, total `$0`.

Não foi encontrado bug funcional nesses requisitos.

### Bug válido: assentos indisponíveis a teclado e tecnologias assistivas

**Severidade:** alta para acessibilidade; média no produto geral  
**Confiança:** alta  
**Status:** confirmado no DOM e na representação acessível

Os assentos em `index.html:40-97` são `div class="seat"`. Não possuem `button`, `role`, `tabindex`, nome acessível nem estado `aria-pressed`/`aria-selected`. A interação em `script.js:45` depende exclusivamente de clique no container.

Na representação acessível do navegador aparecem o seletor de filme, a legenda e o total, mas nenhum assento selecionável. Consequência: um usuário de teclado ou leitor de tela não consegue executar a função central do aplicativo.

O E2P conseguiu clicar nesses elementos usando seletores visuais internos, mas não avaliou se um usuário real conseguiria alcançá-los. Esse contraste revela uma lacuna importante: **capacidade da automação não equivale a acessibilidade da aplicação**.

### Veredito

- Regras de preço, contagem, ocupação e persistência verificadas: **funcionam no recorte testado**.
- Acessibilidade da seleção de assentos: **bug real e coerente**.
- Hipóteses do modelo: **rejeitadas corretamente**.

### Eu conseguiria encontrar bugs neste projeto?

**Sim.** A exploração precisa ser orientada por propriedades: assentos disponíveis alternam estado, ocupados não mudam, total é `quantidade × preço`, estado sobrevive ao reload e todas as ações essenciais devem ser operáveis por teclado. O E2P cobriu principalmente repetição de cliques; a auditoria dirigida cobriu as propriedades restantes e revelou a falha de acessibilidade.

### Evidências

- Resultado completo: `action-e2e/prototype-runs/movie-seat-booking-2026-09-03T02-28-45-688Z/results/blind-evaluation.json`
- Elementos de assento: `candidates/vanillawebprojects/movie-seat-booking/index.html:40`
- Manipulador exclusivo de clique: `candidates/vanillawebprojects/movie-seat-booking/script.js:45`
- Execução parcial preservada: `action-e2e/prototype-runs/movie-seat-booking-2026-09-02T23-15-57-497Z/artifacts/exploration/`

## 5. Vanilla Web Projects — Breakout Game

### Identificação da execução

- Subprojeto: `breakout-game`
- Execução: `breakout-game-2026-09-03T02-35-37-852Z`
- Resultado E2P: `completed`
- Exploração: 2 ações, 2 transições alteradas, 2 estados únicos, 7,343 s
- Testes: 2 gerados, 2 aprovados, 0 reprovados, 7,440 s
- Hipóteses: nenhuma criada ou retida

### O que foi realmente coberto

O agente abriu e fechou o painel “How To Play”. Não enviou setas, não observou movimento da raquete, não avaliou colisões, placar, perda ou vitória. Assim, os 2/2 testes verdes validam somente o drawer de regras, não o Breakout descrito no README.

### Bug válido 1: jogo e placar não possuem alternativa acessível

**Severidade:** alta para acessibilidade  
**Confiança:** alta

Toda a função principal é desenhada no `canvas` de `index.html:23`. Não há fallback textual, nome/descrição do canvas, estado acessível do placar nem representação da posição da bola, raquete ou blocos. Na árvore acessível do navegador aparecem título, regras e botões, mas não o jogo.

Um usuário de leitor de tela recebe instruções para usar as setas, porém não consegue perceber o estado ou resultado dessas ações.

### Bug válido 2: painel fechado continua acessível e recebe foco fora da tela

**Severidade:** média para acessibilidade  
**Confiança:** alta

O fechamento usa apenas `transform: translateX(-400px)` em `.rules`; não aplica `hidden`, `inert` ou `aria-hidden`. Em uma sessão limpa, a ordem de Tab com o painel fechado foi:

1. `Show Rules`
2. `Close` — ainda invisível, fora da tela
3. `body`

A representação acessível também expôs o título e todo o texto das regras enquanto o painel estava fechado. Adicionalmente, `.btn:focus { outline: 0; }` remove o indicador visual de foco dos dois botões.

### Avaliação do caçador automático

Não houve falso positivo, mas houve ausência completa de investigação do comportamento central. O pipeline tratou controles DOM visíveis como universo funcional e não gerou ações globais de teclado nem oráculos para canvas/animação.

### Veredito

- Drawer por mouse: funciona no recorte testado.
- Acessibilidade do jogo e do drawer: **dois bugs válidos**.
- Resultado 2/2: smoke test verde, sem significado para a jogabilidade principal.

### Eu conseguiria encontrar bugs neste projeto?

**Parcialmente, com instrumentação apropriada.** As falhas de acessibilidade foram encontradas diretamente. Para física, colisões e estados finais, eu usaria relógio controlado, inspeção de pixels/estado ou uma interface de teste determinística; uma exploração visual em tempo real com orçamento de poucos segundos é inadequada.

### Evidências

- Resultado: `action-e2e/prototype-runs/breakout-game-2026-09-03T02-35-37-852Z/results/blind-evaluation.json`
- Canvas sem fallback: `candidates/vanillawebprojects/breakout-game/index.html:23`
- Estado do drawer apenas por transformação: `candidates/vanillawebprojects/breakout-game/style.css:47`
- Foco removido: `candidates/vanillawebprojects/breakout-game/style.css:35`
- Teclado e loop do jogo: `candidates/vanillawebprojects/breakout-game/script.js:200`

## 6. Vanilla Web Projects — Custom Video Player

### Identificação da execução

- Subprojeto: `custom-video-player`
- Execução: `custom-video-player-2026-09-03T02-38-03-755Z`
- Resultado E2P: `completed`
- Exploração: 2 ações, 2 transições alteradas, 3 estados, 7,350 s
- Testes: 3 gerados, 3 aprovados, 0 reprovados, 6,727 s
- Hipóteses: 5 rascunhadas, 4 após deduplicação, 0 retidas

### O que foi realmente coberto

O agente clicou na área do vídeo e no primeiro botão visual. Os testes recompilaram variações de iniciar/parar/reiniciar, mas não aguardaram tempo suficiente para avaliar a formatação, não moveram o slider de maneira significativa e não examinaram semântica acessível.

As quatro hipóteses deduplicadas — botão Play ausente e barra de progresso ausente/não atualizada — foram rejeitadas pelo contrato porque citavam ações não concluídas nas transições. As rejeições foram corretas e evitaram falsos positivos evidentes.

### Bug válido 1: timestamp ganha um terceiro dígito nos segundos

**Severidade:** média-baixa  
**Confiança:** alta  
**Status:** confirmado em reprodução temporal

Em `script.js:30` e `script.js:36`, o código decide adicionar zero quando `mins < video.duration` e `secs < video.duration`. A comparação correta para formatação de dois dígitos seria com `10`.

Com a mídia em `11,697 s`, a interface exibiu `00:011`, não `00:11`. Para vídeos mais longos, a mesma lógica também pode gerar minutos como `010`.

### Bug válido 2: controles customizados não têm nomes acessíveis úteis

**Severidade:** alta para acessibilidade  
**Confiança:** alta

Os botões contêm somente ícones Font Awesome sem `aria-label` ou texto oculto. Na árvore acessível, seus nomes foram os glifos `` e ``; o slider apareceu apenas como `0`, sem rótulo de “progresso”. O elemento de vídeo também não fornece alternativa/captions.

Consequência: um usuário de leitor de tela não consegue identificar com segurança Play/Pause, Stop ou a finalidade do slider. Novamente, seletores CSS capazes de dirigir a automação mascaram a experiência real do usuário.

### Avaliação do caçador automático

O filtro de evidência funcionou bem ao rejeitar alegações sem ação comprovada. A descoberta, porém, não possui observação temporal dirigida nem auditoria da árvore acessível; por isso não viu os dois defeitos reais.

### Veredito

- Hipóteses do modelo: **rejeitadas corretamente**.
- Formatação temporal: **bug funcional válido e reproduzível**.
- Semântica dos controles: **bug de acessibilidade válido**.
- Resultado 3/3: não representa cobertura suficiente dos requisitos do player.

### Eu conseguiria encontrar bugs neste projeto?

**Sim.** A formatação foi confirmada aguardando um limite temporal relevante. Uma estratégia adequada também exercitaria seek no início/meio/fim, pause/resume, término da mídia, sincronização do ícone e nomes/valores acessíveis.

### Evidências

- Resultado: `action-e2e/prototype-runs/custom-video-player-2026-09-03T02-38-03-755Z/results/blind-evaluation.json`
- Zero-padding defeituoso: `candidates/vanillawebprojects/custom-video-player/script.js:30`
- Botões apenas com ícones: `candidates/vanillawebprojects/custom-video-player/index.html:24`
- Slider sem rótulo: `candidates/vanillawebprojects/custom-video-player/index.html:32`

## 7. Vanilla Web Projects — DOM Array Methods

### Identificação da execução

- Subprojeto: `dom-array-methods`
- Execução: `dom-array-methods-2026-09-03T02-41-02-213Z`
- Resultado E2P: `completed`
- Exploração: 5 ações, 5 transições alteradas, 6 estados, 18,882 s
- Testes: 5 gerados, 5 aprovados, 0 reprovados, 12,695 s
- Hipóteses: 4 rascunhadas, 2 retidas

### O que foi coberto

O agente percorreu todas as operações visíveis: adicionar usuário, dobrar valores, filtrar milionários, ordenar e calcular o total. Esta foi a melhor cobertura funcional do E2P até aqui.

### Falsos positivos retidos

1. **“Double Money não dobra o patrimônio”** — falso. O estado 2 continha `$222,011`, `$728,004`, `$916,065` e `$206,715`; o estado 3 mostrou exatamente `$444,022`, `$1,456,008`, `$1,832,130` e `$413,430`.
2. **“Show Only Millionaires não filtra”** — falso. O estado 4 preservou somente `$1,456,008` e `$1,832,130`, ambos acima de um milhão.

As duas observações foram marcadas como reproduzidas com similaridade 0,80/0,81, mas a comparação semântica/aritimética essencial não foi feita. Este é um caso forte de falha do **julgador**, não de falta de evidência.

### Bug válido: cálculo repetido duplica a apresentação do total

**Severidade:** baixa  
**Confiança:** alta  
**Status:** confirmado no navegador e no código

`calculateWealth()` cria um novo `div`/`h3` e sempre o adiciona ao `main`, sem procurar ou atualizar um total existente. Ao acionar novamente o botão, a interface passou a conter duas linhas idênticas de `Total Wealth`.

O valor calculado está correto, mas a ação não é idempotente e acumula resultados duplicados, confundindo o usuário.

### Risco adicional não classificado como confirmado

Os três usuários iniciais são carregados por requisições assíncronas independentes e os botões ficam disponíveis imediatamente. Se o usuário dobrar/filtrar enquanto parte das requisições ainda está em voo, usuários que chegarem depois não participarão da operação anterior. O código sustenta a possibilidade, mas esta auditoria não controlou a rede para reproduzi-la; portanto fica como **risco a testar**, não bug confirmado.

### Veredito

- Cinco testes verdes, com cobertura funcional razoável.
- Duas hipóteses retidas: **dois falsos positivos demonstráveis pelos próprios estados**.
- Um bug de apresentação/estado acumulado: **válido**.

### Eu conseguiria encontrar bugs neste projeto?

**Sim.** As operações admitem oráculos matemáticos simples: dobro exato, predicado `> 1.000.000`, ordem decrescente e soma. Esses oráculos determinísticos são mais confiáveis do que pedir ao modelo para julgar screenshots contendo números.

### Evidências

- Resultado: `action-e2e/prototype-runs/dom-array-methods-2026-09-03T02-41-02-213Z/results/blind-evaluation.json`
- Transformações: `candidates/vanillawebprojects/dom-array-methods/script.js:30`
- Acúmulo do total: `candidates/vanillawebprojects/dom-array-methods/script.js:59`

## 8. Vanilla Web Projects — Exchange Rate

### Identificação da execução

- Subprojeto: `exchange-rate`
- Execução: `exchange-rate-2026-09-03T02-45-19-341Z`
- Resultado E2P: `completed`
- Exploração: 2 ações, 1 transição alterada, 2 estados, 9,614 s
- Testes: 2 gerados, 2 aprovados, 0 reprovados, 6,444 s
- Hipóteses: 2 rascunhadas, 0 retidas

### O que foi realmente coberto

O agente selecionou uma moeda e clicou em Swap, mas terminou com EUR nos dois lados e a relação trivial `1 EUR = 1 EUR`. Nenhum valor foi preenchido e nenhuma conversão não trivial foi verificada. Os dois testes verdes representam uma jornada de baixíssimo poder de detecção.

As duas hipóteses foram rejeitadas por alegarem ações não concluídas na transição citada. A contenção foi correta.

### Bug válido 1: segundo campo é editável, mas não controla a conversão

**Severidade:** média  
**Confiança:** alta, sustentada pelo fluxo de código

`amountEl_two` registra listener de `input`, sugerindo conversão bidirecional. Entretanto, `calculate()` sempre lê `amountEl_one` e sempre grava em `amountEl_two`. Assim, ao digitar no segundo campo com a API respondendo, o valor do usuário é substituído pelo cálculo originado no primeiro campo; o primeiro nunca é recalculado a partir do segundo.

Ou o segundo campo deveria ser somente leitura, ou a direção do cálculo deveria depender de qual campo foi editado. A implementação atual comunica uma capacidade que não entrega.

### Bug válido 2: quatro controles sem nomes acessíveis

**Severidade:** alta para acessibilidade  
**Confiança:** alta

Os dois `select` e os dois `input type="number"` não possuem `label`, `aria-label` ou outro nome. A árvore acessível os apresentou como dois “combobox” e dois “spinbutton” anônimos, impedindo que um usuário de leitor de tela saiba qual moeda/quantia pertence a cada lado.

### Fragilidade de rede observada

Na run oficial, a API respondeu e produziu uma taxa. Na sessão complementar isolada, a requisição externa foi bloqueada pelo ambiente; a interface deixou taxa e segundo valor vazios sem mensagem. O código não possui `catch`, loading ou estado de erro. Isso é uma lacuna de resiliência real, mas não foi contado como terceiro bug porque a falha foi induzida pelo ambiente de inspeção.

### Avaliação do caçador automático

O E2P identificou os controles, mas o explorador preferiu seleção/Swap e ignorou os inputs. Também não impôs a propriedade matemática de reciprocidade ou um caso de conversão não trivial.

### Veredito

- Duas hipóteses descartadas corretamente.
- Dois bugs válidos: direção enganosa do segundo input e ausência de nomes acessíveis.
- 2/2 testes verdes não demonstram correção cambial.

### Eu conseguiria encontrar bugs neste projeto?

**Sim.** Um conjunto mínimo deveria testar A→B, edição do valor da esquerda, edição do valor da direita, Swap e reciprocidade aproximada, além de falha/latência de rede e semântica acessível.

### Evidências

- Resultado: `action-e2e/prototype-runs/exchange-rate-2026-09-03T02-45-19-341Z/results/blind-evaluation.json`
- Cálculo unidirecional: `candidates/vanillawebprojects/exchange-rate/script.js:8`
- Listener enganoso no segundo valor: `candidates/vanillawebprojects/exchange-rate/script.js:25`
- Controles sem labels: `candidates/vanillawebprojects/exchange-rate/index.html:19`

## 9. Vanilla Web Projects — Expense Tracker

### Identificação da execução

- Subprojeto: `expense-tracker`
- Execução: `expense-tracker-2026-09-03T02-48-04-890Z`
- Resultado E2P: `completed`
- Exploração: 3 ações, 1 transição alterada, 2 estados, 8,704 s
- Testes: 3 gerados, 3 aprovados, 0 reprovados, 7,048 s
- Hipóteses: 2 rascunhadas, 0 retidas

### O que foi realmente coberto

O agente preencheu apenas o texto com `A`, pressionou Enter e clicou em adicionar sem preencher o valor. A transação não foi criada; saldo, histórico e totais permaneceram em zero. Mesmo assim, foram gerados três testes verdes intitulados como se cobrissem adição, saldo/histórico e fluxo do usuário.

As duas hipóteses foram descartadas por falta de ação concluída. Isso evitou falsos positivos, mas a nomenclatura dos testes superestima fortemente a cobertura.

### Verificação funcional dirigida

Foram adicionadas uma receita de `100` e uma despesa de `-25`. A interface mostrou:

- saldo: `$75.00`;
- receita: `$100.00`;
- despesa: `$25.00`.

Após uma terceira entrada de `1` e reload, o saldo `$76.00` e as três entradas permaneceram. Cálculo e persistência funcionaram no recorte. A remoção não foi executada nessa sessão complementar.

### Bug válido: injeção HTML persistente no texto da transação

**Severidade:** alta  
**Confiança:** alta  
**Status:** injeção HTML confirmada; execução ativa não foi tentada

`addTransactionDOM()` concatena `transaction.text` diretamente em `item.innerHTML`. Uma entrada de teste inofensiva contendo `<strong id="html-injection-proof">Injected markup</strong>` criou um elemento `strong` real, em vez de texto literal. Após reload, o elemento reapareceu a partir do conteúdo persistido no `localStorage`.

Isso confirma injeção HTML armazenada e sustenta risco direto de XSS persistente com atributos/eventos ativos. Nenhum payload executável foi necessário ou usado para comprovar a falha.

### Avaliação do caçador automático

O E2P não preencheu o campo Amount, portanto nunca alcançou o caminho vulnerável nem qualquer comportamento central do projeto. A run mostra uma segunda forma de fragilidade: títulos e insights podem descrever uma intenção de teste muito maior do que as ações realmente executadas.

### Veredito

- Cálculo e persistência: corretos no cenário dirigido.
- Injeção HTML persistente: **bug válido e relevante de segurança**.
- 3/3 testes verdes: cobertura nominal enganosa; nenhuma transação foi criada na run oficial.

### Eu conseguiria encontrar bugs neste projeto?

**Sim.** Uma matriz curta de receitas/despesas/zero/decimais, persistência e entradas não confiáveis encontra falhas de lógica e segurança com muito mais poder do que a jornada gerada.

### Evidências

- Resultado: `action-e2e/prototype-runs/expense-tracker-2026-09-03T02-48-04-890Z/results/blind-evaluation.json`
- Sink de HTML: `candidates/vanillawebprojects/expense-tracker/script.js:49`
- Persistência: `candidates/vanillawebprojects/expense-tracker/script.js:92`

## 10. Vanilla Web Projects — Hangman

### Identificação da execução

- Subprojeto: `hangman`
- Execução: `hangman-2026-09-03T02-50-36-339Z`
- Resultado E2P: `stopped`
- Estágio: exploração ao vivo
- Exploração: 0 ações, 1 estado inicial
- Testes/hipóteses: não gerados
- Erro: o modelo não conseguiu concluir uma exploração útil

### Por que a pipeline parou

O jogo recebe letras exclusivamente por `window.addEventListener('keydown', ...)`. Não existe input, botão de letra ou outro elemento acionável. O E2P observou texto e desenho, mas seu conjunto de ações seguras ficou vazio e o contrato fail-fast encerrou a run.

Esse comportamento é honesto — não inventou um teste —, porém evidencia que o vocabulário de ações não cobre teclado global, jogos e interfaces baseadas em desenho.

### Verificação funcional dirigida

A palavra sorteada tinha 11 posições. Pressionar `a` revelou duas ocorrências; pressionar `a` novamente ativou corretamente a classe visual de notificação. Não foi percorrido um ciclo completo de vitória/derrota nesta iteração.

### Bug válido: estado essencial e notificações incoerentes para tecnologias assistivas

**Severidade:** alta para acessibilidade  
**Confiança:** alta

Antes de qualquer jogada, a árvore acessível já expõe “You have already entered this letter”. O aviso é ocultado visualmente por deslocamento/transição, não por estado semântico; portanto comunica falsamente um erro inexistente.

Além disso, as 11 lacunas da palavra eram `span` vazios e não tinham representação acessível. Após `a`, a árvore expôs apenas dois caracteres `a`, sem informar quantidade ou posição das letras desconhecidas. Também não há controle de entrada alternativo para touch/leitor de tela.

O jogo é operável por teclado físico para uma pessoa vidente, mas sua informação necessária não é perceptível por tecnologia assistiva.

### Avaliação do caçador automático

Não houve julgamento porque a exploração não começou. Este alvo deve ser mantido como teste negativo do E2P: após as melhorias, a pipeline deveria criar ações globais de tecla com orçamento e oráculos específicos, ou declarar explicitamente a dimensão não coberta em vez de um erro genérico de “exploração não útil”.

### Veredito

- Run oficial: **parada por limitação do E2P**, não por defeito do alvo.
- Entrada básica e letra repetida: funcionaram na sessão dirigida.
- Representação acessível do jogo: **bug válido**.

### Eu conseguiria encontrar bugs neste projeto?

**Sim, mas não pelo modelo de ações atual.** Uma exploração apropriada deve gerar teclas, observar palavra/letras erradas, atingir vitória e derrota de forma determinística e verificar o reset. A auditoria acessível já encontrou um defeito real.

### Evidências

- Resultado parado: `action-e2e/prototype-runs/hangman-2026-09-03T02-50-36-339Z/results/blind-evaluation.json`
- Entrada global: `candidates/vanillawebprojects/hangman/script.js:78`
- Lacunas sem alternativa: `candidates/vanillawebprojects/hangman/script.js:16`
- Notificação apenas visual: `candidates/vanillawebprojects/hangman/script.js:67`

## 11. Vanilla Web Projects — Infinite Scroll Blog

### Identificação da execução

- Subprojeto: `infinite_scroll_blog`
- Execução: `infinite-scroll-blog-2026-09-03T02-52-13-856Z`
- Resultado E2P: `completed-with-test-failures`
- Exploração: 2 ações, 1 transição alterada, 2 estados, 7,033 s
- Testes: 1 gerado, 0 aprovado, 1 reprovado, 11,791 s
- Hipóteses: 2 rascunhadas e 2 retidas

### O que foi realmente coberto

O agente preencheu o filtro com `test` e pressionou Enter. Não executou scroll, não viu o loader e não carregou uma segunda página. A run que deveria avaliar “infinite scroll” cobriu somente um filtro sem resultados.

### Dois falsos positivos contraditórios

1. **“O campo mostra `test`, mas os posts não são filtrados.”** A filtragem estava correta: nenhum dos posts carregados continha o termo e o estado 2 mostrou somente o título da página.
2. **“O campo não mostra `test`.”** O próprio `inputDetails` do estado 2 registra `value: "test"`.

As duas hipóteses foram retidas e reproduzidas com similaridade 1,0. Uma contradiz a outra e ambas contradizem a evidência estruturada.

### Falha do teste gerado

O teste usou `getByText("test", { exact: true })` depois de preencher o input. Valores de formulário não são nós de texto. O locator correto seria uma asserção sobre o valor de `#filter`; além disso, esperar que o termo digitado apareça nos resultados é logicamente incorreto quando a busca retorna zero itens.

A classificação `automation-locator` mascara uma falha de compilação/oráculo do E2P.

### Bug válido: posts novos ignoram o filtro ativo

**Severidade:** média  
**Confiança:** alta pelo fluxo de código  
**Status:** confirmado estruturalmente; reprodução com rede controlada pendente

`filterPosts()` altera o `display` apenas dos `.post` que já existem. Quando `showPosts()` carrega a página seguinte, ele anexa novos elementos e não reaplica o termo atual. Assim, se houver filtro ativo e o usuário alcançar nova paginação, posts incompatíveis entram visíveis na lista.

Há ainda riscos não contabilizados como bugs confirmados: a condição de fim exige igualdade exata de pixels e `showLoading()` não possui trava contra chamadas concorrentes.

### Avaliação do caçador automático

Este alvo expõe simultaneamente quatro falhas: falta de ação de scroll, julgamento contraditório, reprodução que valida apenas a tela e compilação incorreta de valor de input em busca de texto.

### Veredito

- Duas hipóteses retidas: **falsos positivos**.
- Um teste reprovado: **falha do teste, não do alvo**.
- Filtro após paginação: **bug válido com forte evidência de código**.

### Eu conseguiria encontrar bugs neste projeto?

**Sim.** A estratégia precisa combinar scroll dirigido, contagem de itens/páginas, filtro antes e depois de novos carregamentos, latência/falha de rede e prevenção de requisições concorrentes.

### Evidências

- Resultado: `action-e2e/prototype-runs/infinite-scroll-blog-2026-09-03T02-52-13-856Z/results/blind-evaluation.json`
- Teste incorreto: `action-e2e/prototype-runs/infinite-scroll-blog-2026-09-03T02-52-13-856Z/tests/flow-1.spec.cjs`
- Append sem refiltro: `candidates/vanillawebprojects/infinite_scroll_blog/script.js:20`
- Filtro somente sobre nós existentes: `candidates/vanillawebprojects/infinite_scroll_blog/script.js:53`

## 12. Vanilla Web Projects — Lyrics Search

### Identificação da execução

- Subprojeto: `lyrics-search`
- Execução: `lyrics-search-2026-09-03T02-55-28-716Z`
- Resultado E2P: `completed-with-test-failures`
- Exploração: 4 ações, 3 transições alteradas, 4 estados, 31,755 s
- Testes: 4 gerados, 2 aprovados, 2 reprovados, 12,105 s
- Hipóteses: 4 rascunhadas, 3 após filtragem/deduplicação, 0 retidas

### O que foi coberto

Após uma correção de boundary probe, o agente preencheu `A`, submeteu a busca e abriu a primeira letra. A API retornou 15 resultados e a letra de “Sexy Nana” foi exibida. Busca e detalhe funcionaram. O botão Next apareceu, mas não foi acionado.

### Duas falhas de teste que não são bugs do alvo

Os dois testes reprovados usaram `getByText("A", { exact: true })` para tentar confirmar o termo digitado. Como `A` é o `value` do input, não um nó de texto, o locator falhou. Outros dois testes da mesma jornada passaram.

A classificação `automation-locator` é incompleta: a causa é uma tradução errada de estado de input para oráculo textual.

### Bug válido: paginação depende de proxy público que responde 403

**Severidade:** média-alta  
**Confiança:** alta  
**Status:** confirmado em 3 de setembro de 2026

`getMoreSongs()` envia a URL `next` para `https://cors-anywhere.herokuapp.com/`. Para a busca `A`, a API retornou `http://api.deezer.com/search?limit=15&q=A&index=15`; a URL final do proxy respondeu HTTP 403 e exigiu desbloqueio manual do demo CORS Anywhere.

Como não há `try/catch` nem estado de erro, a paginação documentada não funciona para um usuário comum e falha silenciosamente.

### Avaliação do caçador automático

O E2P demonstrou que consegue navegar de resultado para letra, mas não selecionou Next mesmo sendo uma oportunidade nova e semanticamente forte. Também repetiu o erro de converter valor de input em busca de texto.

### Veredito

- Busca e exibição da primeira letra: funcionam.
- Dois testes reprovados: **falhas do E2P**.
- Paginação: **bug válido por dependência externa indisponível no fluxo padrão**.

### Eu conseguiria encontrar bugs neste projeto?

**Sim.** A paginação foi validada consultando exatamente a URL gerada pelo alvo. Uma estratégia completa incluiria busca sem resultado, caracteres especiais, erro/latência da API, Prev/Next e conteúdo de letra ausente.

### Evidências

- Resultado: `action-e2e/prototype-runs/lyrics-search-2026-09-03T02-55-28-716Z/results/blind-evaluation.json`
- Testes com oráculo incorreto: `action-e2e/prototype-runs/lyrics-search-2026-09-03T02-55-28-716Z/tests/enter-artist-or-song-name-state-2.spec.cjs`
- Proxy da paginação: `candidates/vanillawebprojects/lyrics-search/script.js:50`

## 13. Vanilla Web Projects — Meal Finder

### Identificação da execução

- Subprojeto: `meal-finder`
- Execução: `meal-finder-2026-09-03T02-59-11-798Z`
- Resultado E2P: `completed`
- Exploração: 5 ações, 5 transições alteradas, 5 estados, 18,937 s
- Testes: 4 gerados, 4 aprovados, 0 reprovados, 8,020 s
- Hipóteses: 3 rascunhadas, 1 retida

### O que foi coberto

O agente buscou `pasta`, abriu “Mediterranean Pasta Salad” e pediu uma refeição aleatória. Isso cobriu três capacidades centrais e resultou em quatro testes verdes.

### Falso positivo retido apesar de reprodução divergente

A hipótese “Search Input Field is Empty” afirma que o botão Random deveria colocar um termo aleatório no input. O requisito e o código dizem outra coisa: Random busca e exibe diretamente uma refeição aleatória. O campo vazio é correto.

Além disso, a reprodução foi marcada `observation-diverged`, mas a hipótese permaneceu no conjunto retido. Isso viola a expectativa mais básica de confirmação e é uma falha direta da lógica de julgamento/agregação.

### Bug válido 1: busca vazia mantém resultados antigos

**Severidade:** média  
**Confiança:** alta  
**Status:** reproduzido

Após buscar `pasta`, havia um card. Em seguida, uma busca por `zzzznotamealzzzz` mostrou “There are no search results. Try again!”, mas o card de pasta continuou visível (`mealCount: 1`).

No ramo `data.meals === null`, o código atualiza apenas o heading e não limpa `mealsEl`; a limpeza existe no fluxo Random, não no início da busca comum.

### Bug válido 2: botões Search e Random sem nome acessível

**Severidade:** alta para acessibilidade  
**Confiança:** alta

Ambos os botões contêm somente elementos Font Awesome e não têm texto, `aria-label` ou `title` adequado. Um leitor de tela não consegue distinguir as duas ações essenciais.

### Avaliação do caçador automático

A exploração foi funcionalmente melhor, mas o julgamento inventou um requisito e ignorou a divergência da própria reprodução. O bug de estado antigo exigia uma sequência “resultado → zero resultados”, que não foi escolhida.

### Veredito

- Quatro smoke tests verdes.
- Uma hipótese retida: **falso positivo e inconsistência de status**.
- Dois bugs reais: **resultado antigo após busca vazia** e **ações principais sem nome acessível**.

### Eu conseguiria encontrar bugs neste projeto?

**Sim.** O defeito foi encontrado com uma sequência de duas buscas. Uma matriz adequada deve alternar resultados/nada/erro, abrir detalhes, voltar a buscar e verificar Random sem derivar expectativas não documentadas.

### Evidências

- Resultado: `action-e2e/prototype-runs/meal-finder-2026-09-03T02-59-11-798Z/results/blind-evaluation.json`
- Ramo que não limpa cards: `candidates/vanillawebprojects/meal-finder/script.js:26`
- Botões somente com ícones: `candidates/vanillawebprojects/meal-finder/index.html:20`

## 14. Vanilla Web Projects — Memory Cards

### Identificação da execução

- Subprojeto: `memory-cards`
- Execução: `memory-cards-2026-09-03T03-02-57-895Z`
- Resultado E2P: `completed-with-test-failures`
- Exploração: 9 ações concluídas, 3 transições alteradas, 4 estados, 70,046 s
- Testes: 5 gerados, 0 aprovados, 5 reprovados, 24,334 s
- Hipóteses: 3 rascunhadas, 1 retida

### O que foi coberto

O agente iniciou por Clear Cards, abriu o formulário, preencheu `A`/`B`, submeteu, tentou navegação e flip. Começar com limpeza em sessão nova não causou perda material, mas mostra que ações destrutivas/reset podem receber prioridade indevida.

### Falso positivo retido

“Card Display Issue” afirma que o cartão não apareceu após Add Card. O estado citado mostra `A B 1/1`. A reprodução marcou similaridade 1,0, reiterando o estado que refuta a própria alegação. É falso positivo claro.

### Cinco falhas de teste pertencem ao E2P

Os testes esperaram um heading exato `Memory Cards Add New Card`, embora o nome acessível real inclua o glifo do botão filho, e procuraram `B` como texto visível enquanto ele ainda era valor do textarea. Todos foram classificados como `automation-locator`; nenhum representa defeito funcional do alvo.

### Bug válido 1: Next/Prev quebram quando não há cartões

**Severidade:** média  
**Confiança:** alta  
**Status:** reproduzido

Com coleção vazia, clicar Next gerou:

```text
TypeError: Cannot set properties of undefined (setting 'className')
```

O handler acessa `cardsEl[currentActiveCard].className` antes de verificar se o array contém elementos. Prev possui a mesma estrutura.

### Bug válido 2: injeção HTML persistente em pergunta/resposta

**Severidade:** alta  
**Confiança:** alta  
**Status:** injeção HTML confirmada; payload ativo não utilizado

`createCard()` concatena pergunta e resposta do usuário em `card.innerHTML`. Uma pergunta com elemento `strong` inofensivo criou um nó DOM real e, após a gravação/reload, permaneceu presente. Isso confirma injeção HTML armazenada e sustenta risco de XSS persistente.

### Avaliação do caçador automático

O E2P alcançou o caminho de criação, mas falhou em interpretar o estado resultante e em compilar oráculos. Também não testou o caso vazio antes de navegar, apesar de ter acabado de limpar a coleção.

### Veredito

- Hipótese retida: **falso positivo**.
- Cinco testes vermelhos: **falhas do E2P**.
- Navegação vazia e injeção persistente: **dois bugs válidos**.

### Eu conseguiria encontrar bugs neste projeto?

**Sim.** O caso vazio foi reproduzido diretamente e a superfície de conteúdo não confiável revelou a segunda falha. Também testaria múltiplos cartões, limites Prev/Next, flip, reload e Clear isolado às chaves do aplicativo.

### Evidências

- Resultado: `action-e2e/prototype-runs/memory-cards-2026-09-03T03-02-57-895Z/results/blind-evaluation.json`
- Navegação sem guarda: `candidates/vanillawebprojects/memory-cards/script.js:98`
- Sink de HTML: `candidates/vanillawebprojects/memory-cards/script.js:43`

## 15. Vanilla Web Projects — Modal Menu Slider

### Identificação da execução

- Subprojeto: `modal-menu-slider`
- Execução: `modal-menu-slider-2026-09-03T03-08-40-371Z`
- Resultado E2P: `completed-with-test-failures`
- Exploração: 8 ações, 4 transições alteradas, 4 estados, 63,951 s
- Testes: 5 gerados, 4 aprovados, 1 reprovado, 15,651 s
- Hipóteses: 2 rascunhadas, 1 retida

### Falso positivo retido

“Sign Up Button Missing” afirma que Sign Up não estava na landing page. O texto `Sign Up` consta nos estados 1, 2 e 3 citados; no estado 3, o modal de cadastro está aberto. A alegação é diretamente refutada pela evidência usada para retê-la.

### Falha de teste pertencente ao E2P

“Exploring the Landing Page” falhou ao procurar `A` como texto visível depois de preencher Name. É novamente confusão entre `input.value` e nó textual, classificada genericamente como `automation-locator`.

### Bug válido: menu/modal não preservam semântica e foco acessíveis

**Severidade:** média-alta para acessibilidade  
**Confiança:** alta

- O botão de menu tem nome acessível `` e o botão de fechar ``, pois contêm apenas ícones.
- O container aberto não possui `role="dialog"`, `aria-modal`, rótulo programático ou isolamento do conteúdo de fundo.
- Ao abrir, o foco permanece no botão Sign Up; o fundo continua presente na árvore acessível.
- `button:focus { outline: none; }` remove o indicador visual de foco.

O modal funciona por mouse, mas não implementa as garantias esperadas de um diálogo acessível.

### Avaliação do caçador automático

O E2P conseguiu abrir menu/modal, porém errou ao julgar a presença do CTA e não avaliou nomes acessíveis, foco ou isolamento. O teste vermelho repete uma falha de compilação já vista em três projetos.

### Veredito

- Hipótese retida: **falso positivo trivial**.
- Um teste vermelho: **falha do E2P**.
- Semântica/foco: **bug de acessibilidade válido**.

### Eu conseguiria encontrar bugs neste projeto?

**Sim.** Além de abrir/fechar por mouse e backdrop, eu verificaria Escape, ordem/trap/restauração de foco, nomes dos botões e isolamento do fundo — propriedades ausentes na exploração atual.

### Evidências

- Resultado: `action-e2e/prototype-runs/modal-menu-slider-2026-09-03T03-08-40-371Z/results/blind-evaluation.json`
- Estrutura do modal: `candidates/vanillawebprojects/modal-menu-slider/index.html:74`
- Foco removido: `candidates/vanillawebprojects/modal-menu-slider/style.css:99`

## 16. Vanilla Web Projects — Music Player

### Identificação da execução

- Subprojeto: `music-player`
- Execução: `music-player-2026-09-03T03-13-28-079Z`
- Resultado E2P: `completed`
- Exploração: 2 ações concluídas, 1 transição alterada, 2 estados, 27,953 s
- Testes: 1 gerado, 1 aprovado, 0 reprovados, 6,663 s
- Hipóteses: 4 rascunhadas, 3 após deduplicação, 0 retidas

### O que foi realmente coberto

O agente mudou de `ukulele` para `summer` e acionou o controle principal. Uma tentativa na barra de progresso perdeu disponibilidade. Não foram validados pause, next, wrap-around, seek ou término automático.

### Bug válido 1: handler de tempo quebra continuamente

**Severidade:** média-alta  
**Confiança:** alta  
**Status:** reproduzido e presente nos diagnósticos do E2P

O script consulta `#currTime` e `#durTime`, mas o HTML não contém esses elementos. Ao tocar a música, `DurTime` tenta escrever em `currTime.innerHTML` e produz repetidamente:

```text
TypeError: Cannot set properties of null (setting 'innerHTML')
```

Na reprodução, a faixa avançou para `1,424 s` e o mesmo erro apareceu a cada evento temporal. O `pageErrors` da run oficial já continha a mensagem, mas o caçador gerou zero hipóteses.

### Bug válido 2: controles de áudio sem semântica operável

**Severidade:** alta para acessibilidade  
**Confiança:** alta

Previous, Play/Pause e Next são botões contendo apenas Font Awesome, expostos como ``, `` e ``. A barra de progresso é um `div` clicável, sem `role="slider"`, nome, valor ou suporte de teclado.

### Avaliação do caçador automático

Este é um dos falsos negativos mais fortes: um erro de página diretamente relacionado à ação executada estava estruturado no relatório e não chegou à descoberta nem fez o teste falhar. O smoke test 1/1 verde coexistiu com exceções contínuas no fluxo principal.

### Veredito

- Troca/reprodução básica: a faixa toca.
- Atualização de tempo: **bug funcional confirmado**.
- Semântica dos controles: **bug de acessibilidade confirmado**.
- Resultado 1/1: falso senso de saúde diante de `pageErrors` reais.

### Eu conseguiria encontrar bugs neste projeto?

**Sim.** O erro apareceu ao simplesmente tocar por um segundo. Uma política mínima deveria transformar qualquer `pageError` novo após uma ação em candidato prioritário e falha de teste, salvo allowlist explícita.

### Evidências

- Resultado: `action-e2e/prototype-runs/music-player-2026-09-03T03-13-28-079Z/results/blind-evaluation.json`
- Seletores inexistentes: `candidates/vanillawebprojects/music-player/script.js:11`
- Escrita que falha: `candidates/vanillawebprojects/music-player/script.js:120`
- HTML sem os elementos: `candidates/vanillawebprojects/music-player/index.html:18`

## 17. Vanilla Web Projects — New Year Countdown

### Identificação da execução

- Subprojeto: `new-year-countdown`
- Execução: `new-year-countdown-2026-09-03T03-16-15-829Z`
- Resultado E2P: `stopped`
- Exploração: 0 ações, 1 estado
- Testes/hipóteses: não gerados

### Por que a pipeline parou

A página é passiva: não contém botões ou inputs; seu comportamento é a mudança temporal. O E2P exige uma exploração com ações concluídas e encerrou como “não útil”, em vez de criar observações temporais e invariantes do contador.

### Verificação dirigida

Na data da execução, o carregamento começou com spinner e contador oculto. Após 1,3 s, o spinner havia sido removido, o contador estava visível e mostrava `2027`, `119 dias`, `23:42:56`, coerente com o relógio local.

### Bug válido: página aberta na virada passa a contar valores negativos

**Severidade:** baixa-média  
**Confiança:** alta pelo código; reprodução com relógio controlado pendente

`currentYear` e `newYearTime` são calculados uma única vez no carregamento. `updateCountdown()` nunca verifica `diff <= 0` nem recalcula o próximo ano. Se a aba atravessar 1º de janeiro, o alvo permanece no passado e dias/horas/minutos/segundos tornam-se negativos.

### Avaliação do caçador automático

Não houve caça. A pipeline confunde “sem ação” com “sem comportamento testável”, deixando de fora dashboards, relógios, animações, polling e páginas de status.

### Veredito

- Contagem atual e spinner: funcionam.
- Transição de ano em aba longa: **bug de borda válido pelo fluxo de código**.
- Run parada: **limitação do E2P**.

### Eu conseguiria encontrar bugs neste projeto?

**Sim, com relógio controlado.** Eu testaria antes/durante/depois da virada, timezone/DST, formatação e o atraso inicial. O E2P precisa suportar avanço de tempo como ação ambiental segura.

### Evidências

- Resultado parado: `action-e2e/prototype-runs/new-year-countdown-2026-09-03T03-16-15-829Z/results/blind-evaluation.json`
- Alvo temporal fixo: `candidates/vanillawebprojects/new-year-countdown/script.js:9`
- Atualização sem tratamento de término: `candidates/vanillawebprojects/new-year-countdown/script.js:15`

## 18. Vanilla Web Projects — Product Filtering

### Identificação da execução

- Subprojeto: `product-filtering`
- Execução: `product-filtering-2026-09-03T03-17-39-883Z`
- Resultado E2P: `completed`
- Exploração: 3 ações, 1 transição alterada, 2 estados, 9,123 s
- Testes: 3 gerados, 3 aprovados, 0 reprovados, 7,045 s
- Hipóteses: 2 rascunhadas, 0 retidas

### O que foi realmente coberto

O agente digitou `cameras`, pressionou Enter e clicou no elemento nomeado `0`. Como os nomes usam “Camera” singular, a busca não trouxe itens; o clique em `0` correspondeu ao contador/botão do carrinho e não mudou o estado. Checkboxes e adicionar/remover não foram exercitados.

As duas hipóteses foram rejeitadas pelo contrato. Não houve falso positivo retido.

### Verificação funcional dirigida

- Busca `camera`: 3 itens corretos — Cannon EOS, Sony A7 e Sony ZV1F.
- Checkbox Cameras: os mesmos 3 itens.

Não foi encontrado defeito funcional nos filtros combinatórios desse recorte.

### Bug válido: ações de carrinho não são operáveis/identificáveis por acessibilidade

**Severidade:** alta para acessibilidade  
**Confiança:** alta

Cada “Add To Cart” é um `span` com listener de clique e é revelado visualmente por hover. Não possui papel de botão, `tabindex`, nome associado ao produto ou handler de teclado. Na árvore acessível aparece como `generic: Add To Cart`, não como ação.

O botão do carrinho contém somente SVG e o contador; seu nome acessível é `0`, depois `1`, etc., e não “Carrinho”. Usuários de teclado/leitor de tela não conseguem operar ou entender a função.

### Avaliação do caçador automático

O E2P viu cinco inputs, mas escolheu apenas a busca e depois o contador. Não diferenciou controle de estado de um botão de ação nem avaliou operabilidade por teclado.

### Veredito

- Busca e categoria: corretas no cenário dirigido.
- Carrinho: **bug de acessibilidade válido**.
- 3/3 verdes: não cobrem adicionar/remover item.

### Eu conseguiria encontrar bugs neste projeto?

**Sim.** Eu testaria matriz busca×categoria, adicionar/remover vários itens, contador e operabilidade/nome por teclado. O recorte funcional testado passou; o principal achado é acessível.

### Evidências

- Resultado: `action-e2e/prototype-runs/product-filtering-2026-09-03T03-17-39-883Z/results/blind-evaluation.json`
- Ação implementada como span: `candidates/vanillawebprojects/product-filtering/script.js:69`
- Botão de carrinho sem nome: `candidates/vanillawebprojects/product-filtering/index.html:39`

## 19. Vanilla Web Projects — Relaxer App

### Identificação da execução

- Subprojeto: `relaxer-app`
- Execução: `relaxer-app-2026-09-03T03-19-59-794Z`
- Resultado E2P: `stopped`
- Exploração: 0 ações, 1 estado
- Testes/hipóteses: não gerados

### Por que a pipeline parou

Como o countdown, o Relaxer é uma aplicação temporal sem controles. O E2P capturou a tela inicial, encontrou zero ações/inputs e encerrou, sem esperar ou comparar fases.

### Verificação dirigida

O navegador observou:

- 0 ms: `Breathe In!`, classe `grow`;
- 3.100 ms: `Hold`, ainda `grow`;
- 4.700 ms: `Breathe Out!`, classe `shrink`.

O ciclo principal funciona conforme os tempos de 3 s/1,5 s/3 s.

### Bug válido: animação contínua sem redução/pausa e instrução sem anúncio

**Severidade:** média-alta para acessibilidade  
**Confiança:** alta

A rotação de 7,5 s é infinita e o container escala em todos os ciclos. Não existe media query `prefers-reduced-motion`, controle de pausa ou modo estático. Usuários sensíveis a movimento não conseguem reduzir/interromper a animação.

O texto de respiração muda dinamicamente, mas não possui `aria-live`; leitores de tela podem não anunciar as fases no momento necessário.

### Avaliação do caçador automático

A run reforça que “esperar” e “avançar tempo” precisam ser ações de primeira classe. Sem isso, aplicações temporais são descartadas antes de qualquer julgamento.

### Veredito

- Ciclo temporal: correto no recorte.
- Acessibilidade de movimento/instrução: **bug válido**.
- Run parada: **limitação do E2P**.

### Eu conseguiria encontrar bugs neste projeto?

**Sim.** A sequência foi validada observando três pontos no tempo. Com relógio virtual, seria possível testar vários ciclos rapidamente, drift, aba em background e preferência de movimento reduzido.

### Evidências

- Resultado parado: `action-e2e/prototype-runs/relaxer-app-2026-09-03T03-19-59-794Z/results/blind-evaluation.json`
- Agenda das fases: `candidates/vanillawebprojects/relaxer-app/script.js:7`
- Animação infinita: `candidates/vanillawebprojects/relaxer-app/style.css:73`

## 20. Vanilla Web Projects — Sortable List

### Identificação da execução

- Subprojeto: `sortable-list`
- Execução: `sortable-list-2026-09-03T03-21-26-709Z`
- Resultado E2P: `completed`
- Exploração: 10 ações, 0 transições alteradas, 1 estado, 26,334 s
- Testes: 6 gerados, 6 aprovados, 0 reprovados, 18,999 s
- Hipóteses: 1 rascunhada e 1 retida

### O que foi realmente coberto

O agente clicou uma vez em cada um dos dez nomes. Nenhum clique mudou o estado; não houve `dragstart`, `drop` ou Check Order. Apesar disso, seis testes foram intitulados “Drag-and-Drop” ou “Sortable List Interaction” e passaram.

### Falso positivo retido

“Drag-and-Drop Functionality” afirma que a lista permaneceu embaralhada após uma sequência de drag. A evidência contém apenas cliques e um único estado. A expectativa de que a lista se ordenaria automaticamente ao “completar a sequência” não é sustentada porque sequência alguma foi executada.

### Bug válido: ordenação depende exclusivamente de drag por ponteiro

**Severidade:** alta para acessibilidade  
**Confiança:** alta

Os itens usam `draggable="true"` e listeners `dragstart`, `dragover`, `drop`, `dragenter` e `dragleave`. Não há controles mover para cima/baixo, atalhos, foco, estado de posição ou anúncio acessível da reordenação.

Consequência: usuários de teclado, leitores de tela e muitos dispositivos touch não conseguem realizar a função central.

### Suspeita não promovida a bug

`checkOrder()` adiciona `wrong` sem remover uma classe `right` anterior. O CSS posterior de `wrong` mascara visualmente a cor verde, e a tentativa de reprodução por drag não foi confiável. O item permanece como risco de estado CSS, não como bug confirmado.

### Avaliação do caçador automático

Este caso expõe falta de verificação de precondição de ação: títulos e hipóteses disseram “drag” sem o protocolo ter uma ação de drag. O sistema deveria bloquear nomenclatura e julgamento incompatíveis com o log real.

### Veredito

- 6/6 testes verdes: **cobertura nominal sem drag**.
- Hipótese retida: **falso positivo**.
- Operabilidade sem mouse: **bug de acessibilidade válido**.

### Eu conseguiria encontrar bugs neste projeto?

**Sim, com suporte real a drag e alternativa de teclado.** Eu verificaria swaps, múltiplas correções, ordem final e classes após rechecagem. Sem uma ação de drag confiável, o E2P não deve alegar que testou a funcionalidade.

### Evidências

- Resultado: `action-e2e/prototype-runs/sortable-list-2026-09-03T03-21-26-709Z/results/blind-evaluation.json`
- Implementação somente por drag: `candidates/vanillawebprojects/sortable-list/script.js:99`
- Elementos draggable: `candidates/vanillawebprojects/sortable-list/script.js:31`

## 21. Vanilla Web Projects — Speak Number Guess

### Identificação da execução

- Subprojeto: `speak-number-guess`
- Execução: `speak-number-guess-2026-09-03T03-26-37-561Z`
- Resultado E2P: `stopped`
- Exploração: 0 ações, 0 inputs e nenhum teste ou hipótese gerada

### O que foi realmente coberto

O E2P carregou somente a tela inicial. A aplicação depende integralmente de reconhecimento de voz, mas o protocolo não possui ação de microfone/transcrição. No navegador de automação, `SpeechRecognition` e `webkitSpeechRecognition` estavam ambos ausentes; a interface permaneceu congelada nas instruções.

### Bug válido 1: inicialização quebra sem suporte à API de voz

**Severidade:** alta  
**Confiança:** alta

O código faz `new window.SpeechRecognition()` sem testar se a API existe. Em navegadores ou builds sem suporte, ocorre uma exceção durante a inicialização e nenhum aviso, alternativa digitável ou instrução de compatibilidade é apresentado. A API é classificada pela MDN como de disponibilidade limitada, portanto o fallback não é opcional para uma aplicação web robusta.

### Bug válido 2: ciclo de reconhecimento não possui encerramento nem tratamento de erro

**Severidade:** média-alta  
**Confiança:** alta no código; o ciclo completo de microfone não foi autorizado/exercitado

Todo evento `end` executa `recognition.start()` incondicionalmente. Não há listener de `error`, estado de permissão negada, limite de tentativas nem parada quando o usuário acerta. Além de poder formar um ciclo de falhas, o reconhecimento permanece conceitualmente ativo após a tela de sucesso substituir o conteúdo da página.

### Avaliação do caçador automático

O caso evidencia duas lacunas independentes: ausência de ações multimodais e ausência de promoção automática de exceções de inicialização. Mesmo sem conseguir falar, o pipeline já tinha evidência suficiente para reportar a falha de compatibilidade de forma determinística.

### Veredito

- Run parada: **limitação do protocolo do E2P**.
- Ausência de fallback: **bug válido e reproduzível no ambiente**.
- Reinício incondicional: **bug de robustez/privacidade sustentado pelo código**.

### Eu conseguiria encontrar bugs neste projeto?

**Sim.** O primeiro independe de áudio real. Para o fluxo completo eu usaria entrada de voz sintetizada ou injeção controlada de eventos, testaria permissão negada, erro de rede, transcrição inválida, vitória e encerramento do microfone.

### Evidências

- Resultado parado: `action-e2e/prototype-runs/speak-number-guess-2026-09-03T03-26-37-561Z/results/blind-evaluation.json`
- Inicialização sem guarda: `candidates/vanillawebprojects/speak-number-guess/script.js:8`
- Reinício incondicional: `candidates/vanillawebprojects/speak-number-guess/script.js:58`
- Compatibilidade: [MDN — SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition)

## 22. Vanilla Web Projects — Speech Text Reader

### Identificação da execução

- Subprojeto: `speech-text-reader`
- Execução: `speech-text-reader-2026-09-05T12-58-55-783Z`
- Resultado E2P: `completed`
- Exploração: 17 ações, 4 transições alteradas, 4 estados únicos, 0 falhas de ação
- Testes: 4 gerados, 4 aprovados
- Hipóteses: 2 retidas, ambas falsos positivos

### O que foi realmente coberto

O agente abriu e fechou o painel, preencheu `A`, acionou Read Text e clicou nos doze cartões. A síntese de voz não faz parte do estado capturado; os cliques nos cartões não produziram transição visual permanente além do efeito ativo temporário.

### Falsos positivos retidos: áudio inferido a partir do DOM

“Text Box Does Not Speak Entered Text” e “Text Input Not Triggering Speech” afirmam que `A` não foi falado. A única evidência usada é a ausência de mudança estruturada no DOM — exatamente o comportamento esperado de uma saída de áudio. A reprodução com similaridade 1,0 confirma a mesma tela, não confirma silêncio. O código chama `speechSynthesis.speak(message)` e a run não coletou áudio nem instrumentou a API.

### Bug válido 1: controles centrais não são operáveis por teclado

**Severidade:** alta para acessibilidade  
**Confiança:** alta

Os doze cartões e o controle de fechar são `div` com listener de `click`, sem `button`, `tabindex` ou evento de teclado. O próprio inventário do E2P os classificou como controles “visuais”, fora da árvore de ações acessíveis. Para um produto descrito como auxiliar pessoas não verbais, impedir operação por teclado ou tecnologia assistiva compromete a função central.

### Bug válido 2: lista de vozes pode acumular duplicatas

**Severidade:** baixa-média  
**Confiança:** alta no código

`getVoices()` acrescenta opções sem limpar o `select`, é chamado durante a inicialização e novamente a cada `voiceschanged`. Se a lista já estiver disponível na primeira chamada ou o evento ocorrer mais de uma vez, as mesmas vozes são anexadas repetidamente.

### Avaliação do caçador automático

Este é o exemplo mais claro de erro de modalidade do oráculo: o pipeline julgou áudio usando somente visão/DOM. Os 4/4 testes verdes também não demonstram que texto algum foi falado; eles verificam apenas que os cliques e preenchimentos não falharam.

### Veredito

- Duas hipóteses retidas: **dois falsos positivos**.
- 4/4 testes verdes: **smoke tests visuais, sem oráculo de áudio**.
- Operabilidade e duplicação de vozes: **dois bugs válidos**.

### Eu conseguiria encontrar bugs neste projeto?

**Sim.** Eu instrumentaria `speechSynthesis.speak` para conferir texto/voz/fila, simularia `voiceschanged` repetido e faria toda a jornada somente por teclado. O E2P atual fez os cliques, mas não observou o efeito que define sucesso.

### Evidências

- Resultado: `action-e2e/prototype-runs/speech-text-reader-2026-09-05T12-58-55-783Z/results/blind-evaluation.json`
- Clique em `div`: `candidates/vanillawebprojects/speech-text-reader/script.js:74`
- Opções acumulativas: `candidates/vanillawebprojects/speech-text-reader/script.js:101`
- Chamada de áudio não observada pelo E2P: `candidates/vanillawebprojects/speech-text-reader/script.js:112`

## 23. Vanilla Web Projects — Typing Game

### Identificação da execução

- Subprojeto: `typing-game`
- Execução: `typing-game-2026-09-05T13-07-48-070Z`
- Resultado E2P: `completed`
- Exploração: 5 ações, 5 transições alteradas, 6 estados, 0 falhas de ação
- Testes: 5 gerados, 5 aprovados
- Hipóteses: 3 retidas, todas falsos positivos

### O que foi realmente coberto

O agente preencheu uma palavra genérica que não correspondia necessariamente à palavra sorteada, mudou a dificuldade, pressionou Enter, abriu as configurações, aguardou o fim e recarregou. Não completou deliberadamente a ação central de acertar uma palavra antes do fim.

### Falsos positivos retidos: persistência contradita pela evidência

As três hipóteses têm o mesmo título, “Difficulty Setting Not Persisted”. Uma revisão diz que a tela mostra `Easy`, contradizendo a própria hipótese, mas ainda a reteve. Outra mistura a palavra digitada (`admit` versus `sigh`) com a persistência. Na validação manual, selecionei `Easy`, recarreguei e o seletor voltou corretamente em `Easy`.

### Bug válido 1: jogo continua aceitando respostas após terminar

**Severidade:** alta  
**Confiança:** alta; reproduzido no navegador

Depois de “Time ran out”, o input permanece habilitado e seu listener continua ativo. Ao digitar a palavra ainda exibida após o fim, a pontuação passou de 1 para 2, o tempo mudou para 4 s e a sobreposição continuou informando “Your final score is 0”. Há três estados mutuamente incompatíveis na mesma tela.

### Bug válido 2: bônus de tempo sofre decremento imediato

**Severidade:** média  
**Confiança:** alta no código

Ao acertar, o código soma 2/3/5 segundos conforme a dificuldade e chama imediatamente `updateTime()`, que subtrai um segundo antes de renderizar. O bônus líquido é 1/2/4, não o valor configurado. O problema fica ainda mais evidente após o fim, quando o intervalo já parou e a resposta reanima apenas o número visual.

### Bug válido 3: botão de configurações não possui nome acessível útil

**Severidade:** média para acessibilidade  
**Confiança:** alta

O botão contém somente um ícone Font Awesome sem `aria-label`. Na árvore acessível, seu nome era o glifo privado ``, não “Settings”. Usuários de leitor de tela não recebem a finalidade do controle.

### Avaliação do caçador automático

A run fez 5/5 testes passarem e reteve três falsos positivos, mas não verificou a propriedade mais importante: “uma palavra correta altera pontuação/tempo exatamente uma vez e somente enquanto a partida está ativa”. O caso mostra por que exploração orientada a propriedades e estados de ciclo de vida supera sequência genérica de cliques.

### Veredito

- Persistência de dificuldade: **funciona; três falsos positivos**.
- Entrada após game over: **bug válido, reproduzido**.
- Bônus e nome do botão: **dois bugs válidos**.

### Eu conseguiria encontrar bugs neste projeto?

**Sim — e encontrei um apenas combinando fronteira temporal com a ação central.** Eu também testaria cada dificuldade com relógio virtual, múltiplos acertos no mesmo segundo, input exatamente em zero, persistência entre contextos e operação por teclado/leitor de tela.

### Evidências

- Resultado: `action-e2e/prototype-runs/typing-game-2026-09-05T13-07-48-070Z/results/blind-evaluation.json`
- Fim do jogo sem desabilitar input: `candidates/vanillawebprojects/typing-game/script.js:92`
- Listener ainda ativo: `candidates/vanillawebprojects/typing-game/script.js:107`
- Decremento após bônus: `candidates/vanillawebprojects/typing-game/script.js:125`

## Ciclo de melhoria do E2P — implementação e retestes

### Mudanças implementadas

1. Exceções de página e erros de console acionáveis tornaram-se hipóteses determinísticas de `runtime-diagnostic`; 404 genérico de recurso continua filtrado.
2. A reprodução independente agora é um gate: estado divergente, reprodução bloqueada ou diagnóstico que não reaparece deixa de ser retido.
3. Alegações sobre áudio são rejeitadas quando a run não capturou áudio/evento de síntese.
4. Alegações de drag, scroll ou hover são rejeitadas se esse tipo de ação não ocorreu.
5. Valores de `input` passaram a integrar a checagem de contradição do crítico determinístico.
6. O compilador deixou de procurar o valor digitado com `getByText`; quando o valor permanece no campo, gera `toHaveValue` no próprio input.

### Reteste 1 — Music Player

- Antes: execução `music-player-2026-09-03T03-13-28-079Z`; 0 hipóteses retidas, embora `pageErrors` contivesse a exceção.
- Depois: execução `music-player-2026-09-05T13-22-09-407Z`; 1 diagnóstico acionável retido e 0 rejeitado na reprodução.
- Achado: `Unhandled page error: Cannot set properties of null (setting 'innerHTML')`.
- Reprodução: `runtime-diagnostic-reproduced`; a mesma assinatura apareceu duas vezes em uma sessão limpa.
- Teste gerado: 1/1 aprovado. Isso continua sendo somente um smoke test e não anula o diagnóstico.

**Resultado parcial:** melhora confirmada na descoberta de exceções reais. O bug anteriormente ignorado passou a ser encontrado com evidência direta e repetível.

### Reteste 2 — Speech Text Reader

- Antes: execução `speech-text-reader-2026-09-05T12-58-55-783Z`; 2 hipóteses de ausência de áudio retidas, ambas sem evidência sonora.
- Depois: execução `speech-text-reader-2026-09-05T13-26-28-422Z`; 6 candidatos redigidos, 6 rejeitados deterministicamente e 0 retidos.
- Quatro candidatos de silêncio/fala foram rejeitados com a razão correta: a run não capturou áudio nem eventos de síntese.
- O primeiro ciclo gerou 6 testes: 3 passaram e 3 falharam porque Enter em `textarea` transformou `A` em `A\n`; o novo `toHaveValue("A")` ainda era exato demais.
- Correção incremental: o compilador agora usa o valor final efetivamente observado (`A\n`) e a taxonomia passou a classificar falha de `expect(locator).toHaveValue` como `behavior-assertion`, não `automation-locator`.

**Resultado parcial:** precisão melhorou de 0/2 para ausência correta de achados. A regressão do novo oráculo foi detectada pelo próprio reteste e corrigida; a suíte direcionada confirmou a correção.

### Reteste 3 — Typing Game

- Duas tentativas intermediárias (`typing-game-2026-09-05T13-31-06-228Z` e `typing-game-2026-09-05T13-31-43-689Z`) pararam após três ações válidas porque o modelo insistiu numa ação fora do conjunto seguro.
- Mudança adicional: decisão inválida tardia agora encerra a exploração de forma graciosa e preserva a cobertura; continua fatal se ocorrer antes de qualquer ação útil.
- Uma execução intermediária completa (`typing-game-2026-09-05T13-33-02-202Z`) rejeitou um dos falsos positivos de persistência, mas reteve outro porque os estados não registravam o valor selecionado.
- Mudança adicional: o estado agora registra o rótulo da opção selecionada e alegações de persistência exigem reload/nova sessão entre as evidências citadas.
- Execução final: `typing-game-2026-09-05T13-38-58-389Z`; 5 ações, 6 estados, 2 candidatos, 2 rejeitados, 0 retidos; 4/4 testes aprovados.
- “Difficulty Setting Not Persisted” foi rejeitada porque a evidência já continha o resultado esperado. “Score is not updated correctly” foi rejeitada porque a ação necessária não foi executada.

**Resultado parcial:** precisão melhorou de 0/3 para ausência correta de achados no mesmo tipo de jornada. O bug real de pós-game-over continua fora porque a exploração ainda não combina palavra correta com a fronteira temporal.

## Julgamento sobre o E2P como caçador de bugs

### Pontos positivos observados

- Conseguiu iniciar projetos de stacks diferentes e produzir jornadas reproduzíveis.
- Preservou estados, screenshots, ações, diagnósticos e testes, dando boa auditabilidade.
- A proteção contra overlay revelou um erro real do Dopa.
- A reprodução em sessão limpa ajuda a separar estado transitório de observação repetível.

### Problemas mais sérios

1. **Expectativas inventadas:** no Janvas, o modelo criou um requisito que contradizia o produto.
2. **Confusão entre estado intermediário e resultado:** no Form Validator, ausência de erro antes do submit virou “bug”.
3. **Reprodução insuficiente:** repetir o mesmo estado confirma a observação, mas não a expectativa normativa. O próprio relatório admite isso, porém ainda retém a hipótese.
4. **Cobertura superficial:** duas ações no Form Validator e duas no Dopa são insuficientes para caçar bugs de lógica.
5. **Diagnóstico não convertido em achado:** o hydration mismatch do Janvas estava disponível e foi ignorado.
6. **Classificação de causa incorreta:** o overlay real do Dopa foi contabilizado como `automation-locator`.
7. **Sem matriz de navegadores:** o explorador está preso ao Chromium; não cobre Firefox apesar do requisito.

### Julgamento final desta iteração

O E2P demonstrou valor como **coletor estruturado de evidências e gerador de smoke tests**, mas ainda não foi confiável como caçador autônomo de bugs nesta amostra. A taxa de aprovação dos testes gerados não deve ser interpretada como qualidade do produto: Janvas e Form Validator passaram em 2/2 e ainda assim tinham bugs reais fora das jornadas escolhidas.

Eu próprio consigo encontrar bugs nesses projetos porque posso combinar três fontes que o fluxo atual integra mal: exploração orientada por riscos, leitura do código e verificação dirigida no navegador. O Form Validator prova isso diretamente; o Janvas e o Dopa reforçam o padrão.

## Recomendações para as próximas iterações

1. Emitir/atualizar este relatório após cada subprojeto, antes de iniciar o seguinte.
2. Exigir que toda hipótese cite a ação disparadora e o estado posterior, não apenas um estado intermediário.
3. Rejeitar expectativas de “documentação” sem apontar o trecho documental exato.
4. Separar “observação reproduzida” de “bug confirmado” no status final.
5. Direcionar exploração por riscos do tipo de aplicação: limites e combinações em formulários; persistência e cálculos em Movie Seat Booking; autenticação simulada em Janvas.
6. Transformar `pageErrors` e overlays em candidatos de primeira classe para revisão.
7. Corrigir a taxonomia de falhas para distinguir automação, ambiente e aplicação alvo.
8. Adicionar seleção real de `chromium`, `firefox` e `webkit` ao runner.

## Próximo estado de trabalho

Nenhuma nova run foi iniciada após a interrupção. O próximo alvo deve ser retomado individualmente; ao concluir, este documento deve receber uma nova seção e um novo resumo consolidado antes de prosseguir.
