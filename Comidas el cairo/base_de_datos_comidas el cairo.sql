-- =====================================================================
-- PedidoCentral · Base de datos (PostgreSQL / Supabase)
-- Uso: Supabase > SQL Editor > New query > pegar todo > Run
-- =====================================================================

-- ---------- 1. Tabla de pedidos ----------
create table if not exists public.pedidos (
  id          bigint generated always as identity primary key,
  creado_en   timestamptz not null default now(),
  actualizado timestamptz not null default now(),
  estado      text not null default 'Recibido'
              check (estado in ('Recibido','En preparación','Listo','En camino','Entregado','Cancelado')),
  canal       text not null
              check (canal in ('WhatsApp','App de domicilio','Instagram','Facebook','Llamada')),
  nombre      text not null check (length(trim(nombre)) > 0),
  telefono    text not null check (length(trim(telefono)) > 0),
  direccion   text not null check (length(trim(direccion)) > 0),
  items       text not null check (length(trim(items)) > 0),   -- un producto por línea
  notas       text not null default '',
  total       integer not null default 0 check (total >= 0)     -- en pesos (COP)
);

-- ---------- 2. Índices ----------
create index if not exists pedidos_estado_idx   on public.pedidos (estado);
create index if not exists pedidos_creado_idx   on public.pedidos (creado_en desc);
create index if not exists pedidos_telefono_idx on public.pedidos (telefono);

-- ---------- 3. Actualizar la fecha de modificación automáticamente ----------
create or replace function public.set_actualizado()
returns trigger
language plpgsql
as $$
begin
  new.actualizado = now();
  return new;
end;
$$;

drop trigger if exists pedidos_set_actualizado on public.pedidos;
create trigger pedidos_set_actualizado
  before update on public.pedidos
  for each row execute function public.set_actualizado();

-- ---------- 4. Vistas útiles para reportes ----------
-- Ventas y cantidad de pedidos por día (sin contar cancelados)
create or replace view public.ventas_por_dia as
select
  (creado_en at time zone 'America/Bogota')::date as dia,
  count(*)                                        as pedidos,
  coalesce(sum(total), 0)                         as ventas
from public.pedidos
where estado <> 'Cancelado'
group by 1
order by 1 desc;

-- Pedidos por canal
create or replace view public.pedidos_por_canal as
select
  canal,
  count(*)                as pedidos,
  coalesce(sum(total), 0) as ventas
from public.pedidos
where estado <> 'Cancelado'
group by canal
order by pedidos desc;

-- Tiempo promedio (en minutos) desde que se recibe hasta que se entrega
create or replace view public.tiempo_promedio_entrega as
select
  round(avg(extract(epoch from (actualizado - creado_en)) / 60)::numeric, 1) as minutos
from public.pedidos
where estado = 'Entregado';

-- ---------- 5. Seguridad (Row Level Security) ----------
alter table public.pedidos enable row level security;

-- IMPORTANTE: estas políticas permiten leer y escribir a cualquiera que tenga
-- la clave pública (anon) del proyecto. Sirven para PROBAR el sistema.
-- Cuando agregues inicio de sesión, borra estas políticas y deja solo
-- las de "authenticated" (ver bloque comentado al final).
drop policy if exists "pedidos_anon_select" on public.pedidos;
drop policy if exists "pedidos_anon_insert" on public.pedidos;
drop policy if exists "pedidos_anon_update" on public.pedidos;

create policy "pedidos_anon_select" on public.pedidos for select to anon using (true);
create policy "pedidos_anon_insert" on public.pedidos for insert to anon with check (true);
create policy "pedidos_anon_update" on public.pedidos for update to anon using (true) with check (true);

-- No se permite borrar con la clave pública: los pedidos se cancelan, no se eliminan.

-- ---------- 6. Tiempo real (para que cocina vea los pedidos al instante) ----------
do $$
begin
  alter publication supabase_realtime add table public.pedidos;
exception
  when duplicate_object then null;
end $$;

-- ---------- 7. Datos de ejemplo (opcional: borra este bloque si no los quieres) ----------
insert into public.pedidos (estado, canal, nombre, telefono, direccion, items, notas, total, creado_en) values
  ('Recibido',       'WhatsApp',         'Laura Pérez',  '3001112233', 'Cra 5 #10-20', E'2 hamburguesas dobles\n1 gaseosa', 'Sin cebolla',      38000, now() - interval '14 minutes'),
  ('En preparación', 'App de domicilio', 'Carlos Díaz',  '3014445566', 'Calle 8 #3-15', E'1 perro caliente\nPapas grandes',  '',                 22000, now() - interval '8 minutes'),
  ('Listo',          'Instagram',        'Ana Ruiz',     '3027778899', 'Mz B Casa 4',   E'3 alitas x6',                      'Salsa BBQ aparte', 24000, now() - interval '3 minutes');

-- ---------------------------------------------------------------------
-- Para cuando tengas inicio de sesión (reemplaza las políticas anon):
--
-- drop policy "pedidos_anon_select" on public.pedidos;
-- drop policy "pedidos_anon_insert" on public.pedidos;
-- drop policy "pedidos_anon_update" on public.pedidos;
-- create policy "pedidos_auth_select" on public.pedidos for select to authenticated using (true);
-- create policy "pedidos_auth_insert" on public.pedidos for insert to authenticated with check (true);
-- create policy "pedidos_auth_update" on public.pedidos for update to authenticated using (true) with check (true);
-- ---------------------------------------------------------------------
