# Relatorio da bancada de aplicacoes web do E2P

## 1. Resumo executivo

Este documento consolida a avaliacao do estado atual do Action E2E Prototype (E2P) contra uma bancada local de aplicacoes web. A avaliacao foi conduzida em 25 de agosto de 2026 por meio da interface grafica do E2P, em um navegador visivel, reproduzindo o percurso de um usuario da ferramenta. Nao foram criados scripts externos, regras especificas para cada alvo ou adaptacoes nos projetos avaliados.

Foram iniciadas execucoes em 17 das 20 aplicacoes disponiveis na bancada. A exploracao orientada pelo modelo foi concluida em 16 delas. Quinze aplicacoes chegaram ate a geracao e execucao dos testes; `recipe-finder` foi interrompido depois da exploracao por decisao do usuario, e `expense-tracker` foi interrompido corretamente pelo E2P depois que o modelo solicitou uma acao invalida.

Os resultados demonstram que a infraestrutura da pipeline e funcional e reutilizavel: o E2P carregou projetos diferentes, inferiu como inicia-los, abriu suas interfaces, executou 131 acoes, registrou 65 estados, gerou fluxos, produziu testes Playwright e preservou evidencias. Entretanto, a bancada tambem revelou limitacoes importantes na profundidade dos fluxos, na qualidade das expectativas, na calibracao de confianca e na robustez dos seletores gerados.

O resultado mais importante e o seguinte:

> A bancada comprovou a viabilidade operacional da pipeline, mas nao confirmou nenhum defeito real nas aplicacoes-alvo. As cinco falhas de teste observadas foram causadas por problemas nos testes gerados pelo E2P, e parte significativa das hipoteses de defeito apresentou sinais de falso positivo.

Portanto, o estado atual deve ser caracterizado como um prototipo experimental promissor, mas ainda nao como uma solucao pronta para assumir autonomamente uma funcao abrangente de QA.

## 2. Objetivos da bancada

A bancada buscou responder as seguintes perguntas:

1. O E2P consegue carregar projetos web diferentes sem adaptacoes especificas?
2. O E2P consegue inferir como iniciar a aplicacao e encontrar a interface em execucao?
3. O modelo consegue explorar a interface por meio das acoes disponibilizadas pelo E2P?
4. As observacoes coletadas sao transformadas em fluxos e criterios de aceite relevantes?
5. Os testes Playwright gerados sao executaveis e tecnicamente robustos?
6. As hipoteses de defeito sao sustentadas pelas evidencias observadas?
7. A pipeline oferece rastreabilidade suficiente para revisao humana?

## 3. Configuracao experimental

### 3.1 Ambiente de uso

- Ferramenta avaliada: Action E2E Prototype.
- Modelo principal: `qwen2.5vl:7b`.
- Provedor: Ollama local.
- Modo de acesso: guest.
- Navegador: Firefox em modo visivel.
- Ferramenta de execucao E2E: Playwright.
- Projetos-alvo: subdiretorios de `C:\Users\henri\Documents\web-apps\apps`.
- Operacao: interface grafica do E2P, utilizando os mesmos botoes e campos oferecidos a um usuario final.
- Adaptacoes especificas aos alvos: nenhuma.
- Alteracoes no codigo dos projetos-alvo: nenhuma.

### 3.2 Procedimento utilizado

Para cada aplicacao, o seguinte percurso foi realizado sempre que a etapa anterior permitiu a continuidade:

1. Informar o diretorio local do projeto.
2. Carregar o projeto na interface do E2P.
3. Manter o modelo `qwen2.5vl:7b` selecionado.
4. Executar a inspecao e o enriquecimento semantico.
5. Iniciar a exploracao da interface em execucao.
6. Acompanhar visualmente as decisoes e estados apresentados pelo E2P.
7. Solicitar a geracao de fluxos e criterios de aceite.
8. Manter os fluxos propostos aprovados, reproduzindo o comportamento padrao da interface.
9. Gerar os testes Playwright.
10. Executar os testes e coletar screenshots, videos, traces, logs e resultados.

Os artefatos de cada execucao foram armazenados em [`prototype-runs`](prototype-runs/).

### 3.3 Escopo efetivamente executado

Das 20 aplicacoes existentes, 17 tiveram uma execucao iniciada. As tres aplicacoes abaixo nao foram iniciadas porque a rodada foi encerrada quando a amostra ja havia revelado padroes repetidos:

- `restaurant-finder`
- `travel-destination-explorer`
- `word-guessing-game`

O `recipe-finder` concluiu a exploracao e a descoberta de hipoteses, mas nao chegou a geracao de fluxos e testes. Ele e tratado como avaliacao parcial neste relatorio.

## 4. Resultados quantitativos

| Indicador | Resultado |
|---|---:|
| Projetos com execucao iniciada | 17 |
| Exploracoes concluidas | 16 |
| Exploracoes interrompidas por erro do modelo | 1 |
| Aplicacoes que chegaram a execucao dos testes | 15 |
| Acoes executadas durante as exploracoes | 131 |
| Estados distintos registrados | 65 |
| Hipoteses de defeito retidas | 41 |
| Hipoteses rejeitadas pelo critico | 11 |
| Total de candidatas analisadas | 52 |
| Hipoteses com confianca media | 40 |
| Hipoteses com confianca alta | 1 |
| Fluxos aprovados e automatizados | 19 |
| Fluxos classificados com confianca alta | 19 |
| Testes executados | 19 |
| Testes aprovados | 14 |
| Testes reprovados | 5 |
| Testes ignorados | 0 |

Indicadores derivados:

- Taxa de conclusao da exploracao: **94,1%** (16 de 17).
- Taxa tecnica de aprovacao dos testes: **73,7%** (14 de 19).
- Aplicacoes com pelo menos um teste aprovado: **80,0%** das 15 executadas.
- Media de fluxos por aplicacao que chegou a execucao: **1,27**.
- Aplicacoes reduzidas a somente um fluxo: **11 de 15**.
- Media de hipoteses por exploracao concluida: **2,56**.
- Taxa de rejeicao do critico: **21,2%** (11 de 52 candidatas).

A taxa de aprovacao dos testes nao deve ser interpretada como cobertura ou eficacia de QA. Um unico teste superficial pode passar sem exercitar as principais funcionalidades da aplicacao.

## 5. Resultado por aplicacao

| Aplicacao | Exploracao | Hipoteses | Fluxos | Execucao | Observacao principal |
|---|---:|---:|---:|---:|---|
| [`airport-flight-board`](prototype-runs/airport-flight-board-2026-08-25T19-54-35-428Z/) | Concluida | 1 | 2 | 0/2 passaram | Ambos os testes expiraram procurando um campo de selecao por um nome acessivel incorreto. |
| [`event-explorer`](prototype-runs/event-explorer-2026-08-25T20-00-53-596Z/) | Concluida | 3 | 2 | 2/2 passaram | Execucao tecnica bem-sucedida, mas as hipoteses confundiram filtros e buscas sem resultado com defeitos. |
| [`expense-tracker`](prototype-runs/expense-tracker-2026-08-25T20-06-43-453Z/) | Falhou | 0 | 0 | Nao executado | A pipeline parou na decisao 2 porque o modelo solicitou `select` sem um valor permitido. |
| [`fake-ecommerce`](prototype-runs/fake-ecommerce-2026-08-25T20-09-19-879Z/) | Concluida | 4 | 1 | 1/1 passou | O unico fluxo apenas abriu o carrinho; hipoteses usaram produtos arbitrarios e ate trataram carrinho vazio correto como anomalia. |
| [`food-delivery`](prototype-runs/food-delivery-2026-08-25T20-16-38-979Z/) | Concluida | 4 | 1 | 1/1 passou | O modelo limitou-se a categoria de pizzas e inferiu, sem base, que o campo de busca deveria limpar depois de Enter. |
| [`habit-tracker`](prototype-runs/habit-tracker-2026-08-25T20-24-41-029Z/) | Concluida | 1 | 1 | 1/1 passou | O fluxo cobriu criacao de habito, mas a hipotese esperava confirmacao ou redirecionamento nao exigidos pela interface. |
| [`job-board`](prototype-runs/job-board-2026-08-25T20-31-36-819Z/) | Concluida | 2 | 1 | 1/1 passou | As duas hipoteses eram variacoes de ausencia de resultados depois de filtros. |
| [`kanban-board`](prototype-runs/kanban-board-2026-08-25T20-37-39-592Z/) | Concluida | 2 | 1 | 1/1 passou | Foram produzidas duas hipoteses duplicadas sobre a mesma tarefa, embora o teste de adicionar tarefa tenha passado. |
| [`memory-matching-game`](prototype-runs/memory-matching-game-2026-08-25T20-45-22-461Z/) | Concluida | 2 | 2 | 1/2 passou | Um teste falhou porque o seletor `?` correspondia simultaneamente as oito cartas. |
| [`mini-social-network`](prototype-runs/mini-social-network-2026-08-25T20-52-13-075Z/) | Concluida | 4 | 1 | 1/1 passou | A exploracao observou o contador de curtidas mudar, mas uma hipotese afirmou que ele nao mudou. |
| [`movie-series-explorer`](prototype-runs/movie-series-explorer-2026-08-25T21-01-38-767Z/) | Concluida | 3 | 2 | 2/2 passaram | Melhor resultado tecnico da rodada, mas ainda houve falsas expectativas sobre termos e generos sem resultados. |
| [`parking-finder`](prototype-runs/parking-finder-2026-08-25T21-09-04-368Z/) | Concluida | 2 | 1 | 1/1 passou | As hipoteses assumiram que consultas arbitrarias deveriam necessariamente retornar vagas. |
| [`pet-adoption-browser`](prototype-runs/pet-adoption-browser-2026-08-25T21-16-05-274Z/) | Concluida | 5 | 1 | 1/1 passou | A exploracao foi rica, com 14 acoes e tela de detalhes, mas foi comprimida em um unico fluxo. |
| [`public-transport-planner`](prototype-runs/public-transport-planner-2026-08-25T21-24-36-001Z/) | Concluida | 1 | 1 | 1/1 passou | A ausencia de rota entre dois locais foi tratada como defeito sem evidencia de que a combinacao deveria existir. |
| [`quiz-game`](prototype-runs/quiz-game-2026-08-25T21-31-34-881Z/) | Concluida | 1 | 1 | 0/1 passou | O teste expirou procurando um campo de dificuldade por um nome acessivel incorreto. |
| [`real-estate-browser`](prototype-runs/real-estate-browser-2026-08-25T21-38-55-204Z/) | Concluida | 4 | 1 | 0/1 passou | O teste expirou ao tentar selecionar faixa de preco com um seletor fragil. |
| [`recipe-finder`](prototype-runs/recipe-finder-2026-08-25T21-46-02-370Z/) | Concluida | 2 | 0 | Nao executado | A rodada foi encerrada depois da exploracao; ambas as hipoteses dependiam da premissa de que `lemon` deveria retornar receitas. |

## 6. Pontos positivos observados

### 6.1 Inicializacao generalizavel

O E2P conseguiu trabalhar com uma colecao variada de aplicacoes sem configuracoes especificas por projeto. A deteccao de comandos e a capacidade de encontrar a aplicacao efetivamente executada se mostraram mais maduras do que nas primeiras versoes do prototipo. Em diferentes execucoes, a interface configurada inicialmente como `127.0.0.1:3000` foi ajustada para a instancia real servida em `localhost:5173`.

### 6.2 Exploracao efetivamente orientada pelo modelo

As evidencias mostram que o modelo nao ficou restrito a carregar a pagina principal. Ele preencheu campos, pressionou Enter, selecionou opcoes, aplicou filtros, abriu detalhes, acionou curtidas, criou tarefas e percorreu estados de jogos. O `mini-social-network`, por exemplo, chegou a 14 acoes e 11 estados; o `pet-adoption-browser` chegou a 14 acoes e seis estados.

### 6.3 Observabilidade para o usuario

O painel de atividade tornou visiveis o numero da decisao, o orcamento adaptativo, a acao escolhida, a justificativa, o resultado esperado e a screenshot mais recente. Durante operacoes longas, tambem foi possivel distinguir exploracao, descoberta de hipoteses e critica das candidatas. Isso reduziu significativamente a sensacao de congelamento da aplicacao.

### 6.4 Comportamento AI-first coerente em caso de falha

No `expense-tracker`, o modelo solicitou uma acao `select` sem fornecer um valor permitido. O E2P interrompeu a pipeline e exibiu a causa, em vez de substituir silenciosamente a decisao por uma heuristica. Esse comportamento e coerente com o objetivo experimental de avaliar o modelo, porque torna a falha observavel e atribuivel.

### 6.5 Rastreabilidade dos resultados

Cada execucao preservou, quando disponivel:

- inspecao do projeto;
- configuracao de runtime;
- jornada da exploracao;
- screenshots dos estados;
- hipoteses retidas e rejeitadas;
- fluxos aprovados;
- testes gerados;
- resultado Playwright;
- screenshots, videos e traces da execucao;
- sintese final de insights.

Essa estrutura permite auditoria posterior e e um ponto forte para a metodologia de pesquisa.

### 6.6 Separacao formal entre fato e hipotese

Os relatorios identificaram os itens como hipoteses nao confirmadas e preservaram campos separados para resultado observado, resultado esperado, justificativa e nivel de confianca. Embora a qualidade do conteudo ainda precise melhorar, a estrutura de dados e apropriada para revisao humana.

## 7. Pontos negativos e limitacoes

### 7.1 Cobertura funcional rasa

Onze das quinze aplicacoes que chegaram a execucao receberam apenas um fluxo. A media geral foi de 1,27 fluxo por aplicacao, valor insuficiente para representar uma implantacao abrangente de QA.

Esse problema foi especialmente evidente em aplicacoes com varias oportunidades:

- `fake-ecommerce` foi reduzido a abrir o carrinho vazio;
- `food-delivery` foi reduzido a abrir a categoria de pizzas;
- `mini-social-network` foi reduzido a publicar uma atualizacao;
- `pet-adoption-browser` foi reduzido a um fluxo generico, apesar de filtros, favoritos e detalhes;
- `real-estate-browser` foi reduzido a uma unica busca.

### 7.2 Perda de informacao entre exploracao e planejamento

A exploracao frequentemente registrou mais comportamentos do que a etapa de fluxos utilizou. O caso mais claro e `mini-social-network`: 14 acoes e 11 estados resultaram em somente um fluxo. O mesmo ocorreu com `kanban-board` e `pet-adoption-browser`.

Isso indica que o gargalo principal nao e apenas descobrir controles, mas sintetizar a evidencia em uma carteira diversificada de cenarios.

### 7.3 Expectativas nao fundamentadas

Muitas hipoteses assumiram que uma consulta arbitraria deveria possuir resultados. Exemplos incluem:

- `Fone Nebula` no comercio eletronico;
- `Pizza Marguerita` no aplicativo de entrega;
- `Jazz ao por do sol` em uma categoria especifica;
- `Horizonte Azul` combinado com generos sem itens;
- `lemon` no buscador de receitas;
- rotas entre locais escolhidos pelo modelo.

A existencia de busca ou filtros nao implica que todo termo deva produzir resultados. Ausencia de dados somente pode ser tratada como anomalia quando houver evidencia de que o item deveria existir.

### 7.4 Inferencias baseadas em convencoes incorretas

O modelo utilizou convencoes inexistentes como comportamento esperado. Exemplos:

- esperar que um campo de busca seja limpo depois de pressionar Enter;
- esperar que um filtro navegue para outra pagina;
- esperar redirecionamento ou notificacao depois de cadastrar um habito;
- tratar a mensagem correta de carrinho vazio como defeito;
- considerar que cartas mostrando `?` depois de reiniciar representam necessariamente falha no reset.

### 7.5 Contradicoes com a propria evidencia

O problema mais preocupante ocorreu quando uma hipotese contradisse fatos registrados:

- no `mini-social-network`, a exploracao observou o contador de curtidas passar de 11 para 12, mas uma hipotese afirmou que o numero nao mudou;
- no `food-delivery`, uma hipotese sobre notificacao ausente descreveu, no proprio resultado observado, que a mensagem de carrinho vazio estava presente;
- no `kanban-board`, foram mantidas duas copias da mesma hipotese, enquanto o teste de adicionar tarefa foi aprovado;
- no jogo da memoria, duas hipoteses equivalentes sobre reinicio foram mantidas e um dos fluxos relacionados passou.

O critico rejeitou 11 candidatas, mas ainda reteve itens que poderiam ser eliminados por verificacoes de consistencia mais simples.

### 7.6 Seletores Playwright frageis

As cinco falhas da execucao automatizada foram explicadas por problemas nos testes gerados:

1. Dois testes do painel de voos aguardaram um `combobox` com nome acessivel incorreto ate o timeout de 60 segundos.
2. O jogo da memoria tentou clicar em `getByRole('button', { name: '?' })`, que correspondia a oito cartas e causou violacao de modo estrito.
3. O quiz aguardou um campo de dificuldade por um nome acessivel concatenado que nao correspondia ao DOM executado.
4. O navegador de imoveis apresentou o mesmo problema ao selecionar a faixa de preco.

Nenhuma dessas cinco falhas demonstra defeito na aplicacao-alvo. Elas demonstram que o gerador precisa validar os locators contra a interface real antes de salvar ou executar o teste.

### 7.7 Calibracao de confianca inadequada

Todas as 19 propostas de fluxo foram classificadas como alta confianca, mesmo quando:

- havia somente um fluxo superficial;
- existiam premissas inventadas, como usuario autenticado em aplicacoes guest;
- o teste gerado depois falhou por seletor invalido;
- a cobertura ignorava funcionalidades evidentes.

Por outro lado, 40 das 41 hipoteses foram marcadas como confianca media e somente uma como alta. Essa uniformidade sugere que os rotulos nao estao discriminando adequadamente a qualidade real das saidas.

### 7.8 Duplicacao de hipoteses

O `kanban-board` e o jogo da memoria produziram hipoteses duplicadas sobre o mesmo comportamento. A ausencia de deduplicacao aumenta o volume aparente de descobertas sem aumentar a informacao util.

### 7.9 Custo temporal

Exploracoes com muitos estados exigiram varios minutos, especialmente quando cada lote era analisado novamente para descoberta e critica de defeitos. Esse custo seria aceitavel se produzisse cobertura profunda, mas se torna desproporcional quando o resultado final contem somente um fluxo.

### 7.10 Nenhum defeito confirmado

As 41 hipoteses permaneceram nao confirmadas. Nesta rodada, nenhuma delas reuniu simultaneamente:

- uma expectativa claramente fundamentada;
- uma reproducao independente bem-sucedida;
- uma diferenca inequivoca entre observado e esperado;
- um teste robusto que falhasse pelo comportamento do alvo, e nao pelo locator.

O E2P encontrou comportamentos que merecem revisao, mas a bancada nao permite afirmar que um bug real tenha sido descoberto.

## 8. Descobertas e questoes interessantes

### 8.1 Explorar bem nao garante planejar bem

O resultado separa duas capacidades que antes podiam parecer equivalentes. O modelo pode realizar varias acoes relevantes e ainda produzir um unico fluxo superficial. A qualidade da exploracao deve ser medida separadamente da qualidade da sintese dos testes.

### 8.2 Visao nao elimina erros semanticos

O uso de um modelo com capacidade visual e screenshots melhora a contextualizacao, mas nao garante que o modelo interprete corretamente o significado da tela. A contradicao do contador de curtidas demonstra que percepcao visual, memoria da trajetoria e julgamento semantico precisam ser avaliados separadamente.

### 8.3 Passar nao significa agregar valor

Quatorze testes passaram, mas varios verificaram somente uma jornada estreita. Um teste de abrir carrinho vazio pode ser tecnicamente estavel e ainda ter baixo valor para uma equipe que precisa validar busca, detalhes, adicao, remocao, quantidade e checkout.

### 8.4 Falhar tambem nao significa encontrar um bug

As cinco falhas foram falhas de automacao. Esse resultado reforca a necessidade de separar pelo menos tres classes:

1. falha da pipeline ou do modelo;
2. falha do teste gerado;
3. possivel defeito da aplicacao-alvo.

Sem essa classificacao, a taxa de falhas pode ser interpretada incorretamente como eficacia de descoberta de bugs.

### 8.5 O critico ajuda, mas nao resolve sozinho

O critico rejeitou 21,2% das candidatas, mostrando que a segunda avaliacao possui utilidade. Entretanto, ele reteve contradicoes e expectativas arbitrarias. Um segundo modelo usando o mesmo contexto e as mesmas premissas pode reproduzir os mesmos vieses do autor inicial.

### 8.6 O encerramento controlado e um resultado experimental valido

A interrupcao do `expense-tracker` e valiosa porque mostra um limite real do modelo: ele escolheu `select` sem um valor seguro. Como o E2P nao recorreu silenciosamente a heuristicas, a falha pode ser contabilizada em futuras comparacoes entre modelos.

### 8.7 A bancada ja permite comparar modelos

Os 17 diretorios preservam uma referencia util para repetir o experimento com outros modelos. As mesmas aplicacoes podem ser usadas para comparar:

- taxa de conclusao da exploracao;
- quantidade e diversidade de estados;
- cobertura de oportunidades observadas;
- numero de fluxos distintos;
- taxa de locators validos;
- falsos positivos;
- contradicoes com evidencias;
- custo de execucao;
- quantidade de defeitos confirmados por humanos.

## 9. Melhorias recomendadas

### Prioridade 1: validar testes antes da execucao final

O E2P deve verificar cada locator contra a aplicacao em execucao antes de aceitar o arquivo gerado. A validacao deve detectar:

- nenhum elemento encontrado;
- mais de um elemento encontrado;
- valor inexistente em `select`;
- nome acessivel concatenado ou instavel;
- ausencia de correspondencia entre a acao explorada e o locator compilado.

Quando houver ambiguidade, o modelo deve receber novamente o catalogo de controles e corrigir o teste antes da execucao oficial.

### Prioridade 2: exigir fundamentacao para o resultado esperado

Uma hipotese baseada em conteudo deve indicar de onde vem a certeza de que esse conteudo existe. Sao fontes aceitaveis:

- dado observado anteriormente na propria interface;
- documentacao explicita;
- estado anterior reproduzivel;
- regra de negocio identificada no projeto;
- consistencia interna demonstravel.

Convencoes genericas e termos inventados nao devem ser suficientes para reter uma hipotese.

### Prioridade 3: adicionar uma etapa de confirmacao da hipotese

Antes de exibir um item como forte candidato, o E2P deve gerar uma jornada curta de reproducao e executa-la novamente a partir de um estado limpo. O resultado pode ser classificado como:

- reproduzido;
- nao reproduzido;
- inconclusivo;
- bloqueado por falha da automacao.

Isso nao elimina a validacao humana, mas reduz falsos positivos obvios.

### Prioridade 4: transformar cobertura observada em cobertura planejada

A quantidade de fluxos nao deve ser fixa. O planejamento deve considerar as oportunidades efetivamente observadas, por exemplo:

- busca e filtro;
- abertura de detalhes;
- favoritos;
- criacao e remocao;
- mudanca de estado;
- navegacao;
- estado vazio;
- validacao de formulario;
- progressao de jogo.

Se a exploracao cobriu cinco areas distintas e somente uma virou fluxo, o E2P deve justificar explicitamente por que as demais foram descartadas.

### Prioridade 5: verificar consistencia antes da critica por modelo

Antes de consultar o critico, verificacoes estruturais podem remover candidatas contraditorias:

- o esperado ja aparece no estado observado;
- a metrica realmente mudou depois da acao;
- a hipotese duplica outra candidata;
- os passos citam uma acao que nao foi executada;
- o estado referenciado nao contem o elemento descrito.

Essas verificacoes nao substituem o modelo; elas garantem que ele avalie um conjunto mais coerente de evidencias.

### Prioridade 6: recalibrar confianca

A confianca deve refletir dimensoes mensuraveis, como:

- proporcao de passos sustentados por estados reais;
- validade dos locators;
- quantidade de premissas;
- reproducibilidade;
- qualidade da fonte do resultado esperado;
- concordancia entre modelo autor, critico e execucao.

Um fluxo nao deve receber alta confianca apenas por possuir JSON valido.

### Prioridade 7: comparar modelos e separar papeis

A bancada deve ser repetida com modelos diferentes e, quando possivel, com um modelo revisor diferente do autor. Isso permite avaliar se os problemas decorrem:

- do modelo `qwen2.5vl:7b`;
- dos prompts e contratos do E2P;
- da quantidade de contexto;
- da arquitetura da pipeline;
- da compilacao das jornadas para Playwright.

## 10. Criterios sugeridos para a proxima rodada

Uma nova bancada deve considerar sucesso somente quando uma aplicacao atender simultaneamente aos seguintes criterios:

1. A exploracao termina sem violar o contrato de acoes.
2. As principais areas observadas sao representadas por fluxos distintos.
3. Todos os locators sao validados antes da execucao.
4. Cada resultado esperado possui fonte identificavel.
5. Hipoteses duplicadas ou contraditorias sao removidas.
6. Falhas sao classificadas como pipeline, automacao ou aplicacao-alvo.
7. Hipoteses importantes sao reproduzidas em uma segunda jornada.
8. Um humano consegue confirmar ou rejeitar o item usando os passos e evidencias fornecidos.

Metricas recomendadas:

- conclusao da exploracao;
- cobertura de oportunidades observadas;
- diversidade de fluxos;
- taxa de locators validos;
- taxa de execucao sem falha de automacao;
- precisao das hipoteses apos revisao humana;
- taxa de reproducao;
- defeitos confirmados por aplicacao;
- tempo e uso de recursos por etapa;
- variacao entre modelos.

## 11. Conclusao

A bancada cumpriu um papel importante ao deslocar a avaliacao do E2P de demonstracoes isoladas para uma amostra heterogenea de aplicacoes. O prototipo demonstrou que consegue operar uma pipeline integrada, iniciar projetos, explorar interfaces por meio de um modelo, produzir artefatos estruturados e executar testes com evidencias.

Ao mesmo tempo, os resultados mostram que a principal questao de pesquisa permanece aberta: a pipeline ainda nao demonstrou capacidade confiavel de encontrar defeitos reais de maneira autonoma. O maior obstaculo nao esta na inicializacao dos projetos, mas na passagem entre evidencia observada, interpretacao semantica, planejamento de cobertura e geracao de testes robustos.

O valor imediato do E2P esta na instrumentacao experimental e na rastreabilidade. A proxima evolucao deve concentrar-se em reduzir falsos positivos, validar automaticamente os testes gerados, preservar a riqueza da exploracao na etapa de planejamento e confirmar hipoteses por reproducao independente. Com essas melhorias, a mesma bancada podera medir de forma objetiva se o sistema evolui de um gerador experimental de jornadas para um assistente de QA capaz de produzir descobertas tecnicamente defensaveis.

