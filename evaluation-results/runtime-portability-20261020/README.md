# Implantação adaptável e operação no Linux

Esta revisão atende Linux como boot principal da máquina com RTX 3060 de 12 GB e contempla um notebook com 8 GB de RAM e RTX 3050 mobile, cuja VRAM deve ser detectada. O artigo e o pacote experimental anterior foram preservados. Os novos perfis não são resultados de desempenho nessas máquinas.

## Implementação

- Launcher em Node, comum a Linux e Windows, sem PowerShell obrigatório no Linux.
- Seleção por RAM total/disponível, VRAM livre, visibilidade CUDA e suporte do executável. Não soma a memória de GPUs diferentes.
- Perfis de visão 7B/3B, texto 3B/1,5B, CPU e provedor separado. Modo de entrada e contexto aparecem no alias e no plano de inicialização.
- Diagnóstico sem downloads (`npm run doctor`), escolha manual e preservação de provedor já em execução.
- Supervisor com reinício progressivo, proteção contra segunda instância, encerramento dos processos que inicia e plano registrado em logs.
- Unidade systemd de usuário, habilitada para boot sem login por meio de linger. Instalação não exige executar E2P como root.
- [Guia de implantação](../../docs/guides/portable-runtime.md) com opção de usar o modelo ou toda a execução na máquina antiga através de SSH.

## Verificação

A suíte inclui 13 testes novos de seleção/configuração e uma integração do supervisor. Os cenários de memória são **simulados**: 3060/12 GB e RAM 16 GB; notebook com RAM 8 GB e VRAM 4 GB; GPU ocupada; pouca RAM disponível; CPU; mais de uma GPU e dispositivo oculto. Eles conferem a decisão da política, não comprovam que cada modelo foi carregado naquele hardware.

A execução real em Linux encontrou uma incompatibilidade na interpretação de anexos com caminhos Windows. O parser passou a respeitar a convenção do caminho registrado, com regressão para Windows, POSIX e UNC que continua rejeitando travessia e outras raízes. A conferência da unidade systemd também identificou e corrigiu a sintaxe de `WorkingDirectory` antes da conclusão da implantação.

O teste do supervisor inicia o E2P real, recusa uma segunda instância na mesma porta, termina seu processo de aplicação, confere a recuperação e verifica o encerramento. No Linux, o encerramento exercita SIGTERM e grupos de processos; no Windows, utiliza o encerramento da árvore criada pelo próprio teste.

O [log Windows](windows-tests.txt) acompanha esta revisão. A automação [Validate Linux and Windows](../../.github/workflows/validate.yml) instala dependências e Chromium, confere as evidências preservadas, executa a suíte e verifica a sintaxe da unidade Linux. Os resultados de cada execução ficam na aba Actions do repositório.

**Resultado final:** [167 testes aprovados em Linux e Windows](https://github.com/pieceofhell/action-e2e/actions/runs/39456855091), sem falha ou skip. A sintaxe da unidade Linux foi aceita por `systemd-analyze verify`, e os 102 hashes dos artefatos preservados foram conferidos nas duas plataformas. O [registro extraído dos logs](ci-verification.json) identifica commit, jobs, versões de Node e resultados. Esse ensaio verifica instalação, aplicação, políticas e processos em runners; não mede GPU NVIDIA nem um boot da máquina antiga.

Ainda são necessárias medições reais nos equipamentos: pico de RAM/VRAM, tempo até disponibilizar o modelo, exploração útil, contexto efetivamente utilizado e estabilidade após uma noite de operação. O diagnóstico automático não substitui esses ensaios, e perfis menores não herdam os resultados do modelo utilizado no artigo.
