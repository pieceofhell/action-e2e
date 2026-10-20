# Revisão do artigo E2P

Recorte da implementação e dos resultados: 13 de setembro de 2026.

## Arquivo principal e preservação

- `main.tex` é a fonte canônica atualizada, com `sbc-template.bib`, `sbc-template.sty` e `sbc.bst`.
- `main_revisado.tex` continua apenas incluindo `main.tex`; não é uma segunda versão divergente.
- `../main-1.pdf` foi preservado sem alteração.
- As versões anteriores dos fontes, dos dois PDFs e do inicializador estão em `archive/pre-update-2026-09-13/`.
- `research/main.tex` é um levantamento bibliográfico auxiliar antigo, não o artigo. Foi preservado e não deve ser usado como fonte autoritativa de metadados corrigidos.
- O PDF de entrega é `../output/pdf/E2P_artigo_atualizado.pdf`. `main.pdf` e `main_revisado.pdf` recebem o mesmo conteúdo após a compilação.

## Escopo editorial

O título foi ajustado para abranger a pipeline de QA, não apenas geração e execução de scripts. Autores e e-mails foram preservados; a sigla institucional foi padronizada como PUC Minas. A introdução contém motivação, problema, objetivos, síntese dos resultados e organização das seções. A metodologia descreve uma avaliação formativa, sem alegar experimento causal de comparação de modelos. Não foram inventados novos experimentos, participantes, revisões independentes ou aprovações do orientador.

A implementação foi atualizada para incluir llama.cpp, visão opcional, compilação determinística da jornada escolhida pelo modelo, objetivos QA, controle temporal, autor/crítico/reprodução, histórico, revisão humana persistida e descoberta ordinária antes da análise de defeitos. Recursos implementados foram separados de benefícios ainda não medidos. Não foram propostas ou introduzidas mudanças de código na aplicação nesta revisão do artigo.

## Conformidade consultada

O regulamento local `C:/Users/henri/Downloads/Regulamento_TCC_CC.pdf`, arts. 3 e 4, exige LaTeX, formato SBC, 10 a 16 páginas e ao menos 10 referências. A estrutura obrigatória foi mantida. Os arts. 6 a 11 exigem declaração da ferramenta de IA, finalidade e partes afetadas; foi incluída uma seção específica, sem inventar a versão do modelo subjacente usado pelo assistente.

O [modelo SBC indicado pelo próprio regulamento](https://www.overleaf.com/latex/templates/sbc-conferences-template/blbxwjwzdngr) determina coluna única A4, Times 12 pt, margens superior de 3,5 cm, inferior de 2,5 cm e laterais de 3 cm, ausência de numeração, abstract e resumo na primeira página com até 10 linhas cada. As definições locais do estilo SBC foram mantidas; não se comprimiram margens ou fonte para obter o limite de páginas. O limite de páginas vem do regulamento do curso, não de um limite universal da SBC.

As datas administrativas do semestre anterior não foram copiadas. A versão é uma atualização do artigo com os resultados existentes, não uma declaração de conclusão ou aprovação do TCC. Se a entrega for especificamente de TCC I, o art. 5, §2, ainda prevê cronograma para TCC II, a ser definido com o orientador; não foi inventado um cronograma letivo.

## Rastreabilidade dos resultados

Todos os caminhos a seguir são relativos à raiz `E2P`.

| Afirmação | Registro verificável | Limite de interpretação |
|---|---|---|
| Dopa: 2 ações, 6 estados, 0/1 teste, 1 hipótese | `action-e2e/prototype-runs/dopa-2026-09-08T11-42-34-893Z/exploration.json`, `results/playwright-results.json`, `tests/` | Candidato forte de execução/configuração; não bug funcional confirmado da busca. |
| Expense Tracker: 4 ações, 2 estados, 2/2 testes, 0 hipóteses | `action-e2e/prototype-runs/expense-tracker-2026-09-08T11-53-53-009Z/` | Nenhuma transação válida foi criada; recarga não comprova persistência. |
| Typing Game: 6 ações, 7 estados, 3/3 testes, 1 hipótese | `action-e2e/prototype-runs/typing-game-2026-09-08T11-59-57-372Z/` | Asserções finais `toHaveValue("w")` não verificam os objetivos anunciados. Hipótese sobre parar timer é falso positivo na análise assistida, não julgamento independente de banca. |
| 22 pausas, 148.094 ms isolados | `agenticExploration.metrics.modelThinkTimeIsolation` nos três `exploration.json` | Tempo da aplicação instrumentado, não congelamento de serviços nem redução igual do tempo total. |
| Cobertura 68%, 76,4%, 88,3% | `agenticExploration.qaCoverage.summary.ratio` | Heurística de objetivos, não cobertura de código ou garantia funcional. |
| Falha inicial do Form Validator | `action-e2e/prototype-runs/form-validator-2026-09-13T13-41-32-014Z/` | Respostas brutas originais de todos os fluxos não foram preservadas; não se reconstrói motivo exato de cada rejeição. |
| Primeira tentativa revelou JSON fora do ciclo de reparo | `action-e2e/prototype-runs/form-validator-2026-09-13T19-10-00-335Z/` | Tentativa incompleta, não sucesso de planejamento. |
| Reteste: 2 ações, 3 estados, 2 fluxos admitidos, 0 hipóteses retidas | `action-e2e/prototype-runs/form-validator-2026-09-13T19-12-00-882Z/exploration.json` e `flow-plan.json` | Fluxos não executados como nova suíte; não contabilizar como 2 testes aprovados. |
| Síntese e avaliação por projeto | `action-e2e/NEW_FEATURES_3_PROJECT_EVALUATION_2026-09-08.md` | Rodada anterior à separação de descoberta introduzida no dia 13. |
| Reteste recente e 96 testes do instrumento | `action-e2e/DISCOVERY_REFINEMENT_2026-09-13.md` e `features.md` | Testes internos distintos dos testes gerados para os candidatos; não foram novamente executados para redigir o artigo. |
| Perfil local, medições curtas e contexto longo | `RELATORIO_QWEN38_LLAMA_CPP_2026-09-05.md` e `action-e2e/scripts/start-llama-qwen38-iq1m.ps1` | 51,9 tokens/s em geração curta; 41,4 tokens/s após 51.560 tokens, sem alegar 50 tokens/s com contexto cheio. Nome GGUF e alias são identificadores do ambiente registrado. |
| Comparação histórica não causal | `RELATORIO_RETESTE_QWEN38_E2P_2026-09-05.md` | Modelo e integração mudaram juntos. Sem estimativa isolada de superioridade do modelo. |

## Correspondência com a implementação

- `action-e2e/src/services/live-explorer.js`: Chromium, visão opcional convidada, relógio, diagnóstico, análise de hipóteses após exploração e antes do planejamento; análise desabilitada para autenticação.
- `agentic-explorer.js`: entradas ordinárias, correção limitada de validação e tratamento de decisões.
- `qa-coverage.js`: objetivos e índice heurístico.
- `ai-workflows.js`: planejamento fundamentado em evidência e admissão de fluxos.
- `test-generator.js`: compilação convidada direta em modo `model-journey-compiled`, não código livre gerado primeiro pelo LLM.
- `bug-discovery.js` e `hypothesis-reproducer.js`: autoria, crítica, diagnósticos e repetição em contexto novo.
- `features.md`: histórico e feedback como recuperação de contexto, limitações de identidade por caminho e ausência de medição de redução de falsos positivos.

## Revisão bibliográfica

A bibliografia final contém 15 referências citadas, sendo 11 trabalhos de pesquisa e 4 fontes de software/documentação. Links foram colocados no campo `note`, pois o estilo local `sbc.bst` não imprime automaticamente `url` e `doi`.

- **LIBRO / Few-shot Testers:** autoria corrigida de Jin et al. para [Kang, Yoon e Yoo](https://arxiv.org/abs/2209.11515), ICSE 2023.
- **GPTDroid:** autores e título corrigidos conforme [Liu et al.](https://arxiv.org/abs/2310.15780), com confirmação de aceite no ICSE 2024.
- **Avgust:** a entrada antiga com autoria incorreta foi substituída pelo [artigo de Zhao et al., ESEC/FSE 2022](https://arxiv.org/abs/2209.02577), distinguindo-o da demonstração ICSE 2023.
- **Panta:** atualizado para ICSE 2026 e DOI [10.1145/3744916.3764553](https://doi.org/10.1145/3744916.3764553).
- **TestWeaver:** [versão dos autores](https://arxiv.org/abs/2508.01255) informa aceite ICSE 2026.
- **SpecOps:** conferidos título, cinco autores e DOI no [texto integral](https://arxiv.org/html/2603.10268v1).
- **GUISpector:** citada explicitamente a [versão arXiv de 2025](https://arxiv.org/abs/2510.04791), sem confundir data do preprint com demonstração em 2026.
- **WorkArena:** citada a [versão arXiv identificada](https://arxiv.org/abs/2403.07718), em vez da referência incompleta a PMLR.
- **Survey:** acrescentada a revisão de [Wang et al.](https://arxiv.org/abs/2307.07221), TSE 2024, para fundamentar a distinção entre atividades de teste.
- **Ferreira et al. e WebArena:** resultados preservados com atribuição aos respectivos estudos, sem comparação numérica direta com o E2P.
- Entradas antigas sobre bug reports, knowledge graph, unusual inputs, capture/replay e Odysseus foram retiradas desta síntese. Não são declaradas inexistentes: a retirada evita perpetuar metadados não confirmados e mantém o foco. A versão anterior continua no arquivo de preservação.
- TestSpark, ASTER e Test Intention eram entradas não citadas da bibliografia antiga; não foram mantidas como referências artificiais para completar quantidade.

## Compilação

Execute `build-pdf.bat` nesta pasta. O script usa o Tectonic portátil em `../runtimes/tectonic-0.17.0/`, um Tectonic no PATH ou uma instalação de pdfLaTeX + BibTeX. A primeira execução do Tectonic baixa os pacotes necessários; não executa comandos do projeto E2P nem do modelo. O antigo caminho fixo para MiKTeX não existia mais nesta máquina.

Para Overleaf, envie `main.tex`, `sbc-template.bib`, `sbc-template.sty` e `sbc.bst`, e selecione `main.tex`. O diagrama é vetorial e está definido no próprio fonte; os JPGs do template antigo não são necessários.

## Pontos que ainda exigem decisão acadêmica

1. Autor e orientador devem revisar o título ampliado, a redação final e a declaração de IA antes de submissão.
2. A avaliação existente não permite afirmar confiabilidade autônoma, ganho causal do novo modelo ou eficácia medida do feedback humano.
3. Para resultados finais mais fortes, faltam revisões congeladas, repetições pareadas, julgamentos independentes e defeitos conhecidos com versões corrigidas.
4. A declaração não inventa versão exata do aplicativo/modelo Codex, não disponível nos registros utilizados. Acrescentar essa informação somente com identificação verificável, se exigida pelo orientador.

## Validação final do documento

- Compilação concluída com Tectonic 0.17.0 e BibTeX; `build-pdf.bat` executado com sucesso.
- PDF com **15 páginas A4**, dentro da faixa de 10 a 16 páginas; **15 referências efetivamente citadas**, incluindo 11 trabalhos de pesquisa.
- Abstract e resumo com **9 linhas cada**, ambos na primeira página.
- Diagrama vetorial e duas tabelas revisados; todas as 15 páginas renderizadas e inspecionadas visualmente após a última edição.
- Nenhuma referência indefinida, glifo ausente ou caixa transbordando (`Overfull`) registrada. Permanecem avisos de justificação (`Underfull`) e um aviso do Fontconfig do runtime portátil; as fontes Times equivalentes, Courier e Helvetica foram incorporadas corretamente ao PDF e a inspeção não encontrou defeito visual associado.
- A validação foi documental: não foram reexecutados os benchmarks do E2P ou treinado/consultado o modelo local para produzir novos resultados.
