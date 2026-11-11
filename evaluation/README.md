# Avaliar comportamentos, com escopo verificável

O corpus central é uma amostra de conveniência de 21 aplicações didáticas de origem comum. A finalidade de cada alvo vem antes de sua contagem de testes. Os campos de `corpus.json` registram finalidade, família, comportamento de referência e limite observado; são anotações de pesquisa revisáveis, não classificações automáticas de correção.

## Reproduzir o inventário

Na raiz do E2P:

```powershell
npm.cmd run evaluate:corpus
```

Saídas padrão: `../output/evaluation-corpus/corpus-report.md` e `corpus-report.json`. É possível informar `--manifest=<arquivo>`, `--runs-root=<pasta>` e `--output=<pasta>` após `--` no comando npm. O diretório dos alvos é resolvido em relação ao manifesto.

O comando não inicia o alvo nem o modelo. Ele valida que lote e manifesto contêm o mesmo conjunto de aplicações, mede a cópia atual e vincula cada alvo a um log. Falta de alvo ou log permanece explícita e produz código de saída 2. Erros de configuração, divergência de aplicações e JSON inválido produzem código 1. Uma contagem de execução ausente permanece desconhecida; não vira uma aprovação.

Métricas estáticas contam arquivos-fonte e linhas físicas não vazias, incluindo comentários; ignoram dependências, builds, minificados, links simbólicos e mídia. Busca textual de APIs produz indícios com arquivos de origem, não análise sintática completa. Hashes atuais não são evidência da revisão histórica. Asserções extraídas são trechos reais dos scripts e não recebem automaticamente um julgamento semântico.

## O que substitui uma comparação por datas

Uma comparação útil precisa identificar o fator alterado e o que foi mantido: revisão, perfil de modelo, orçamento, requisitos, alvos e condições de execução. Os lotes antigos não isolam esses fatores. Por isso o relatório principal apresenta uma única coleta por famílias funcionais; datas e IDs ficam na proveniência.

As cinco famílias se sobrepõem em capacidades, mas cada alvo recebe uma família principal para agregação. Não comparar taxas pequenas entre famílias como evidência estatística de dificuldade. Não chamar uma aplicação de médio porte só por usar React, ter muitas linhas ou oferecer vários botões. Caracterizar módulos, jornadas, papéis, camadas, estado e integrações antes de justificar essa classificação.

## Protocolo da próxima coleta

1. Definir e congelar requisitos de referência por comportamento, com fonte e justificativa; registrar quais já foram usados para ajustar o E2P. Os alvos atuais já estão expostos ao desenvolvimento.
2. Congelar versões, dados iniciais, configuração do modelo e orçamentos. Controlar relógio e respostas de serviços quando isso fizer parte do requisito.
3. Avaliar separadamente exploração autônoma, compilação de trajetória fornecida e replay de suíte congelada. Uma trajetória criada por script não demonstra autonomia do modelo.
4. Selecionar pares corretos/defeituosos que diferenciem resultados de domínio. Manter referência e mutações fora do contexto fornecido ao agente em avaliação cega.
5. Preservar todas as tentativas, inclusive bloqueios e falhas. Repetições e ordem de execução devem ser definidas antes da coleta, sem ajustar o instrumento após observar um resultado favorável.
6. Julgar fidelidade das asserções com pessoas, buscando segundo avaliador. Não computar precisão ou revocação a partir de hipóteses não adjudicadas.

Para cada comportamento, registrar separadamente:

| Campo | Pergunta respondida |
|---|---|
| Identidade do requisito e fonte | Por que esse efeito é esperado? |
| Jornada alcançada | O agente executou os passos necessários? |
| Critério e asserção | A propriedade e o valor esperado foram preservados? |
| Resultado no original | O teste aceita o comportamento correto? |
| Resultado no mutante | Falha pelo defeito pretendido, e não por seletor ou infraestrutura? |
| Julgamento e justificativa | A conclusão foi revisada e por quem? |
| Custo e interrupções | Quanto custaram também as tentativas malsucedidas? |

Exemplos de profundidade: no seletor de assentos, restaurar identidades e preço após recarga; no buscador de receitas, relacionar consulta, resultado selecionado e detalhe; na lista reordenável, conferir ordem antes/depois; no player, conferir identidade da faixa; em fala, distinguir chamada da API de qualidade audível. Esses são objetivos para definição de critérios e coleta, não resultados já demonstrados.

## Matriz função × execução e concordância entre avaliadores

`reference-functions/diverse-contexts-v1.json` define as funções de referência por alvo. O avaliador mantém o arquivo separado do contexto do modelo. `npm run evaluate:functions` registra tentativas e, quando há um efeito textual configurado, indica a transição correspondente. A verificação fica indisponível nessa leitura estática. O protocolo `protocols/diverse-contexts-v2.json` registra o hash da referência antes da coleta.

Para a coleta de 20/10/2026, a matriz é uma auditoria retroativa (definida depois). Para coletas posteriores a 07/11/2026, é a referência congelada.

`npm run evaluate:agreement` gera modelos de rotulação cegos (sem o veredito do modelo) e calcula concordância observada, kappa de Cohen, matriz de confusão e divergências entre dois avaliadores humanos. Itens rotulados por só um avaliador ficam listados e fora do kappa. Com uma única categoria usada, o kappa é indefinido e não é apresentado como concordância perfeita.
# Comparação de políticas e verificação de funções

O protocolo [selector-comparison-v1](protocols/selector-comparison-v1.json) compara o explorador com modelo local e uma escolha uniforme com semente sobre o mesmo catálogo permitido. Os dois passam pelo mesmo executor, isolamento do relógio, critérios de elegibilidade, limites e compilador. O modelo escolhe os parâmetros das ações. O controle usa texto fictício, um valor numérico compatível com os alvos desta coleta e opções observadas. A política completa de ação e preenchimento é a intervenção.

O avaliador lê o DOM separadamente e exige os efeitos definidos em `scripts/lib/comparison-functions.cjs`. Essas regras ficam fora do contexto do modelo. Cada efeito atingido pode gerar um replay com asserções explícitas, executado em uma nova sessão pelo Playwright. As falhas e as tentativas sem efeito permanecem na tabela. O resultado de replay mede o que foi conferido com critérios fornecidos pelo avaliador. A descoberta autônoma de critérios é um problema adicional.

Para reproduzir, prepare as quatro aplicações locais e o perfil Qwen de 27B descrito no README. O serviço deve escutar em `127.0.0.1`, na porta `18081` por padrão. Use um identificador novo por coleta.

```sh
node scripts/evaluate-selector-comparison.cjs minha-coleta-controlada
node scripts/summarize-selector-comparison.cjs evaluation-results/minha-coleta-controlada
node scripts/verify-card-function.cjs meu-controle-dos-cartoes
```

O primeiro comando grava o plano, o commit e os hashes antes de iniciar. Ele grava cada trajetória à medida que termina. O segundo recalcula os totais e os contrastes por par. O terceiro registra uma jornada dirigida em Memory Cards, compila um teste e usa os mesmos bytes no original e nas cópias com alterações pontuais de criação e restauração.

A matriz histórica de `evaluate:functions` informa tentativas e efeitos textuais configurados. O campo de verificação fica indisponível nessa leitura de logs. A execução com asserções registradas é relatada no resultado do protocolo controlado.

### Protocolo para outro aplicativo estático

Use um identificador próprio e passe `--protocol` para carregar seu arquivo JSON. O protocolo declara os IDs em `targets`, os respectivos diretórios em `targetPaths`, o modelo local, as duas condições `llm` e `random`, a semente, as repetições e os limites. Os caminhos dos diretórios e de `referenceImplementation` são relativos à raiz do E2P ou absolutos. Use um módulo CommonJS local que você revisou, pois o executor carrega seu código.

O módulo de avaliação exporta `reference`, com IDs de função por alvo, `readDomain(page, target)`, com as observações de domínio, e `judgeEffects(target, steps, observations)`, com os efeitos atingidos. Cada efeito aponta para o passo e seus estados e traz as asserções de texto ou contagem que serão reexecutadas. O manifesto grava o hash do módulo carregado. Prefira manter as regras em um módulo autônomo para que esse hash cubra o oráculo inteiro. O código da exploração recebe a observação padrão do E2P. Os dados de `readDomain` seguem para o avaliador.

```sh
node scripts/evaluate-selector-comparison.cjs minha-coleta --protocol=evaluation/protocols/meu-protocolo.json
```

Ative `requirePriorFillForPress` se o protocolo exigir preenchimento prévio no mesmo controle. O orçamento fixo funciona também com valores pré-preenchidos. `baselineNumber` pode sugerir um valor numérico preferido, sujeito aos limites e ao incremento do controle observado. O protocolo original continua disponível para o corpus histórico. Os manifestos arquivados apontam para os commits exatos usados nas respectivas coletas.

O [oráculo de exemplo](../test/fixtures/selector-comparison-oracle.cjs) e o [teste em Chromium](../test/selector-comparison.integration.test.cjs) mostram um aplicativo fora do corpus de 10/11. O teste carrega seu protocolo, explora uma busca pré-preenchida e reexecuta a mesma asserção no original e em uma versão com resultado alterado.

