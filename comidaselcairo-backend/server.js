require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

const ESTADOS = ["Recibido", "En preparación", "Listo", "En camino", "Entregado"];
const CANALES = ["WhatsApp", "App de domicilio", "Instagram", "Facebook", "Llamada"];
const VENTANA_DUPLICADO_MIN = 20;

if (!process.env.DATABASE_URL) {
  console.error("Falta DATABASE_URL. Copia .env.example como .env y complétalo.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false,
});

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "50kb" }));

const origins = (process.env.CORS_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
app.use(cors(origins.length ? { origin: origins } : {}));

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function aPedido(r) {
  return {
    id: Number(r.id),
    creadoEn: r.creado_en,
    actualizado: r.actualizado,
    estado: r.estado,
    canal: r.canal,
    nombre: r.nombre,
    telefono: r.telefono,
    direccion: r.direccion,
    items: r.items,
    notas: r.notas,
    total: r.total,
    minutos: r.minutos != null ? Number(r.minutos) : undefined,
  };
}

const SELECT = `select *, floor(extract(epoch from (now() - creado_en)) / 60) as minutos from pedidos`;

function limpiar(v, max) {
  return String(v == null ? "" : v).trim().slice(0, max);
}

function validar(body) {
  const d = {
    canal: limpiar(body.canal, 40),
    nombre: limpiar(body.nombre, 120),
    telefono: limpiar(body.telefono, 30),
    direccion: limpiar(body.direccion, 200),
    items: limpiar(body.items, 1000),
    notas: limpiar(body.notas, 300),
    total: parseInt(String(body.total == null ? "0" : body.total).replace(/\D/g, ""), 10) || 0,
  };
  const errores = [];
  if (!CANALES.includes(d.canal)) errores.push("canal inválido (usa: " + CANALES.join(", ") + ")");
  if (!d.nombre) errores.push("nombre es obligatorio");
  if (!d.telefono || d.telefono.replace(/\D/g, "").length < 7) errores.push("teléfono inválido");
  if (!d.direccion) errores.push("dirección es obligatoria");
  if (!d.items) errores.push("productos es obligatorio");
  if (d.total > 100000000) errores.push("total fuera de rango");
  return { d, errores };
}

app.use("/api", (req, res, next) => {
  if (req.path === "/salud") return next();
  const key = process.env.API_KEY;
  if (key && req.get("x-api-key") !== key) return res.status(401).json({ error: "No autorizado" });
  next();
});

app.get("/api/salud", wrap(async (req, res) => {
  await pool.query("select 1");
  res.json({ ok: true });
}));

app.get("/api/pedidos", wrap(async (req, res) => {
  const cond = [], vals = [];
  if (req.query.estado) { vals.push(req.query.estado); cond.push(`estado = $${vals.length}`); }
  if (req.query.canal) { vals.push(req.query.canal); cond.push(`canal = $${vals.length}`); }
  if (req.query.activos === "true") cond.push(`estado not in ('Entregado','Cancelado')`);
  const limite = Math.min(parseInt(req.query.limite, 10) || 200, 500);
  vals.push(limite);
  const sql = `${SELECT} ${cond.length ? "where " + cond.join(" and ") : ""} order by creado_en desc limit $${vals.length}`;
  const { rows } = await pool.query(sql, vals);
  res.json(rows.map(aPedido));
}));

app.get("/api/pedidos/:id", wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: "id inválido" });
  const { rows } = await pool.query(`${SELECT} where id = $1`, [id]);
  if (!rows.length) return res.status(404).json({ error: "Pedido no encontrado" });
  res.json(aPedido(rows[0]));
}));

app.post("/api/pedidos", wrap(async (req, res) => {
  const { d, errores } = validar(req.body || {});
  if (errores.length) return res.status(400).json({ error: "Datos inválidos", detalles: errores });

  if (req.body.forzar !== true) {
    const digitos = d.telefono.replace(/\D/g, "");
    const rep = await pool.query(
      `${SELECT}
       where estado not in ('Entregado','Cancelado')
         and regexp_replace(telefono, '\\D', '', 'g') = $1
         and creado_en > now() - ($2 || ' minutes')::interval
       order by creado_en desc limit 1`,
      [digitos, String(VENTANA_DUPLICADO_MIN)]
    );
    if (rep.rows.length) {
      return res.status(409).json({ error: "Posible pedido duplicado", duplicado: aPedido(rep.rows[0]) });
    }
  }

  const ins = await pool.query(
    `insert into pedidos (canal, nombre, telefono, direccion, items, notas, total)
     values ($1,$2,$3,$4,$5,$6,$7) returning id`,
    [d.canal, d.nombre, d.telefono, d.direccion, d.items, d.notas, d.total]
  );
  const { rows } = await pool.query(`${SELECT} where id = $1`, [ins.rows[0].id]);
  res.status(201).json(aPedido(rows[0]));
}));

app.patch("/api/pedidos/:id/avanzar", wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: "id inválido" });
  const cur = await pool.query("select estado from pedidos where id = $1", [id]);
  if (!cur.rows.length) return res.status(404).json({ error: "Pedido no encontrado" });
  const i = ESTADOS.indexOf(cur.rows[0].estado);
  if (i === -1 || i === ESTADOS.length - 1) {
    return res.status(409).json({ error: "El pedido ya no puede avanzar (" + cur.rows[0].estado + ")" });
  }

  const upd = await pool.query(
    "update pedidos set estado = $2 where id = $1 and estado = $3 returning id",
    [id, ESTADOS[i + 1], ESTADOS[i]]
  );
  if (!upd.rows.length) return res.status(409).json({ error: "El pedido cambió de estado, vuelve a consultarlo" });
  const { rows } = await pool.query(`${SELECT} where id = $1`, [id]);
  res.json(aPedido(rows[0]));
}));

app.patch("/api/pedidos/:id/cancelar", wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: "id inválido" });
  const upd = await pool.query(
    "update pedidos set estado = 'Cancelado' where id = $1 and estado not in ('Entregado','Cancelado') returning id",
    [id]
  );
  if (!upd.rows.length) {
    const ex = await pool.query("select 1 from pedidos where id = $1", [id]);
    if (!ex.rows.length) return res.status(404).json({ error: "Pedido no encontrado" });
    return res.status(409).json({ error: "El pedido ya estaba entregado o cancelado" });
  }
  const { rows } = await pool.query(`${SELECT} where id = $1`, [id]);
  res.json(aPedido(rows[0]));
}));

app.get("/api/resumen", wrap(async (req, res) => {
  const { rows } = await pool.query(
    `select
       count(*) filter (where estado = 'Recibido')                  as por_preparar,
       count(*) filter (where estado = 'En preparación')            as en_cocina,
       count(*) filter (where estado in ('Listo','En camino'))      as en_reparto,
       coalesce(sum(total) filter (where estado <> 'Cancelado'
         and (creado_en at time zone 'America/Bogota')::date = (now() at time zone 'America/Bogota')::date), 0) as ventas_hoy
     from pedidos`
  );
  const r = rows[0];
  res.json({
    porPreparar: Number(r.por_preparar),
    enCocina: Number(r.en_cocina),
    enReparto: Number(r.en_reparto),
    ventasHoy: Number(r.ventas_hoy),
  });
}));

app.get("/api/reportes/ventas-por-dia", wrap(async (req, res) => {
  const { rows } = await pool.query("select * from ventas_por_dia limit 60");
  res.json(rows.map((r) => ({ dia: r.dia, pedidos: Number(r.pedidos), ventas: Number(r.ventas) })));
}));
app.get("/api/reportes/por-canal", wrap(async (req, res) => {
  const { rows } = await pool.query("select * from pedidos_por_canal");
  res.json(rows.map((r) => ({ canal: r.canal, pedidos: Number(r.pedidos), ventas: Number(r.ventas) })));
}));
app.get("/api/reportes/tiempo-promedio", wrap(async (req, res) => {
  const { rows } = await pool.query("select * from tiempo_promedio_entrega");
  res.json({ minutos: rows[0].minutos == null ? null : Number(rows[0].minutos) });
}));

app.use(express.static(path.join(__dirname, "public")));

app.use("/api", (req, res) => res.status(404).json({ error: "Ruta no encontrada" }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Error interno del servidor" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("PedidoCentral API escuchando en http://localhost:" + PORT));
