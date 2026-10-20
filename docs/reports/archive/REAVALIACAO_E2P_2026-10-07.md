# Reavaliação do E2P e do artigo — 7 de outubro de 2026

**Minha nota atual é 8,1/10 para o projeto e 8,0/10 para o artigo revisado**, contra 7,5 e 7,8 na avaliação de 6 de outubro. A evolução do software é substancial e verificável. A do artigo é principalmente de precisão, transparência e descrição da implementação; a evidência experimental central ainda é histórica.

São estimativas de revisão, usando as mesmas dimensões e pesos anteriores, e não notas oficiais da banca. O regulamento fornecido não estabelece esses pesos. A defesa e o acompanhamento acadêmico continuam fora desta avaliação.

**Atenção ao arquivo:** a nota 8,0 refere-se a `output/pdf/E2P_final_prototype_revised_20261006.pdf`. O arquivo originalmente indicado, `output/pdf/E2P_final_prototype.pdf`, permanece com o mesmo hash da revisão anterior; para esse texto mantenho 7,8.

## O que foi conferido novamente

- Comparação com o manifesto de hashes da revisão anterior, leitura das alterações nos serviços centrais, dos testes novos e dos documentos de implementação e limites.
- Nova execução da suíte interna: **130 aprovados, zero falhas e zero ignorados**, aproximadamente 22 segundos; antes eram 115.
- Nova auditoria de dependências de produção: **zero vulnerabilidades reportadas** no momento da consulta. Isso não representa uma auditoria completa de segurança.
- Nova execução dos scripts de regressão de Music Player e Expense Tracker, com cópias locais defeituosas dos alvos.
- Inicialização real do servidor e verificação HTTP de sessão e origem. Interface: 200; artefato sem sessão: 403; com sessão: 200; origem externa: 403. O servidor escutava somente em `127.0.0.1`.
- Provas pequenas usando as funções reais de contrato, crítica, resultado de execução e cobertura, incluindo entradas que contradizem os critérios esperados.
- Uma tentativa nova com o modelo local no Expense Tracker. Foi habilitado o perfil descartável por um adaptador de avaliação que acrescenta `disposableLocalProfile: true` ao fluxo do comando existente, sem alterar o código do produto. Portanto, esta tentativa não equivale ao uso padrão do comando nem à execução pela interface.
- Extração e comparação do texto dos PDFs, renderização das 16 páginas da versão revisada e inspeção visual das páginas alteradas relevantes. Os critérios do regulamento e a comparação estrutural com o TCC de Arthur foram retomados da avaliação anterior.

O código do produto, os alvos originais e os PDFs não foram editados nesta revisão. Foram criados artefatos de avaliação e este relatório. Os processos do servidor E2P e do modelo iniciados para a análise foram encerrados.

## Por que a nota do projeto aumentou

| Mudança | Evidência obtida nesta revisão | Alcance da conclusão |
|---|---|---|
| Contrato entre critério e asserção | Novo contrato registra origem da expectativa, comparação, ação, evidência e estado de verificação | Avanço real, mas a correspondência semântica ainda tem erro reproduzível |
| Detecção da falha de navegação musical | Suíte histórica passa no correto e no mutante; suíte recompilada passa no correto e falha por asserção no mutante sem `Prev` | O compilador passou a detectar esta regressão específica |
| Verificação de saldo e persistência | Dois testes passam no original; o mutante de saldo falha no teste de saldo; o de armazenamento falha no de persistência | Há asserções comportamentais úteis para a trajetória preparada |
| Resultados incompletos | Relatório ausente produz `infrastructure-error` e estado incompleto | Ausência de execução deixou de se confundir com ausência de falhas |
| Cobertura mais honesta | Denominador vazio retorna `null`/`not-measurable`; exploração é separada de verificação | Melhora a interpretação das métricas |
| Diálogos e ações numéricas | Testes de navegador para alertas nativos; perfil numérico local explícito | Corrige uma lacuna de observação, sem comprovar autonomia no fluxo completo |
| Acesso local e dependências | Restrições de sessão/origem reproduzidas, loopback e auditoria sem alertas | Reduz problemas concretos apontados anteriormente |
| Rastreabilidade | Snapshots V0/V1, manifestos, agregador e registros de execução mais uniformes | Favorece reprodução; não substitui reprodução por terceiro |

Os resultados de regressão devem ser descritos com precisão: Music Player reutiliza uma exploração histórica e compara suítes; não é uma nova comparação integral entre duas versões do agente. Expense Tracker usa uma trajetória registrada programaticamente. Nenhum desses ensaios, isoladamente, demonstra descoberta autônoma de defeitos novos.

### Limitação 1 — o contrato ainda pode verificar o valor errado

Em `action-e2e/src/services/acceptance-contract.js:78`, o ramo de valor de campo usa o valor da ação observada para construir a asserção.

Contraprova reproduzida:

| Elemento | Conteúdo |
|---|---|
| Critério aprovado | `The field value should be '99'.` |
| Origem declarada no caso sintético | Requisito do projeto, com referência explícita |
| Ação e estado observados | Campo `amount` preenchido com `42` |
| Contrato produzido | `expectedValue: "42"`, comparação `exact-input-value`, estado `asserted` |

Esse caso demonstra um erro na compilação do contrato: a expectativa explícita foi substituída pelo valor observado. A prova foi feita diretamente na função de contrato; não é uma estimativa da frequência desse erro em projetos reais. Registrar a origem da expectativa ajuda, mas ainda não garante que a asserção a respeite.

**Correção prioritária:** preservar a expectativa aprovada como fonte do resultado esperado. Quando não for possível traduzi-la com segurança, manter o critério não verificado. Incluir casos com valor esperado diferente do observado e com dois campos contendo o mesmo valor. A aprovação depende da correspondência correta entre requisito, entidade e comparação.

### Limitação 2 — a exploração autônoma ainda não concluiu o Expense Tracker

Na tentativa desta revisão, o modelo preencheu `Lunch`, mas sua decisão para o campo numérico foi rejeitada pela regra de inteiro sintético entre 1 e 1000. A tentativa de correção não resolveu a decisão. A execução parou antes do planejamento, com **uma ação concluída, dois estados, uma decisão inválida e nenhum teste gerado**.

O registro final indica falha, sem simular uma aprovação. Isso é positivo para a confiabilidade do diagnóstico, mas a tarefa funcional não foi concluída. O valor numérico proposto não está preservado no passo inválido do artefato consultado; não atribuo a causa a um número específico nem a um sinal negativo sem essa evidência.

**Correção prioritária:** tornar o perfil descartável acessível e explícito nos caminhos de uso relevantes, registrar a proposta inválida de forma adequada e testar a recuperação do agente dentro das restrições. Verificar criação, saldo e persistência em novas execuções guiadas pelo modelo, com repetições predefinidas. Uma tentativa não mede taxa de sucesso nem prova piora estatística em relação à versão anterior.

### Limitação 3 — a barreira de contradição rejeita uma frase afirmativa

Em `action-e2e/src/services/bug-discovery.js:396`, a expressão usada para reconhecer rejeição torna `not` opcional depois de `does/do/did`.

A frase `The evidence does support the hypothesis that the saved item disappears after reload.` foi rejeitada como contraditória, mesmo com os campos estruturados indicando anomalia. A contradição histórica também passou a ser bloqueada, mas a regra nova introduz esse falso bloqueio.

**Correção prioritária:** separar construções negativas de afirmativas e testar ambas. O erro observado é uma rejeição indevida da análise do crítico; não significa, por si só, que o sistema confirmou um defeito inexistente.

### Rubrica do projeto

| Dimensão | Peso | Antes | Agora |
|---|---:|---:|---:|
| Adequação da proposta | 15% | 9,0 | 9,0 |
| Arquitetura e implementação | 25% | 8,5 | 8,5 |
| Eficácia dos testes e hipóteses | 30% | 6,0 | 7,0 |
| Robustez e testes do instrumento | 15% | 8,0 | 8,5 |
| Segurança e reprodutibilidade | 15% | 6,5 | 8,0 |

Resultado ponderado: **8,05 → 8,1**. A arquitetura já recebia nota alta; o aumento vem principalmente de corrigir verificações, diagnósticos, acesso e rastreabilidade. O projeto continua sendo avaliado como protótipo acadêmico com revisão humana.

## Por que o artigo sobe menos

A versão revisada corrige os totais históricos para **105 ações e 92 estados**, explicita a auditoria assistida por IA, retira a alegação não medida de economia de esforço e distingue a engenharia posterior dos lotes antigos. Mantém 16 páginas, formato SBC, seções esperadas, mais de dez referências e declaração de IA. A apresentação visual das páginas inspecionadas permanece adequada.

Essas mudanças aumentam a credibilidade do relato. Ainda assim, não há nova avaliação prospectiva completa das versões, repetições pareadas, conjunto independente de referência ou adjudicação por segundo avaliador. A principal diferença em relação ao modelo de Arthur continua sendo o controle e a sustentação empírica da avaliação, e não a quantidade de funcionalidades implementadas.

Há dois ajustes editoriais especialmente úteis:

1. **Colocar os novos ensaios na metodologia e nos resultados.** As regressões de Music Player e Expense Tracker aparecem na conclusão, na página 15, sem uma apresentação equivalente de procedimento e resultados nas seções experimentais. Acrescentar uma tabela compacta com origem da trajetória, mutação, comportamento do original, resultado do mutante e limite da inferência. A conclusão deve sintetizar resultados previamente apresentados.
2. **Harmonizar o que já foi implementado e o que ainda precisa ser demonstrado.** A página 9 descreve a revisão de engenharia, mas a página 14 ainda apresenta parte dos mesmos pontos como prioridades futuras. Distinguir explicitamente “implementado”, “verificado em regressão de desenvolvimento” e “eficácia ainda não avaliada”. Rever também se o título no plural sugere comparação entre modelos que o estudo não realizou.

Como o artigo já tem 16 páginas, a integração desses resultados exige condensar descrições existentes. A documentação complementar pode guardar detalhes extensos, preservando no artigo o procedimento essencial para entender e julgar os resultados.

| Dimensão | Peso | Antes | Agora |
|---|---:|---:|---:|
| Problema e objetivos | 10% | 9,0 | 9,0 |
| Referencial e posicionamento | 15% | 8,5 | 8,5 |
| Metodologia e reprodutibilidade | 25% | 6,5 | 7,0 |
| Resultados e análise | 25% | 7,5 | 7,8 |
| Estrutura, linguagem e apresentação | 15% | 8,5 | 8,5 |
| Contribuições e conclusões | 10% | 8,0 | 8,5 |

Resultado ponderado: **8,00 → 8,0**. Resultados negativos não impedem uma nota alta; a contribuição aumenta quando eles são produzidos por um protocolo controlado e interpretados corretamente.

## Próxima sequência de ações

| Ordem | Ação | Critério de conclusão |
|---|---|---|
| 1 | Corrigir a fidelidade do contrato ao critério — continuação de A05 | Contraprova 99/42 não gera asserção de sucesso para 42; casos ambíguos ficam não verificados |
| 2 | Corrigir a regra de contradição — continuação de A08 | Frase afirmativa aceita e negativa rejeitada nos contextos correspondentes |
| 3 | Validar a exploração numérica e a recuperação — continuação de A07 | Execuções autônomas registradas chegam à criação, ao saldo e à persistência; falhas permanecem no denominador |
| 4 | Congelar a versão corrigida e executar A10–A11 | Alvos e critérios congelados, pares correto/defeituoso, repetições, custos e julgamentos registrados; sem reajustar o instrumento durante a coleta |
| 5 | Integrar evidências ao artigo — continuação de A12 | Método e resultados apresentam os ensaios, conclusão os sintetiza, implementação e validação ficam temporalmente consistentes |

O maior ganho seguinte virá da fidelidade das asserções e da avaliação controlada. Acrescentar mais funcionalidades periféricas tende a contribuir menos para a nota neste estágio. Uma faixa acima de 8,5 torna-se mais defensável com essas evidências, mas não é resultado garantido pela simples conclusão de uma lista de tarefas.

## Evidências locais desta revisão

Os caminhos abaixo são relativos à raiz `C:/Users/henri/Documents/Codex/E2P`:

- `tmp/review-2026-10-07/tests.txt`: suíte interna completa.
- `tmp/review-2026-10-07/audit.json`: auditoria de dependências.
- `tmp/review-2026-10-07/contract-probes.json`: contraprovas e verificações de cobertura/resultado.
- `tmp/review-2026-10-07/local-access.json`: respostas HTTP verificadas.
- `tmp/review-2026-10-07/run-opt-in.cjs`: adaptador utilizado na nova tentativa com o modelo.
- `tmp/review-2026-10-07/fresh-model-run.txt`: registro dessa tentativa.
- `action-e2e/prototype-runs/expense-tracker-2026-10-07T23-44-56-178Z-c3927a/`: artefatos da tentativa autônoma, incluindo `exploration.json`, `run-log.json` e `results/blind-evaluation.json`.
- `output/e2p-evolution-20261006/regression-pairs/music-player-2026-10-07T23-41-30-174Z/pair-result.json`: regressão musical repetida nesta revisão.
- `output/e2p-evolution-20261006/regression-pairs/expense-tracker-2026-10-07T23-41-40-530Z/pair-result.json`: regressões de saldo e persistência repetidas nesta revisão.
- `tmp/review-2026-10-07/article.diff`: comparação textual entre os PDFs.
- `tmp/review-2026-10-07/reviewed-files-sha256.json`: identidade dos arquivos para a próxima revisão.

As provas desta revisão foram executadas pelo mesmo assistente que conduz a análise. Não constituem adjudicação humana independente nem substituem o estudo prospectivo previsto no plano.
