# Artigo e versões

| Versão | PDF | Fontes | Situação |
|---|---|---|---|
| Anterior, preservada em 20/10/2026 | [18/10/2026](versions/2026-10-18/article.pdf) | [main.tex](versions/2026-10-18/main.tex) | Cópia integral do artigo que estava em uso antes desta revisão. Não foi sobrescrito. |
| Incrementada, 20/10/2026 | [Artigo atual](current/article.pdf) | [main.tex](current/main.tex) | Novos contextos de exploração, análise funcional, papel da instrumentação, reprodução e transferência de configuração. |
| Anteriormente publicada no GitHub | [Baseline remota](versions/remote-baseline/article.pdf) | [Fontes históricas](versions/remote-baseline/main.tex) | Preservada para continuidade do repositório. Não é o artigo de 18/10. |

[versions.json](versions.json) registra hashes dos PDFs e fontes. O PDF anterior tem SHA-256 `c94145ddacaf7232c8169285b4ab7c29fc6e317643d647e7f44adfaad93b5d64`.

## Mudanças da versão incrementada

- Oito explorações adicionais em quatro aplicações, incluindo TodoMVC React, com fontes fixos durante a coleta e duas repetições intercaladas.
- Tabela com ações, estados e funções efetivamente alcançadas; criação, conclusão, edição e restauração são discutidas como operações distintas.
- Caso de formulário que diferencia observação repetível e expectativa válida.
- Distinção entre ações escolhidas pelo modelo e exceções capturadas pela instrumentação.
- Conferência das quatro trajetórias com diagnóstico após corrigir recarga/espera no reprodutor, sem alterar os registros originais.
- Suíte atual com 152 testes e verificações de navegador; relação dos resultados com as questões de pesquisa e com a literatura.
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
