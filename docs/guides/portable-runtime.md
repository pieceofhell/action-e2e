# Execução adaptável: Linux, Windows e computadores com menos memória

O E2P separa a interface e o navegador do servidor de inferência. Eles podem executar no mesmo computador ou em máquinas diferentes. A configuração automática escolhe um ponto de partida conforme RAM disponível, VRAM livre e suporte do runtime; não promete a mesma qualidade em qualquer equipamento.

## Começar

Com Node.js 24, Git e o repositório instalado:

```sh
npm ci
npx playwright install chromium
npm run doctor
```

No Linux, a primeira instalação do navegador pode precisar de `npx playwright install --with-deps chromium`. No Windows, use `npm.cmd` e `npx.cmd` se o PowerShell restringir os scripts com extensão `.ps1`.

`doctor` somente lê informações e mostra o plano: perfil, memória, contexto, entrada visual, executável e argumentos. Não baixa pesos nem inicia o modelo. Instale uma distribuição de [llama.cpp](https://github.com/ggml-org/llama.cpp/releases) adequada ao sistema e à GPU, preservando as bibliotecas do pacote. Configure o caminho absoluto:

```sh
# Linux; ajustar ao seu caminho real
export E2P_LLAMA_SERVER="$HOME/llama.cpp/build/bin/llama-server"
"$E2P_LLAMA_SERVER" --list-devices
npm run doctor
npm run start:unattended
```

No PowerShell: `$env:E2P_LLAMA_SERVER = 'C:\AI\llama.cpp\llama-server.exe'`. A interface fica em `http://127.0.0.1:4318`, e a inferência local em `http://127.0.0.1:8081/v1`. Selecione em Local llama.cpp o alias mostrado no plano. O supervisor inicia diretamente o executável tanto no Linux quanto no Windows, sem exigir PowerShell no Linux.

A primeira inicialização pode baixar o modelo e o projetor pelo mecanismo `-hf`. Para experimentar somente o modelo: `npm run model:start`. Feche esse processo antes de iniciar o supervisor completo. Uma porta de inferência já ocupada é preservada; o supervisor não assume controle daquele processo.

## Escolha automática

| Perfil | Entrada | Contexto inicial | Quando a seleção automática o considera |
|---|---|---|---|
| `vision-7b` | DOM, texto e imagens | 16k | RAM total ≥12 GiB, disponível ≥5 GiB e VRAM livre ≥9 GiB. |
| `vision-3b` | DOM, texto e imagens | 8k | RAM total ≥10 GiB, disponível ≥4 GiB e VRAM livre ≥6 GiB. |
| `text-3b` | DOM e texto | 8k | RAM total ≥6,5 GiB, disponível ≥3 GiB e VRAM livre ≥3 GiB. |
| `text-1.5b` | DOM e texto | 8k | RAM total ≥6 GiB, disponível ≥2,5 GiB e VRAM livre ≥1,5 GiB; em CPU, disponível ≥4 GiB. |
| Provedor separado | Conforme o servidor escolhido | Conforme o servidor | Memória insuficiente para os pontos de partida locais ou endpoint explicitamente configurado. |

São margens de implantação, não resultados medidos nessas máquinas. O tamanho do arquivo de pesos não inclui cache, projetor, buffers, navegador e sistema. A detecção automática de VRAM usa `nvidia-smi`; mede a GPU permitida com mais memória livre, sem somar placas. Respeita `CUDA_VISIBLE_DEVICES`. O binário também precisa listar um dispositivo CUDA. Em Linux, a RAM disponível vem de `MemAvailable`, que considera memória recuperável de cache.

Na **RTX 3060 12 GB com 16 GB de RAM**, o ponto de partida esperado é `vision-7b`, desde que haja memória livre suficiente. No **Dell G15 com 8 GB de RAM e RTX 3050 mobile**, a VRAM é detectada — não se presume que a placa tenha 4 ou 6 GB. Mesmo com VRAM maior, a pouca RAM pode levar a `text-3b`, `text-1.5b` ou provedor separado. Feche programas pesados antes de avaliar a capacidade local.

Os perfis visuais usam [Qwen2.5-VL GGUF](https://github.com/ggml-org/llama.cpp/blob/master/docs/multimodal.md). Os perfis de texto usam [Qwen2.5-3B](https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF) ou [Qwen2.5-1.5B](https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF), em Q4_K_M. A qualidade da seleção de ações e das hipóteses precisa ser avaliada em cada perfil. Sem entrada visual, screenshots podem continuar nos artefatos, mas não são enviadas ao modelo.

O plano é fixado ao iniciar e salvo em `logs/runtime-plan.json`; não há troca silenciosa de modelo durante uma execução. Se a inicialização falhar por memória, escolha um perfil menor e reinicie. O supervisor reinicia processos que terminam, com espera progressiva, mas não diagnostica todos os travamentos. Logs são limitados; as evidências em `prototype-runs/` não são apagadas automaticamente.

## Linux: iniciar no boot, sem login

Use uma distribuição com systemd. Instale o driver NVIDIA e um runtime llama.cpp com CUDA. Se compilar, instale também o CUDA Toolkit conforme a [documentação NVIDIA para sua distribuição](https://docs.nvidia.com/cuda/cuda-installation-guide-linux/); possuir somente o driver não garante que `nvcc` esteja disponível.

Uma compilação possível, após preparar esses pré-requisitos:

```sh
git clone https://github.com/ggml-org/llama.cpp.git "$HOME/llama.cpp"
cmake -S "$HOME/llama.cpp" -B "$HOME/llama.cpp/build" -DGGML_CUDA=ON -DCMAKE_BUILD_TYPE=Release
cmake --build "$HOME/llama.cpp/build" --config Release -j 4 --target llama-server
```

Primeiro execute uma exploração curta manualmente. Depois, na raiz do E2P:

```sh
# Mostra a configuração, sem instalar
npm run service:linux
# Instala e habilita para este usuário, sem iniciar ainda
npm run service:linux -- --install
```

Edite `~/.config/e2p/environment` para conter o caminho real, **sem `$HOME`**, pois esse arquivo não expande variáveis de shell:

```ini
E2P_LLAMA_SERVER=/home/henri/llama.cpp/build/bin/llama-server
E2P_RUNTIME_PROFILE=auto
```

Ative a permanência do serviço de usuário e inicie:

```sh
sudo loginctl enable-linger "$USER"
systemctl --user start e2p
systemctl --user status e2p
journalctl --user -u e2p -f
```

O [linger](https://www.freedesktop.org/software/systemd/man/latest/loginctl.html) permite iniciar o gerenciador de usuário no boot e mantê-lo sem uma sessão aberta. O serviço habilitado usa esse gerenciador; `Restart=on-failure` recupera o supervisor e `KillMode=control-group` encerra seus processos no desligamento. O E2P executa como usuário comum, e não como root. O comando com `sudo` acima configura apenas o linger.

Para parar: `systemctl --user stop e2p`. Para desabilitar: `systemctl --user disable --now e2p`. Se mudar o caminho do clone ou do Node, atualize a unidade com `npm run service:linux -- --install --replace`. O instalador preserva o arquivo de ambiente existente. Para registrar a versão do runtime, use `llama-server --version`; para replicar ensaios, fixe também modelo, quantização, contexto e revisão do código.

## Notebook: duas formas de usar a máquina antiga

**Todo o processamento na máquina antiga:** abra um túnel no notebook:

```sh
ssh -N -L 4318:127.0.0.1:4318 usuario@maquina-antiga
```

Abra `http://127.0.0.1:4318`. O notebook usa apenas o navegador da interface; o E2P, os alvos, o Playwright e o modelo ficam na máquina antiga. As pastas selecionadas pertencem a ela. Essa opção reduz mais o consumo do notebook.

**Aplicação testada no notebook, modelo na máquina antiga:** instale E2P e Chromium no notebook e abra o túnel da inferência:

```sh
ssh -N -L 8081:127.0.0.1:8081 usuario@maquina-antiga
# Em outro terminal, dentro do clone local
npm run start:unattended -- --application-only
```

Selecione Local llama.cpp, endpoint `http://127.0.0.1:8081/v1` e o modelo anunciado pela máquina antiga. Nesse caso o Playwright e o alvo consomem RAM do notebook, mas os pesos ficam no servidor. O túnel mantém a conexão em loopback nas duas pontas, compatível com o envio de imagens a um modelo local do E2P. Nenhuma porta do projeto precisa ser publicada na internet.

Ao compartilhar o servidor de inferência, faça uma avaliação por vez para evitar que a espera de outro cliente consuma o orçamento de exploração.

Um endpoint próprio também pode ser informado com `--remote URL` ou `E2P_AI_ENDPOINT`; o supervisor inicia só a aplicação. Na interface, configure o mesmo endpoint/provedor. APIs diretamente externas continuam sujeitas à política existente de entrada visual do projeto.

## Escolhas manuais

```sh
npm run doctor -- --profile text-3b
npm run start:unattended -- --profile text-3b --context 8192
npm run model:start -- --profile text-1.5b --cpu
# GPU não detectada automaticamente, por exemplo uma Radeon com runtime Vulkan:
npm run doctor -- --profile vision-3b --device Vulkan0
```

Para pesos locais, use `--profile`, `--model` e, em visão, `--projector`. Seus tamanhos podem diferir dos modelos previstos. GPU não NVIDIA/unificada não tem orçamento de VRAM inferido automaticamente: use CPU, servidor separado ou perfil/dispositivo explícitos após conferir memória. Isso permite rodar a aplicação em mais máquinas sem fingir que toda GPU foi identificada corretamente.

O launcher anterior `start-rtx3060.ps1` permanece disponível para reproduzir sua configuração fixa; o caminho recomendado agora é o launcher adaptável em Node. O artigo e as evidências preservadas não foram alterados por esta mudança de implantação.
