# Revisão da instância atual do E2P - 18 de outubro de 2026

O artigo foi recentrado na exploração inicial de aplicações desconhecidas e na observação de possíveis falhas. A seção 2.4 apresenta esse posicionamento; a descrição das aplicações parte de suas funções, e a discussão de hardware relaciona memória, contexto e tempo de inferência. O Dopa é identificado como projeto do autor do TCC. JEV foi incluído como proposta de trabalho futuro, com fonte oficial.

A implementação passou a preservar valores aprovados no critério, associar campo e estado à ação e distinguir justificativas afirmativas e negativas do crítico. O perfil descartável respeita min, max e step do HTML e observa números fictícios sem expô-los no perfil conservador.

## Nova coleta de exploração

Foram realizadas duas explorações por aplicação, sem jornada fornecida ao modelo e com os serviços preservados por hashes durante a coleta. A tabela descreve ações concluídas e estados registrados, não percentuais de cobertura funcional.

| Aplicação | Repetição | Ações | Estados | Run ID |
|---|---:|---:|---:|---|
| expense-tracker | 1 | 5 | 4 | expense-tracker-2026-10-18T14-49-09-324Z-6a68b3 |
| movie-seat-booking | 1 | 17 | 18 | movie-seat-booking-2026-10-18T14-50-21-653Z-b5fd04 |
| modal-menu-slider | 1 | 8 | 4 | modal-menu-slider-2026-10-18T14-55-23-909Z-c59808 |
| expense-tracker | 2 | 5 | 4 | expense-tracker-2026-10-18T14-57-15-892Z-4505a1 |
| movie-seat-booking | 2 | 17 | 18 | movie-seat-booking-2026-10-18T14-58-31-767Z-6e1657 |
| modal-menu-slider | 2 | 8 | 4 | modal-menu-slider-2026-10-18T15-03-37-184Z-16643d |

Total: 60 ações e 52 estados somados entre seis explorações. A repetição da mesma observação em execuções distintas não representa uma nova funcionalidade.

No Expense Tracker, as duas trajetórias criaram Lunch com valor 15,00 e reencontraram o lançamento e o saldo após recarga. O seletor de assentos concentrou ações em seleção de lugares; o menu e o diálogo permitiram observar navegação e interação com formulário. Esses resultados descrevem a exploração inicial, sem atribuir às contagens uma validação integral de cada produto.

## Verificações da implementação

- Suíte completa: 151 testes aprovados, sem falhas ou testes ignorados.
- Quatro propriedades aceitaram a referência e rejeitaram a cópia alterada: faixa anterior, saldo, persistência e valor esperado explícito.
- As exceções do player e dos cartões foram reproduzidas duas vezes por aplicação em contextos limpos.
- A reaplicação do contrato atual rejeitou as duas alegações dos painéis que repetiam o mesmo efeito como esperado e observado. As hipóteses e trajetórias originais permanecem preservadas em arquivo próprio.
- O ensaio de exploração está em `current-validation-20261018/exploration/validation.json`; a síntese estruturada está em `current-validation-20261018/summary.json`.

## Artigo e fontes

A fonte ativa está em `../latex/final-prototype/main.tex`, incluindo `current-exploration.tex`. O PDF atualizado está em `pdf/E2P_final_prototype_revised.pdf`. A versão anterior foi preservada na pasta de arquivo da fonte.

JEV foi pesquisado na documentação oficial da TypeSafe: https://docs.typesafe.ai/introduction. O texto propõe investigar decisões tipadas para seleção de ações, sustentação de hipóteses e revisão de casos incertos. O serviço não foi utilizado nesta coleta.
