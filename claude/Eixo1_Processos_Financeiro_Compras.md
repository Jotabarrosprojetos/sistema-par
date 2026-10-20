# Eixo 1 — Processos Financeiro / Compras: Planejamento Financeiro no PAR

> Atualizado em 19/10/2026, a pedido do Roberto (tarefa ClickUp). Substitui a descrição antiga de planilha Excel manual — esse processo não existe mais, hoje roda dentro do Sistema PAR.

## Passo a passo do fluxo hoje

1. **Cadastro do projeto** (manual) — projeto é criado em Gestão de Projetos (ou sincronizado do ClickUp), com setor (prefixo ARQ-/INF-/SAN-), cliente e valor global.

2. **Criação do Planejamento Financeiro no PAR** (manual) — na tela Planejamento Financeiro, alguém preenche contrato (valor, impostos, taxa adm.), equipe interna (horas/custo), terceirizados, despesas previstas e medições (marcos de faturamento).

3. **Vínculo com o centro de custo do OPP** (manual — ponto mais sensível do processo) — no mesmo cadastro, é preciso preencher o "Nome do Centro de Custo" e/ou o número da O.S. OPP. Esse texto precisa bater com o centro de custo usado de verdade no OPP/VHSys. É esse vínculo que permite ao PAR casar automaticamente, depois, as despesas e receitas daquele projeto. Se não for preenchido (ou não bater), o projeto fica "sem vínculo" e nada do que vem a seguir funciona pra ele — é o caso de projetos como os de Mulungu, que nem têm planejamento financeiro feito no PAR.

4. **Validação das regras PAR** (automático, em tempo real) — margem ≥ 23%, terceirizados ≤ 25% do contrato, custo de produção ≤ 30%: o sistema calcula e mostra o painel de validação a cada alteração no formulário.

5. **Envio para aprovação** (ação manual) **+ notificação no ClickUp** (automático) — ao mudar o status pra "Em Aprovação", o backend posta sozinho um comentário na tarefa do ClickUp do projeto, marcando o Diretor e o P.O. do setor responsável.

6. **Decisão (aprovar/rejeitar)** (manual, decisão humana) — Admin/Diretoria/PO decide na tela de Aprovação de Baseline, com justificativa. A decisão também dispara uma notificação automática no ClickUp.

7. **Baseline travado** (automático) — no momento da aprovação, o sistema grava sozinho um snapshot completo do planejamento (o "baseline"); versões anteriores ficam guardadas no histórico.

8. **Lançamento das contas no OPP/VHSys** (manual, e fora do PAR) — feito pela Roberta: criação da O.S. e lançamento das receitas/despesas direto no ERP. O PAR não lança nada no OPP, só lê o que já está lá.

9. **Leitura e casamento das despesas/receitas do OPP** (automático, em tempo real) — toda vez que a tela "Despesas OPP" ou "Plan vs Real" é aberta, o backend consulta a API do OPP e casa cada lançamento com o projeto certo, usando o texto de centro de custo vinculado no passo 3. Não é um lançamento manual no PAR — é consulta ao vivo.

10. **Tratamento de despesas/receitas rateadas por centro de custo** (automático, desde 14/10/2026) — quando um lançamento no OPP é dividido entre vários projetos ao mesmo tempo (comissões de sócios/diretores, aluguel de veículo e passagens usados em mais de uma visita técnica, por exemplo), o PAR agora lê a divisão certa que vem da própria API do OPP e calcula a fatia de cada projeto. Antes dessa correção, essas linhas rateadas sumiam do extrato de todos os projetos envolvidos — foi o bug confirmado e corrigido nessa data.

11. **Medições e faturamento** (parte manual, parte automática) — criar a medição e avançar o status físico (Prevista → Em Andamento → Concluída) é manual. Já o status financeiro pode avançar sozinho pra "Recebido" quando a reconciliação com o OPP (contas a receber) confirma que aquela O.S. foi liquidada.

12. **Gestão de terceirizados** (manual) — cadastro do fornecedor e da Ordem de Compra, e avanço manual pela esteira de status (Backlog → OC → Em Andamento → Contas a Pagar → Concluído). O sistema só enriquece automaticamente o registro com dados do OPP contas-a-pagar pelo número da OC.

13. **Alertas** (automático) — depois de cada sincronização ou alteração, o motor de regras roda sozinho e gera/expira alertas (prazo de planejamento, margem abaixo do mínimo, teto de terceirizados, medição atrasada etc.), sem ação humana.

14. **Auditoria** (automático) — qualquer criação, edição ou aprovação em Projetos, Planejamentos, Medições ou Terceirizados é registrada sozinha no log de auditoria (Postgres), com o antes/depois de cada alteração.

## Resumo — o que já é automático

- Validação das regras PAR em tempo real
- Notificação no ClickUp ao enviar, aprovar ou rejeitar um planejamento
- Snapshot do baseline no momento da aprovação
- Leitura e casamento das despesas/receitas do OPP com o centro de custo vinculado (consulta ao vivo, não é importação manual)
- Separação correta de valores rateados entre projetos (desde a correção de 14/10/2026)
- Atualização do status financeiro da medição pra "Recebido" quando o OPP confirma o pagamento
- Enriquecimento de terceirizados com dados do OPP contas-a-pagar pela OC
- Geração de alertas
- Log de auditoria

## Resumo — o que ainda depende de lançamento/ação manual

- Cadastro do projeto e preenchimento do planejamento (contrato, equipe, terceirizados, despesas previstas, medições previstas)
- Preenchimento do vínculo de centro de custo (o texto que liga o projeto do PAR ao centro de custo no OPP) — esse é o campo mais crítico: sem ele certo, nada é casado automaticamente depois
- Decisão de aprovar ou rejeitar o planejamento
- Lançamento das contas em si no OPP/VHSys (feito pela Roberta, fora do PAR)
- Criação da medição e avanço do status físico
- Cadastro de terceirizados e avanço manual pela esteira de status

## Sobre a documentação antiga

A descrição de planilha Excel manual é de um processo anterior ao PAR e está desatualizada. Hoje o planejamento financeiro, a validação das regras PAR, o vínculo com o OPP e a geração de alertas rodam dentro do sistema. A única parte do fluxo financeiro que continua acontecendo fora do PAR é o lançamento das contas no próprio OPP/VHSys — que é o ERP da empresa, não o PAR.
