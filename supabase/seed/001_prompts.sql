with base_prompts(type, template) as (
  values
    ('prompt', 'Describe a daily habit that would make %s easier to handle.'),
    ('prompt', 'Explain why %s matters more than people usually admit.'),
    ('prompt', 'Tell us how you would improve %s with one small change.'),
    ('word', '%s'),
    ('interview', 'Tell me about a time you showed %s under pressure.'),
    ('interview', 'How would a teammate describe your approach to %s?'),
    ('storytelling', 'Tell a story where %s changes the ending.'),
    ('storytelling', 'Create a short story that begins with %s.'),
    ('debate', 'Should people care more about %s than convenience?'),
    ('debate', 'Is %s underrated in modern life?'),
    ('sales_pitch', 'Pitch a product that helps busy people with %s.'),
    ('sales_pitch', 'Sell a simple subscription service built around %s.'),
    ('elevator_pitch', 'Pitch yourself using %s as your central strength.'),
    ('elevator_pitch', 'Pitch a project that helps students practice %s.'),
    ('timed_response', 'In two minutes, explain the tradeoff between %s and speed.'),
    ('timed_response', 'Give a concise answer: what makes %s difficult to master?'),
    ('daily_challenge', 'Today, give a short talk about how %s showed up in your life.'),
    ('daily_challenge', 'Teach one practical lesson about %s.')
),
topics(topic) as (
  values
    ('momentum'), ('clarity'), ('confidence'), ('focus'), ('patience'), ('creativity'), ('discipline'),
    ('curiosity'), ('teamwork'), ('feedback'), ('resilience'), ('leadership'), ('communication'),
    ('preparation'), ('ambition'), ('kindness'), ('risk'), ('growth'), ('trust'), ('practice'),
    ('failure'), ('energy'), ('attention'), ('simplicity'), ('courage'), ('listening'), ('adaptability'),
    ('craft'), ('ownership'), ('consistency')
),
numbered as (
  select
    row_number() over () as n,
    base_prompts.type,
    format(base_prompts.template, topics.topic) as text
  from base_prompts
  cross join topics
)
insert into public.prompts(type, text)
select type, text
from numbered
where n <= 500
on conflict do nothing;
