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
