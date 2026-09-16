# Qwen 3.8 27B — otimização direta com llama.cpp

**Hardware:** Ryzen 7 7800X3D, Radeon RX 9070 XT 16 GB, 32 GB RAM  
**Objetivo:** abandonar Ollama, manter pelo menos 50k tokens de contexto e buscar 50 tokens/s de geração.

## Resultado

A configuração escolhida é:

- `llama.cpp` b10819, backend Vulkan;
- Unsloth `Qwen3.8-27B-UD-IQ1_M.gguf` (1,75 bpw, 6,27 GiB locais);
- projetor visual `mmproj-BF16.gguf` (0,87 GiB);
- todas as camadas na RX 9070 XT;
- contexto de 65.536 tokens, um slot;
- Flash Attention;
- cache KV Q8;
- reasoning configurável, desativado nas respostas JSON pelo cliente;
- endpoint OpenAI-compatible local `http://127.0.0.1:8081/v1`;
- alias `qwen3.8-vl-27b-iq1m-64k`.

O benchmark padronizado atingiu **51,92 tokens/s**. Uma chamada visual real pelo E2P gerou a **50,79 tokens/s** e identificou corretamente título, placar e estado de um painel numa captura do Breakout. O modelo processou e recuperou corretamente uma chave escondida em um prompt de **51.560 tokens**, confirmando uso prático acima de 50k.

## Quantizações comparadas

| Configuração | Pesos locais | Prompt curto | Geração curta | Resultado de QA |
|---|---:|---:|---:|---|
| Ollama Q4_K_M anterior | ~15,66 GiB de pesos; 19 GB carregado | 106,24 t/s | 7,31 t/s | 3/3 apenas com schema; saída livre truncou |
| Unsloth UD-IQ2_S + Vulkan | 7,80 GiB | 774,86 t/s | 43,08 t/s | 9/10 na bateria conservadora |
| Unsloth UD-IQ1_M + Vulkan | 6,27 GiB | 819,02 t/s | **51,92 t/s** | variou entre 7/10 e 9/10 sem gates determinísticos |

O IQ2_S foi descartado porque não atingiu a meta de velocidade e não demonstrou uma vantagem consistente na pequena bateria: também errou um caso, embora quantizações maiores normalmente preservem melhor a qualidade. IQ1_M cumpriu a meta, mas a perda de fidelidade é real; ele é adequado como autor/explorador atrás dos gates do E2P, não como juiz autônomo.

## Contexto longo: a ressalva importante

“50 tokens/s e 50k de contexto” tem duas leituras diferentes:

1. o servidor suporta 50k+ e a geração normal alcança 50 t/s — **cumprido**;
2. a geração ainda alcança 50 t/s quando mais de 50k tokens já ocupam o cache — **não cumprido** neste hardware.

Com 51.560 tokens já processados:

| Cache KV | Prompt | Geração após 51k | Recuperação da chave |
|---|---:|---:|---|
| Q8 | 641,35 t/s | 41,42 t/s | correta |
| Q4 | 557,14 t/s | 42,41 t/s | correta |

O KV Q4 economizou memória, mas quase não acelerou a geração e reduziu a velocidade do prompt. Por isso a configuração final mantém Q8. A queda em contexto longo vem do custo de atenção sobre um cache muito maior, não de offload: todas as camadas permanecem na GPU.

## Backends

O build oficial ROCm 7.14 do `llama.cpp` foi testado primeiro, mas não carregou o backend HIP porque o runtime correspondente não estava instalado globalmente. O Vulkan b10819 reconheceu imediatamente a RX 9070 XT, FP16/BF16, integer dot products e cooperative matrices. Como atingiu a meta sem depender das bibliotecas do Ollama, ele foi escolhido e o runtime ROCm baixado foi removido.

A AMD inclui a RX 9070 XT na documentação atual do HIP para Windows, mas instalar um SDK global adicional não trouxe justificativa depois que Vulkan ultrapassou 50 t/s. Fontes: [llama.cpp releases](https://github.com/ggml-org/llama.cpp/releases), [build Vulkan oficial](https://github.com/ggml-org/llama.cpp/blob/master/docs/build.md), [HIP SDK para Windows](https://rocm.docs.amd.com/projects/install-on-windows/en/latest/reference/system-requirements.html) e [GGUFs da Unsloth](https://huggingface.co/unsloth/Qwen3.8-27B-GGUF/tree/main).

## Integração entregue

- launcher otimizado: `action-e2e/scripts/start-llama-qwen38-iq1m.ps1`;
- provedor `Local llama.cpp` adicionado ao E2P e tornado padrão;
- descoberta automática pelo endpoint `/v1/models`;
- respostas JSON solicitadas pelo protocolo OpenAI-compatible;
- thinking desativado em chamadas estruturadas;
- screenshots habilitados pelo alias `vl` e projetor multimodal;
- contexto `64k` inferido pelo perfil;
- documentação atualizada.

## Limpeza de disco

Foram removidos:

- `qwen3.8:27b` Q4_K_M e seu alias Ollama;
- `qwen2.5vl:7b` e `gemma3:12b` do Ollama;
- Unsloth `UD-IQ2_S` após o benchmark;
- build ROCm que não carregou;
- ZIPs dos runtimes já extraídos;
- Modelfile antigo do Ollama.

O servidor Ollama foi encerrado e sua lista de modelos ficou vazia. O aplicativo Ollama em si não foi desinstalado, mas não é usado pelo E2P. O espaço livre no disco C: terminou em **68,2 GB**, contra 45,84 GB antes da troca.

## Uso

No diretório `action-e2e`, executar:

```powershell
.\scripts\start-llama-qwen38-iq1m.ps1
```

Depois iniciar o E2P normalmente. O provedor padrão é `Local llama.cpp` e o modelo descoberto deve ser `qwen3.8-vl-27b-iq1m-64k`.

## Julgamento final

IQ1_M é a quantização que satisfaz a meta de throughput nesta 9070 XT sem offload. O preço é uma queda mensurável na estabilidade de julgamento. A decisão tecnicamente correta é usá-la para exploração e geração de candidatos, enquanto regras determinísticas eliminam contradições, modalidades não observadas e expectativas sem fundamento. Para casos críticos, uma quantização maior ou revisão externa continua sendo mais segura — mas não deve permanecer ocupando disco quando não estiver em uso.
