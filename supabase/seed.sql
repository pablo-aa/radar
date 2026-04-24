-- Seed data for week 17, 2026. Mirrors .notes/design/radar/app/mock-data.jsx.
-- All ids, deadlines, funding figures, and source_urls are fictive but plausible.
-- One scout_run, twelve opportunities across the four categories,
-- nine scout_discarded entries representing the transparency ledger.

-- 1. Scout run for cycle 2026-W17.
with sr as (
  insert into public.scout_runs (
    started_at, finished_at, cycle_label,
    sources_count, pages_fetched, found_count, updated_count, discarded_count,
    status
  ) values (
    '2026-04-22 13:20:00+00',
    '2026-04-22 14:08:30+00',
    '2026-W17',
    18, 214, 12, 4, 86,
    'done'
  )
  returning id
)
insert into public.opportunities (
  source_url, title, org, loc, category, deadline, funding_brl,
  commitment, badge, status, fit, id_display, found_at, deep_data, scout_run_id
)
select source_url, title, org, loc, category, deadline, funding_brl,
       commitment, badge, status, fit, id_display, found_at, deep_data, sr.id
from sr,
(values
  -- DATED ONE-SHOT
  (
    'https://www.mercatus.org/emergent-ventures',
    'Emergent Ventures',
    'Mercatus Center, George Mason University',
    'US',
    'dated_one_shot',
    'Rolling, 2 to 3 week decision',
    'R$ 5k to R$ 260k, no equity',
    'Self-directed, no cohort, no reporting theatre',
    'bolsas, inscricoes abertas',
    'inscricoes abertas',
    84::smallint,
    '#0142, 2026-04-21',
    '2026-04-21 17:08:00+00'::timestamptz,
    jsonb_build_object(
      'why', 'Your ICPC bronze, Cosseno post-exit trajectory, and T5-transformer monograph fit the Tyler Cowen unusual and unorthodox STEM talent thesis directly. Apply with the monograph as the centrepiece. Lead with the exit proof, it resolves the usual has this person ever shipped question in one sentence.',
      'partners', jsonb_build_array('Mercatus Center', 'GMU Department of Economics'),
      'winnerPattern', '7 of the last 24 BR winners were OSS maintainers with under 2k GitHub followers at time of grant. Size of network not correlated with decision.',
      'redFlags', jsonb_build_array(
        'Application writes like a VC pitch is reliably rejected. Keep it a monograph-style narrative.',
        'Do not mention revenue figures from Cosseno; the program is topic-agnostic and numbers read as misdirection.'
      ),
      'fitBreakdown', jsonb_build_array(
        jsonb_build_object('k','profile match','v','0.88, exit proof + monograph'),
        jsonb_build_object('k','thesis alignment','v','0.91, unusual talent'),
        jsonb_build_object('k','historical winners','v','0.74, 3 similar BR profiles'),
        jsonb_build_object('k','timing feasibility','v','0.86, rolling window')
      )
    )
  ),
  (
    'https://www.studyinjapan.go.jp/en/planning/about-mext/',
    'MEXT Research Scholarship',
    'Ministry of Education, Japan',
    'JP',
    'dated_one_shot',
    'Applications close 2026-05-31',
    'Y 144k / month, tuition waived, R$ 5.4k equivalent',
    '18 to 24 months, residency in JP',
    'fellowship, deadline fixed',
    'accepting',
    71::smallint,
    '#0119, 2026-04-18',
    '2026-04-18 12:41:00+00'::timestamptz,
    jsonb_build_object(
      'why', 'Voce ja passou pelo METI Japan duas vezes, portanto a rede consular e conhecida. MEXT valoriza candidatos com ponto de contato previo no pais. O programa acomoda bem uma pesquisa sobre tooling LLM em portugues, linha ainda rara no lado japones.',
      'partners', jsonb_build_array('Embassy of Japan, Brasilia', 'JASSO'),
      'winnerPattern', 'BR candidates with prior JP exposure have a 3.2x higher admission rate vs first-time applicants. Letters from Japanese PIs triple effective fit.',
      'redFlags', jsonb_build_array('Do not apply without an identified host professor in JP. Cold applications are filtered at embassy stage.')
    )
  ),
  (
    'https://fapesp.br/pipe',
    'FAPESP, Pesquisa Inovativa, PIPE Fase 1',
    'Fundacao de Amparo a Pesquisa, SP',
    'BR',
    'dated_one_shot',
    'Submissao ate 2026-06-15',
    'R$ 250k, 9 meses, sem equity',
    'Empresa registrada em SP, PI dedicado',
    'pesquisa, edital aberto',
    'edital aberto',
    79::smallint,
    '#0128, 2026-04-19',
    '2026-04-19 19:02:00+00'::timestamptz,
    jsonb_build_object(
      'why', 'Cosseno esta registrada em SP, o PI pode ser voce. A linha de tooling para LLM em portugues tem tres revisores conhecidos no painel PIPE deste ciclo, todos com historico favoravel a projetos de infraestrutura. Seu monograph serve de anexo tecnico.',
      'partners', jsonb_build_array('FAPESP', 'SEBRAE SP como parceiro secundario'),
      'winnerPattern', 'Projetos com prototipo ja funcional e commit history publico tem aprovacao 2.1x maior. O tooling em BR-PT atual tem 4 grupos financiados, sem overlap com sua proposta.',
      'redFlags', jsonb_build_array('Orcamento acima de R$ 230k exige justificativa line-by-line. Cortar antes de submeter poupa um ciclo de pareceres.')
    )
  ),
  (
    'https://www.chevening.org/scholarship/brazil/',
    'Chevening Scholarship, 2027 cohort',
    'UK Foreign, Commonwealth & Development Office',
    'UK',
    'dated_one_shot',
    'Applications open 2026-08-05',
    'Full tuition, GBP 1,917 / mo stipend, R$ 12.4k equivalent',
    '12 months, 1 year UK residency',
    'fellowship, apply window',
    'upcoming',
    58::smallint,
    '#0131, 2026-04-20',
    '2026-04-20 14:30:00+00'::timestamptz,
    jsonb_build_object(
      'why', 'Fit moderado, nao alto. Chevening premia lideranca demonstravel, e seu historico e mais tecnico do que institucional. Vale apenas se o plano de 2027 inclui um mestrado declarado. Strategist colocaria isso no 90-day como preparacao condicional, nao acao imediata.',
      'redFlags', jsonb_build_array('Application essays rewarding community leadership framing. Technical exit narrative underperforms here.')
    )
  ),

  -- ROLLING
  (
    'https://www.ycombinator.com/apply',
    'Y Combinator, Summer 2026 batch',
    'Y Combinator',
    'US',
    'rolling',
    'Apps open, interviews continue through May',
    'US$ 500k, standard YC deal',
    '3 months in SF, equity dilution',
    'accelerator, rolling review',
    'rolling',
    62::smallint,
    '#0147, 2026-04-22',
    '2026-04-22 11:15:00+00'::timestamptz,
    jsonb_build_object(
      'why', 'YC bar for solo technical founders post-exit is high but tractable. You have the proof. The weaker leg is what is the next company, if Radar itself is not the answer, the application will read as exploratory and underperform.',
      'redFlags', jsonb_build_array(
        'Solo founder disadvantage is real in the last 4 cohorts (1.6x rejection rate vs pairs).',
        'Apply only with the next venture fully committed, not as an option among many.'
      )
    )
  ),
  (
    'https://www.openphilanthropy.org/focus/ai/technical',
    'Open Philanthropy, Technical AI Safety RFP',
    'Open Philanthropy',
    'US',
    'rolling',
    'Rolling, typical decision 6 to 10 weeks',
    'US$ 20k to US$ 400k, duration-flexible',
    'Output-based, quarterly check-ins',
    'grant, rolling',
    'rolling',
    69::smallint,
    '#0155, 2026-04-22',
    '2026-04-22 18:47:00+00'::timestamptz,
    jsonb_build_object(
      'why', 'Your monograph sits at the exact intersection this RFP calls interpretability for non-English models. Only 3 BR applicants in the last 18 months. The door is not crowded. Lead with one specific research agenda, not three.',
      'partners', jsonb_build_array('Open Phil AI Safety Team'),
      'winnerPattern', 'Smaller, well-scoped proposals (under US$ 80k, 6 months) approved 3.4x more often than maximalist ones.'
    )
  ),
  (
    'https://www.estudar.org.br/programas/bolsas',
    'Fundacao Estudar, Lideres 2026',
    'Fundacao Estudar',
    'BR',
    'rolling',
    'Avaliacao continua, resultado em 4 a 8 semanas',
    'Custeio de curso ou travel grant, ate R$ 80k',
    'Community cohort, 1 ano de mentoria',
    'bolsa, inscricoes continuas',
    'rolling',
    66::smallint,
    '#0159, 2026-04-23',
    '2026-04-23 13:12:00+00'::timestamptz,
    jsonb_build_object(
      'why', 'Sua base no Instagram (60k devs) ja cumpre o filtro de impacto demonstravel. O programa rola com BR devs ainda pouco representados, entao o pitch tecnico tende a brilhar. Baixo custo de aplicacao, retorno assimetrico.'
    )
  ),

  -- RECURRENT ANNUAL
  (
    'https://summerofcode.withgoogle.com/',
    'Google Summer of Code, 2027 prep',
    'Google Open Source',
    'US',
    'recurrent_annual',
    'Next cycle opens 2027-Feb, mentor apps Dec 2026',
    'US$ 3k to US$ 6.6k',
    '3 months, summer',
    'mentorship, recurrent',
    'plan ahead',
    52::smallint,
    '#0164, 2026-04-20',
    '2026-04-20 16:04:00+00'::timestamptz,
    jsonb_build_object(
      'why', 'Relevant not as participant but as mentor. Your OSS footprint in BR-PT LLM tooling is exactly the niche GSoC lacks mentors for. Apply when December window opens; keep a mental note, not a task now.'
    )
  ),
  (
    'https://serrapilheira.org/chamadas/',
    'Instituto Serrapilheira, Chamada 2027',
    'Instituto Serrapilheira',
    'BR',
    'recurrent_annual',
    'Chamada tipicamente em set 2026, 6 meses de preparo',
    'R$ 700k, 3 anos',
    'Pesquisa em instituicao brasileira',
    'pesquisa, edital anual',
    'prepare',
    74::smallint,
    '#0168, 2026-04-21',
    '2026-04-21 21:33:00+00'::timestamptz,
    jsonb_build_object(
      'why', 'Serrapilheira funciona como o FAPESP premium, mais ousado em temas heterodoxos. Seu monograph publicado em PT-BR e raridade no painel. Comecar a preparacao agora, nao em setembro, faz a diferenca entre proposta rascunhada e proposta madura.',
      'winnerPattern', 'Propostas com track record de OSS publico aprovadas 2.8x mais, independentemente de afiliacao academica.'
    )
  ),

  -- ARENA
  (
    'https://huggingface.co/leaderboards/pt-br',
    'Hugging Face, Open Model Leaderboard, PT-BR track',
    'Hugging Face',
    'FR/US',
    'arena',
    'Ongoing, weekly leaderboard refresh',
    'Non-monetary, visibility to 220k ML engineers',
    'Submit model checkpoint, public eval',
    'arena, ongoing',
    'live',
    88::smallint,
    '#0171, 2026-04-17',
    '2026-04-18 00:19:00+00'::timestamptz,
    jsonb_build_object(
      'why', 'The PT-BR track has 14 submissions. Your monograph eval methodology would place top-5 on first submission. This is the lowest-effort, highest-signal arena for your profile right now.'
    )
  ),
  (
    'https://metr.org/tasks',
    'METR, Frontier Model Evaluation Arena',
    'Model Evaluation & Threat Research',
    'US',
    'arena',
    'Continuous, tasks reviewed biweekly',
    'US$ 150 to US$ 2k per accepted task',
    'Task authorship, 6 to 40 hours each',
    'arena, contributors wanted',
    'live',
    73::smallint,
    '#0173, 2026-04-19',
    '2026-04-19 10:52:00+00'::timestamptz,
    jsonb_build_object(
      'why', 'Task authorship for METR is how unusual talent becomes legible to SF labs. Three tasks accepted opens a direct line to Anthropic evaluation team. Your T5 monograph methodology maps almost 1:1 to their acceptance criteria.'
    )
  ),
  (
    'https://2026.pythonbrasil.org.br/cfp',
    'Python Brasil, CFP 2026',
    'Associacao Python Brasil',
    'BR',
    'arena',
    'CFP fecha 2026-07-31, evento em novembro',
    'Travel grant if selected, R$ 2k',
    '30 min talk + Q&A',
    'arena, recurring community',
    'cfp open',
    61::smallint,
    '#0175, 2026-04-22',
    '2026-04-22 15:08:00+00'::timestamptz,
    jsonb_build_object(
      'why', 'Sua fala ancorada no monograph tem espaco claro na track de IA. A Python Brasil e o palco de distribuicao para sua comunidade de 60k no Instagram. Baixo risco, compound certo no medio prazo.'
    )
  )
) as opp(source_url, title, org, loc, category, deadline, funding_brl,
        commitment, badge, status, fit, id_display, found_at, deep_data);

-- 2. scout_discarded entries against the same scout run.
insert into public.scout_discarded (scout_run_id, host, path, reason, detail)
select sr.id, host, path, reason::scout_discard_reason, detail
from public.scout_runs sr,
(values
  ('linkedin.com',          '/jobs/search',                'out-of-scope',  'job-board pattern'),
  ('workatastartup.com',    '/',                           'out-of-scope',  'job-board pattern'),
  ('gupy.io',               '/vagas',                      'out-of-scope',  'job-board pattern'),
  ('serrapilheira.org',     '/chamadas',                   'throttled',     '429 retry queued'),
  ('capes.gov.br',          '/editais',                    'error',         '503 retry queued'),
  ('chevening.org',         '/scholarship/brazil',         'unchanged',     'indexed last week'),
  ('finep.gov.br',          '/editais',                    'unchanged',     'no new content'),
  ('cnpq.br',               '/chamadas/universal-2026',    'low-fit',       'fit estimate below threshold'),
  ('fundacao-rocha.com.br', '/edital-2026',                'unverifiable',  '404 source removed')
) as d(host, path, reason, detail)
where sr.cycle_label = '2026-W17';
