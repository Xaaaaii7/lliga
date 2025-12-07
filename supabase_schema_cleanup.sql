-- Create table team_cities
create table if not exists team_cities (
  id bigint primary key generated always as identity,
  nickname text unique not null,
  city text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS Policies
alter table team_cities enable row level security;

create policy "Enable read access for all users" on team_cities
  for select using (true);

create policy "Enable write access for authenticated users only" on team_cities
  for insert with check (auth.role() = 'authenticated');

create policy "Enable update access for authenticated users only" on team_cities
  for update using (auth.role() = 'authenticated');

-- Insert existing data from equipos_ciudades.json
insert into team_cities (nickname, city)
values
  ('Jordi', 'London'),
  ('Gimeno', 'Milan'),
  ('Eudald', 'Villarreal'),
  ('Eloi', 'Bergamo'),
  ('Isaac', 'Seville'),
  ('Erik', 'San Sebastian'),
  ('Jose', 'Bilbao'),
  ('Tiago', 'Madrid'),
  ('Vandal', 'London'),
  ('Hagen', 'London'),
  ('Josep', 'Naples'),
  ('Adriel', 'Milan'),
  ('Leandro', 'Turin'),
  ('Pablo', 'Rome'),
  ('Berni', 'Marseille'),
  ('Ricard', 'Monaco'),
  ('Raka', 'Leverkusen'),
  ('Tes', 'Dortmund'),
  ('Joel', 'Newcastle upon Tyne'),
  ('Elian', 'Birmingham'),
  ('Enric', 'Porto'),
  ('Franco', 'Manchester')
on conflict (nickname) do update set
  city = excluded.city;
