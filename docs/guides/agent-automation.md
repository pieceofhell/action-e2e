# Executar o E2P sem interface gráfica

Um agente com acesso ao terminal pode iniciar o E2P sobre um diretório local e obter o resultado como JSON. O comando reutiliza os serviços da interface e executa inspeção, exploração, diagnóstico e reprodução, revisão por dois agentes, planejamento, aprovação por regra explícita, compilação, execução e interpretação. Não é preciso abrir a interface nem aprovar cada fluxo à mão. Uma decisão inválida, a falta de evidência ou um erro de infraestrutura ainda pode interromper a execução e fica registrado.

## Uma execução completa

Instale as dependências e o Chromium conforme o [README](../../README.md). Aponte para um modelo já atendendo no endereço local e use seu alias exato:

```powershell
$env:E2P_AI_MODEL = 'alias-do-modelo'
$env:E2P_AI_ENDPOINT = 'http://127.0.0.1:8081/v1'
node scripts/run-agent-pipeline.cjs ../candidates/vanillawebprojects/music-player
```

O mesmo comando está disponível como `npm run agent:run -- <diretório>`. A chamada direta a `node` mantém a saída padrão exclusivamente em JSON; o progresso sai em stderr. O código de saída é `0` se a suíte passar, `2` se a execução terminar com resultado diferente de aprovado e `1` se o fluxo parar. `runDirectory` aponta para `run-log.json`, planejamento e `results/agent-review/`. O registro referencia a suíte gerada e a execução Playwright.

O padrão serve arquivos estáticos e usa duas avaliações separadas com o modelo configurado. É possível usar dois modelos distintos e configurar o alvo com `--config <arquivo.json>`. Exemplo para uma aplicação já atendida em loopback:

```json
{
  "model": { "provider": "llama-cpp", "endpoint": "http://127.0.0.1:8081/v1", "model": "modelo-explorador" },
  "reviewers": [
    { "model": "modelo-a" },
    { "provider": "ollama", "endpoint": "http://127.0.0.1:11434", "model": "modelo-b" }
  ],
  "runtime": { "mode": "external", "baseUrl": "http://127.0.0.1:7002" }
}
```

`runtime.mode: "command"` exige `allowCommand: true`, `startCommand` e uma URL de loopback. Para instalar antes de explorar, informe também `runInstallBeforeExecution: true` e `installCommand`. Esses comandos são fornecidos pelo executor; não são extraídos do texto produzido pelo modelo. Chaves usam `apiKeyEnv` ou `E2P_AI_API_KEY`. Revisores usam loopback por padrão; `allowRemoteReview: true` permite enviar evidências do alvo ao provedor remoto configurado. O `auth` aceita a configuração existente de [sessão somente leitura](../architecture/features/auth.md); nessa sessão, a investigação de defeitos e sua dupla revisão continuam desabilitadas pela política de evidências.

## Revisar registros existentes

```sh
node scripts/review-with-agents.cjs prepare <diretório-de-exploração-ou-coleção> <nova-saída>
node scripts/review-with-agents.cjs judge <nova-saída>/packet.json <nova-saída> [config.json]
node scripts/review-with-agents.cjs compare <nova-saída>/packet.json <nova-saída>/agent-a.json <nova-saída>/agent-b.json
```

O pacote inclui alegações retidas e descartadas, referências de ação e estado e dados de reprodução disponíveis. A tabela de identificação original fica em `mapping.json`, separada do pacote. Cada julgamento recebe apenas seu caso e a trajetória; não recebe os rótulos do outro revisor, o veredito original ou o motivo do descarte. A presença de dados de reprodução pode sugerir quais itens avançaram no fluxo. O mesmo pacote pode ser entregue a agentes externos; para agregar, as respostas precisam indicar `kind: "ai-agent"`, revisor, hash do pacote e uma justificativa por caso.

`agreement.json` mantém divergências em aberto e declara `humanValidation: false`. A concordância mede consistência dos julgamentos sobre a evidência compartilhada; os agentes podem repetir o mesmo erro, especialmente com o mesmo modelo. A ausência de candidatos é registrada como não aplicável. Nenhum julgamento é gravado como revisão humana no histórico.
