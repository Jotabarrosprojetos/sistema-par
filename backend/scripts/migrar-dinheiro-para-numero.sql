-- Fase 2 (24/11/2026): colunas de dinheiro de TEXT para NUMERIC(18,2).
-- Seguro: roda em uma transacao (qualquer erro desfaz tudo), e idempotente (so mexe em coluna ainda TEXT),
-- guarda a soma de cada coluna ANTES e confere a soma DEPOIS; se divergir, desfaz.
-- Aceita so os formatos medidos no banco real: inteiro, "1234.5" (EN, ate 2 casas) e "1.234,56" (BR).
-- Qualquer outro texto faz a migracao falhar (e desfazer), em vez de gravar um valor errado.
-- A lista abaixo deve ser igual a de src/utils/colunasDinheiro.js (um teste confere).
BEGIN;

CREATE OR REPLACE FUNCTION par_para_numero(t text) RETURNS numeric LANGUAGE plpgsql IMMUTABLE AS $f$
BEGIN
  IF t IS NULL OR btrim(t) = '' THEN RETURN NULL; END IF;
  t := btrim(t);
  IF t ~ '^-?[0-9]+$' THEN RETURN t::numeric; END IF;
  IF t ~ '^-?[0-9]+[.][0-9]{1,2}$' THEN RETURN t::numeric; END IF;
  IF t ~ '^-?[0-9]{1,3}([.][0-9]{3})*,[0-9]{1,2}$' OR t ~ '^-?[0-9]+,[0-9]{1,2}$' THEN
    RETURN replace(replace(t, '.', ''), ',', '.')::numeric;
  END IF;
  RAISE EXCEPTION 'valor de dinheiro ilegivel: %', t;
END
$f$;

CREATE TABLE IF NOT EXISTS _migracao_dinheiro (
  tabela text, coluna text, linhas bigint, nao_vazios bigint, soma_antes numeric, soma_depois numeric,
  feito_em timestamptz DEFAULT now()
);

DO $m$
DECLARE
  par text[];
  t text; c text;
  pares text[][] := ARRAY[
    ['Custos_OPP','Valor_Lancado'],
    ['Despesas_Planejamento','Valor'],
    ['Equipe_Planejamento','Total'],
    ['Financeiro_OPP','Valor'],
    ['Log_Horas','Custo_Calculado'],
    ['Medicoes','Valor'],
    ['OrdensCompra_OPP','Valor_Liquidado'],
    ['OrdensCompra_OPP','Valor_Total'],
    ['OrdensServico_OPP','Valor_Total'],
    ['Planejamentos','Valor_Contrato'],
    ['Projetos_Contratos','Teto_Terc_Valor'],
    ['Projetos_Contratos','Valor_Global'],
    ['Terceirizados','Valor_Contratado'],
    ['Terceirizados','Valor_Estimado'],
    ['Terceirizados','Valor_Pago']
  ];
  i int; tipo text; antes numeric; depois numeric; n bigint; nv bigint;
BEGIN
  FOR i IN 1 .. array_length(pares, 1) LOOP
    t := pares[i][1]; c := pares[i][2];
    SELECT data_type INTO tipo FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = c;
    IF tipo IS NULL OR tipo <> 'text' THEN CONTINUE; END IF;  -- tabela/coluna ausente ou ja convertida
    EXECUTE format('SELECT count(*), count(NULLIF(btrim(%I), '''')), coalesce(sum(par_para_numero(%I)), 0) FROM %I', c, c, t)
      INTO n, nv, antes;
    EXECUTE format('ALTER TABLE %I ALTER COLUMN %I TYPE NUMERIC(18,2) USING par_para_numero(%I)', t, c, c);
    EXECUTE format('SELECT coalesce(sum(%I), 0) FROM %I', c, t) INTO depois;
    IF depois <> antes THEN
      RAISE EXCEPTION 'soma diverge em %.%: antes % depois %', t, c, antes, depois;
    END IF;
    INSERT INTO _migracao_dinheiro (tabela, coluna, linhas, nao_vazios, soma_antes, soma_depois)
      VALUES (t, c, n, nv, antes, depois);
  END LOOP;
END
$m$;

COMMIT;

-- Conferencia: uma linha por coluna convertida, com a soma antes e depois (iguais).
SELECT tabela, coluna, linhas, nao_vazios, soma_antes, soma_depois, (soma_antes = soma_depois) AS confere
FROM _migracao_dinheiro ORDER BY tabela, coluna;
