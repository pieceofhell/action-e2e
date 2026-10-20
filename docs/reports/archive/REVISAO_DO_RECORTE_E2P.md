# Revisão do recorte e da argumentação do E2P

Revisão concluída em 7 de outubro de 2026. O objetivo foi substituir a narrativa de sucessivas execuções por uma avaliação que explique seleção, estrutura dos alvos, exigências de teste e alcance das conclusões.

## O que mudou no artigo

- **Título e objetivo:** avaliação de uma pipeline local orientada por ações. O estudo não se apresenta como comparação controlada entre modelos.
- **Apresentação da amostra:** as 21 aplicações aparecem antes dos resultados, organizadas por finalidade. O inventário explica estrutura, funções, estado e dependências.
- **Porte:** o recorte é de aplicações didáticas compactas de navegador. A medição encontrou um HTML por aplicação, dois a quatro arquivos-fonte e 118 a 372 linhas não vazias, incluindo comentários. Esses números caracterizam a cópia atual; não definem porte por si só. Não há reivindicação de validação em sistemas de médio porte.
- **Tabela por datas removida:** a tabela principal usa um único lote de referência, agrupado em cinco famílias. Datas e IDs permanecem como proveniência, sem sugerir experimento controlado.
- **Casos antigos:** o catálogo Dopa aparece somente como contexto do piloto, além de sua referência bibliográfica. Typing Game aparece no inventário; os resultados tratam também receitas, assentos, cartões, listas, mídia e outros comportamentos.
- **Profundidade:** uma tabela confronta finalidade, comportamento esperado e asserção real. Diferencia fidelidade ao critério e abrangência dos critérios escolhidos.
- **Correção factual:** o teste de Movie Seat Booking cujo título promete persistência não recarrega e verifica apenas `body` visível. O texto agora corrige a interpretação excessiva do resumo histórico.
- **Ensaios posteriores:** métodos e resultados apresentam as regressões conhecidas com sua origem de trajetória, antes da conclusão. A execução autônoma, a trajetória programática e o replay de suíte congelada não são somados como uma única medida de eficácia.

O artigo compilado tem **16 páginas**. A fonte ativa está em `../latex/final-prototype/main.tex`; o PDF atualizado é `pdf/E2P_final_prototype_revised.pdf`. As versões anteriores foram preservadas.

## O que mudou no projeto

Foi adicionado `npm run evaluate:corpus`, que gera inventário e relatório por família a partir de um manifesto revisável e dos logs reais. O JSON inclui hashes dos arquivos medidos, IDs de execução e asserções extraídas dos 28 scripts. O comando valida a correspondência entre corpus e lote, preserva casos ausentes e distingue contagens desconhecidas de execuções sem testes.

Arquivos principais em `../action-e2e/`:

- `evaluation/corpus.json`: seleção, famílias, finalidade, comportamentos e limitações por aplicação.
- `evaluation/README.md`: procedimento e critérios da próxima coleta.
- `src/services/corpus-evaluation.js`: medição e agregação.
- `scripts/characterize-corpus.cjs`: geração dos relatórios.
- `test/corpus-evaluation.test.cjs`: testes de integridade do corpus, denominadores e inventário.

O resultado legível está em `evaluation-corpus/corpus-report.md`, com versão estruturada em `corpus-report.json`.

## Verificação realizada

- Suíte completa: **134 testes aprovados**, zero falhas e zero ignorados.
- Corpus e lote: 21 aplicações e 21 logs, sem omissões.
- Totais derivados: 18 chegaram à execução; 28/28 testes; seis hipóteses; 105 ações; 92 estados.
- Inventário: cinco alvos com indícios de `fetch`, quatro com armazenamento no navegador e dois com APIs de fala, com arquivos de origem disponíveis.
- PDF recompilado, texto e referências conferidos, páginas renderizadas para revisão visual, sem referências indefinidas ou caixas excedendo a largura registradas pelo compilador.

Essas alterações melhoram a metodologia, a precisão do relato e a instrumentação da avaliação. Não constituem uma nova coleta com o modelo, nem resolvem por si só os limites conhecidos da geração de asserções e da exploração autônoma. Os resultados históricos foram preservados e reanalisados; novas medidas estáticas são identificadas como atuais.
