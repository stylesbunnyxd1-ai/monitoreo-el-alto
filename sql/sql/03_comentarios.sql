create table if not exists comentarios (
  id bigint generated always as identity primary key,
  reporte_id bigint not null references reportes_ambientales(id) on delete cascade,
  usuario_id uuid not null references profiles(id),
  padre_id bigint,
  texto text not null check (char_length(btrim(texto)) between 2 and 500),
  oculto boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id, reporte_id),
  -- una respuesta solo puede colgar de un comentario del MISMO reporte
  foreign key (padre_id, reporte_id) references comentarios (id, reporte_id) on delete cascade
);

create index if not exists comentarios_reporte_idx on comentarios (reporte_id, created_at);

alter table comentarios enable row level security;

-- Los comentarios ocultos solo los ven su autor y el administrador
create policy "ver comentarios" on comentarios for select
  using (not oculto or usuario_id = auth.uid() or es_admin());
create policy "comentar" on comentarios for insert
  with check (usuario_id = auth.uid() and oculto = false);
create policy "moderar comentarios" on comentarios for update
  using (es_admin()) with check (es_admin());
create policy "borrar comentario" on comentarios for delete
  using (usuario_id = auth.uid() or es_admin());

alter publication supabase_realtime add table comentarios;