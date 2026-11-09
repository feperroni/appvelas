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

const STORAGE_KEY = "pedidoVelas.v1";

// state: { cores: [{nome, css, custom}], qtd: {nome: {palito, dias}}, cliente, obs }
let state = carregar();

function carregar() {
  let salvo = null;
  try { salvo = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (e) {}
  const extras = (salvo && salvo.extras) || [];
  return {
    cores: [
      ...CORES_PADRAO.map(([nome, css]) => ({ nome, css, custom: false })),
      ...extras.map((nome) => ({ nome, css: "#cccccc", custom: true })),
    ],
    qtd: (salvo && salvo.qtd) || {},
    cliente: (salvo && salvo.cliente) || "",
    obs: (salvo && salvo.obs) || "",
  };
}

function salvar(silencioso) {
  const dados = {
    extras: state.cores.filter((c) => c.custom).map((c) => c.nome),
    qtd: state.qtd,
    cliente: state.cliente,
    obs: state.obs,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(dados));
    if (!silencioso) toast("Pedido salvo ✔");
  } catch (e) {
    if (!silencioso) toast("Não foi possível salvar neste navegador");
  }
}

// ===== Render =====
const lista = document.getElementById("lista");

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
        ${cor.custom ? '<button class="remover" title="Remover cor" aria-label="Remover cor">✕</button>' : ""}
      </div>
      <input type="number" inputmode="numeric" min="0" step="1" data-tipo="palito" aria-label="Palito ${cor.nome}" placeholder="0">
      <input type="number" inputmode="numeric" min="0" step="1" data-tipo="dias" aria-label="7 Dias ${cor.nome}" placeholder="0">
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
        salvar(true); // autosave para não perder nada
      });
      inp.addEventListener("focus", () => inp.select());
    });
    const rm = li.querySelector(".remover");
    if (rm) rm.addEventListener("click", () => {
      if (!confirm(`Remover a cor "${cor.nome}"?`)) return;
      state.cores = state.cores.filter((c) => c !== cor);
      delete state.qtd[cor.nome];
      salvar(true); render();
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
  const soma = (t) => itens(t).reduce((a, [, n]) => a + n, 0);
  document.getElementById("totals").textContent =
    `Palito: ${soma("palito")} · 7 Dias: ${soma("dias")}`;
}

// ===== Exportar =====
function dataHoje() {
  return new Date().toLocaleDateString("pt-BR");
}
function nomeArquivo(ext) {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `pedido-velas-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.${ext}`;
}

function temItens() {
  if (itens("palito").length || itens("dias").length) return true;
  toast("Preencha pelo menos uma quantidade");
  return false;
}

async function entregar(blob, nome) {
  // No celular, abre o menu de compartilhar (WhatsApp, e-mail, Drive...).
  const file = new File([blob], nome, { type: blob.type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: nome });
      return;
    } catch (e) {
      if (e.name === "AbortError") return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function exportarPdf() {
  if (!temItens()) return;
  if (!window.jspdf) return toast("Biblioteca de PDF não carregou (sem internet?)");
  salvar(true);
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const larg = doc.internal.pageSize.getWidth();

  doc.setFontSize(18);
  doc.text("Pedido de Velas", 14, 18);
  doc.setFontSize(11);
  let y = 26;
  doc.text(`Data: ${dataHoje()}`, 14, y);
  if (state.cliente) { y += 6; doc.text(`Cliente: ${state.cliente}`, 14, y); }
  if (state.obs) { y += 6; doc.text(doc.splitTextToSize(`Obs.: ${state.obs}`, larg - 28), 14, y); y += 6; }

  const palito = itens("palito");
  const dias = itens("dias");
  const total = (l) => l.reduce((a, [, n]) => a + n, 0);
  const meia = (larg - 28 - 6) / 2;
  const opts = (titulo, linhas, x) => ({
    startY: y + 6,
    margin: { left: x },
    tableWidth: meia,
    head: [[titulo, "Qtd"]],
    body: linhas.length ? linhas : [["—", ""]],
    foot: [["Total", String(total(linhas))]],
    theme: "grid",
    headStyles: { fillColor: [91, 42, 134] },
    footStyles: { fillColor: [235, 228, 243], textColor: 20 },
    columnStyles: { 1: { halign: "center", cellWidth: 18 } },
  });
  doc.autoTable(opts("Velas Palito", palito, 14));
  doc.autoTable(opts("Velas 7 Dias", dias, 14 + meia + 6));

  await entregar(doc.output("blob"), nomeArquivo("pdf"));
}

async function exportarExcel() {
  if (!temItens()) return;
  if (!window.XLSX) return toast("Biblioteca do Excel não carregou (sem internet?)");
  salvar(true);
  const wb = XLSX.utils.book_new();
  const aba = (linhas) => {
    const total = linhas.reduce((a, [, n]) => a + n, 0);
    const ws = XLSX.utils.aoa_to_sheet([["Cor", "Quantidade"], ...linhas, [], ["Total", total]]);
    ws["!cols"] = [{ wch: 24 }, { wch: 12 }];
    return ws;
  };
  XLSX.utils.book_append_sheet(wb, aba(itens("palito")), "Palito");
  XLSX.utils.book_append_sheet(wb, aba(itens("dias")), "7 Dias");
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  await entregar(blob, nomeArquivo("xlsx"));
}

// ===== Eventos =====
let toastTimer;
function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 2200);
}

const cliente = document.getElementById("cliente");
const obs = document.getElementById("obs");
cliente.value = state.cliente;
obs.value = state.obs;
cliente.addEventListener("input", () => { state.cliente = cliente.value; salvar(true); });
obs.addEventListener("input", () => { state.obs = obs.value; salvar(true); });

document.getElementById("addForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const inp = document.getElementById("novaCor");
  const nome = inp.value.trim();
  if (!nome) return;
  if (state.cores.some((c) => c.nome.toLowerCase() === nome.toLowerCase())) {
    return toast("Essa cor já existe");
  }
  state.cores.push({ nome, css: "#cccccc", custom: true });
  inp.value = "";
  salvar(true); render();
  toast(`Cor "${nome}" adicionada`);
});

document.getElementById("btnSalvar").addEventListener("click", () => salvar(false));
document.getElementById("btnPdf").addEventListener("click", exportarPdf);
document.getElementById("btnExcel").addEventListener("click", exportarExcel);
document.getElementById("btnLimpar").addEventListener("click", () => {
  if (!confirm("Zerar todas as quantidades?")) return;
  state.qtd = {}; state.obs = ""; obs.value = "";
  salvar(true); render();
  toast("Quantidades zeradas");
});

render();

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
