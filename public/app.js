// ===== Lista de cores padrão (edite aqui para mudar as cores fixas) =====
// [nome, cor CSS para a bolinha]
const CORES_PADRAO = [
  ["Branca", "#ffffff"],
  ["Preta", "#111111"],
  ["Vermelha", "#d01c1c"],
  ["Azul Clara", "#7fc4f0"],
  ["Azul Escura", "#1b3f9c"],
  ["Verde", "#1f9a3a"],
  ["Amarela", "#f6d21b"],
  ["Rosa", "#f39ac0"],
  ["Roxa", "#6a2c91"],
  ["Lilás", "#c3a1e0"],
  ["Laranja", "#f28c1c"],
  ["Marrom", "#6b3f1d"],
  ["Dourada", "linear-gradient(135deg,#f7e08a,#c79a2b)"],
  ["Prateada", "linear-gradient(135deg,#f2f2f2,#9a9a9a)"],
  ["Preta e Vermelha", "linear-gradient(90deg,#111 50%,#d01c1c 50%)"],
  ["Preta e Branca", "linear-gradient(90deg,#111 50%,#fff 50%)"],
  ["Vermelha e Branca", "linear-gradient(90deg,#d01c1c 50%,#fff 50%)"],
  ["Azul e Branca", "linear-gradient(90deg,#1b3f9c 50%,#fff 50%)"],
  ["Verde e Branca", "linear-gradient(90deg,#1f9a3a 50%,#fff 50%)"],
  ["Rosa e Azul", "linear-gradient(90deg,#f39ac0 50%,#7fc4f0 50%)"],
  ["Verde e Vermelha", "linear-gradient(90deg,#1f9a3a 50%,#d01c1c 50%)"],
];

// Dados guardados no celular. Cada usuário tem as próprias chaves (sufixo ":<id>"),
// para que quem usar o mesmo celular depois não veja os pedidos de outra pessoa.
const BASE_RASCUNHO = "pedidoVelas.v1";        // pedido em andamento + lista de cores
const BASE_HIST = "pedidoVelas.historico";     // pedidos guardados
const USUARIO_KEY = "pedidoVelas.usuario";     // último usuário logado (para abrir offline)
const TEM_SERVIDOR_KEY = "pedidoVelas.temServidor";
const COR_EXTRA = "#cccccc";
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const $ = (id) => document.getElementById(id);

// ================= Estado =================
// state: { cores: [{nome, css}], qtd: {nome: {palito, dias}}, nome, cliente, obs,
//          fin: {kg, vp, vd} (texto digitado), editando: id do pedido em edição ou null }
let state = null;
// pedidos: [{id, data: ISO, nome, cliente, obs, palito: [[cor, qtd]], dias: [[cor, qtd]],
//            fin: {kgPalito, valorPalito, valorDias} | null, salvo}]
let pedidos = [];
// usuário logado: {id, usuario, nome, admin}; null = app sem servidor (dados só no celular)
let usuario = null;

const sufixo = () => (usuario ? ":" + usuario.id : ":local");
const chaveRascunho = () => BASE_RASCUNHO + sufixo();
const chaveHist = () => BASE_HIST + sufixo();

const ls = {
  get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
  del: (k) => { try { localStorage.removeItem(k); } catch (e) {} },
};

// Dados de antes do login (versões antigas do app) passam para o primeiro usuário que entrar.
function adotarDadosAntigos() {
  for (const base of [BASE_RASCUNHO, BASE_HIST]) {
    const destino = base + sufixo();
    if (ls.get(destino) != null) continue;
    const origens = usuario ? [base, base + ":local"] : [base];
    for (const o of origens) {
      const v = ls.get(o);
      if (v != null) { ls.set(destino, v); ls.del(o); break; }
    }
  }
  ls.del("pedidoVelas.pin"); // código de acesso antigo, não é mais usado
}

function coresPadrao() {
  return CORES_PADRAO.map(([nome, css]) => ({ nome, css }));
}

function carregar() {
  let salvo = null;
  try { salvo = JSON.parse(ls.get(chaveRascunho())); } catch (e) {}
  let cores;
  if (salvo && Array.isArray(salvo.cores)) {
    cores = salvo.cores;
  } else {
    const extras = (salvo && salvo.extras) || []; // formato antigo
    cores = [...coresPadrao(), ...extras.map((nome) => ({ nome, css: COR_EXTRA }))];
  }
  return {
    cores,
    qtd: (salvo && salvo.qtd) || {},
    nome: (salvo && salvo.nome) || "",
    cliente: (salvo && salvo.cliente) || "",
    obs: (salvo && salvo.obs) || "",
    fin: (salvo && salvo.fin) || { kg: "", vp: "", vd: "" },
    editando: (salvo && salvo.editando) || null,
  };
}

function salvar() {
  const cores = state.cores.map(({ nome, css }) => ({ nome, css }));
  ls.set(chaveRascunho(), JSON.stringify({
    cores, qtd: state.qtd, nome: state.nome, cliente: state.cliente, obs: state.obs,
    fin: state.fin, editando: state.editando,
  }));
  enviarCoresSeMudou(cores);
}

function carregarHistorico() {
  try {
    const h = JSON.parse(ls.get(chaveHist()));
    return Array.isArray(h) ? h : [];
  } catch (e) { return []; }
}

function salvarHistorico() {
  if (ls.set(chaveHist(), JSON.stringify(pedidos))) return true;
  toast("Não foi possível guardar neste navegador");
  return false;
}

// ================= Servidor (Postgres) e login =================
// Com o servidor (Railway), cada usuário entra com usuário e senha e os pedidos dele
// ficam no banco, acessíveis de qualquer celular. Sem servidor (ex.: abrir o arquivo
// direto), tudo continua funcionando só no próprio celular.
let servidor = false; // true = servidor respondeu e o usuário está logado
let sincronizando = null;
let ultimasCoresEnviadas = null;
let timerCores;

async function api(metodo, url, corpo) {
  const r = await fetch(url, {
    method: metodo,
    cache: "no-store",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const dados = await r.json().catch(() => ({}));
  if (r.status === 401 && !url.endsWith("api/login")) {
    servidor = false;
    mostrarLogin("Sua sessão terminou. Entre de novo.");
    throw new Error("sem-sessao");
  }
  if (!r.ok) {
    const e = new Error(dados.erro || "Erro " + r.status);
    e.status = r.status;
    throw e;
  }
  return dados;
}

// Verifica servidor e sessão. Retorna "ok", "login" (precisa entrar) ou "offline".
async function conectar() {
  let saude = null;
  try {
    const r = await fetch("api/saude", { cache: "no-store" });
    if (r.ok) saude = await r.json();
  } catch (e) {}
  if (!saude || !saude.ok) { servidor = false; return "offline"; }
  ls.set(TEM_SERVIDOR_KEY, "1");
  try {
    const r = await fetch("api/eu", { cache: "no-store", credentials: "same-origin" });
    if (r.status === 401) { servidor = false; return "login"; }
    if (!r.ok) throw new Error();
    const eu = await r.json();
    if (!usuario || usuario.id !== eu.id) abrirComo(eu);
    else { usuario = eu; ls.set(USUARIO_KEY, JSON.stringify(eu)); atualizarConta(); }
    servidor = true;
    return "ok";
  } catch (e) { servidor = false; return "offline"; }
}

async function iniciar() {
  let cache = null;
  try { cache = JSON.parse(ls.get(USUARIO_KEY)); } catch (e) {}
  if (cache) abrirComo(cache); // abre na hora com os dados do celular (funciona sem internet)
  const r = await conectar();
  if (r === "login") return mostrarLogin();
  if (r === "offline" && !cache) {
    if (ls.get(TEM_SERVIDOR_KEY)) return mostrarLogin("Sem conexão com o servidor. Verifique a internet.");
    abrirComo(null); // app sem servidor: dados só neste celular
  }
  atualizarStatus();
  if (r === "ok") sincronizar();
}

// Carrega os dados do usuário (ou do modo sem servidor) e mostra o app.
function abrirComo(u) {
  usuario = u;
  if (u) ls.set(USUARIO_KEY, JSON.stringify(u));
  adotarDadosAntigos();
  state = carregar();
  pedidos = carregarHistorico();
  ultimasCoresEnviadas = null;
  $("telaLogin").hidden = true;
  $("busca").value = "";
  preencherCampos();
  render();
  mostrarAba("pedido");
  atualizarConta();
  atualizarStatus();
}

function mostrarLogin(msg) {
  $("telaLogin").hidden = false;
  $("loginErro").hidden = !msg;
  $("loginErro").textContent = msg || "";
  $("loginSenha").value = "";
  document.querySelectorAll("dialog[open]").forEach((d) => d.close());
  setTimeout(() => ($("loginUsuario").value ? $("loginSenha") : $("loginUsuario")).focus(), 50);
}

$("formLogin").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("btnEntrar");
  btn.disabled = true;
  $("loginErro").hidden = true;
  try {
    const u = await api("POST", "api/login", { usuario: $("loginUsuario").value, senha: $("loginSenha").value });
    abrirComo(u);
    servidor = true;
    sincronizar();
    toast(`Olá, ${u.nome || u.usuario}!`);
  } catch (err) {
    $("loginErro").textContent = err.status ? err.message : "Sem conexão com o servidor.";
    $("loginErro").hidden = false;
  } finally {
    btn.disabled = false;
    $("loginSenha").value = "";
  }
});

// ---------- Conta ----------
function atualizarConta() {
  const b = $("btnConta");
  b.hidden = !usuario;
  if (!usuario) return;
  const nome = usuario.nome || usuario.usuario;
  $("contaInicial").textContent = nome.trim().charAt(0).toUpperCase() || "?";
  b.title = nome;
  $("contaNome").textContent = nome;
  $("contaLogin").textContent = `Usuário: ${usuario.usuario}${usuario.admin ? " · administrador" : ""}`;
  $("btnUsuarios").hidden = !usuario.admin;
}

$("btnConta").addEventListener("click", () => $("dlgConta").showModal());
$("btnFecharConta").addEventListener("click", () => $("dlgConta").close());

$("formSenha").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await api("POST", "api/senha", { atual: $("senhaAtual").value, nova: $("senhaNova").value });
    $("formSenha").reset();
    toast("Senha alterada ✔");
  } catch (err) {
    if (err.message !== "sem-sessao") toast(err.status ? err.message : "Sem conexão com o servidor");
  }
});

$("btnSair").addEventListener("click", async () => {
  const pend = pedidos.filter((p) => !p.salvo).length;
  const aviso = pend
    ? `Há ${pend} pedido(s) que ainda não foram enviados ao servidor e serão perdidos. Sair mesmo assim?`
    : "Sair da sua conta neste celular?";
  if (!confirm(aviso)) return;
  try { await api("POST", "api/logout"); } catch (e) {}
  // apaga os dados deste usuário do celular
  ls.del(chaveRascunho()); ls.del(chaveHist()); ls.del(USUARIO_KEY);
  usuario = null; servidor = false; pedidos = [];
  $("loginUsuario").value = "";
  mostrarLogin();
});

// ---------- Usuários (administrador) ----------
async function carregarUsuarios() {
  const ul = $("listaUsuarios");
  ul.innerHTML = `<li class="nada">Carregando...</li>`;
  try {
    const lista = await api("GET", "api/usuarios");
    ul.innerHTML = "";
    lista.forEach((u) => {
      const li = document.createElement("li");
      const eu = u.id === usuario.id;
      li.innerHTML = `
        <div class="u-info">
          <b>${esc(u.nome || u.usuario)}</b>${u.admin ? ' <span class="tag">admin</span>' : ""}${eu ? ' <span class="tag">você</span>' : ""}
          <small>${esc(u.usuario)} · ${u.pedidos} pedido(s)</small>
        </div>
        <div class="u-acoes">
          <button type="button" class="btn sm" data-a="senha">Senha</button>
          ${eu ? "" : `<button type="button" class="btn sm perigo" data-a="excluir">Excluir</button>`}
        </div>`;
      li.querySelector('[data-a="senha"]').onclick = async () => {
        const nova = prompt(`Nova senha para "${u.usuario}" (mín. 6 caracteres):`);
        if (nova === null) return;
        try { await api("PUT", "api/usuarios/" + u.id, { senha: nova }); toast("Senha alterada ✔"); }
        catch (err) { toast(err.status ? err.message : "Sem conexão com o servidor"); }
      };
      const ex = li.querySelector('[data-a="excluir"]');
      if (ex) ex.onclick = async () => {
        if (!confirm(`Excluir o usuário "${u.usuario}"? Os ${u.pedidos} pedido(s) dele também serão apagados. Isso não pode ser desfeito.`)) return;
        try { await api("DELETE", "api/usuarios/" + u.id); toast("Usuário excluído"); carregarUsuarios(); }
        catch (err) { toast(err.status ? err.message : "Sem conexão com o servidor"); }
      };
      ul.appendChild(li);
    });
  } catch (err) {
    ul.innerHTML = `<li class="nada">${err.status ? esc(err.message) : "Sem conexão com o servidor."}</li>`;
  }
}

$("btnUsuarios").addEventListener("click", () => {
  $("dlgConta").close();
  $("dlgUsuarios").showModal();
  carregarUsuarios();
});
$("btnFecharUsuarios").addEventListener("click", () => $("dlgUsuarios").close());

$("formNovoUsuario").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await api("POST", "api/usuarios", {
      nome: $("nuNome").value, usuario: $("nuUsuario").value,
      senha: $("nuSenha").value, admin: $("nuAdmin").checked,
    });
    toast(`Usuário "${$("nuUsuario").value.trim().toLowerCase()}" criado ✔`);
    $("formNovoUsuario").reset();
    carregarUsuarios();
  } catch (err) {
    toast(err.status ? err.message : "Sem conexão com o servidor");
  }
});

// Envia pedidos pendentes, baixa todos do banco e sincroniza a lista de cores.
function sincronizar() {
  if (!servidor) return Promise.resolve();
  if (sincronizando) return sincronizando;
  sincronizando = (async () => {
    try {
      const pendentes = pedidos.filter((p) => !p.salvo);
      if (pendentes.length) {
        await api("POST", "api/pedidos", { pedidos: pendentes.map(semMarcas) });
        pendentes.forEach((p) => (p.salvo = true));
      }
      const remotos = await api("GET", "api/pedidos");
      const ainda = pedidos.filter((p) => !p.salvo);
      pedidos = [...remotos.map((p) => ({ ...p, salvo: true })), ...ainda];
      salvarHistorico();

      const { cores } = await api("GET", "api/cores");
      if (Array.isArray(cores) && cores.length) {
        ultimasCoresEnviadas = JSON.stringify(cores);
        state.cores = cores;
        salvar();
        if (document.body.dataset.tab === "pedido") render();
      } else {
        ultimasCoresEnviadas = null;
        salvar(); // banco ainda sem cores: envia as deste celular
      }
    } catch (e) {
      if (e.message !== "sem-sessao") console.warn("Sincronização falhou:", e);
    } finally {
      sincronizando = null;
      atualizarStatus();
      const aba = document.body.dataset.tab;
      if (aba === "historico") renderHistorico();
      if (aba === "estatisticas") renderEstatisticas();
    }
  })();
  return sincronizando;
}

function enviarCoresSeMudou(cores) {
  if (!servidor) return;
  const json = JSON.stringify(cores);
  if (json === ultimasCoresEnviadas) return;
  clearTimeout(timerCores);
  timerCores = setTimeout(async () => {
    try {
      await api("PUT", "api/cores", { cores });
      ultimasCoresEnviadas = json;
    } catch (e) { console.warn("Não foi possível enviar as cores:", e); }
  }, 800);
}

const semMarcas = ({ salvo, ...p }) => p;

function atualizarStatus() {
  const el = $("statusDados");
  if (!el) return;
  const pend = pedidos.filter((p) => !p.salvo).length;
  if (!servidor) {
    el.textContent = "Os pedidos ficam guardados só neste celular. Faça um backup de vez em quando para não perder nada.";
  } else if (pend) {
    el.textContent = `${pend} pedido(s) aguardando internet para ir ao servidor. Eles já estão guardados neste celular.`;
  } else {
    el.textContent = "Pedidos guardados no servidor. Só você vê os seus pedidos, de qualquer celular em que entrar.";
  }
}

// Quando a internet volta ou o app volta para a frente: reconecta e sincroniza.
async function aoVoltar() {
  if (!state || !$("telaLogin").hidden) return;
  if (servidor) return sincronizar();
  const r = await conectar();
  if (r === "ok") sincronizar();
  else if (r === "login" && usuario) mostrarLogin("Sua sessão terminou. Entre de novo.");
}
window.addEventListener("online", aoVoltar);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") aoVoltar();
});

// ================= Utilidades =================
// Lê número digitado no formato brasileiro ("1.234,5") ou com ponto ("12.5").
function lerNumero(s) {
  s = String(s ?? "").trim().replace(/\s|R\$/g, "");
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
const brl = (n) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const kg = (n) => n.toLocaleString("pt-BR", { maximumFractionDigits: 3 }) + " kg";
const numBR = (n) => (n == null ? "" : n.toLocaleString("pt-BR", { maximumFractionDigits: 3 }));

// Resumo financeiro de um pedido (valores ausentes ficam null).
function resumoFin(p) {
  const f = p.fin || {};
  const kgP = f.kgPalito ?? null, vp = f.valorPalito ?? null, vd = f.valorDias ?? null;
  const unDias = somaItens(p.dias);
  const total = vp == null && vd == null ? null : (vp || 0) + (vd || 0);
  return {
    kg: kgP, vp, vd, total, unDias,
    porKg: vp != null && kgP ? vp / kgP : null,
    porUn: vd != null && unDias ? vd / unDias : null,
  };
}

function htmlResumoFin(r) {
  const partes = [];
  if (r.kg != null || r.vp != null) {
    partes.push(`<div><span>Palito</span><b>${[r.kg != null ? kg(r.kg) : "", r.vp != null ? brl(r.vp) : ""].filter(Boolean).join(" · ")}</b>${r.porKg != null ? `<small>${brl(r.porKg)}/kg</small>` : ""}</div>`);
  }
  if (r.vd != null) {
    partes.push(`<div><span>7 Dias</span><b>${r.unDias} un · ${brl(r.vd)}</b>${r.porUn != null ? `<small>${brl(r.porUn)}/un</small>` : ""}</div>`);
  }
  if (r.total != null) partes.push(`<div class="fin-total"><span>Total</span><b>${brl(r.total)}</b></div>`);
  return partes.join("");
}
const somaItens = (l) => l.reduce((a, [, n]) => a + n, 0);
const cssDaCor = (nome) => (state.cores.find((c) => c.nome === nome) || {}).css || COR_EXTRA;
const pad = (n) => String(n).padStart(2, "0");

function formatarData(iso, comHora) {
  const d = new Date(iso);
  const s = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  return comHora ? `${s} ${pad(d.getHours())}:${pad(d.getMinutes())}` : s;
}

function nomeArquivo(ext, iso) {
  const d = iso ? new Date(iso) : new Date();
  return `pedido-velas-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.${ext}`;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

let toastTimer;
function toast(msg) {
  const t = $("toast");
  // se houver uma janela aberta, o aviso precisa ficar dentro dela para aparecer por cima
  const dlg = document.querySelector("dialog[open]");
  (dlg || document.body).appendChild(t);
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 2400);
}

async function entregar(blob, nome) {
  // No celular, abre o menu de compartilhar (WhatsApp, e-mail, Drive...).
  const file = new File([blob], nome, { type: blob.type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: nome }); return; }
    catch (e) { if (e.name === "AbortError") return; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ================= Abas =================
function mostrarAba(nome) {
  document.body.dataset.tab = nome;
  document.querySelectorAll(".tabs button").forEach((b) =>
    b.setAttribute("aria-selected", String(b.dataset.tab === nome)));
  document.querySelectorAll(".tab-panel").forEach((p) => (p.hidden = p.id !== "tab-" + nome));
  if (nome === "historico") renderHistorico();
  if (nome === "estatisticas") renderEstatisticas();
  window.scrollTo(0, 0);
}
document.querySelectorAll(".tabs button").forEach((b) =>
  b.addEventListener("click", () => mostrarAba(b.dataset.tab)));

// altura do cabeçalho para o título da tabela grudar logo abaixo
const topbar = $("topbar");
new ResizeObserver(() =>
  document.documentElement.style.setProperty("--header-h", topbar.offsetHeight + "px")
).observe(topbar);

// ================= Aba Pedido =================
const lista = $("lista");

function render() {
  lista.innerHTML = "";
  state.cores.forEach((cor) => {
    const q = state.qtd[cor.nome] || {};
    const li = document.createElement("li");
    li.className = "item";
    li.innerHTML = `
      <div class="cor">
        <span class="swatch" style="background:${cor.css}"></span>
        <span class="nome"></span>
        <span class="mini-acoes">
          <button type="button" class="mini editar" title="Editar nome" aria-label="Editar nome">✎</button>
          <button type="button" class="mini remover" title="Remover cor" aria-label="Remover cor">✕</button>
        </span>
      </div>
      <input type="number" inputmode="numeric" min="0" step="1" data-tipo="palito" aria-label="Palito ${esc(cor.nome)}" placeholder="0">
      <input type="number" inputmode="numeric" min="0" step="1" data-tipo="dias" aria-label="7 Dias ${esc(cor.nome)}" placeholder="0">
    `;
    li.querySelector(".nome").textContent = cor.nome;
    li.querySelectorAll("input").forEach((inp) => {
      const v = q[inp.dataset.tipo];
      if (v) inp.value = v;
      inp.addEventListener("input", () => {
        const n = Math.max(0, parseInt(inp.value, 10) || 0);
        state.qtd[cor.nome] = state.qtd[cor.nome] || {};
        state.qtd[cor.nome][inp.dataset.tipo] = n;
        marcar(li, cor.nome);
        atualizarTotais();
        salvar(); // autosave
      });
      inp.addEventListener("focus", () => inp.select());
    });
    li.querySelector(".remover").addEventListener("click", () => {
      if (!confirm(`Remover a cor "${cor.nome}"?`)) return;
      state.cores = state.cores.filter((c) => c !== cor);
      delete state.qtd[cor.nome];
      salvar(); render();
      toast(`Cor "${cor.nome}" removida`);
    });
    li.querySelector(".editar").addEventListener("click", () => {
      const novo = (prompt("Novo nome da cor:", cor.nome) || "").trim();
      if (!novo || novo === cor.nome) return;
      if (state.cores.some((c) => c !== cor && c.nome.toLowerCase() === novo.toLowerCase())) {
        return toast("Já existe uma cor com esse nome");
      }
      if (state.qtd[cor.nome]) {
        state.qtd[novo] = state.qtd[cor.nome];
        delete state.qtd[cor.nome];
      }
      cor.nome = novo;
      salvar(); render();
      toast("Nome alterado");
    });
    marcar(li, cor.nome);
    lista.appendChild(li);
  });
  atualizarTotais();
}

function marcar(li, nome) {
  const q = state.qtd[nome] || {};
  li.classList.toggle("filled", (q.palito || 0) + (q.dias || 0) > 0);
}

function itens(tipo) {
  return state.cores
    .map((c) => [c.nome, (state.qtd[c.nome] || {})[tipo] || 0])
    .filter(([, n]) => n > 0);
}

function atualizarTotais() {
  $("totals").textContent =
    `Palito: ${somaItens(itens("palito"))} · 7 Dias: ${somaItens(itens("dias"))}`;
  $("finResumo").innerHTML = htmlResumoFin(resumoFin({ dias: itens("dias"), fin: finAtual() }));
}

function finAtual() {
  const f = {
    kgPalito: lerNumero(state.fin.kg),
    valorPalito: lerNumero(state.fin.vp),
    valorDias: lerNumero(state.fin.vd),
  };
  return Object.values(f).some((v) => v != null) ? f : null;
}

function pedidoAtual() {
  const original = state.editando && pedidos.find((p) => p.id === state.editando);
  return {
    data: original ? original.data : new Date().toISOString(),
    nome: state.nome.trim(),
    cliente: state.cliente.trim(),
    obs: state.obs.trim(),
    palito: itens("palito"),
    dias: itens("dias"),
    fin: finAtual(),
  };
}

// Limpa o formulário para um pedido novo (o cliente fica, pois costuma ser o mesmo).
function novoFormulario() {
  state.qtd = {}; state.obs = ""; state.nome = "";
  state.fin = { kg: "", vp: "", vd: "" };
  state.editando = null;
  preencherCampos();
  salvar(); render();
}

function preencherCampos() {
  $("nomePedido").value = state.nome;
  $("cliente").value = state.cliente;
  $("obs").value = state.obs;
  $("finKg").value = state.fin.kg;
  $("finVp").value = state.fin.vp;
  $("finVd").value = state.fin.vd;
  const ed = state.editando && pedidos.find((p) => p.id === state.editando);
  if (state.editando && !ed && pedidos.length) state.editando = null; // pedido sumiu
  $("avisoEdicao").hidden = !state.editando;
  $("edicaoData").textContent = ed ? formatarData(ed.data, true) + (ed.nome ? ` (${ed.nome})` : "") : "";
  $("btnGuardar").textContent = state.editando ? "Salvar" : "Guardar";
}

function temItens() {
  if (itens("palito").length || itens("dias").length) return true;
  toast("Preencha pelo menos uma quantidade");
  return false;
}

function guardarPedido() {
  if (!temItens()) return;
  const p = pedidoAtual();
  const editando = state.editando;
  const antes = pedidos;
  if (editando) {
    p.id = editando;
    p.salvo = false;
    pedidos = pedidos.map((x) => (x.id === editando ? p : x));
  } else {
    p.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    p.salvo = false; // ainda não foi para o servidor
    pedidos = [...pedidos, p];
  }
  if (!salvarHistorico()) { pedidos = antes; return; }
  novoFormulario();
  if (editando) {
    mostrarAba("historico");
    toast("Alterações salvas ✔");
  } else {
    toast("Pedido guardado no Histórico ✔");
  }
  sincronizar().then(() => {
    if (servidor && !p.salvo) toast("Sem internet: o pedido será enviado depois");
  });
}

// ================= Exportar =================
async function exportarPdf(p) {
  if (!window.jspdf) return toast("Biblioteca de PDF não carregou (sem internet?)");
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const larg = doc.internal.pageSize.getWidth();

  doc.setFontSize(18);
  doc.text("Pedido de Velas", 14, 18);
  doc.setFontSize(11);
  let y = 26;
  doc.text(`Data: ${formatarData(p.data)}`, 14, y);
  if (p.nome) { y += 6; doc.text(`Pedido: ${p.nome}`, 14, y); }
  if (p.cliente) { y += 6; doc.text(`Cliente: ${p.cliente}`, 14, y); }
  if (p.obs) { y += 6; doc.text(doc.splitTextToSize(`Obs.: ${p.obs}`, larg - 28), 14, y); y += 6; }

  const meia = (larg - 28 - 6) / 2;
  const opts = (titulo, linhas, x) => ({
    startY: y + 6,
    margin: { left: x },
    tableWidth: meia,
    head: [[titulo, "Qtd"]],
    body: linhas.length ? linhas : [["—", ""]],
    foot: [["Total", String(somaItens(linhas))]],
    theme: "grid",
    headStyles: { fillColor: [91, 42, 134] },
    footStyles: { fillColor: [235, 228, 243], textColor: 20 },
    columnStyles: { 1: { halign: "center", cellWidth: 18 } },
  });
  doc.autoTable(opts("Velas Palito", p.palito, 14));
  const fimEsq = doc.lastAutoTable.finalY;
  doc.autoTable(opts("Velas 7 Dias", p.dias, 14 + meia + 6));

  const r = resumoFin(p);
  if (r.total != null || r.kg != null) {
    const linhas = [];
    if (r.kg != null) linhas.push(["KG de palito", kg(r.kg)]);
    if (r.vp != null) linhas.push(["Valor palito", brl(r.vp) + (r.porKg != null ? `  (${brl(r.porKg)}/kg)` : "")]);
    if (r.vd != null) linhas.push(["Valor 7 Dias", brl(r.vd) + (r.porUn != null ? `  (${brl(r.porUn)}/un)` : "")]);
    if (r.total != null) linhas.push(["Valor total", brl(r.total)]);
    doc.autoTable({
      startY: Math.max(fimEsq, doc.lastAutoTable.finalY) + 8,
      margin: { left: 14 },
      tableWidth: meia,
      head: [["Financeiro", ""]],
      body: linhas,
      theme: "grid",
      headStyles: { fillColor: [91, 42, 134] },
      columnStyles: { 1: { halign: "right" } },
    });
  }

  await entregar(doc.output("blob"), nomeArquivo("pdf", p.data));
}

function abaExcel(linhas, extras = []) {
  const ws = XLSX.utils.aoa_to_sheet([["Cor", "Quantidade"], ...linhas, [], ["Total", somaItens(linhas)], ...extras]);
  ws["!cols"] = [{ wch: 24 }, { wch: 12 }];
  return ws;
}

function blobExcel(wb) {
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

async function exportarExcel(p) {
  if (!window.XLSX) return toast("Biblioteca do Excel não carregou (sem internet?)");
  const wb = XLSX.utils.book_new();
  const r = resumoFin(p);
  const extP = [], extD = [];
  if (r.kg != null) extP.push(["KG", r.kg]);
  if (r.vp != null) extP.push(["Valor (R$)", r.vp]);
  if (r.porKg != null) extP.push(["R$ por kg", Math.round(r.porKg * 100) / 100]);
  if (r.vd != null) extD.push(["Valor (R$)", r.vd]);
  if (r.porUn != null) extD.push(["R$ por unidade", Math.round(r.porUn * 100) / 100]);
  XLSX.utils.book_append_sheet(wb, abaExcel(p.palito, extP), "Palito");
  XLSX.utils.book_append_sheet(wb, abaExcel(p.dias, extD), "7 Dias");
  await entregar(blobExcel(wb), nomeArquivo("xlsx", p.data));
}

async function exportarExcelTodos() {
  if (!pedidos.length) return toast("Nenhum pedido guardado");
  if (!window.XLSX) return toast("Biblioteca do Excel não carregou (sem internet?)");
  const ordem = [...pedidos].sort((a, b) => a.data.localeCompare(b.data));
  const resumo = [["Data", "Nome", "Cliente", "Observações", "Palito (un)", "7 Dias (un)",
    "KG palito", "Valor palito (R$)", "R$/kg", "Valor 7 Dias (R$)", "R$/un 7 Dias", "Valor total (R$)"]];
  const detalhe = [["Data", "Nome", "Cliente", "Tipo", "Cor", "Quantidade"]];
  const v = (n) => (n == null ? "" : Math.round(n * 100) / 100);
  ordem.forEach((p) => {
    const d = formatarData(p.data, true);
    const r = resumoFin(p);
    resumo.push([d, p.nome || "", p.cliente || "", p.obs || "", somaItens(p.palito), somaItens(p.dias),
      r.kg ?? "", v(r.vp), v(r.porKg), v(r.vd), v(r.porUn), v(r.total)]);
    p.palito.forEach(([c, n]) => detalhe.push([d, p.nome || "", p.cliente || "", "Palito", c, n]));
    p.dias.forEach(([c, n]) => detalhe.push([d, p.nome || "", p.cliente || "", "7 Dias", c, n]));
  });
  const wb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.aoa_to_sheet(resumo);
  ws1["!cols"] = [{ wch: 17 }, { wch: 20 }, { wch: 20 }, { wch: 24 }, { wch: 10 }, { wch: 10 },
    { wch: 9 }, { wch: 16 }, { wch: 8 }, { wch: 16 }, { wch: 12 }, { wch: 15 }];
  const ws2 = XLSX.utils.aoa_to_sheet(detalhe);
  ws2["!cols"] = [{ wch: 17 }, { wch: 20 }, { wch: 20 }, { wch: 8 }, { wch: 22 }, { wch: 11 }];
  XLSX.utils.book_append_sheet(wb, ws1, "Pedidos");
  XLSX.utils.book_append_sheet(wb, ws2, "Itens");
  await entregar(blobExcel(wb), "historico-pedidos-velas.xlsx");
}

// ================= Texto para WhatsApp =================
function textoPedido(p) {
  const bloco = (titulo, linhas) => linhas.length
    ? `${titulo}:\n${linhas.map(([c, n]) => `${c} - ${n}`).join("\n")}`
    : "";
  return [bloco("Velas Palito", p.palito), bloco("Velas 7 Dias", p.dias)].filter(Boolean).join("\n\n");
}

function abrirTexto(p) {
  $("txtPedido").value = textoPedido(p);
  $("btnCompartilharTexto").hidden = !navigator.share;
  $("dlgTexto").showModal();
}

async function copiarTexto() {
  const txt = $("txtPedido");
  try {
    await navigator.clipboard.writeText(txt.value);
  } catch (e) {
    txt.select(); document.execCommand("copy"); // navegadores antigos
  }
  toast("Texto copiado! Agora é só colar no WhatsApp");
}

$("btnCopiarTexto").addEventListener("click", copiarTexto);
$("btnFecharTexto").addEventListener("click", () => $("dlgTexto").close());
$("btnCompartilharTexto").addEventListener("click", async () => {
  try { await navigator.share({ text: $("txtPedido").value }); } catch (e) {}
});
$("dlgTexto").addEventListener("click", (e) => { if (e.target.id === "dlgTexto") e.target.close(); });

// ================= Aba Histórico =================
function renderHistorico() {
  const ul = $("historico");
  ul.innerHTML = "";
  const termo = normalizar($("busca").value.trim());
  const lista = [...pedidos]
    .sort((a, b) => b.data.localeCompare(a.data))
    .filter((p) => !termo || normalizar(
      [p.nome, p.cliente, p.obs, formatarData(p.data, true), ...p.palito.map((i) => i[0]), ...p.dias.map((i) => i[0])].join(" ")
    ).includes(termo));
  $("histVazio").hidden = lista.length > 0;
  $("histVazio").innerHTML = pedidos.length
    ? "Nenhum pedido encontrado."
    : "Nenhum pedido guardado ainda.<br>Preencha um pedido e toque em <b>Guardar</b>.";
  lista.forEach((p) => {
    const tp = somaItens(p.palito), td = somaItens(p.dias);
    const rf = resumoFin(p);
    const linhas = (l) => l.length
      ? l.map(([c, n]) => `<li><span class="swatch sm" style="background:${cssDaCor(c)}"></span><span>${esc(c)}</span><b>${n}</b></li>`).join("")
      : `<li class="nada">—</li>`;
    const li = document.createElement("li");
    li.innerHTML = `
      <details class="pedido">
        <summary>
          <div class="p-info">
            ${p.nome ? `<div class="p-nome">${esc(p.nome)}</div>` : ""}
            <div class="${p.nome ? "p-sub" : "p-data"}">${formatarData(p.data, true)}</div>
            ${p.cliente ? `<div class="p-sub">${esc(p.cliente)}</div>` : ""}
          </div>
          <div class="p-tot">
            Palito <b>${tp}</b> · 7 Dias <b>${td}</b>
            ${rf.total != null ? `<div class="p-valor">${brl(rf.total)}</div>` : ""}
          </div>
        </summary>
        ${p.obs ? `<p class="p-obs">Obs.: ${esc(p.obs)}</p>` : ""}
        <div class="p-colunas">
          <div><h3>Palito</h3><ul>${linhas(p.palito)}</ul></div>
          <div><h3>7 Dias</h3><ul>${linhas(p.dias)}</ul></div>
        </div>
        ${rf.total != null || rf.kg != null ? `<div class="fin-resumo p-fin">${htmlResumoFin(rf)}</div>` : ""}
        <div class="p-acoes">
          <button type="button" class="btn sm" data-a="texto">Texto</button>
          <button type="button" class="btn sm" data-a="pdf">PDF</button>
          <button type="button" class="btn sm" data-a="excel">Excel</button>
          <button type="button" class="btn sm" data-a="editar">Editar</button>
          <button type="button" class="btn sm" data-a="repetir">Repetir</button>
          <button type="button" class="btn sm perigo" data-a="excluir">Excluir</button>
        </div>
      </details>`;
    li.querySelector('[data-a="texto"]').onclick = () => abrirTexto(p);
    li.querySelector('[data-a="pdf"]').onclick = () => exportarPdf(p);
    li.querySelector('[data-a="excel"]').onclick = () => exportarExcel(p);
    li.querySelector('[data-a="repetir"]').onclick = () => repetirPedido(p);
    li.querySelector('[data-a="editar"]').onclick = () => editarPedido(p);
    li.querySelector('[data-a="excluir"]').onclick = async () => {
      if (!confirm(`Excluir o pedido de ${formatarData(p.data, true)}? Isso não pode ser desfeito.`)) return;
      if (servidor && p.salvo) {
        try { await api("DELETE", "api/pedidos/" + encodeURIComponent(p.id)); }
        catch (e) { return toast("Sem conexão com o servidor. Tente de novo."); }
      }
      pedidos = pedidos.filter((x) => x.id !== p.id);
      if (state.editando === p.id) novoFormulario();
      salvarHistorico(); renderHistorico();
      toast("Pedido excluído");
    };
    ul.appendChild(li);
  });
}

const normalizar = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

function formularioTemDados() {
  return itens("palito").length || itens("dias").length || state.editando;
}

function copiarQuantidades(p) {
  state.qtd = {};
  const add = (tipo) => p[tipo].forEach(([c, n]) => {
    if (!state.cores.some((x) => x.nome === c)) state.cores.push({ nome: c, css: COR_EXTRA });
    state.qtd[c] = state.qtd[c] || {};
    state.qtd[c][tipo] = n;
  });
  add("palito"); add("dias");
}

function repetirPedido(p) {
  if (formularioTemDados() &&
      !confirm("Substituir o pedido que está sendo preenchido por uma cópia deste?")) return;
  novoFormulario();
  copiarQuantidades(p);
  state.nome = p.nome || "";
  preencherCampos();
  salvar(); render();
  mostrarAba("pedido");
  toast("Quantidades copiadas para um pedido novo");
}

function editarPedido(p) {
  if (state.editando !== p.id && formularioTemDados() &&
      !confirm("Substituir o pedido que está sendo preenchido pela edição deste?")) return;
  copiarQuantidades(p);
  const f = p.fin || {};
  state.nome = p.nome || "";
  state.cliente = p.cliente || "";
  state.obs = p.obs || "";
  state.fin = { kg: numBR(f.kgPalito), vp: numBR(f.valorPalito), vd: numBR(f.valorDias) };
  state.editando = p.id;
  preencherCampos();
  salvar(); render();
  mostrarAba("pedido");
}

function fazerBackup() {
  if (!pedidos.length) return toast("Nenhum pedido guardado");
  const dados = { app: "pedido-velas", versao: 1, criadoEm: new Date().toISOString(), pedidos: pedidos.map(semMarcas) };
  const blob = new Blob([JSON.stringify(dados, null, 1)], { type: "application/json" });
  entregar(blob, `backup-pedidos-velas-${nomeArquivo("json").slice(13)}`);
}

$("arquivoBackup").addEventListener("change", async (e) => {
  const f = e.target.files[0];
  e.target.value = "";
  if (!f) return;
  try {
    const dados = JSON.parse(await f.text());
    const lidos = Array.isArray(dados) ? dados : dados.pedidos;
    if (!Array.isArray(lidos)) throw new Error();
    const validos = lidos.filter((p) => p && p.id && p.data && Array.isArray(p.palito) && Array.isArray(p.dias));
    const ids = new Set(pedidos.map((p) => p.id));
    const novos = validos.filter((p) => !ids.has(p.id));
    if (!novos.length) return toast("Nenhum pedido novo nesse backup");
    if (!confirm(`Adicionar ${novos.length} pedido(s) do backup ao histórico?`)) return;
    pedidos.push(...novos.map((p) => ({ ...semMarcas(p), salvo: false })));
    salvarHistorico(); renderHistorico();
    toast(`${novos.length} pedido(s) restaurado(s)`);
    sincronizar();
  } catch (err) {
    toast("Arquivo de backup inválido");
  }
});

// ================= Aba Estatísticas =================
let rankTipo = "todos";

function mesesDoPeriodo(periodo) {
  const hoje = new Date();
  let ini, fim = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  if (periodo === "ano") ini = new Date(hoje.getFullYear(), 0, 1);
  else if (periodo === "anoPassado") {
    ini = new Date(hoje.getFullYear() - 1, 0, 1);
    fim = new Date(hoje.getFullYear() - 1, 11, 1);
  } else if (periodo === "tudo" && pedidos.length) {
    const primeiro = new Date(pedidos.reduce((m, p) => (p.data < m ? p.data : m), pedidos[0].data));
    ini = new Date(primeiro.getFullYear(), primeiro.getMonth(), 1);
  } else ini = new Date(hoje.getFullYear(), hoje.getMonth() - 11, 1);
  const meses = [];
  for (let d = new Date(ini); d <= fim; d.setMonth(d.getMonth() + 1)) {
    meses.push({ chave: `${d.getFullYear()}-${pad(d.getMonth() + 1)}`, mes: d.getMonth(), ano: d.getFullYear() });
  }
  return meses;
}

const chaveMes = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };

function renderEstatisticas() {
  const meses = mesesDoPeriodo($("periodo").value);
  const chaves = new Set(meses.map((m) => m.chave));
  const doPeriodo = pedidos.filter((p) => chaves.has(chaveMes(p.data)));

  const totP = doPeriodo.reduce((a, p) => a + somaItens(p.palito), 0);
  const totD = doPeriodo.reduce((a, p) => a + somaItens(p.dias), 0);
  const media = doPeriodo.length ? Math.round((totP + totD) / doPeriodo.length) : 0;
  $("tiles").innerHTML = [
    ["Pedidos", doPeriodo.length],
    ["Velas Palito", totP],
    ["Velas 7 Dias", totD],
    ["Média de velas por pedido", media],
  ].map(([r, v]) => `<div class="tile"><div class="tile-v">${v.toLocaleString("pt-BR")}</div><div class="tile-r">${r}</div></div>`).join("");

  // ---- financeiro ----
  let gastoP = 0, gastoD = 0, kgTot = 0, comValor = 0;
  let vpComKg = 0, kgComValor = 0, vdComUn = 0, unComValor = 0;
  doPeriodo.forEach((p) => {
    const r = resumoFin(p);
    if (r.total != null) comValor++;
    gastoP += r.vp || 0; gastoD += r.vd || 0; kgTot += r.kg || 0;
    if (r.porKg != null) { vpComKg += r.vp; kgComValor += r.kg; }
    if (r.porUn != null) { vdComUn += r.vd; unComValor += r.unDias; }
  });
  const tile = (v, r) => `<div class="tile"><div class="tile-v money">${v}</div><div class="tile-r">${r}</div></div>`;
  $("tilesFin").innerHTML = comValor || kgTot
    ? [
        tile(brl(gastoP + gastoD), "Gasto total"),
        tile(comValor ? brl((gastoP + gastoD) / comValor) : "—", "Média por pedido"),
        tile(brl(gastoP), "Gasto com palito"),
        tile(brl(gastoD), "Gasto com 7 Dias"),
        tile(kg(kgTot), "KG de palito"),
        tile(kgComValor ? brl(vpComKg / kgComValor) : "—", "Preço médio do kg"),
        tile(unComValor ? brl(vdComUn / unComValor) : "—", "Preço médio da vela 7 Dias"),
        tile(String(comValor), "Pedidos com valor informado"),
      ].join("")
    : `<p class="ajuda tiles-vazio">Nenhum valor informado neste período. Preencha a parte <b>Financeiro</b> nos pedidos (dá para editar os já guardados).</p>`;

  const porMes = Object.fromEntries(meses.map((m) => [m.chave, { pedidos: 0, palito: 0, dias: 0, gp: 0, gd: 0 }]));
  doPeriodo.forEach((p) => {
    const m = porMes[chaveMes(p.data)];
    const r = resumoFin(p);
    m.pedidos++; m.palito += somaItens(p.palito); m.dias += somaItens(p.dias);
    m.gp += r.vp || 0; m.gd += r.vd || 0;
  });

  const moedaCurta = (n) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  graficoBarras($("chartGasto"), meses, [
    { cls: "s-palito", valores: meses.map((m) => porMes[m.chave].gp) },
    { cls: "s-dias", valores: meses.map((m) => porMes[m.chave].gd) },
  ], (m) => { const v = porMes[m.chave]; return `${nomeMes(m)}: Palito ${brl(v.gp)} · 7 Dias ${brl(v.gd)} · total ${brl(v.gp + v.gd)}`; },
  moedaCurta);

  graficoBarras($("chartPedidos"), meses, [{ cls: "s-pedidos", valores: meses.map((m) => porMes[m.chave].pedidos) }],
    (m, i) => { const n = porMes[m.chave].pedidos; return `${nomeMes(m)}: ${n} pedido${n === 1 ? "" : "s"}`; });

  graficoBarras($("chartVelas"), meses, [
    { cls: "s-palito", valores: meses.map((m) => porMes[m.chave].palito) },
    { cls: "s-dias", valores: meses.map((m) => porMes[m.chave].dias) },
  ], (m) => { const v = porMes[m.chave]; return `${nomeMes(m)}: Palito ${v.palito} · 7 Dias ${v.dias} · total ${v.palito + v.dias}`; });

  renderRanking(doPeriodo);
}

const nomeMes = (m) => `${MESES[m.mes]}/${m.ano}`;

// Barras verticais empilhadas. Toque numa barra para ver os números.
function graficoBarras(el, meses, series, texto, fmtEixo = (n) => n.toLocaleString("pt-BR")) {
  const totais = meses.map((_, i) => series.reduce((a, s) => a + s.valores[i], 0));
  const max = Math.max(1, ...totais);
  const vazio = totais.every((t) => t === 0);
  el.innerHTML = `
    <div class="chart">
      <div class="chart-eixo"><span>${vazio ? "" : fmtEixo(max)}</span><span>0</span></div>
      <div class="chart-area">
        <div class="bars">
          ${meses.map((m, i) => `
            <button type="button" class="bar-col" data-i="${i}" aria-label="${esc(texto(m, i))}">
              <span class="plot"><span class="stack" style="height:${(totais[i] / max) * 100}%">
                ${series.map((s) => s.valores[i] ? `<span class="seg ${s.cls}" style="flex-grow:${s.valores[i]}"></span>` : "").join("")}
              </span></span>
              <span class="bar-lbl">${MESES[m.mes]}${m.mes === 0 || i === 0 ? `<br><small>${String(m.ano).slice(2)}</small>` : ""}</span>
            </button>`).join("")}
        </div>
      </div>
    </div>
    <p class="chart-cap">${vazio ? "Sem pedidos neste período." : "Toque numa barra para ver os números."}</p>`;
  const cap = el.querySelector(".chart-cap");
  el.querySelectorAll(".bar-col").forEach((b) => b.addEventListener("click", () => {
    el.querySelectorAll(".bar-col.sel").forEach((x) => x.classList.remove("sel"));
    b.classList.add("sel");
    cap.textContent = texto(meses[+b.dataset.i], +b.dataset.i);
  }));
  // mostra o mês mais recente primeiro quando há muitos meses
  const area = el.querySelector(".chart-area");
  area.scrollLeft = area.scrollWidth;
}

function renderRanking(doPeriodo) {
  const cont = {}; // cor -> {palito, dias}
  const soma = (tipo) => (p) => p[tipo].forEach(([c, n]) => {
    cont[c] = cont[c] || { palito: 0, dias: 0 };
    cont[c][tipo] += n;
  });
  doPeriodo.forEach((p) => {
    if (rankTipo !== "dias") soma("palito")(p);
    if (rankTipo !== "palito") soma("dias")(p);
  });
  const top = Object.entries(cont)
    .map(([c, v]) => [c, v, v.palito + v.dias])
    .filter(([, , t]) => t > 0)
    .sort((a, b) => b[2] - a[2]).slice(0, 10);
  const max = top.length ? top[0][2] : 1;
  $("ranking").innerHTML = top.length
    ? top.map(([c, v, t]) => `
      <li title="Palito ${v.palito} · 7 Dias ${v.dias}">
        <span class="swatch sm" style="background:${cssDaCor(c)}"></span>
        <span class="r-nome">${esc(c)}</span>
        <span class="r-barra" style="width:${(t / max) * 100}%">
          ${v.palito ? `<span class="s-palito" style="flex-grow:${v.palito}"></span>` : ""}
          ${v.dias ? `<span class="s-dias" style="flex-grow:${v.dias}"></span>` : ""}
        </span>
        <b class="r-num">${t}</b>
      </li>`).join("")
    : `<li class="nada">Sem pedidos neste período.</li>`;
}

$("periodo").addEventListener("change", renderEstatisticas);
$("rankTipo").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
  rankTipo = b.dataset.tipo;
  $("rankTipo").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  renderEstatisticas();
}));

// ================= Eventos da aba Pedido =================
const ligarCampo = (id, ler) => $(id).addEventListener("input", (e) => { ler(e.target.value); salvar(); atualizarTotais(); });
ligarCampo("nomePedido", (v) => (state.nome = v));
ligarCampo("cliente", (v) => (state.cliente = v));
ligarCampo("obs", (v) => (state.obs = v));
ligarCampo("finKg", (v) => (state.fin.kg = v));
ligarCampo("finVp", (v) => (state.fin.vp = v));
ligarCampo("finVd", (v) => (state.fin.vd = v));

$("btnCancelarEdicao").addEventListener("click", () => {
  if (!confirm("Cancelar a edição? As alterações não salvas serão descartadas.")) return;
  novoFormulario();
  toast("Edição cancelada");
});

$("busca").addEventListener("input", renderHistorico);

$("addForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const inp = $("novaCor");
  const nome = inp.value.trim();
  if (!nome) return;
  if (state.cores.some((c) => c.nome.toLowerCase() === nome.toLowerCase())) {
    return toast("Essa cor já existe");
  }
  state.cores.push({ nome, css: COR_EXTRA });
  inp.value = "";
  salvar(); render();
  toast(`Cor "${nome}" adicionada`);
});

$("btnRestaurar").addEventListener("click", () => {
  if (!confirm("Voltar para a lista de cores original? Cores adicionadas ou renomeadas serão desfeitas.")) return;
  state.cores = coresPadrao();
  const nomes = new Set(state.cores.map((c) => c.nome));
  Object.keys(state.qtd).forEach((n) => { if (!nomes.has(n)) delete state.qtd[n]; });
  salvar(); render();
  toast("Lista de cores restaurada");
});

$("btnGuardar").addEventListener("click", guardarPedido);
$("btnTexto").addEventListener("click", () => temItens() && abrirTexto(pedidoAtual()));
$("btnPdf").addEventListener("click", () => temItens() && exportarPdf(pedidoAtual()));
$("btnExcel").addEventListener("click", () => temItens() && exportarExcel(pedidoAtual()));
$("btnLimpar").addEventListener("click", () => {
  if (!confirm("Zerar quantidades, nome, observações e financeiro?")) return;
  state.qtd = {}; state.obs = ""; state.nome = "";
  state.fin = { kg: "", vp: "", vd: "" };
  preencherCampos(); salvar(); render();
  toast("Pedido zerado");
});

$("btnExcelTodos").addEventListener("click", exportarExcelTodos);
$("btnBackup").addEventListener("click", fazerBackup);
$("btnRestaurarBackup").addEventListener("click", () => $("arquivoBackup").click());

iniciar();

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
