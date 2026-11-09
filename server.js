// Servidor do app Pedido de Velas: serve a pasta public/ e a API em /api,
// guardando pedidos e a lista de cores no Postgres.
//
// Variáveis de ambiente:
//   DATABASE_URL  (obrigatória) conexão do Postgres. No Railway: ${{Postgres.DATABASE_URL}}
//   APP_PIN       (opcional)    código de acesso pedido pelo app antes de ver/alterar pedidos
//   PGSSL=true    (opcional)    usa SSL na conexão (necessário só com a URL pública do banco)
//   PORT          definida pelo Railway automaticamente
import express from "express";
import pg from "pg";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const PIN = (process.env.APP_PIN || "").trim();

if (!process.env.DATABASE_URL) {
  console.error("Erro: defina a variável DATABASE_URL com a conexão do Postgres.");
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : undefined,
  max: 5,
});

async function prepararBanco() {
  for (let tentativa = 1; ; tentativa++) {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS pedidos (
          id        TEXT PRIMARY KEY,
          data      TIMESTAMPTZ NOT NULL,
          cliente   TEXT NOT NULL DEFAULT '',
          obs       TEXT NOT NULL DEFAULT '',
          palito    JSONB NOT NULL DEFAULT '[]',
          dias      JSONB NOT NULL DEFAULT '[]',
          criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS financeiro JSONB;
        ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS nome TEXT NOT NULL DEFAULT '';
        ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now();
        CREATE INDEX IF NOT EXISTS pedidos_data_idx ON pedidos (data DESC);
        CREATE TABLE IF NOT EXISTS config (
          chave TEXT PRIMARY KEY,
          valor JSONB NOT NULL,
          atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
        );
      `);
      return;
    } catch (e) {
      if (tentativa >= 10) throw e;
      console.log(`Banco ainda não respondeu (${e.message}). Tentando de novo...`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

// ---------- validação ----------
const texto = (v, max) => (typeof v === "string" ? v.slice(0, max) : "");

function validarItens(lista) {
  if (!Array.isArray(lista) || lista.length > 500) return null;
  const out = [];
  for (const item of lista) {
    if (!Array.isArray(item) || typeof item[0] !== "string") return null;
    const n = Number(item[1]);
    if (!Number.isInteger(n) || n < 0 || n > 1_000_000) return null;
    out.push([item[0].slice(0, 100), n]);
  }
  return out;
}

// Financeiro do pedido: { kgPalito, valorPalito, valorDias } — cada um número ou null.
// Retorna undefined se inválido; null se não houver nada preenchido.
function validarFin(f) {
  if (f == null) return null;
  if (typeof f !== "object") return undefined;
  const out = {};
  for (const k of ["kgPalito", "valorPalito", "valorDias"]) {
    const v = f[k];
    if (v == null) { out[k] = null; continue; }
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 10_000_000) return undefined;
    out[k] = Math.round(v * 1000) / 1000;
  }
  return Object.values(out).some((v) => v != null) ? out : null;
}

function validarPedido(p) {
  if (!p || typeof p !== "object") return null;
  if (typeof p.id !== "string" || !p.id || p.id.length > 64) return null;
  const data = new Date(p.data);
  if (isNaN(data)) return null;
  const palito = validarItens(p.palito);
  const dias = validarItens(p.dias);
  const fin = validarFin(p.fin);
  if (!palito || !dias || fin === undefined) return null;
  return {
    id: p.id, data, nome: texto(p.nome, 200), cliente: texto(p.cliente, 200), obs: texto(p.obs, 1000),
    palito, dias, fin,
  };
}

function validarCores(cores) {
  if (!Array.isArray(cores) || cores.length > 300) return null;
  const out = [];
  for (const c of cores) {
    if (!c || typeof c.nome !== "string" || !c.nome.trim()) return null;
    out.push({ nome: c.nome.slice(0, 100), css: texto(c.css, 200) || "#cccccc" });
  }
  return out;
}

// ---------- app ----------
const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "2mb" }));

app.get("/api/saude", (req, res) => res.json({ ok: true, pin: Boolean(PIN) }));

app.use("/api", (req, res, next) => {
  if (!PIN) return next();
  const enviado = Buffer.from(String(req.get("x-app-pin") || ""));
  const certo = Buffer.from(PIN);
  if (enviado.length === certo.length && crypto.timingSafeEqual(enviado, certo)) return next();
  res.status(401).json({ erro: "Código de acesso inválido" });
});

const linhaParaPedido = (r) => ({
  id: r.id, data: r.data.toISOString(), nome: r.nome, cliente: r.cliente, obs: r.obs,
  palito: r.palito, dias: r.dias, fin: r.financeiro ?? null,
});

app.get("/api/pedidos", async (req, res, next) => {
  try {
    const { rows } = await pool.query("SELECT * FROM pedidos ORDER BY data DESC");
    res.json(rows.map(linhaParaPedido));
  } catch (e) { next(e); }
});

// Recebe um ou vários pedidos (novos ou editados). Se o id já existe, o pedido
// é atualizado; então reenviar é seguro.
app.post("/api/pedidos", async (req, res, next) => {
  const lista = Array.isArray(req.body?.pedidos) ? req.body.pedidos : [req.body];
  if (lista.length > 5000) return res.status(400).json({ erro: "Pedidos demais de uma vez" });
  const validos = lista.map(validarPedido);
  if (validos.some((p) => !p)) return res.status(400).json({ erro: "Pedido inválido" });
  const cliente = await pool.connect();
  try {
    await cliente.query("BEGIN");
    for (const p of validos) {
      await cliente.query(
        `INSERT INTO pedidos (id, data, cliente, obs, palito, dias, financeiro, nome)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO UPDATE SET
           data = EXCLUDED.data, nome = EXCLUDED.nome, cliente = EXCLUDED.cliente, obs = EXCLUDED.obs,
           palito = EXCLUDED.palito, dias = EXCLUDED.dias, financeiro = EXCLUDED.financeiro,
           atualizado_em = now()`,
        [p.id, p.data, p.cliente, p.obs, JSON.stringify(p.palito), JSON.stringify(p.dias),
         p.fin ? JSON.stringify(p.fin) : null, p.nome]
      );
    }
    await cliente.query("COMMIT");
    res.json({ ok: true, gravados: validos.length });
  } catch (e) {
    await cliente.query("ROLLBACK").catch(() => {});
    next(e);
  } finally {
    cliente.release();
  }
});

app.delete("/api/pedidos/:id", async (req, res, next) => {
  try {
    await pool.query("DELETE FROM pedidos WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

app.get("/api/cores", async (req, res, next) => {
  try {
    const { rows } = await pool.query("SELECT valor FROM config WHERE chave = 'cores'");
    res.json({ cores: rows[0]?.valor ?? null });
  } catch (e) { next(e); }
});

app.put("/api/cores", async (req, res, next) => {
  const cores = validarCores(req.body?.cores);
  if (!cores) return res.status(400).json({ erro: "Lista de cores inválida" });
  try {
    await pool.query(
      `INSERT INTO config (chave, valor) VALUES ('cores', $1)
       ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = now()`,
      [JSON.stringify(cores)]
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
});

app.use("/api", (req, res) => res.status(404).json({ erro: "Rota não encontrada" }));

app.use(express.static(path.join(DIR, "public"), {
  setHeaders: (res) => res.setHeader("Cache-Control", "no-cache"),
}));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ erro: "Erro no servidor" });
});

await prepararBanco();
app.listen(PORT, () => {
  console.log(`Pedido de Velas rodando na porta ${PORT}${PIN ? " (com código de acesso)" : ""}`);
});
