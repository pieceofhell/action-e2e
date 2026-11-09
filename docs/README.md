# Documentação do E2P

- [Análise atual e plano de validação](research/critical-review-20261020.md): principais lacunas e critérios para reforçá-las.
- [Execução remota na RTX 3060](guides/remote-rtx3060.md): instalação, modelos, operação contínua e acesso.
- [Execução adaptável e boot no Linux](guides/portable-runtime.md): detecção de memória, notebook com 8 GB, perfis menores e inferência remota.
- [Execução por agentes](guides/agent-automation.md): execução completa por terminal e revisão automatizada de hipóteses.
- [Especificação](architecture/specs.md) e [cenários BDD](architecture/specs.bdd.md).
- [Autenticação](architecture/features/auth.md) e [hipóteses de falha](architecture/features/bug-discovery.md).
- [Pesquisa e exploração](research/features.md) e [aplicações candidatas](research/candidates.md).
- [Artigo e versões preservadas](../paper/README.md).
- [Validação de 20/10/2026](../evaluation-results/current-20261020/README.md).
- [Coleta de 07/11/2026 em Apple M4 com Qwen3-VL 4B e matriz de funções](../evaluation-results/apple-m4-qwen3vl4b-20261107/README.md).
- [Funções de referência do avaliador](../evaluation/reference-functions/diverse-contexts-v1.json): base da matriz função × execução (`npm run evaluate:functions`).
- `reports/archive/`: relatórios e avaliações anteriores, conservados como histórico; suas descrições de caminhos e contagens pertencem à data de cada documento.

`reorganization.json` registra os caminhos anteriores dos documentos movidos. Pesos, runtimes, dependências e gravações de execução permanecem fora do versionamento. Os manifestos e os registros selecionados publicados em `evaluation-results/` acompanham os resultados do artigo.
