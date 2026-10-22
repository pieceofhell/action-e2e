# Artigo e versões

| Versão | PDF | Fontes | Situação |
|---|---|---|---|
| Anterior, preservada em 20/10/2026 | [18/10/2026](versions/2026-10-18/article.pdf) | [main.tex](versions/2026-10-18/main.tex) | Cópia integral do artigo que estava em uso antes desta revisão. Não foi sobrescrito. |
| Incrementada, 20/10/2026, preservada | [20/10/2026](versions/2026-10-20/article.pdf) | [main.tex](versions/2026-10-20/main.tex) | Novos contextos de exploração, análise funcional, papel da instrumentação e reprodução. Cópia integral anterior à revisão editorial. |
| Revisão editorial, 21/10/2026, preservada | [21/10/2026](versions/2026-10-21-editorial/article.pdf) | [main.tex](versions/2026-10-21-editorial/main.tex) | Revisão editorial anterior ao ajuste da declaração de IA. |
| Declaração de IA ajustada, 21/10/2026 | [Artigo atual](current/article.pdf) | [main.tex](current/main.tex) | Somente o parágrafo da declaração foi substituído pelo texto fornecido pelo autor. |
| Anteriormente publicada no GitHub | [Baseline remota](versions/remote-baseline/article.pdf) | [Fontes históricas](versions/remote-baseline/main.tex) | Preservada para continuidade do repositório. Não é o artigo de 18/10. |

[versions.json](versions.json) registra hashes dos PDFs e fontes. O PDF anterior tem SHA-256 `c94145ddacaf7232c8169285b4ab7c29fc6e317643d647e7f44adfaad93b5d64`.

## Revisão editorial de 21/10/2026

Esta revisão aplica os itens exclusivamente textuais do parecer `PARECER_E2P_E_PLANO_DE_ACAO.md`, sobretudo P-3 e P-4. Como o parecer avaliou o PDF de 06/10, as sugestões foram confrontadas com o artigo de 20/10, preservando os resultados e avanços já incorporados.

- Título centrado na exploração inicial orientada por ações com um modelo local, compatível com o objeto avaliado.
- Contribuição explícita ao fim da introdução e no início da conclusão, sustentada pelas trajetórias e verificações existentes.
- Resumos e respostas às questões de pesquisa sintetizados; totais da avaliação concentrados nos resultados, sem repetição na conclusão.
- Ressalvas recorrentes reunidas nas ameaças à validade, mantendo junto aos casos as distinções que determinam sua interpretação.
- Termos de implementação definidos ou substituídos por equivalentes em português; identificadores de software preservados.
- Ajuste do reprodutor identificado como verificação **após a coleta**, separado das decisões do modelo registradas nas explorações.
- Discussão da quantização como parte da configuração avaliada e proposta de comparação controlada em trabalhos futuros; JEV permanece nessa seção.
- Declaração de IA distingue o apoio da ferramenta da responsabilidade intelectual do autor, sem afirmar aprovação do orientador ou avaliação humana independente já realizadas.

Não foram executados novos experimentos nem alterados software, protocolos ou evidências empíricas. Comparações com outras estratégias, matriz prévia de funções, revisão independente e ampliação de alvos permanecem propostas, sem resultados atribuídos a elas. As quantidades dos testes internos correspondem à avaliação descrita, e não ao desenvolvimento posterior do software.

A versão anterior e seus cinco arquivos-fonte foram copiados sem alterações para `versions/2026-10-20/`; o PDF preservado tem SHA-256 `600e89ea0fd898efb1bb7e47093641aa5041343e5065985bf796042581c34029`. A nova versão mantém **16 páginas** no formato SBC, com a mesma fonte e as mesmas margens. A declaração e o texto final continuam sujeitos à revisão acadêmica do autor e do orientador.

## Mudanças da versão incrementada de 20/10/2026

- Oito explorações adicionais em quatro aplicações, incluindo TodoMVC React, com fontes fixos durante a coleta e duas repetições intercaladas.
- Tabela com ações, estados e funções efetivamente alcançadas; criação, conclusão, edição e restauração são discutidas como operações distintas.
- Caso de formulário que diferencia observação repetível e expectativa válida.
- Distinção entre ações escolhidas pelo modelo e exceções capturadas pela instrumentação.
- Conferência das quatro trajetórias com diagnóstico após corrigir recarga/espera no reprodutor, sem alterar os registros originais.
- Suíte registrada na avaliação com 152 testes e verificações de navegador; relação dos resultados com as questões de pesquisa e com a literatura.
- Discussão da transferência para recursos menores, sem apresentar a RTX 3060 como máquina já avaliada.
- Material complementar e roteiro de experimentos futuros no repositório. JEV permanece em trabalhos futuros.

O texto foi mantido em **16 páginas**, no formato SBC. Trechos repetitivos foram reduzidos para acomodar os novos resultados sem alterar fonte ou margens do modelo. A declaração de uso de IA foi preservada. A revisão e aprovação acadêmica permanecem com autor e orientador.

## Compilar

Instale [Tectonic](https://tectonic-typesetting.github.io/) e execute a partir da raiz do repositório:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\paper\build.ps1
```

Pode configurar `E2P_TECTONIC` com o caminho do executável. O script atualiza somente `current/article.pdf`; não escreve nas versões preservadas. Também é possível abrir `current/main.tex` em um editor LaTeX, mantendo os arquivos SBC, bibliografia e tabela no mesmo diretório.

Veja o [relatório experimental](../evaluation-results/current-20261020/README.md) e a [análise crítica com próximos experimentos](../docs/research/critical-review-20261020.md).
