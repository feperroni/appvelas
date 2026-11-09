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

const STORAGE_KEY = "pedidoVelas.v1";          // pedido em andamento + lista de cores
const HIST_KEY = "pedidoVelas.historico";      // pedidos guardados
const COR_EXTRA = "#cccccc";
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const $ = (id) => document.getElementById(id);

// ================= Estado =================
// state: { cores: [{nome, css}], qtd: {nome: {palito, dias}}, cliente, obs }
let state = carregar();
// pedidos: [{id, data: ISO, cliente, obs, palito: [[cor, qtd]], dias: [[cor, qtd]]}]
let pedidos = carregarHistorico();

function coresPadrao() {
  return CORES_PADRAO.map(([nome, css]) => ({ nome, css }));
}

function carregar() {
  let salvo = null;
  try { salvo = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (e) {}
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
    cliente: (salvo && salvo.cliente) || "",
    obs: (salvo && salvo.obs) || "",
  };
}

function salvar() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      cores: state.cores.map(({ nome, css }) => ({ nome, css })),
      qtd: state.qtd, cliente: state.cliente, obs: state.obs,
    }));
  } catch (e) {}
}

function carregarHistorico() {
  try {
    const h = JSON.parse(localStorage.getItem(HIST_KEY));
    return Array.isArray(h) ? h : [];
  } catch (e) { return []; }
}

function salvarHistorico() {
  try {
    localStorage.setItem(HIST_KEY, JSON.stringify(pedidos));
    return true;
  } catch (e) {
    toast("Não foi possível guardar neste navegador");
    return false;
  }
}

// ================= Utilidades =================
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
}

function pedidoAtual() {
  return {
    data: new Date().toISOString(),
    cliente: state.cliente.trim(),
    obs: state.obs.trim(),
    palito: itens("palito"),
    dias: itens("dias"),
  };
}

function temItens() {
  if (itens("palito").length || itens("dias").length) return true;
  toast("Preencha pelo menos uma quantidade");
  return false;
}

function guardarPedido() {
  if (!temItens()) return;
  const p = pedidoAtual();
  p.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  pedidos.push(p);
  if (!salvarHistorico()) { pedidos.pop(); return; }
  // começa um pedido novo (o cliente fica, pois costuma ser o mesmo)
  state.qtd = {}; state.obs = ""; $("obs").value = "";
  salvar(); render();
  toast("Pedido guardado no Histórico ✔");
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
  doc.autoTable(opts("Velas 7 Dias", p.dias, 14 + meia + 6));

  await entregar(doc.output("blob"), nomeArquivo("pdf", p.data));
}

function abaExcel(linhas) {
  const ws = XLSX.utils.aoa_to_sheet([["Cor", "Quantidade"], ...linhas, [], ["Total", somaItens(linhas)]]);
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
  XLSX.utils.book_append_sheet(wb, abaExcel(p.palito), "Palito");
  XLSX.utils.book_append_sheet(wb, abaExcel(p.dias), "7 Dias");
  await entregar(blobExcel(wb), nomeArquivo("xlsx", p.data));
}

async function exportarExcelTodos() {
  if (!pedidos.length) return toast("Nenhum pedido guardado");
  if (!window.XLSX) return toast("Biblioteca do Excel não carregou (sem internet?)");
  const ordem = [...pedidos].sort((a, b) => a.data.localeCompare(b.data));
  const resumo = [["Data", "Cliente", "Observações", "Palito", "7 Dias", "Total"]];
  const detalhe = [["Data", "Cliente", "Tipo", "Cor", "Quantidade"]];
  ordem.forEach((p) => {
    const d = formatarData(p.data, true);
    const tp = somaItens(p.palito), td = somaItens(p.dias);
    resumo.push([d, p.cliente || "", p.obs || "", tp, td, tp + td]);
    p.palito.forEach(([c, n]) => detalhe.push([d, p.cliente || "", "Palito", c, n]));
    p.dias.forEach(([c, n]) => detalhe.push([d, p.cliente || "", "7 Dias", c, n]));
  });
  const wb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.aoa_to_sheet(resumo);
  ws1["!cols"] = [{ wch: 17 }, { wch: 20 }, { wch: 28 }, { wch: 8 }, { wch: 8 }, { wch: 8 }];
  const ws2 = XLSX.utils.aoa_to_sheet(detalhe);
  ws2["!cols"] = [{ wch: 17 }, { wch: 20 }, { wch: 8 }, { wch: 22 }, { wch: 11 }];
  XLSX.utils.book_append_sheet(wb, ws1, "Pedidos");
  XLSX.utils.book_append_sheet(wb, ws2, "Itens");
  await entregar(blobExcel(wb), "historico-pedidos-velas.xlsx");
}

// ================= Aba Histórico =================
function renderHistorico() {
  const ul = $("historico");
  ul.innerHTML = "";
  $("histVazio").hidden = pedidos.length > 0;
  [...pedidos].sort((a, b) => b.data.localeCompare(a.data)).forEach((p) => {
    const tp = somaItens(p.palito), td = somaItens(p.dias);
    const linhas = (l) => l.length
      ? l.map(([c, n]) => `<li><span class="swatch sm" style="background:${cssDaCor(c)}"></span><span>${esc(c)}</span><b>${n}</b></li>`).join("")
      : `<li class="nada">—</li>`;
    const li = document.createElement("li");
    li.innerHTML = `
      <details class="pedido">
        <summary>
          <div>
            <div class="p-data">${formatarData(p.data, true)}</div>
            ${p.cliente ? `<div class="p-cliente">${esc(p.cliente)}</div>` : ""}
          </div>
          <div class="p-tot">Palito <b>${tp}</b> · 7 Dias <b>${td}</b></div>
        </summary>
        ${p.obs ? `<p class="p-obs">Obs.: ${esc(p.obs)}</p>` : ""}
        <div class="p-colunas">
          <div><h3>Palito</h3><ul>${linhas(p.palito)}</ul></div>
          <div><h3>7 Dias</h3><ul>${linhas(p.dias)}</ul></div>
        </div>
        <div class="p-acoes">
          <button type="button" class="btn sm" data-a="pdf">PDF</button>
          <button type="button" class="btn sm" data-a="excel">Excel</button>
          <button type="button" class="btn sm" data-a="repetir">Repetir</button>
          <button type="button" class="btn sm perigo" data-a="excluir">Excluir</button>
        </div>
      </details>`;
    li.querySelector('[data-a="pdf"]').onclick = () => exportarPdf(p);
    li.querySelector('[data-a="excel"]').onclick = () => exportarExcel(p);
    li.querySelector('[data-a="repetir"]').onclick = () => repetirPedido(p);
    li.querySelector('[data-a="excluir"]').onclick = () => {
      if (!confirm(`Excluir o pedido de ${formatarData(p.data, true)}? Isso não pode ser desfeito.`)) return;
      pedidos = pedidos.filter((x) => x !== p);
      salvarHistorico(); renderHistorico();
      toast("Pedido excluído");
    };
    ul.appendChild(li);
  });
}

function repetirPedido(p) {
  if ((itens("palito").length || itens("dias").length) &&
      !confirm("Substituir as quantidades do pedido atual por este?")) return;
  state.qtd = {};
  const add = (tipo) => p[tipo].forEach(([c, n]) => {
    if (!state.cores.some((x) => x.nome === c)) state.cores.push({ nome: c, css: COR_EXTRA });
    state.qtd[c] = state.qtd[c] || {};
    state.qtd[c][tipo] = n;
  });
  add("palito"); add("dias");
  salvar(); render();
  mostrarAba("pedido");
  toast("Quantidades copiadas para o pedido");
}

function fazerBackup() {
  if (!pedidos.length) return toast("Nenhum pedido guardado");
  const dados = { app: "pedido-velas", versao: 1, criadoEm: new Date().toISOString(), pedidos };
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
    pedidos.push(...novos);
    salvarHistorico(); renderHistorico();
    toast(`${novos.length} pedido(s) restaurado(s)`);
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

  const porMes = Object.fromEntries(meses.map((m) => [m.chave, { pedidos: 0, palito: 0, dias: 0 }]));
  doPeriodo.forEach((p) => {
    const m = porMes[chaveMes(p.data)];
    m.pedidos++; m.palito += somaItens(p.palito); m.dias += somaItens(p.dias);
  });

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
function graficoBarras(el, meses, series, texto) {
  const totais = meses.map((_, i) => series.reduce((a, s) => a + s.valores[i], 0));
  const max = Math.max(1, ...totais);
  const vazio = totais.every((t) => t === 0);
  el.innerHTML = `
    <div class="chart">
      <div class="chart-eixo"><span>${vazio ? "" : max}</span><span>0</span></div>
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
const cliente = $("cliente");
const obs = $("obs");
cliente.value = state.cliente;
obs.value = state.obs;
cliente.addEventListener("input", () => { state.cliente = cliente.value; salvar(); });
obs.addEventListener("input", () => { state.obs = obs.value; salvar(); });

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
$("btnPdf").addEventListener("click", () => temItens() && exportarPdf(pedidoAtual()));
$("btnExcel").addEventListener("click", () => temItens() && exportarExcel(pedidoAtual()));
$("btnLimpar").addEventListener("click", () => {
  if (!confirm("Zerar todas as quantidades?")) return;
  state.qtd = {}; state.obs = ""; obs.value = "";
  salvar(); render();
  toast("Quantidades zeradas");
});

$("btnExcelTodos").addEventListener("click", exportarExcelTodos);
$("btnBackup").addEventListener("click", fazerBackup);
$("btnRestaurarBackup").addEventListener("click", () => $("arquivoBackup").click());

render();

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
