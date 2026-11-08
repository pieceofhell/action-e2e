# Coleta de 07/11/2026: Apple M4 com Qwen3-VL 4B e matriz de funções

Coleta: 08/11/2026 00:55–01:26 UTC (07/11 no horário local). [Manifesto](collection/validation.json), [protocolo v2](../../evaluation/protocols/diverse-contexts-v2.json) e [funções de referência](../../evaluation/reference-functions/diverse-contexts-v1.json) (SHA-256 `d08ddef6…b012`, registrado no manifesto **antes** da primeira execução e não fornecido ao modelo).

## Condições

| Item | Valor |
|---|---|
| Máquina | MacBook com Apple M4 (10 núcleos), 16 GB de memória unificada, macOS 27.2 |
| Runtime | llama.cpp 0.9.0 (build 12110, Homebrew), Metal `MTL0`, working set informado de 12.124 MiB |
| Modelo | `Qwen/Qwen3-VL-4B-Instruct-GGUF:Q4_K_M` + projetor Q8_0, alias `e2p-vl-qwen3-4b-16k`, contexto reservado 16k, KV Q8, um slot |
| Seleção | Automática por `npm run doctor`: memória recuperável ≈3,2 GiB no momento (outros aplicativos abertos) levou ao perfil 4B; o 8B exige ≥7 GiB |
| Velocidade medida | ≈27,7 tokens/s de geração; ≈83 tokens/s de prompt curto |
| Protocolo | Mesmos quatro alvos e revisões da coleta de 20/10, duas repetições intercaladas, convidado, navegador limpo, 20 ações/180 s |

Esta é uma **configuração completa diferente** da coleta de 20/10 (27B IQ1_M, Vulkan, RX 9070 XT, contexto 64k). Mudaram modelo, quantização, máquina, runtime e contexto ao mesmo tempo. A comparação descreve o que cada configuração alcançou; ela não isola o efeito de nenhum desses fatores.

## Matriz função × execução

Legenda: **—** não tentada, **T** tentada, **E** exercitada com mudança de estado citada, **V** verificada por asserção gerada. Para 20/10 a matriz é retroativa. [Tabela completa desta coleta](function-matrix/function-matrix.md) · [tabela retroativa de 20/10](function-matrix-historical-20261020/function-matrix.md).

| Alvo (funções de referência) | 20/10 — 27B IQ1_M (R1/R2) | 07/11 — Qwen3-VL 4B (R1/R2) |
|---|---|---|
| Form Validator (5) | exercitadas 2/2 · não tentadas: e-mail, senha, confirmação | idêntico |
| Music Player (4) | exercitada: voltar faixa · tentadas: tocar, buscar · não tentada: avançar | idêntico |
| Memory Cards (6) | exercitadas: limpar, recarga · tentadas: abrir formulário, criar, navegar | exercitadas: limpar, recarga · tentadas: abrir formulário, criar · **navegar não tentada** |
| TodoMVC React (6) | exercitadas: criar, filtrar · não tentadas: concluir, concluir todas, excluir, limpar concluídas | idêntico |

Leitura: com o mesmo catálogo de ações, política e orçamento, um modelo cerca de sete vezes menor alcançou quase a mesma matriz. O único recuo foi não navegar entre cartões em Memory Cards — justamente a ação que, em 20/10, levou à exceção reproduzida nesse alvo. Nenhuma das duas configurações concluiu tarefa no TodoMVC nem preencheu e-mail/senha no formulário; essas lacunas parecem mais ligadas ao instrumento (política de entradas, encerramento por catálogo esgotado, orçamento adaptativo) do que ao tamanho do modelo. É uma hipótese para a Rodada C do plano crítico, não uma conclusão: são duas repetições por alvo e várias condições mudaram ao mesmo tempo.

## Candidatos a defeito

| Alvo | 07/11 retidos | Observação |
|---|---|---|
| Music Player | 1 em cada repetição | A mesma exceção `Cannot set properties of null (setting 'innerHTML')` de 20/10, reproduzida em sessão limpa. As duas hipóteses do modelo sobre botões foram rejeitadas pelos filtros determinísticos. |
| Form Validator | 2 em R2 | Mesmo padrão do candidato não sustentado de 20/10: esperar validação individual ao pressionar Enter. A [conferência de 20/10](../current-20261020/form-expectation.json) mostra que o submit valida o formulário inteiro. A reprodução confirma a observação, não a expectativa. |
| Memory Cards, TodoMVC | 0 | A exceção de navegação dos cartões não foi alcançada. |

Os modelos de rotulação cega estão em [`adjudication/`](adjudication/), sem veredito do modelo. Eles devem ser preenchidos por **dois avaliadores humanos independentes** e comparados com `npm run evaluate:agreement`. Nenhum rótulo humano foi inventado aqui.

## Pipeline completo (geração e execução de testes)

`npm run evaluate:blind-local -- ../candidates/vanillawebprojects/memory-cards e2p-vl-qwen3-4b-16k` concluiu inspeção, exploração (10 ações), revisão, planejamento, geração e execução em 6 min 34 s: **3 testes Playwright gerados, 3 aprovados**. [Artefatos selecionados](full-pipeline/). Mesmo assim, a [matriz](function-matrix-full-pipeline/function-matrix.md) mostra **0 de 6 funções verificadas**. As asserções conferem só os valores digitados em `#question`/`#answer` e um título; nenhuma confere criação, virada ou navegação de cartões.

Esse caso também revelou um falso positivo na primeira versão da matriz: a guarda de overlay do dev-server (`toHaveCount(0)`) casava com a asserção esperada de "limpar coleção". Guardas de infraestrutura agora são excluídas, com teste de regressão.

## Limitações

- Duas repetições por alvo; não há inferência estatística.
- Funções de referência definidas por quem também conhecia as coletas anteriores; os alvos já estavam expostos ao desenvolvimento do E2P.
- A memória recuperável varia com os outros aplicativos abertos; outro momento pode selecionar o perfil 8B.
- `runs/` guarda `exploration.json` e `run-log.json`, sem capturas, para manter o repositório leve. Caminhos absolutos nos registros pertencem à máquina de coleta.
