// Servidor do app Pedido de Velas: serve a pasta public/ e a API em /api,
// guardando usuários, pedidos e listas de cores no Postgres.
// Cada usuário só enxerga e altera os próprios pedidos.
//
// Variáveis de ambiente:
//   DATABASE_URL   (obrigatória) conexão do Postgres. No Railway: ${{Postgres.DATABASE_URL}}
//   ADMIN_USUARIO  (recomendada) login do primeiro administrador (criado se ainda não existir)
//   ADMIN_SENHA    (recomendada) senha inicial desse administrador
//   PGSSL=true     (opcional)    usa SSL na conexão (necessário só com a URL pública do banco)
//   PORT           definida pelo Railway automaticamente
import express from "express";
import pg from "pg";
import crypto from "node:crypto";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const COOKIE = "velas_sessao";
const SESSAO_DIAS = 180;
const scrypt = promisify(crypto.scrypt);

if (!process.env.DATABASE_URL) {
  console.error("Erro: defina a variável DATABASE_URL com a conexão do Postgres.");
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : undefined,
  max: 5,
});

// ---------- senhas e sessões ----------
async function gerarHash(senha) {
  const sal = crypto.randomBytes(16);
  const hash = await scrypt(senha, sal, 64);
  return `scrypt$${sal.toString("hex")}$${hash.toString("hex")}`;
}

async function conferirSenha(senha, guardado) {
  const [tipo, salHex, hashHex] = String(guardado).split("$");
  if (tipo !== "scrypt" || !salHex || !hashHex) return false;
  const esperado = Buffer.from(hashHex, "hex");
  const hash = await scrypt(senha, Buffer.from(salHex, "hex"), esperado.length);
  return crypto.timingSafeEqual(hash, esperado);
}

const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

function lerCookie(req, nome) {
  const cab = req.headers.cookie || "";
  for (const parte of cab.split(";")) {
    const i = parte.indexOf("=");
    if (i > 0 && parte.slice(0, i).trim() === nome) return decodeURIComponent(parte.slice(i + 1).trim());
  }
  return null;
}

function gravarCookie(req, res, valor, maxAgeSeg) {
  const seguro = req.secure ? "; Secure" : "";
  res.setHeader("Set-Cookie",
    `${COOKIE}=${encodeURIComponent(valor)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeg}${seguro}`);
}

const normalizarLogin = (s) => String(s || "").trim().toLowerCase();
const loginValido = (s) => /^[a-z0-9._-]{3,40}$/.test(s);

// ---------- banco ----------
async function prepararBanco() {
  for (let tentativa = 1; ; tentativa++) {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS usuarios (
          id         SERIAL PRIMARY KEY,
          usuario    TEXT NOT NULL UNIQUE,
          nome       TEXT NOT NULL DEFAULT '',
          senha_hash TEXT NOT NULL,
          admin      BOOLEAN NOT NULL DEFAULT false,
          criado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE TABLE IF NOT EXISTS sessoes (
          token_hash TEXT PRIMARY KEY,
          usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
          expira_em  TIMESTAMPTZ NOT NULL
        );
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
        ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE;
        CREATE INDEX IF NOT EXISTS pedidos_usuario_data_idx ON pedidos (usuario_id, data DESC);
        CREATE TABLE IF NOT EXISTS config (
          chave TEXT PRIMARY KEY,
          valor JSONB NOT NULL,
          atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        DELETE FROM sessoes WHERE expira_em < now();
      `);
      break;
    } catch (e) {
      if (tentativa >= 10) throw e;
      console.log(`Banco ainda não respondeu (${e.message}). Tentando de novo...`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }

  // Primeiro administrador, a partir das variáveis de ambiente.
  const login = normalizarLogin(process.env.ADMIN_USUARIO);
  const senha = process.env.ADMIN_SENHA || "";
  if (login && senha) {
    if (!loginValido(login)) {
      console.error("ADMIN_USUARIO inválido: use 3 a 40 letras minúsculas, números, ponto, hífen ou _.");
    } else {
      const r = await pool.query(
        `INSERT INTO usuarios (usuario, nome, senha_hash, admin) VALUES ($1, $1, $2, true)
         ON CONFLICT (usuario) DO NOTHING RETURNING id`,
        [login, await gerarHash(senha)]
      );
      if (r.rowCount) console.log(`Administrador "${login}" criado.`);
    }
  }

  // Pedidos e cores de antes do login passam para o primeiro administrador.
  const { rows } = await pool.query("SELECT id FROM usuarios WHERE admin ORDER BY id LIMIT 1");
  if (rows[0]) {
    const adm = rows[0].id;
    const r = await pool.query("UPDATE pedidos SET usuario_id = $1 WHERE usuario_id IS NULL", [adm]);
    if (r.rowCount) console.log(`${r.rowCount} pedido(s) antigos atribuídos ao administrador.`);
    await pool.query(
      `INSERT INTO config (chave, valor) SELECT $1, valor FROM config WHERE chave = 'cores'
       ON CONFLICT (chave) DO NOTHING`,
      [`cores:${adm}`]
    );
  } else {
    console.warn("Nenhum usuário cadastrado. Defina ADMIN_USUARIO e ADMIN_SENHA para criar o administrador.");
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
app.set("trust proxy", 1); // Railway fica atrás de um proxy HTTPS
app.use(express.json({ limit: "2mb" }));

const ok = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const publicoUsuario = (u) => ({ id: u.id, usuario: u.usuario, nome: u.nome, admin: u.admin });

app.get("/api/saude", (req, res) => res.json({ ok: true, login: true }));

// Limite simples de tentativas de login (por IP), para dificultar adivinhar senhas.
const tentativas = new Map();
function bloqueado(ip) {
  const t = tentativas.get(ip);
  if (!t || Date.now() - t.inicio > 15 * 60_000) return false;
  return t.falhas >= 10;
}
function registrarFalha(ip) {
  const t = tentativas.get(ip);
  if (!t || Date.now() - t.inicio > 15 * 60_000) tentativas.set(ip, { inicio: Date.now(), falhas: 1 });
  else t.falhas++;
}

app.post("/api/login", ok(async (req, res) => {
  const ip = req.ip;
  if (bloqueado(ip)) return res.status(429).json({ erro: "Muitas tentativas. Aguarde 15 minutos." });
  const login = normalizarLogin(req.body?.usuario);
  const senha = String(req.body?.senha || "");
  const { rows } = await pool.query("SELECT * FROM usuarios WHERE usuario = $1", [login]);
  const u = rows[0];
  if (!u || !(await conferirSenha(senha, u.senha_hash))) {
    registrarFalha(ip);
    return res.status(401).json({ erro: "Usuário ou senha incorretos" });
  }
  tentativas.delete(ip);
  const token = crypto.randomBytes(32).toString("base64url");
  await pool.query(
    `INSERT INTO sessoes (token_hash, usuario_id, expira_em) VALUES ($1, $2, now() + interval '${SESSAO_DIAS} days')`,
    [sha256(token), u.id]
  );
  gravarCookie(req, res, token, SESSAO_DIAS * 86400);
  res.json(publicoUsuario(u));
}));

app.post("/api/logout", ok(async (req, res) => {
  const token = lerCookie(req, COOKIE);
  if (token) await pool.query("DELETE FROM sessoes WHERE token_hash = $1", [sha256(token)]);
  gravarCookie(req, res, "", 0);
  res.json({ ok: true });
}));

// Daqui para baixo, tudo exige login.
app.use("/api", ok(async (req, res, next) => {
  const token = lerCookie(req, COOKIE);
  if (token) {
    const { rows } = await pool.query(
      `SELECT u.* FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id
       WHERE s.token_hash = $1 AND s.expira_em > now()`,
      [sha256(token)]
    );
    if (rows[0]) { req.usuario = rows[0]; return next(); }
  }
  res.status(401).json({ erro: "Faça login" });
}));

const soAdmin = (req, res, next) =>
  req.usuario.admin ? next() : res.status(403).json({ erro: "Apenas administradores" });

app.get("/api/eu", (req, res) => res.json(publicoUsuario(req.usuario)));

app.post("/api/senha", ok(async (req, res) => {
  const { atual, nova } = req.body || {};
  if (!(await conferirSenha(String(atual || ""), req.usuario.senha_hash))) {
    return res.status(400).json({ erro: "Senha atual incorreta" });
  }
  if (typeof nova !== "string" || nova.length < 6) {
    return res.status(400).json({ erro: "A nova senha precisa ter pelo menos 6 caracteres" });
  }
  await pool.query("UPDATE usuarios SET senha_hash = $1 WHERE id = $2", [await gerarHash(nova), req.usuario.id]);
  // encerra as outras sessões deste usuário
  await pool.query("DELETE FROM sessoes WHERE usuario_id = $1 AND token_hash <> $2",
    [req.usuario.id, sha256(lerCookie(req, COOKIE))]);
  res.json({ ok: true });
}));

// ---------- usuários (admin) ----------
app.get("/api/usuarios", soAdmin, ok(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT u.id, u.usuario, u.nome, u.admin, count(p.id)::int AS pedidos
     FROM usuarios u LEFT JOIN pedidos p ON p.usuario_id = u.id
     GROUP BY u.id ORDER BY u.nome, u.usuario`
  );
  res.json(rows);
}));

app.post("/api/usuarios", soAdmin, ok(async (req, res) => {
  const login = normalizarLogin(req.body?.usuario);
  const nome = texto(req.body?.nome, 100).trim() || login;
  const senha = req.body?.senha;
  if (!loginValido(login)) {
    return res.status(400).json({ erro: "Usuário: 3 a 40 letras minúsculas, números, ponto, hífen ou _ (sem espaços)" });
  }
  if (typeof senha !== "string" || senha.length < 6) {
    return res.status(400).json({ erro: "A senha precisa ter pelo menos 6 caracteres" });
  }
  const r = await pool.query(
    `INSERT INTO usuarios (usuario, nome, senha_hash, admin) VALUES ($1, $2, $3, $4)
     ON CONFLICT (usuario) DO NOTHING RETURNING id, usuario, nome, admin`,
    [login, nome, await gerarHash(senha), req.body?.admin === true]
  );
  if (!r.rowCount) return res.status(409).json({ erro: "Esse usuário já existe" });
  res.json(r.rows[0]);
}));

app.put("/api/usuarios/:id", soAdmin, ok(async (req, res) => {
  const id = Number(req.params.id);
  const { nome, senha, admin } = req.body || {};
  if (id === req.usuario.id && admin === false) {
    return res.status(400).json({ erro: "Você não pode tirar o seu próprio acesso de administrador" });
  }
  if (senha !== undefined && (typeof senha !== "string" || senha.length < 6)) {
    return res.status(400).json({ erro: "A senha precisa ter pelo menos 6 caracteres" });
  }
  const r = await pool.query(
    `UPDATE usuarios SET
       nome = COALESCE($2, nome),
       senha_hash = COALESCE($3, senha_hash),
       admin = COALESCE($4, admin)
     WHERE id = $1 RETURNING id`,
    [id, typeof nome === "string" && nome.trim() ? nome.trim().slice(0, 100) : null,
     senha ? await gerarHash(senha) : null, typeof admin === "boolean" ? admin : null]
  );
  if (!r.rowCount) return res.status(404).json({ erro: "Usuário não encontrado" });
  if (senha) await pool.query("DELETE FROM sessoes WHERE usuario_id = $1", [id]); // força novo login
  res.json({ ok: true });
}));

app.delete("/api/usuarios/:id", soAdmin, ok(async (req, res) => {
  const id = Number(req.params.id);
  if (id === req.usuario.id) return res.status(400).json({ erro: "Você não pode excluir a si mesmo" });
  await pool.query("DELETE FROM config WHERE chave = $1", [`cores:${id}`]);
  await pool.query("DELETE FROM usuarios WHERE id = $1", [id]); // pedidos e sessões vão junto
  res.json({ ok: true });
}));

// ---------- pedidos (sempre do usuário logado) ----------
const linhaParaPedido = (r) => ({
  id: r.id, data: r.data.toISOString(), nome: r.nome, cliente: r.cliente, obs: r.obs,
  palito: r.palito, dias: r.dias, fin: r.financeiro ?? null,
});

app.get("/api/pedidos", ok(async (req, res) => {
  const { rows } = await pool.query(
    "SELECT * FROM pedidos WHERE usuario_id = $1 ORDER BY data DESC", [req.usuario.id]);
  res.json(rows.map(linhaParaPedido));
}));

// Recebe um ou vários pedidos (novos ou editados). Se o id já existe e é deste
// usuário, o pedido é atualizado; então reenviar é seguro.
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
        `INSERT INTO pedidos (id, data, cliente, obs, palito, dias, financeiro, nome, usuario_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO UPDATE SET
           data = EXCLUDED.data, nome = EXCLUDED.nome, cliente = EXCLUDED.cliente, obs = EXCLUDED.obs,
           palito = EXCLUDED.palito, dias = EXCLUDED.dias, financeiro = EXCLUDED.financeiro,
           atualizado_em = now()
         WHERE pedidos.usuario_id = EXCLUDED.usuario_id`,
        [p.id, p.data, p.cliente, p.obs, JSON.stringify(p.palito), JSON.stringify(p.dias),
         p.fin ? JSON.stringify(p.fin) : null, p.nome, req.usuario.id]
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

app.delete("/api/pedidos/:id", ok(async (req, res) => {
  await pool.query("DELETE FROM pedidos WHERE id = $1 AND usuario_id = $2", [req.params.id, req.usuario.id]);
  res.json({ ok: true });
}));

// ---------- lista de cores (por usuário) ----------
app.get("/api/cores", ok(async (req, res) => {
  const { rows } = await pool.query("SELECT valor FROM config WHERE chave = $1", [`cores:${req.usuario.id}`]);
  res.json({ cores: rows[0]?.valor ?? null });
}));

app.put("/api/cores", ok(async (req, res) => {
  const cores = validarCores(req.body?.cores);
  if (!cores) return res.status(400).json({ erro: "Lista de cores inválida" });
  await pool.query(
    `INSERT INTO config (chave, valor) VALUES ($1, $2)
     ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = now()`,
    [`cores:${req.usuario.id}`, JSON.stringify(cores)]
  );
  res.json({ ok: true });
}));

app.use("/api", (req, res) => res.status(404).json({ erro: "Rota não encontrada" }));

app.use(express.static(path.join(DIR, "public"), {
  setHeaders: (res) => res.setHeader("Cache-Control", "no-cache"),
}));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ erro: "Erro no servidor" });
});

await prepararBanco();
app.listen(PORT, () => console.log(`Pedido de Velas rodando na porta ${PORT}`));
