# Validação complementar da instância atual

Coleta: 20/10/2026. [Manifesto original](diverse-contexts/validation.json), [protocolo](../../evaluation/protocols/diverse-contexts.json) e [inventário de evidências](evidence-manifest.json).

## Exploração inicial

Modelo local de 27B IQ1_M com projetor BF16, llama.cpp b10819 Vulkan, contexto reservado de 65.536 tokens, um slot. Máquina Ryzen 7 7800X3D, Radeon RX 9070 XT 16 GB e RAM 32 GB. Convidado, navegador limpo por execução, perfil descartável local, até 20 ações/180 s na etapa exploratória. Decisões estruturadas usam temperatura zero. O tempo total também inclui inspeção, crítica e reprodução, que ficam fora desse limite de exploração.

Os alvos foram intercalados entre duas repetições. O modelo recebeu inspeção e interface, sem roteiro ou descrição de defeito. O avaliador escolheu os alvos conhecendo suas características; isso não é seleção aleatória nem avaliação humana cega. Os hashes dos serviços e dos alvos permaneceram iguais durante a coleta. A revisão Git do E2P no manifesto indica o ancestral publicado; os hashes de arquivos identificam o código local realmente executado.

| Aplicação | Ações R1/R2 | Estados R1/R2 | Tempo total R1/R2 (s) | Resultado funcional observado |
|---|---|---|---|---|
| Form Validator | 2/2 | 3/3 | 60,4/43,0 | Preenche Username e submete por Enter. E-mail e senhas ficam restritos pela política. |
| Music Player | 3/3 | 2/2 | 41,6/42,1 | Navega faixa, aciona progresso/reprodução; captura exceção. |
| Memory Cards | 9/9 | 3/3 | 109,2/109,3 | Preenche campos, limpa coleção, recarrega e abre/fecha painel; navega sem cartão e captura exceção. Não conclui criação. |
| TodoMVC React | 5/5 | 5/5 | 79,1/77,8 | Cria Buy groceries; a tarefa desaparece em Completed e retorna em Active. Não exercita concluir, editar ou persistir após recarga. |

Oito execuções concluídas, **38 ações** e **26 estados somados por execução**, em 562,45 s somados. Estados de diferentes execuções não são estados globais distintos do sistema. Igualdade das contagens não demonstra igualdade de todas as decisões nem estabilidade estatística; as duas repetições permitem inspeção de repetibilidade nesse perfil.

As métricas internas de objetivos QA e as contagens não são cobertura funcional independente. Para isso, é necessária uma matriz de funções definida antes de coletar, com critérios separados de tentativa, exercício e verificação. O [plano de fortalecimento](../../docs/research/critical-review-20261020.md) especifica esse procedimento.

## Candidatos e conferência das expectativas

Foram retidos cinco registros: quatro diagnósticos correspondentes a dois erros recorrentes e uma hipótese de formulário. Registros repetidos não equivalem a defeitos diferentes. Nos dois alvos com erro, o modelo escolheu a trajetória e a instrumentação gerou o diagnóstico; não se atribui ao LLM sozinho a descoberta da causa.

No Form Validator, uma repetição reteve a expectativa de que Enter em Username deveria validar somente esse campo. A [conferência no navegador](form-expectation.json) mostra um evento submit tanto com Enter quanto com o botão e as mesmas três mensagens. O manipulador de submit valida o formulário inteiro. A expectativa de validação individual não está fundamentada; a análise técnica assistida por IA classifica esse candidato como não sustentado. Não houve segundo avaliador humano independente. Nenhuma precisão ou revocação global é estimada.

## Correção do reprodutor e verificação posterior

Os [registros originais](diverse-contexts/validation.json) mostram o player reproduzido e os cartões bloqueados ao tentar localizar uma recarga como controle DOM. O reprodutor agora executa recarga e espera como operações limitadas do navegador e rejeita tipos desconhecidos.

O [ensaio posterior](replay-after-fix/result.json) repetiu as mesmas quatro trajetórias com diagnóstico, sem nova exploração ou chamada ao modelo. As quatro capturaram novamente as respectivas exceções em sessões limpas. As duas trajetórias dos cartões completaram nove ações cada. Essa verificação tem hash próprio do reprodutor e referência ao manifesto original; não substitui nem reescreve a coleta anterior.

## Contratos e testes

- [152 testes internos aprovados, sem falha ou skip](tests.txt). Incluem uma regressão de recarga/espera e a interpretação de alias com contexto de 8k.
- [Oráculo aprovado](approved-oracle/result.json): preservar 99 apesar de observação com 42; referência passa e alteração falha por asserção.
- [Pares de regressão](regression-pairs/): navegação de faixa, atualização de saldo e persistência. Mesmas asserções na referência e nas alterações; os resultados continuam separando teste do compilador e escolha de jornada pelo modelo.
- Dados da jornada congelada do player estão em `test/fixtures/`; o teste não depende de um diretório privado e não retorna silenciosamente sem exercitar a regressão.
- [Supervisor](supervisor-smoke.json): interface respondeu ao teste de saúde e voltou a responder após encerramento deliberado de seu processo filho. O perfil do modelo e o agendamento foram conferidos quanto à configuração/sintaxe; a operação prolongada na RTX 3060 ainda precisa ser medida nela.

## Reproduzir

```powershell
npm.cmd ci
npx.cmd playwright install chromium
npm.cmd test
npm.cmd run setup:targets
# Preparar as dependências e o build do exemplo React conforme o guia remoto.
npm.cmd run evaluate:protocol -- evaluation/protocols/diverse-contexts.json evaluation-results/nova-coleta
node scripts/verify-approved-oracle.cjs evaluation-results/novo-oraculo
node scripts/verify-form-expectation.cjs evaluation-results/nova-conferencia-formulario.json
node scripts/verify-expense-regressions.cjs
node scripts/verify-music-regression.cjs
```

Para conferir diagnósticos de uma coleta disponível em `prototype-runs/`:

```powershell
node scripts/replay-protocol-diagnostics.cjs caminho/validation.json evaluation-results/nova-reproducao
```

O suplemento publica `runs/<run-id>/exploration.json`, `run-log.json` e as capturas selecionadas da nova coleta. URLs `/artifacts/<run-id>/...` dos registros apontam, no suplemento, para `runs/<run-id>/...`; são endereços originais da interface local, não links HTTP hospedados no GitHub. Pesos, dependências e vídeos volumosos permanecem locais.
