# PedidoCentral · Backend

API REST en Node.js (Express) que se conecta a la base de datos PostgreSQL / Supabase
creada con `base_de_datos_pedidocentral.sql`. También sirve el frontend desde la carpeta `public/`.

## 1. Preparar la base de datos
1. Crea un proyecto en Supabase.
2. SQL Editor → pega y ejecuta `base_de_datos_pedidocentral.sql`.
3. Project Settings → Database → copia la *Connection string (URI)*.

## 2. Ejecutar el backend
```bash
npm install
cp .env.example .env     # en Windows: copy .env.example .env
# edita .env y pega tu DATABASE_URL
npm start
```
Abre http://localhost:3000 (API en `/api`). Prueba: http://localhost:3000/api/salud

## 3. Endpoints
| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/api/salud` | Verifica servidor y base de datos |
| GET | `/api/pedidos` | Lista pedidos (`?estado=`, `?canal=`, `?activos=true`, `?limite=`) |
| GET | `/api/pedidos/:id` | Un pedido |
| POST | `/api/pedidos` | Crea un pedido. Devuelve 409 si hay duplicado; reenviar con `"forzar": true` |
| PATCH | `/api/pedidos/:id/avanzar` | Pasa al siguiente estado |
| PATCH | `/api/pedidos/:id/cancelar` | Cancela el pedido |
| GET | `/api/resumen` | Contadores y ventas de hoy |
| GET | `/api/reportes/ventas-por-dia` | Ventas por día |
| GET | `/api/reportes/por-canal` | Pedidos y ventas por canal |
| GET | `/api/reportes/tiempo-promedio` | Minutos promedio hasta la entrega |

Ejemplo de creación:
```bash
curl -X POST http://localhost:3000/api/pedidos \
  -H "content-type: application/json" \
  -d '{"canal":"WhatsApp","nombre":"Laura","telefono":"3001112233","direccion":"Cra 5 #10-20","items":"2 hamburguesas","total":38000}'
```

## 4. Seguridad
- Si defines `API_KEY` en `.env`, todas las rutas `/api` (menos `/salud`) exigen el encabezado `x-api-key`.
- Nunca subas `.env` a GitHub (ya está en `.gitignore`).
- El inicio de sesión por rol es el siguiente paso.

## 5. Publicar
Sirve en Render, Railway o Fly.io: comando de inicio `npm start` y las variables de `.env.example`.

## 6. Pendiente
El frontend de `public/` todavía usa localStorage. Falta cambiar `app.js` para que llame a esta API.
