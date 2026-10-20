# Caracterização do corpus e alcance dos resultados

Inclusão das 21 aplicações independentes da cópia local de Vanilla Web Projects; seleção de conveniência de um único repositório educacional, sem amostragem probabilística.

Família principal atribuída por revisão do propósito e dos arquivos locais; famílias são mutuamente exclusivas para agregação, mas capacidades se sobrepõem. Não são classes universais de porte nem rótulos de dificuldade do modelo.

As métricas estáticas descrevem a cópia medida agora. O hash atual não autentica retroativamente o alvo executado no lote histórico. Resultados são derivados somente dos logs identificados; não representam uma nova coleta.

## Método de medição

Contam-se arquivos HTML, CSS, JS e TS e linhas físicas não vazias, incluindo comentários. Dependências, builds, arquivos minificados, links simbólicos e mídia ficam fora da contagem. Linhas não medem complexidade ciclomática, esforço ou cobertura. Documentos HTML não equivalem a rotas ou estados dinâmicos. Sinais de APIs são buscas textuais com arquivos de evidência; podem ocorrer em comentários e não comprovam comportamento executado. URLs incluem recursos e documentação, não somente APIs. O relatório JSON preserva hashes e inventário. As descrições funcionais são interpretação de pesquisa, não critérios aprovados automaticamente nem um conjunto-ouro independente.

## Estrutura e finalidade

| Aplicação | Família | Finalidade | Arquivos-fonte | Linhas | Documentos HTML | Sinais no código |
| --- | --- | --- | --- | --- | --- | --- |
| dom-array-methods | Dados e formulários | Lista de pessoas e valores com transformação, filtro, ordenação e soma. | 3 | 165 | 1 | fetch |
| expense-tracker | Dados e formulários | Registro de receitas e despesas, cálculo de saldo e histórico local. | 3 | 269 | 1 | browserStorage |
| form-validator | Dados e formulários | Validação de campos de cadastro no navegador, sem cadastro em servidor. | 3 | 198 | 1 | nenhum dos sinais rastreados |
| memory-cards | Dados e formulários | Cartões de pergunta e resposta com criação, navegação e armazenamento local. | 3 | 372 | 1 | browserStorage |
| movie-seat-booking | Dados e formulários | Seleção de filme e assentos com preço e estado persistido no navegador. | 3 | 256 | 1 | browserStorage |
| exchange-rate | Busca e seleção | Conversão entre moedas com consulta a taxa externa. | 3 | 248 | 1 | fetch |
| infinite_scroll_blog | Busca e seleção | Lista de publicações remotas com carregamento progressivo e filtro. | 3 | 190 | 1 | fetch, timers |
| lyrics-search | Busca e seleção | Busca de músicas e letras, com paginação e serviços remotos. | 3 | 215 | 1 | fetch |
| meal-finder | Busca e seleção | Busca de receitas e navegação ao detalhe, com opção aleatória e API externa. | 3 | 291 | 1 | fetch |
| product-filtering | Busca e seleção | Catálogo local de produtos com busca, categorias e contador de carrinho. | 2 | 258 | 1 | nenhum dos sinais rastreados |
| custom-video-player | Mídia e voz | Player de vídeo com reprodução, parada e controle de progresso. | 4 | 262 | 1 | nenhum dos sinais rastreados |
| music-player | Mídia e voz | Player de áudio com faixas anterior/próxima e progresso. | 3 | 300 | 1 | nenhum dos sinais rastreados |
| speak-number-guess | Mídia e voz | Adivinhação de número por reconhecimento de fala. | 3 | 118 | 1 | speech |
| speech-text-reader | Mídia e voz | Leitura por síntese de voz de cartões e texto informado. | 3 | 271 | 1 | timers, speech |
| breakout-game | Jogos e temporização | Jogo em canvas com raquete, bola, blocos e pontuação. | 3 | 289 | 1 | timers |
| hangman | Jogos e temporização | Jogo de forca com palpites por teclado e estados de vitória/derrota. | 3 | 263 | 1 | timers |
| new-year-countdown | Jogos e temporização | Contagem regressiva até a mudança de ano. | 3 | 147 | 1 | timers |
| relaxer-app | Jogos e temporização | Animação de ciclo respiratório com fases temporizadas. | 3 | 138 | 1 | timers |
| typing-game | Jogos e temporização | Jogo de digitação com palavras, dificuldade, pontuação e cronômetro. | 3 | 264 | 1 | browserStorage, timers |
| modal-menu-slider | Interação e ordenação | Menu lateral e diálogo de inscrição com abertura e fechamento. | 3 | 329 | 1 | nenhum dos sinais rastreados |
| sortable-list | Interação e ordenação | Ordenação de lista por arrastar e soltar e conferência da sequência. | 3 | 194 | 1 | dragAndDrop |

## Resultado por família

Lote de referência: 53c45f0f-d6b8-4bc7-be4f-4fdaafdfc972. Modelo: qwen3.8-vl-27b-iq1m-64k. Data de coleta: 2026-10-05T13:07:39.131Z. A data identifica a proveniência, não um tratamento experimental. Não se agregam execuções de outros modelos ou revisões. Falta de log permanece explícita no denominador; nenhuma aprovação prova correção funcional.

| Família | Aplicações | Com log | Chegaram à execução | Testes aprovados/executados | Hipóteses | Linhas não vazias (mín.–máx.) |
| --- | --- | --- | --- | --- | --- | --- |
| Dados e formulários | 5 | 5 | 5/5 | 9/9 | 3 | 165–372 |
| Busca e seleção | 5 | 5 | 4/5 | 5/5 | 2 | 190–291 |
| Mídia e voz | 4 | 4 | 3/4 | 6/6 | 1 | 118–300 |
| Jogos e temporização | 5 | 5 | 4/5 | 4/4 | 0 | 138–289 |
| Interação e ordenação | 2 | 2 | 2/2 | 4/4 | 0 | 194–329 |

## Profundidade que precisa ser demonstrada

As limitações abaixo são anotações de auditoria histórica; não são inferidas apenas da aprovação dos testes.

| Aplicação | Comportamento de referência para avaliação | Limite da evidência histórica | Run ID |
| --- | --- | --- | --- |
| dom-array-methods | Dobrar valores e conferir a soma do conjunto exibido; filtrar apenas valores superiores a um milhão. | Teste verde coexistiu com hipótese que confundiu lista vazia esperada com defeito. | dom-array-methods-2026-10-05T13-10-52-081Z-f6662e |
| expense-tracker | Criar lançamento válido, conferir saldo e reencontrar o mesmo lançamento após recarga. | Sem entrada numérica válida, preencher descrição e recarregar não provou cálculo nem persistência. | expense-tracker-2026-10-05T13-15-13-806Z-465d05 |
| form-validator | Relacionar mensagens de validação às regras de cada campo e remover o erro após correção válida. | A exploração parcial de Username não concluiu o formulário. | form-validator-2026-10-05T13-17-28-900Z-8513b9 |
| memory-cards | Adicionar cartão, alternar pergunta/resposta, recarregar e verificar a navegação em coleção vazia. | Exceção após esvaziar cartões foi observada, mas sua reprodução independente ficou bloqueada. | memory-cards-2026-10-05T13-33-29-286Z-38eb9c |
| movie-seat-booking | Selecionar assentos livres, excluir ocupados, conferir quantidade vezes preço e restaurar a seleção. | O teste intitulado persistência não recarrega a página e termina verificando body visível; não comprova persistência, preço ou restrição de assentos ocupados. | movie-seat-booking-2026-10-05T13-39-51-945Z-f806bb |
| exchange-rate | Conferir valor convertido e inversão das moedas com taxa de referência controlada. | Nenhum fluxo elegível para aprovação automática; não houve teste executado. | exchange-rate-2026-10-05T13-13-47-835Z-4dfab3 |
| infinite_scroll_blog | Chegar ao fim da lista e comprovar acréscimo de publicações; conferir o filtro sobre os resultados. | Interação com filtro não demonstra carregamento por rolagem. | infinite-scroll-blog-2026-10-05T13-20-18-467Z-2ca8f0 |
| lyrics-search | Buscar, selecionar resultado e conferir letra; tratar resposta não JSON de dependência externa. | Exceção de JSON envolveu resposta 403 do proxy; teste aprovado não distinguiu essa falha de integração. | lyrics-search-2026-10-05T13-22-40-154Z-6b1792 |
| meal-finder | Buscar termo, abrir receita e conferir título e ingredientes correspondentes ao item selecionado. | Vinte ações exploradas resultaram em teste de Enter; hipótese sobre título ausente contradizia as capturas. | meal-finder-2026-10-05T13-25-28-135Z-3ba3b7 |
| product-filtering | Combinar busca e categoria e conferir os produtos resultantes; validar alteração do contador. | Teste da busca por Sony não cobre todas as combinações ou o comportamento do carrinho. | product-filtering-2026-10-05T13-49-14-621Z-4fada4 |
| custom-video-player | Conferir paused/currentTime e atualização do progresso ao interagir com os controles. | Controle exercitado não comprova conteúdo audiovisual percebido. | custom-video-player-2026-10-05T13-09-21-936Z-c2f455 |
| music-player | Conferir mudança de identidade da faixa e estado do elemento de áudio ao navegar e reproduzir. | Teste aprovado coexistiu com exceção ao atualizar elementos de tempo ausentes. | music-player-2026-10-05T13-46-40-857Z-3b2883 |
| speak-number-guess | Fornecer fala reconhecida e conferir indicação maior/menor e estado de acerto. | Sem ação de voz útil, exploração inconclusiva e nenhum teste executado. | speak-number-guess-2026-10-05T13-54-27-388Z-500428 |
| speech-text-reader | Conferir texto e voz enviados à síntese; avaliar saída audível em protocolo próprio. | Texto e opções visíveis não demonstram emissão ou qualidade do áudio. | speech-text-reader-2026-10-05T13-54-38-026Z-f42b95 |
| breakout-game | Controlar raquete, atingir blocos e relacionar colisão a remoção, pontuação e término. | Abrir regras não valida a partida. | breakout-game-2026-10-05T13-07-39-134Z-94c2d9 |
| hangman | Informar letras e conferir progresso, erros, repetição e término da partida. | Observação temporal não exercitou palpites, vitória ou derrota. | hangman-2026-10-05T13-19-06-470Z-097f15 |
| new-year-countdown | Fixar relógio e conferir unidades e transição na fronteira do ano. | Espera limitada não comprova a fronteira da virada do ano. | new-year-countdown-2026-10-05T13-48-16-078Z-ca24ea |
| relaxer-app | Conferir sequência e duração de inspirar, manter e expirar sob relógio controlado. | Uma fronteira temporal não comprova todo o ciclo. | relaxer-app-2026-10-05T13-51-40-369Z-9c8b8b |
| typing-game | Completar palavra, conferir pontuação e incremento de tempo conforme dificuldade e estado final. | Nenhum fluxo elegível no lote principal; exploração não se converteu em teste. | typing-game-2026-10-05T13-58-34-412Z-b987d9 |
| modal-menu-slider | Conferir visibilidade após abrir, fechar e clicar fora do diálogo. | O ciclo dos painéis não demonstra envio ou processamento de inscrição. | modal-menu-slider-2026-10-05T13-36-47-875Z-daa4e2 |
| sortable-list | Mover item, conferir nova ordem e relacionar a verificação à sequência efetiva. | Acionar Check Order no estado inicial não testa a reordenação. | sortable-list-2026-10-05T13-53-03-047Z-6457f5 |

## Próxima avaliação

Antes de nova coleta, congelar versão e requisitos, selecionar comportamentos de referência por família e controlar dados, relógio e dependências necessários. Separar exploração autônoma, compilação de trajetória fornecida e replay de suíte congelada. Para cada comportamento registrar alcance, critério, asserção, aprovação no correto, falha pelo motivo esperado no mutante e julgamento humano. Casos não alcançados e bloqueados permanecem no denominador. Este relatório não calcula precisão, revocação ou porte médio automaticamente.
