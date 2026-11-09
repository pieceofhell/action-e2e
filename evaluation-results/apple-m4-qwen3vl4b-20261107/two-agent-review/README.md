# Revisão de alegações por dois agentes

Ensaio separado sobre as oito explorações arquivadas da coleta no M4. As dez alegações incluem candidatas que o E2P reteve e descartou. O [pacote congelado](packet.json) reúne passos, estados, diagnósticos e verificações dirigidas de navegador, com trechos de código dos alvos. Os rótulos originais e as razões de retenção ou descarte não foram fornecidos. A [chave de correspondência](mapping.json) foi mantida separada. Alguns registros antigos de descarte guardavam apenas o título; a revisão foi feita com a trajetória disponível e não recuperou expectativas que nunca foram registradas.

Os dois agentes do Codex foram iniciados sem histórico da conversa, receberam o mesmo arquivo e rubricaram os casos sem acesso ao resultado um do outro. Foram preservadas as saídas do [agente A](agent-a.json) e do [agente B](agent-b.json). A versão exata do modelo dos agentes não foi registrada; a separação das avaliações não garante independência de erros. Os dados de reprodução, quando presentes, são parte da evidência e podem sugerir que um candidato avançou na análise do E2P.

O [relatório de concordância](agreement.json) contém **9/10 julgamentos iguais e κ de Cohen de 0,75**. Duas ocorrências da mesma exceção de atualização de tempo no Music Player receberam o rótulo de defeito em ambos os julgamentos; sete alegações foram consideradas não sustentadas por ambos. No caso 002, ambos observaram a mudança de `ukulele` para `summer`; um agente considerou isso suficiente para rejeitar a alegação e o outro apontou que a ordem das faixas não constava no trecho de código. A divergência permanece em aberto.

Os dados medem concordância entre agentes nesse conjunto de alegações, não acurácia, quantidade de defeitos únicos nem concordância humana. Para recalcular sem chamar um modelo, a partir da raiz do E2P:

```sh
node scripts/review-with-agents.cjs compare evaluation-results/apple-m4-qwen3vl4b-20261107/two-agent-review/packet.json evaluation-results/apple-m4-qwen3vl4b-20261107/two-agent-review/agent-a.json evaluation-results/apple-m4-qwen3vl4b-20261107/two-agent-review/agent-b.json
```
