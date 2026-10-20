# Revisão crítica e plano de fortalecimento do E2P

Data: 20/10/2026. Objeto: exploração inicial de uma aplicação web apresentada sem roteiro de navegação ou descrição de defeito. A avaliação distingue a atuação do modelo, as ferramentas do E2P e as verificações preparadas pelo avaliador.

## Diagnóstico

O artigo já descreve uma implementação substancial e mantém uma pergunta de pesquisa coerente. O principal ganho agora vem de **aprofundar a evidência que responde à pergunta**, não de aumentar a lista de recursos ou repetir as mesmas aplicações muitas vezes. O regulamento exige produto e procedimento reproduzíveis, resultados analisados, formato SBC, 10–16 páginas e ao menos dez referências. Novos dados devem substituir trechos repetitivos; o material extenso pertence ao repositório.

| Prioridade | Fragilidade atual | Como reforçar | Evidência necessária para considerar o ponto atendido |
|---|---|---|---|
| 1 | Passos e estados não demonstram compreensão funcional. Dez assentos selecionados podem representar uma única operação. | Definir funções de referência antes da coleta; verificar nas trajetórias quais foram exercitadas e quais tiveram resultado conferido. Separar tentativa, exercício e asserção. | Matriz função × execução com ação, estado e resultado citados. Quantidade de funções distintas e profundidade por função, sem converter cliques em cobertura. |
| 1 | Reproduzir um defeito conhecido não mede descoberta inicial. | Apresentar aplicações ao modelo sem trajetória nem descrição do problema; registrar se ele chega ao estado relevante. Depois reproduzir o efeito. | Trajetória original, erro observado e reprodução separados. Registrar também defeitos de referência não alcançados. |
| 1 | Uma expectativa plausível pode virar hipótese falsa. Dois papéis do mesmo modelo não são julgamento independente. | Associar cada expectativa a uma regra verificável; adjudicar candidatos com justificativa e, para medir qualidade, acrescentar revisão humana independente. | Rótulos com fonte, decisão e discordâncias. Precisão somente com todos os candidatos julgados; revocação somente perante um conjunto de defeitos de referência explicitamente delimitado. |
| 2 | O recorte está concentrado em exemplos estáticos de uma origem. | Incluir aplicação de outra origem com componentes, rotas e estado; posteriormente um pequeno serviço local com persistência e respostas controladas. | Caracterização de cada alvo por arquitetura, responsabilidades, dependências e jornadas. Não chamar de médio porte apenas porque utiliza React. |
| 2 | Quatro pares de asserção verificam mecanismos importantes, mas poucos tipos de propriedade. | Acrescentar controles positivos e negativos para cálculo, restauração de estado, filtro e falha de integração. Congelar a mesma suíte em cada par. | Referência aceita, alteração pertinente rejeitada, alteração irrelevante tolerada; registrar erros de infraestrutura separadamente. |
| 2 | Não se conhece a utilidade relativa ao esforço humano nem o efeito de recursos computacionais. | Medir funções alcançadas e candidatos úteis por tempo; comparar contexto/orçamento no mesmo modelo antes de comparar máquinas ou modelos. | Tempos de inferência e de ação, tokens efetivos, memória e custo de revisão. Um desenho que não atribua à GPU uma diferença causada também pela troca de modelo. |

## O que foi feito nesta revisão

- Preservação do PDF anterior e de seus fontes em `paper/versions/2026-10-18/`, com hash para conferência.
- Rodada adicional em quatro contextos: validação de formulário, mídia, coleção de cartões e TodoMVC React. Duas repetições intercaladas, sem roteiro ou indicação de defeito ao modelo. Resultados em `evaluation-results/current-20261020/`.
- Protocolo reutilizável com configuração do provedor, identificação dos fontes dos alvos e do E2P, estados iniciais isolados, tempo de cada execução e proteção contra sobrescrita do relatório.
- Regressões portáveis: dados congelados incluídos no repositório; o teste de navegação do player deixa de retornar silenciosamente quando falta um histórico privado. O teste de diálogos usa um formulário de controle autocontido.
- Perfil de instalação e operação na RTX 3060, supervisão dos processos, logs limitados e instruções de acesso remoto.
- Fontes e PDFs versionados do artigo, documentação organizada e publicação conjunta com o código.

Os resultados finais da rodada e da correção do reprodutor estão no [relatório da validação](../../evaluation-results/current-20261020/README.md). Os registros originais permanecem separados de verificações feitas após a coleta.

## Por que vale outra rodada — e qual rodada

**Sim, mas com uma pergunta por rodada.** Repetir indiscriminadamente o conjunto de 21 aplicações tende a produzir mais registros do mesmo comportamento e pouco poder explicativo. A máquina disponível 24/7 favorece experimentos sequenciais pequenos, com fonte e configuração congelados e análise ao final de cada bloco.

### Rodada A: abrangência funcional e decisões úteis

Usar quatro a seis aplicações cobrindo formulário, estado persistido, navegação e integração. Definir quatro a seis funções por aplicação antes de executar; por exemplo, em tarefas: criar, concluir, filtrar, editar e restaurar após recarga. Esses objetivos pertencem ao avaliador e não entram como roteiro no contexto do explorador. Fazer cinco repetições por alvo, com navegador limpo e ordem intercalada. Cinco repetições são um próximo passo prático, não uma garantia estatística.

Medir por execução: funções exercitadas, funções com resultado observado, funções com asserção válida, ações repetidas sem novo objetivo, tempo e candidatos. Publicar os valores individuais e mediana/amplitude; não tratar passos correlacionados como amostras independentes. A métrica interna de objetivos QA continua útil para orientar o explorador, mas não substitui essa matriz externa.

### Rodada B: descoberta e qualidade dos relatos

Montar pares de aplicações com defeitos delimitados e controles sem o defeito. Além de uma exceção, incluir falha silenciosa: total incorreto, item que desaparece após recarga ou filtro que ignora uma condição. Guardar o gabarito no processo de avaliação, sem fornecer descrição ou trajetória ao modelo. O acesso ao código deve ser igual nos dois membros e declarado, pois o E2P é um instrumento que inspeciona projetos.

Separar três perguntas: o modelo alcançou a função? A instrumentação registrou o efeito? O relato descreveu uma violação real? Uma exceção pode ser detectada deterministicamente depois de uma ação escolhida pelo modelo. Isso é um resultado do sistema combinado, e não evidência de que o LLM diagnosticou sozinho a causa.

Solicitar ao menos um segundo revisor humano para julgar os candidatos sem conhecer a decisão do primeiro. Reportar concordância e resolver divergências com justificativa. Até essa revisão existir, chamar a classificação atual de análise técnica assistida por IA. Não inventar uma avaliação humana ou uma precisão global a partir dos dois erros conhecidos.

### Rodada C: contexto, orçamento e máquina

Primeiro, usar **o mesmo modelo e quantização na mesma máquina**, comparando duas janelas suportadas, por exemplo 8k e 16k, com o mesmo orçamento de ações. Repetir com orçamento maior apenas depois, mantendo as demais condições. Registrar os tokens realmente usados: reservar 16k não significa consumir 16k.

Depois repetir um perfil idêntico nas duas máquinas. Se a RTX 3060 exigir outro modelo, tratar o ensaio como comparação de configurações completas. O ganho esperado de uma GPU maior é capacidade para pesos, cache e visão e/ou menor latência; maior janela não garante maior compreensão. Com 16 GB de RAM, uma configuração que recorre continuamente à memória compartilhada pode piorar a exploração mesmo permanecendo em execução.

### Contextos adicionais com maior retorno

| Contexto | Questão que acrescenta | Controle recomendado |
|---|---|---|
| Serviço local com banco descartável | A jornada sobrevive a recarga e reinício, com estado real no servidor? | Dados semeados por execução, versões fixas, contas fictícias. |
| API com respostas controladas | O explorador distingue resultado vazio, erro de rede e resposta inválida? | Repetir a mesma jornada com respostas 200, vazia e 503. Não depender da disponibilidade de uma API pública. |
| Interface com componentes e rotas | O catálogo e a memória acompanham controles que surgem/desaparecem? | Conferir rotas e ciclos completos, não somente URLs visitadas. |
| Temporização | A exploração observa a fronteira ou apenas espera? | Relógio controlado e protocolo separado de relógio real. |
| Canvas e voz | As ações e observações disponíveis permitem exercitar o comportamento central? | Critérios específicos de percepção/entrada; tratar suporte ausente como limitação do instrumento. |
| Leitura autenticada | As restrições preservam a utilidade e impedem mutação? | Instância local com dados sintéticos, teste explícito de bloqueio e comparação de funções observáveis. |

## Ordem de execução e encerramento

1. Consolidar o relatório desta revisão e os fontes públicos; conferir instalação nova.
2. Elaborar a matriz de funções e adjudicar todos os candidatos desta rodada. Não é necessário reexecutar o corpus para fazer essa análise.
3. Executar A e B com protocolo congelado; corrigir o instrumento somente entre blocos e manter as coletas identificadas.
4. Fazer C na máquina remota após verificar memória e estabilidade. Realizar um ensaio de uma hora e depois uma noite; somente então ampliar a fila.
5. Incorporar ao artigo a evidência que altera as respostas às QPs. Manter o detalhamento no suplemento para respeitar as 16 páginas.

O ponto de chegada é conseguir responder, para cada conclusão relevante: em qual aplicação, por qual ação, com qual expectativa e com que evidência. Mais resultados ajudam quando tornam essa resposta mais precisa.
