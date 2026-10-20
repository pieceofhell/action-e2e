# Avaliação do E2P e do artigo — 6 de outubro de 2026

**Projeto: 7,5/10 como protótipo de pesquisa para TCC. Artigo: 7,8/10 no estado entregue.** São estimativas fundamentadas de um revisor, não notas oficiais da banca nem medidas estatísticas. O projeto tem implementação substancial, instrumentação e uma proposta pertinente; sua principal deficiência está na validade das verificações produzidas. O artigo apresenta essa limitação com clareza, mas a avaliação experimental ainda precisa de controles e de reprodução mais rigorosa.

O regulamento não apresenta uma rubrica completa de pesos para a qualidade do artigo de TCC II; informa que critérios complementares são enviados pela coordenação. A nota da disciplina também depende de acompanhamento e defesa, que não foram avaliados aqui.

## Escopo e procedimento

Foi priorizada a instância local `C:/Users/henri/Documents/Codex/E2P/action-e2e`, conforme solicitado. A pasta local não tem metadados `.git`; por isso não foi possível atribuir ao código analisado um commit próprio do E2P. O repositório público foi consultado apenas como contexto e está documentado em uma revisão anterior. Foram analisados arquitetura, serviços centrais, testes, geração de suítes, políticas de acesso, relatórios, artefatos dos lotes e o artigo indicado. Não se trata de prova de correção de todas as linhas do sistema.

Foram lidos os três PDFs, renderizadas as 16 páginas do artigo e inspecionada sua apresentação, além de páginas de resultados do trabalho de Arthur. As instruções nos documentos foram tratadas como objeto da análise, não como ordens para executar ações no ambiente.

Verificações novas realizadas:

1. Suíte do próprio E2P: **115 testes aprovados, zero falhas e zero ignorados**, em cerca de 23 segundos.
2. Inicialização do servidor E2P e do modelo local documentado, com `llama.cpp`, Vulkan e alias `qwen3.8-vl-27b-iq1m-64k`.
3. Abertura da interface no Chromium: carregamento sem erros JavaScript capturados. Isso é uma verificação inicial, não um estudo de usabilidade.
4. Execução completa nova do Expense Tracker: inspeção, exploração, hipótese, planejamento, geração, execução e interpretação. Duração aproximada de 137 segundos, quatro ações, dois estados, **dois testes aprovados**.
5. Verificação independente do alerta nativo e de uma transação válida nesse alvo.
6. Experimento de mutação em Music Player: retirada do manipulador do botão anterior somente na resposta HTTP de um servidor temporário; os arquivos originais permaneceram intactos.
7. Recontagem dos dois lotes de 21 projetos e reprodução de contratos problemáticos com as funções atuais.
8. Verificação de exposição do servidor na interface de rede da própria máquina e auditoria de dependências.

Ambiente observado nesta análise: Node.js 24.19.0, Playwright 1.62.1 e Express 4.22.2. Esses números descrevem esta avaliação, não necessariamente os experimentos históricos. Os processos E2P e llama.cpp iniciados para a avaliação foram encerrados. Código de produto e PDFs não foram editados; foram acrescentados apenas os artefatos da avaliação, incluindo uma nova execução histórica do Expense Tracker.

## Fundamento das notas

Rubrica autoral para o projeto:

| Dimensão | Peso | Nota | Fundamentação |
|---|---:|---:|---|
| Adequação da proposta | 15% | 9,0 | Problema relevante, escopo concreto e integração útil de entendimento, exploração e evidências. |
| Arquitetura e implementação | 25% | 8,5 | Serviços separados, execução real, rastreabilidade, lote, histórico, revisão e políticas explícitas. |
| Eficácia dos testes e hipóteses | 30% | 6,0 | Falta de vínculo obrigatório entre intenção e asserção; falso positivo reproduzido e mutação não detectada. |
| Robustez e testes do instrumento | 15% | 8,0 | 115 testes passam, mas há lacunas de resultado inconclusivo e da qualidade semântica. |
| Segurança e reprodutibilidade | 15% | 6,5 | Boas medidas para credenciais e sessões; servidor exposto, dependências com alertas e identidade incompleta das revisões. |

Resultado ponderado: **7,45**, arredondado para **7,5**. A nota considera um protótipo acadêmico assistido por revisão humana; não significa prontidão para uso autônomo em produção.

Rubrica autoral para o artigo:

| Dimensão | Peso | Nota |
|---|---:|---:|
| Problema e objetivos | 10% | 9,0 |
| Referencial e posicionamento | 15% | 8,5 |
| Metodologia e reprodutibilidade | 25% | 6,5 |
| Resultados e análise | 25% | 7,5 |
| Estrutura, linguagem e apresentação | 15% | 8,5 |
| Contribuições e conclusões | 10% | 8,0 |

Resultado ponderado: **7,75**, arredondado para **7,8**. A honestidade na interpretação aumenta a qualidade do artigo mesmo quando revela deficiências do software. Resultados negativos podem constituir contribuição científica; precisam de protocolo consistente e evidência verificável.

## Achados técnicos que mais pesam

### 1. O compilador não exige que a asserção verifique o critério aprovado

O caminho convidado compila uma trajetória previamente executada. Em `src/services/test-generator.js:817`, a função `buildObservedJourneySpecContent` escolhe o estado final e monta os passos. A seleção de asserções, especialmente a partir da linha 909, pode preferir um valor residual de campo, um título, um botão ou até a visibilidade do corpo da página. O critério de aceitação não é transformado em contrato executável obrigatório nessa função.

Exemplos efetivos:

- Os três testes históricos do Typing Game para dificuldade, configurações e fim do tempo terminam verificando o valor `w` no campo de texto.
- Na execução nova, o caso `Transaction Entry and Commit` apenas preenche `Lunch` e verifica esse valor. Não efetua a transação descrita no título.
- O novo caso `Persistence Verification` recarrega a página e verifica o título `Expense Tracker`; não verifica uma transação persistida.
- No Music Player, um teste intitulado `Activate the play button to change the track` clica em `#prev` e verifica somente o título fixo `Music Player`.

**Experimento controlado:** no alvo original, clicar no botão anterior alterou o nome da música de `ukulele` para `summer`. Na condição mutante, a mesma ação manteve `ukulele`, pois o manipulador havia sido removido. O mesmo teste gerado passou nas duas condições, com código de saída zero. Isso demonstra uma regressão concreta não detectada por aquele teste; uma única mutação não estima a sensibilidade de toda a ferramenta.

Correção prioritária: representar cada critério em estrutura com identificador, fonte da expectativa, pré-condição, ação, resultado esperado, observação e asserção correspondente. Se não for possível construir uma verificação válida, registrar `não verificado` ou `smoke de observação`, em vez de apresentar o objetivo funcional como atendido. Avaliar a correção com pares defeituoso/corrigido.

### 2. Observação incompleta vira falso positivo e classificação indevida

Na execução nova, o E2P reteve a hipótese `Empty amount submission lacks visible feedback`. O alvo efetivamente emite o alerta nativo **“Please add a text and amount”**. A verificação independente capturou esse evento. Depois de preencher um valor válido, o saldo passou de `$0.00` para `$25.00` e continuou em `$25.00` após recarga.

O alerta não faz parte do DOM capturado. A ausência de mudança no DOM não sustenta a ausência de feedback. A hipótese também recebeu procedência de `runtime-diagnostic` e status correspondente, embora a alegação fosse sobre feedback visual. O código aceita essa procedência sem exigir, em todos os caminhos, a referência a uma exceção real. A política que impede preencher o campo numérico limita a jornada antes da inferência.

Correções: capturar `dialog`, registrar tipo, mensagem, ação causadora e tratamento; permitir dados sintéticos tipados em ambientes de teste explicitamente delimitados; só admitir um diagnóstico de runtime quando existir um evento real identificado. Preservar a política conservadora para alvos autenticados e dados reais.

### 3. O crítico ainda admite contradição entre explicação e decisão

O artefato de Meal Finder declara que o nome da receita está presente e que a evidência contradiz a hipótese; simultaneamente, mantém `verdict: retain`. Reaplicar esse objeto à função atual `validateCriticReview`, em `bug-discovery.js:377`, mantém a hipótese. Existem verificações por padrões textuais, mas elas não abrangem esse caso real.

Correção: decompor as verificações em fatos referenciados, exigir que o resultado esperado e o observado sejam comparáveis e tornar conflitos um estado inconclusivo a revisar. Uma nova rodada de modelo pode auxiliar, mas acrescentar agentes não substitui um contrato coerente. Os papéis autor e crítico atuais usam o mesmo modelo no lote examinado; isso não constitui validação humana ou independência estatística.

### 4. A medida de cobertura pode representar atividade sem verificação

Em `qa-coverage.js`, um objetivo de persistência exige a presença de uma recarga, e variações numéricas podem dar crédito a estado calculado sem validar uma regra do domínio. Uma lista vazia de objetivos produz `ratio: 1` na linha 194. O caso `speak-number-guess` do lote recente tem zero ações, zero objetivos e índice 1.

Correção: separar **explorado**, **exercitado**, **verificado** e **bloqueado**. Cobertura sem denominador deve aparecer como `não mensurável`, não 100%. Persistência precisa vincular o objeto criado ao mesmo objeto depois da recarga; cálculo exige valores de entrada e resultado esperado. O artigo já reconhece parte dessa limitação, mas o instrumento continua produzindo o indicador permissivo.

### 5. Falha de infraestrutura pode perder seu significado no resumo

`parsePlaywrightReport(null)`, em `test-runner.js:138`, retorna zero testes e zero falhas. O executor também coleta o código de saída do Playwright, mas não exige nessa etapa a existência de um relatório válido com os testes esperados. `insight-builder.js:42` decide entre falha e trajetória sem falha fatal com base em `failed > 0`.

A reprodução direta confirmou o retorno zerado. A possibilidade de isso se tornar uma conclusão favorável resulta da leitura dos caminhos de consolidação; não foi simulada uma queda completa do Playwright nesta análise.

Correção: modelar resultados `aprovado`, `reprovado`, `erro de infraestrutura` e `inconclusivo`; validar código de saída, erros globais do relatório, presença e quantidade dos testes. Zero testes não equivale a sucesso.

### 6. A restrição local do servidor é incompleta

O servidor usa `app.listen(PORT)` em `src/server.js:582`, sem endereço explícito. O sistema operacional confirmou escuta em `::` na porta 4318. Requisições pela interface IPv4 não loopback da própria máquina obtiveram HTTP 200 de `/api/health` e de um artefato de execução convidada, sem token. A rota de histórico devolveu corretamente HTTP 403.

Logo, há proteção em operações sensíveis, mas ela não cobre todos os recursos. O teste não demonstrou exploração remota nem contornou firewall; demonstrou a ausência de restrição ao loopback na própria aplicação e acesso a um artefato pela interface de rede local.

Correção: escutar explicitamente em `127.0.0.1`; revisar validação de Host/Origin e proteção de APIs e artefatos. Manter a quarentena e a redação de segredos já implementadas.

A auditoria do lockfile informou cinco pacotes afetados: um crítico, um alto e três moderados, com atualização disponível. Os alertas são de dependências, inclusive transitivas; não demonstram que todas as condições de exploração existam no E2P. Priorizar atualização controlada e executar novamente a suíte.

### 7. Reprodução e manutenção precisam de uma base única

Há bons registros e documentação, mas existem divergências:

- README informa 102 testes esperados; a suíte atual tem 115.
- A pasta local não está ligada a um commit do E2P.
- A execução nova pelo comando documentado `evaluate:blind-local` gerou `blind-evaluation.json`, mas não `run-log.json`. Interface, lote e comando possuem caminhos de orquestração diferentes.
- Módulos centrais chegam a aproximadamente 1.000–1.365 linhas, e a interface a 2.272 linhas. Tamanho isolado não prova má qualidade, mas os contratos observados já justificam extrair unidades menores de compilação, observação e validação.

Correções: uma única orquestração usada por interface, lote e comando; manifesto por execução contendo versão/hash do E2P, revisão dos alvos, hash dos pesos/projetor, parâmetros, versões de dependências, limites e orçamento; agregado experimental calculado automaticamente; pipeline de integração contínua com a suíte atual e testes de defeitos conhecidos.

## Avaliação do artigo em relação ao regulamento

| Exigência documental | Situação |
|---|---|
| LaTeX e formato SBC | Fonte correspondente usa `sbc-template`; PDF tem apresentação compatível. |
| Entre 10 e 16 páginas | Atende: 16 páginas, já no limite. |
| Introdução com problema, motivação, objetivos e organização | Atende. |
| Referencial e revisão da literatura | Atende, com posicionamento explícito e 15 referências totais. |
| Metodologia com representação visual e ferramentas | Atende formalmente: processo na Figura 1 e detalhamento das etapas. |
| Resultados apresentados e analisados | Atende; há três tabelas e discussão dos casos negativos. |
| Conclusões e trabalhos futuros | Atende. |
| Declaração de uso de IA com ferramenta, finalidade e partes | Atende aos elementos centrais: Codex/OpenAI, finalidades e todas as seções. Acrescentar versão/modelo quando aplicável melhoraria a precisão. |
| Reprodução por outros pesquisadores | Parcial: há procedimentos e IDs, mas faltam congelamento e pacote externo completo da revisão avaliada. |

Não encontrei defeitos gráficos graves nas páginas renderizadas. O texto é denso e praticamente todo textual, mas legível. O principal espaço para melhoria está na seleção e demonstração da evidência, não em ornamentação.

Pontos fortes: problema e contribuição delimitados; distinção correta entre decisões do modelo e compilação determinística; separação entre reprodução e confirmação de defeito; reconhecimento de métricas substitutas, variação e dependências externas; declaração de IA e ameaças à validade específicas.

Pontos que impedem uma nota próxima de 9:

1. **Protocolo predominantemente formativo.** Uma execução por configuração, várias mudanças simultâneas e alvos/dependências não inteiramente congelados impedem atribuição causal e medida de estabilidade.
2. **Oráculos externos insuficientes.** Faltam requisitos e defeitos de referência adjudicados independentemente. Não há medida confiável da sensibilidade dos testes às falhas que se propõem a verificar.
3. **Título mais amplo que o experimento principal.** “Avaliação de Modelos...” sugere uma comparação de modelos; a contribuição atual é sobretudo avaliação de uma pipeline com um perfil local. Um título centrado em pipeline e avaliação formativa corresponderia melhor ao conteúdo.
4. **Divergência numérica verificável.** Página 12 informa 107 ações e 91 estados no lote de 5/10. A soma dos 21 `exploration.json` e dos respectivos `run-log.json` produziu **105 ações e 92 estados**. Os totais 18/21 projetos, 28/28 testes e seis hipóteses estão corretos. É preciso corrigir a contagem ou identificar precisamente o snapshot alternativo utilizado.
5. **Conclusão de produtividade não medida.** A página 15 afirma que o E2P “já reduz trabalho de preparação e organização de evidências”. Automatizar essas etapas foi demonstrado; redução líquida do esforço, incluindo correções e revisão, não foi medida. Ajustar a afirmação ou realizar comparação de tempo e esforço.
6. **Descrição do revisor.** O abstract usa “Manual examination”, enquanto as ameaças informam auditoria assistida por IA sem revisão cega independente. Explicitar o papel humano efetivamente realizado e manter essa descrição consistente.
7. **Evidência apresentada pouco diretamente.** Incluir um exemplo compacto com critério, ação, asserção atual e defeito não detectado facilitaria a compreensão da contribuição. Substituir trechos repetidos de descrição e ressalvas, pois o documento já atingiu 16 páginas.

A verificação bibliográfica por amostragem confirmou a existência e o alinhamento geral de Ferreira et al., GUISpector, TestWeaver, Panta e SpecOps nas fontes dos autores. Isso não equivale a uma auditoria de cada afirmação bibliográfica. Fontes consultadas: https://arxiv.org/abs/2504.07244 ; https://arxiv.org/abs/2510.04791 ; https://arxiv.org/abs/2508.01255 ; https://arxiv.org/abs/2503.13580 ; https://arxiv.org/abs/2603.10268 .

## Comparação com o TCC de Arthur

O trabalho de referência tem 13 páginas e organiza melhor uma cadeia experimental delimitada: base de dados identificada, cinco modelos, parâmetros, métricas comparáveis e comparação com/sem aumento de dados. Relata validação cruzada em dez dobras e apresenta tabelas diretamente ligadas à pergunta de pesquisa. Essa estrutura permite localizar mais rapidamente o que mudou, o que foi medido e como a conclusão decorre dos resultados.

O E2P tem maior amplitude de engenharia observável, mas amplitude não substitui fechamento experimental. Seu texto já apresenta linguagem acadêmica e, em vários pontos, é mais explícito sobre as ameaças à validade. Arthur também reconhece avaliação visual das explicações e ausência de validação por especialistas; não deve ser tratado como um padrão sem limitações ou como justificativa para copiar métricas de classificação para QA.

O aspecto a reproduzir é a ligação **pergunta → condições comparáveis → métricas adequadas → resultado → conclusão limitada pela evidência**. Para o E2P, o equivalente é demonstrar que uma suíte detecta um defeito conhecido e aceita sua versão corrigida, sob condições repetíveis.

## Ordem recomendada de evolução

| Prioridade | Entrega | Critério verificável de conclusão |
|---|---|---|
| P0 | Corrigir critérios e asserções | Cada objetivo declarado verificado tem asserção correspondente; smoke é rotulado; mutação da troca de música passa a ser detectada. |
| P0 | Observação de diálogos e dados sintéticos numéricos | Expense Tracker cria e persiste transação válida; validação vazia é registrada como alerta, sem falso relato de ausência de feedback. |
| P0 | Corrigir exposição e resultados inconclusivos | Servidor limitado a loopback; artefatos protegidos; falta de relatório não gera sucesso; cobertura sem objetivos não gera 100%. |
| P1 | Proveniência e contradições das hipóteses | Diagnóstico exige evento real; caso Meal Finder não recebe decisão incompatível com a evidência. |
| P1 | Pacote reprodutível e agregação automática | Código, alvos, configurações e dados identificados; tabelas do artigo regeneráveis por um comando. |
| P1 | Experimento com verdade de referência | Requisitos e pares defeituoso/corrigido revisados, repetições e resultados com incerteza. |
| P2 | Manutenção e interação | Orquestração unificada, módulos menores, resultados com pendências claras e comparação entre execuções. |

Um experimento viável para o próximo estágio pode começar com seis a dez aplicações, requisitos explícitos e três a cinco repetições por condição. Separar conjuntos usados para ajustes dos casos reservados para avaliação. Congelar o perfil principal e comparar versões em que apenas uma melhoria varia: por exemplo, asserção atual versus contrato de asserção; depois, em estudo separado, com/sem crítico ou com/sem feedback. Variar simultaneamente tudo tornaria a atribuição novamente ambígua.

Medir: conclusão de jornadas, correspondência critério–asserção, falha no alvo defeituoso e aprovação no corrigido, alertas corretos/incorretos após revisão humana, defeitos conhecidos detectados/perdidos, flutuação entre repetições, tempo total, chamadas/tokens e esforço de correção. Para precisão dos alertas, revisar os alertas emitidos; para revocação, é necessário conhecer os defeitos elegíveis existentes. Um valor como “três alegações inadequadas em seis candidatos” não deve ser apresentado como precisão geral sem adjudicação e protocolo apropriados.

**Potencial de nota:** correções centrais e validação dos casos devem sustentar uma avaliação na faixa de 8–8,5. Para 9 ou mais, o salto decisivo é demonstrar eficácia e reprodução, inclusive quando o resultado for negativo. Adicionar suporte amplo a novos agentes, aplicações móveis, voz, dashboards ou outros modelos antes disso aumentaria o escopo sem resolver a principal fragilidade.

## Evidências preservadas

- Fontes acadêmicas locais: `C:/Users/henri/Downloads/Regulamento_TCC_CC.pdf`; `C:/Users/henri/Downloads/TCC 2 - Arthur Gabriel Mathias Marques.pdf`; `C:/Users/henri/Documents/Codex/E2P/output/pdf/E2P_final_prototype.pdf`.
- Nova execução: `C:/Users/henri/Documents/Codex/E2P/action-e2e/prototype-runs/expense-tracker-2026-10-06T15-25-08-727Z-d461a5/results/blind-evaluation.json`.
- Evidências auxiliares: `C:/Users/henri/Documents/Codex/E2P/tmp/review-2026-10-06/`.
- Resultado da mutação: `mutation-result.json`; relatórios completos: `mutation-original-report.json` e `mutation-mutant-report.json`.
- Contratos: `contract-probes.json`; verificação do alerta e saldo: `native-dialog-check.json`.
- Execução dos testes internos: `tests.txt`; auditoria de dependências: `npm-audit.json`.
- Manifesto SHA-256 de 45 arquivos do código, testes, dependências e PDF: `reviewed-files-sha256.json`.
- Recontagens dos lotes: `batch-bdd8b939-b944-4345-a2c5-3ea8d98d1bd5.json` e `batch-53c45f0f-d6b8-4bc7-be4f-4fdaafdfc972.json`.

Os resultados novos desta revisão não foram incorporados ao artigo nem usados para alterar retroativamente os lotes históricos. Não foi executado de novo todo o benchmark de 21 aplicações, nem medido desempenho de produção ou realizado estudo com usuários.
