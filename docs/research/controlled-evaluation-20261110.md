# Avaliação controlada do E2P

## Comparação principal

O [protocolo congelado](../../evaluation/protocols/selector-comparison-v1.json) programou três pares em cada um de quatro alvos. A intervenção foi a política de escolha e preenchimento. O modelo local escolheu ações e valores. A referência escolheu uniformemente com sementes gravadas e valores sintéticos predefinidos. Ambas usaram o mesmo catálogo elegível, executor, observação, isolamento do relógio e orçamento nominal de dez ações e 60 segundos. A ordem das condições variou entre pares. Cada tentativa usou um contexto limpo e cada regra de domínio contou no máximo uma vez.

O [manifesto](../../evaluation-results/selector-comparison-20261110/manifest.json) registra as condições e os hashes antes da coleta. O [resultado](../../evaluation-results/selector-comparison-20261110/result.json) contém as 24 tentativas e os contratos e resultados de replay. Os arquivos de entrada mantiveram os mesmos hashes no fechamento. O [perfil de inferência](../../evaluation-results/selector-comparison-20261110/runtime.json) identifica pesos, projetor e ambiente. A compilação foi a mesma nas duas condições e recebeu oráculos definidos pelo avaliador fora do contexto do modelo.

| Alvo | Possíveis por condição | Modelo observados e reconferidos | Uniforme observados e reconferidos |
|---|---:|---:|---:|
| Form Validator | 3 | 3 | 3 |
| Music Player | 6 | 3 | 3 |
| Expense Tracker | 6 | 6 | 0 |
| Memory Cards | 6 | 0 | 0 |
| Total | 21 | 12 | 6 |

O modelo alcançou 0,5 efeito adicional por par em média. A diferença apareceu nos três pares do Expense Tracker. Os nove pares restantes empataram na contagem. No player, o modelo usou a faixa anterior e a política uniforme, a seguinte. A igualdade da contagem preserva essa diferença nas trajetórias.

| Medida | Modelo | Uniforme |
|---|---:|---:|
| Tentativas concluídas | 12/12 | 12/12 |
| Ações concluídas | 36 | 55 |
| Mediana de tempo de exploração | 49,25 s | 4,17 s |
| Tentativas com exceção de página registrada | 3/12 | 5/12 |

As 18 reexecuções foram aprovadas com asserções ligadas a efeitos específicos. Esse resultado avalia a capacidade de recompilar as trajetórias com os oráculos do avaliador. As exceções são ocorrências capturadas pela instrumentação, com repetição de uma assinatura entre tentativas. As contagens descrevem quatro aplicações selecionadas e três repetições por alvo. O custo mede a exploração, excluindo os replays, e o limite de 60 segundos é nominal. A execução e a observação de uma ação já iniciada podem ultrapassá-lo.

## Controle dos cartões

O [controle dirigido](../../evaluation-results/card-control-20261110/result.json) registrou a criação de um cartão e uma recarga explícita no original. O [teste congelado](../../evaluation-results/card-control-20261110/specs/creation-and-restore.spec.cjs) conferiu a quantidade de cartões e a pergunta e resposta da mesma entidade após a criação e após a recarga. O arquivo passou no original. A cópia com criação desativada falhou na asserção de criação. A cópia que perde a restauração após a terceira visita falhou na asserção pós-recarga. O ensaio foi dirigido pelo avaliador e mede a capacidade discriminatória do teste.

O relatório histórico de matriz agora informa verificação indisponível quando só existem logs e arquivos de teste. A comparação usa observações de domínio e reexecuções específicas para atribuir verificação. A referência dos cartões requer identidade de pergunta e resposta e uma criação registrada antes da recarga.

## Reteste dos cartões após a correção

Na coleta principal, o catálogo ofereceu `Question`, `Answer` e `Add Card` com o painel fechado. A opacidade zero estava no elemento pai e a leitura antiga examinava só a do controle. A correção faz a leitura percorrer os elementos pais. Um teste no Chromium verifica que as ações ficam ausentes com o painel transparente e aparecem quando ele abre.

A [rodada focal](../../evaluation-results/card-selector-retest-20261110/result.json) reaplicou as mesmas três sementes, ordem dentro dos pares, critérios e orçamento de Memory Cards. Foi escolhida após a inspeção da falha inicial. O modelo abriu o painel, preencheu os campos e criou um cartão nas três tentativas. Os três testes gerados com a asserção de criação passaram. A política uniforme obteve zero criações. Nenhuma tentativa atingiu a recarga explícita após a criação. O resultado permanece separado da comparação principal e descreve somente os cartões.

## Avaliação humana

O [pacote para distribuição](../../evaluation-results/caderno-revisao-humana-20261110.zip) contém dez alegações, passos, estados e trechos dos alvos em ordem embaralhada. Os vereditos anteriores e a associação com os identificadores antigos ficam fora do pacote distribuído. Cada avaliador recebe uma cópia. Para entregar sua revisão, ele informa um código distinto, declara a avaliação humana independente com `independentHumanReview: true` e fornece o rótulo e a justificativa de cada caso.

Após receber as duas submissões, valide-as e calcule a concordância antes de discutir as divergências.

```sh
node scripts/human-adjudication.cjs compare evaluation-results/human-review-20261110/evidencias.json revisao-A.json revisao-B.json concordancia-humana.json
```

O pacote preparado ainda aguarda as duas avaliações. A concordância anterior permanece registrada como concordância entre agentes.

## Reprodução e reversão

A coleta principal identifica o commit `eb96401`. Use um checkout desse commit para repetir a versão anterior à correção dos controles transparentes. Para a coleta de acompanhamento dos cartões, use a revisão registrada em seu manifesto. Cada execução exige um identificador novo e preserva os resultados anteriores.

As mudanças foram feitas na branch `research/e2p-validacao-controlada`, em um checkout separado de `feat/function-matrix-metal-runtime`. O código do ensaio, o pacote para revisão humana, a correção do catálogo, a correção do perfil Metal, os dados e o artigo ficam em commits separados. Para voltar ao estado anterior, use o checkout original. Caso já tenha incorporado mudanças, reverta os commits correspondentes em ordem inversa para manter a coerência entre código, dados e artigo.
