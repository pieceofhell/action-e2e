# Segunda revisão por dois agentes

Dois agentes em contextos separados receberam as mesmas dez alegações da coleta no M4, com [evidências em ordem embaralhada](../human-review-20261110/evidencias.json). O pacote apresenta passos, estados, diagnósticos e trechos do código. A decisão de retenção, os vereditos anteriores e a resposta do outro agente ficaram fora da revisão. Cada agente atribuiu uma das três categorias e justificou sua decisão por escrito.

Os agentes concordaram em 8 de 10 casos (κ de Cohen = 0,58). Ambos confirmaram duas ocorrências da mesma exceção na atualização do tempo do Music Player e julgaram seis alegações sem sustentação. Em H04 e H09, A considerou inconclusiva a suposta falha de Play/Pause porque os estados de reprodução e pausa da sondagem estavam sem associação temporal com o clique. B considerou a alegação sem sustentação diante dos efeitos observados na sondagem e da localização da exceção no código.

A [primeira rodada](../apple-m4-qwen3vl4b-20261107/two-agent-review/README.md) obteve 9 concordâncias em 10 (κ = 0,75) para as mesmas alegações com outra apresentação das evidências. Os dois resultados descrevem concordância entre agentes. Uma estimativa de acurácia exigiria uma referência externa. Trabalhos anteriores discutem como o oráculo determina se um resultado observado satisfaz a expectativa e identificam vieses em julgamentos automatizados. [Barr et al. (2015)](https://discovery.ucl.ac.uk/id/eprint/1471263/1/06963470.pdf) · [Zheng et al. (2023)](https://arxiv.org/abs/2306.05685)

As submissões [A](agent-a.json) e [B](agent-b.json) registram a origem dos pareceres e suas justificativas. Recalcule a [concordância](agreement.json) a partir da raiz do repositório.

```sh
node scripts/human-adjudication.cjs compare-agents evaluation-results/human-review-20261110/evidencias.json evaluation-results/dedicated-agent-review-20261111/agent-a.json evaluation-results/dedicated-agent-review-20261111/agent-b.json resultado.json
```
