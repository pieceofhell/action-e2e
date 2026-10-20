# Executar o E2P na máquina remota com RTX 3060

Atualização: a máquina utiliza Linux como boot padrão e RTX 3060 de 12 GB. O caminho recomendado é o [guia adaptável para Linux, Windows e notebook](portable-runtime.md), com seleção por memória e serviço no boot sem login. As instruções abaixo preservam o perfil fixo Windows preparado anteriormente.

Perfil informado: i5-10400F, 16 GB DDR4 2666 e RTX 3060. A memória da GPU deve ser conferida com `nvidia-smi`: existem variantes de 8 e 12 GB. Os perfis abaixo são pontos de partida de implantação; os resultados do artigo foram medidos na outra máquina, com Radeon RX 9070 XT. Não há medição de desempenho nesta RTX 3060 ainda.

## Instalação no Windows

Instale Git, Node.js 24 e o driver NVIDIA. Obtenha uma distribuição Windows **CUDA** de [llama.cpp](https://github.com/ggml-org/llama.cpp/releases), incluindo as bibliotecas que acompanham o pacote. Confira `llama-server.exe --list-devices` e registre `--version`. A documentação oficial cobre [servidor](https://github.com/ggml-org/llama.cpp/tree/master/tools/server) e [visão/projetor](https://github.com/ggml-org/llama.cpp/blob/master/docs/multimodal.md).

```powershell
git clone https://github.com/pieceofhell/action-e2e.git
cd action-e2e
npm.cmd ci
npx.cmd playwright install chromium
npm.cmd test
$env:E2P_LLAMA_SERVER = 'C:\AI\llama.cpp\llama-server.exe'
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-rtx3060.ps1
```

O launcher detecta a VRAM com `nvidia-smi`. A primeira execução pode baixar os pesos e o projetor pelo mecanismo `-hf` do llama.cpp. Para operação sem downloads futuros, mantenha os arquivos em disco e forneça `E2P_MODEL_PATH` e `E2P_PROJECTOR_PATH`. O projetor deve pertencer ao mesmo modelo. Guarde os hashes SHA-256 dos dois arquivos e a versão do runtime com o registro experimental.

| GPU | Ponto de partida | Contexto reservado | Concorrência |
|---|---|---|---|
| RTX 3060 12 GB | [Qwen2.5-VL-7B Q4_K_M](https://huggingface.co/ggml-org/Qwen2.5-VL-7B-Instruct-GGUF) | 16.384 | Um slot e uma avaliação por vez |
| RTX 3060 8 GB | [Qwen2.5-VL-3B Q4_K_M](https://huggingface.co/ggml-org/Qwen2.5-VL-3B-Instruct-GGUF) | 8.192 | Um slot e uma avaliação por vez |

O perfil usa seis threads, KV Q8, Flash Attention e lotes menores. O alias contém `vl` para que o E2P reconheça visão e o sufixo de contexto. Esses modelos são alternativas de compatibilidade documentadas pelo mantenedor do runtime; a qualidade exploratória precisa ser medida. Não transferir a nota ou os resultados do modelo de 27B do artigo a esses modelos.

Se faltar memória, reduza o contexto com `-Context 8192` ou `4096`; depois considere o modelo de 3B. Preserve espaço para Windows, acesso remoto, navegador, projetor e buffers. O tamanho do GGUF sozinho não representa a memória total da execução. Não usar automaticamente o perfil de 27B/64k desta outra máquina.

Em outro terminal, execute `npm.cmd start` e abra `http://127.0.0.1:4318`. Escolha o provedor Local llama.cpp e o modelo `e2p-vl-rtx3060-16k` ou `e2p-vl-rtx3060-8k`. O endpoint é `http://127.0.0.1:8081/v1`. Faça uma exploração curta e confira o histórico antes de montar um lote.

## Operação contínua

Para iniciar aplicação e modelo com reinício em caso de término do processo:

```powershell
# Persistir o caminho para novos logons/tarefas; ajustar ao seu diretório.
[Environment]::SetEnvironmentVariable('E2P_LLAMA_SERVER','C:\AI\llama.cpp\llama-server.exe','User')
$env:E2P_LLAMA_SERVER = 'C:\AI\llama.cpp\llama-server.exe'
npm.cmd run start:unattended
```

Feche os servidores iniciados manualmente antes de usar o supervisor, para evitar disputa das portas. Ele controla somente seus próprios processos e reinicia com espera progressiva até 60 segundos. Os logs ficam em `logs/`, com um arquivo atual e um anterior por serviço, de aproximadamente 10 MiB cada. Isso não limita o volume de `prototype-runs/`: acompanhe espaço e arquive os artefatos necessários antes de removê-los. Não há limpeza automática das evidências.

Para iniciar ao entrar no Windows:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-startup-task.ps1 -WhatIf
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-startup-task.ps1
```

A tarefa é registrada para o logon do usuário atual, sem guardar sua senha. **Não é um serviço que inicia antes do logon.** Para esta configuração, mantenha a sessão iniciada; desconectar o acesso remoto é diferente de encerrar a sessão. Confira também suspensão e reinício do Windows conforme a política que você utiliza nessa máquina. Para remover a tarefa: `Unregister-ScheduledTask -TaskName E2P`.

O supervisor reinicia processos que terminam; não diagnostica todos os travamentos. Um reinício do E2P preserva o histórico e identifica trabalhos pendentes para revisão. Não há reexecução automática de jornadas possivelmente mutáveis. Antes de uma noite de coleta, confira `/health` do llama.cpp e execute uma aplicação pequena.

## Acesso remoto

Pode usar a interface dentro da sessão de acesso remoto já existente. Para abrir o E2P no navegador do outro computador via SSH:

```text
ssh -N -L 4318:127.0.0.1:4318 usuario@maquina-remota
```

Abra `http://127.0.0.1:4318` no computador cliente e deixe o modelo em loopback na máquina remota. As pastas selecionadas pertencem à máquina que executa o E2P. Use a porta local 4318, porque a proteção de origem do projeto espera esse endereço/porta. O repositório não abre portas públicas nem altera firewall ou roteador.

## Coletas para o artigo

```powershell
npm.cmd run setup:targets
cd ..\candidates\todomvc\examples\react
npm.cmd install
npm.cmd run build
cd ..\..\..\..\action-e2e
$env:E2P_AI_MODEL = 'e2p-vl-rtx3060-16k'
npm.cmd run evaluate:protocol -- evaluation/protocols/diverse-contexts.json evaluation-results/minha-rodada
```

Se o nome da pasta do clone for diferente, ajuste o último `cd`. O preparador preserva alvos já existentes. Compare os hashes no manifesto: mesma revisão Git pode conter alterações locais. Para dados experimentais mais estritos, preserve também lockfiles e artefatos de build dos alvos. A coleta escreve em diretório novo e não sobrescreve uma anterior.

Registre memória de GPU com `nvidia-smi`, memória do sistema, versão do modelo, janela, tempos e funções alcançadas. Uma comparação entre 27B IQ1_M na Radeon e 7B Q4_K_M na RTX é uma comparação de configurações completas, não um experimento isolado sobre GPU.

## Linux

Instale a versão CUDA correspondente de llama.cpp e inicie o mesmo modelo com `llama-server -hf ... --alias e2p-vl-rtx3060-16k --ctx-size 16384 --parallel 1 --host 127.0.0.1 --port 8081`. Inicie o aplicativo com `node scripts/run-unattended.cjs --application-only`. Os scripts de agendamento fornecidos são para Windows; um serviço systemd deve usar usuário sem privilégios e caminhos absolutos conforme a distribuição instalada.
