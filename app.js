/* =========================
   Finanças PWA (MVP) - app.js
   - token via querystring
   - GET  ?action=list&limit=30&month=Janeiro&token=...
   - GET  ?action=totals&month=Janeiro&token=...
   - POST ?action=process&token=...
   - POST ?action=confirm&token=...
========================= */

const API_BASE = "https://noisy-flower-1665.luca02699.workers.dev";

const LS_TOKEN = "fin_api_token";
const LS_THEME = "fin_theme";
const LS_TAB = "fin_active_tab"; // reg | ana | his
const LS_MONTH = "fin_active_month"; // Janeiro..Dezembro

let pendingState = null;

const $ = (id) => document.getElementById(id);

// ---------- UI helpers ----------
function showToast(msg, type = "") {
  const el = $("toast");
  if (!el) return;
  el.style.display = msg ? "block" : "none";
  el.textContent = msg || "";
  el.classList.remove("ok", "err");
  if (type === "ok") el.classList.add("ok");
  if (type === "err") el.classList.add("err");
}

function showConfirmToast(msg, type = "") {
  const el = $("confirmToast");
  if (!el) return;
  el.style.display = msg ? "block" : "none";
  el.textContent = msg || "";
  el.classList.remove("ok", "err");
  if (type === "ok") el.classList.add("ok");
  if (type === "err") el.classList.add("err");
}

function setNetPill(online) {
  const el = $("netPill");
  if (!el) return;
  el.textContent = online ? "🟢 online" : "🔴 offline";
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function parseBRL(v) {
  if (typeof v === "number") return v;
  const s = String(v || "")
    .replace("R$", "")
    .replace(/\./g, "")
    .replace(",", ".")
    .trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function formatBRL(n) {
  const num = Number(n || 0);
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ---------- Token ----------
function getToken() {
  return localStorage.getItem(LS_TOKEN) || "";
}
function setToken(v) {
  localStorage.setItem(LS_TOKEN, String(v || "").trim());
}
function promptToken() {
  const cur = getToken();
  const next = prompt("Cole seu API_TOKEN (o mesmo do Apps Script):", cur);
  if (next == null) return;
  setToken(next);
  showToast("Token salvo ✅", "ok");
  refreshAll().catch(() => {});
}

// ---------- Theme ----------
function getTheme() {
  return localStorage.getItem(LS_THEME) || "dark";
}
function setTheme(theme) {
  localStorage.setItem(LS_THEME, theme);
  document.documentElement.dataset.theme = theme;
}
function toggleTheme() {
  setTheme(getTheme() === "dark" ? "light" : "dark");
}

// ---------- Month select ----------
function getCurrentMonthName() {
  const months = [
    "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
    "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"
  ];
  return months[new Date().getMonth()];
}
function getActiveMonth() {
  return localStorage.getItem(LS_MONTH) || getCurrentMonthName();
}
function setActiveMonth(m) {
  localStorage.setItem(LS_MONTH, m);
}

// ---------- Tabs (index: tab-registrar/tab-analise/tab-historico + view-registrar/view-analise/view-historico) ----------
function getActiveTab() {
  return localStorage.getItem(LS_TAB) || "reg";
}

function setActiveTab(tab) {
  localStorage.setItem(LS_TAB, tab);

  const map = {
    reg: { btn: "tab-registrar", view: "view-registrar" },
    ana: { btn: "tab-analise", view: "view-analise" },
    his: { btn: "tab-historico", view: "view-historico" }
  };

  Object.keys(map).forEach((k) => {
    const b = document.getElementById(map[k].btn);
    const v = document.getElementById(map[k].view);
    if (b) b.classList.toggle("active", k === tab);
    if (v) v.classList.toggle("show", k === tab);
  });

  // quando abrir Análise, atualiza KPIs
  if (tab === "ana") {
    refreshAnalysis(getActiveMonth()).catch(() => {});
  }
}

// ---------- API ----------
function buildUrl(action, params = {}) {
  const token = getToken().trim();
  const qs = new URLSearchParams({ action, token, ...params });
  return `${API_BASE}/?${qs.toString()}`;
}

async function apiGet(action, params = {}) {
  const url = buildUrl(action, params);
  const resp = await fetch(url);
  const text = await resp.text();
  try { return JSON.parse(text); }
  catch { return { ok: false, error: "Resposta inválida do servidor.", raw: text }; }
}

async function apiPost(action, body = {}) {
  const url = buildUrl(action);
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" }, // evita preflight
    body: JSON.stringify(body || {})
  });
  const text = await resp.text();
  try { return JSON.parse(text); }
  catch { return { ok: false, error: "Resposta inválida do servidor.", raw: text }; }
}

// ---------- Render list (Últimos lançamentos) ----------
function renderList(items = []) {
  const box = $("list");
  if (!box) return;

  if (!items.length) {
    box.innerHTML = `<div class="muted">—</div>`;
    return;
  }

  box.innerHTML = items.map(it => {
    const nome = escapeHtml(it.nome || "");
    const data = escapeHtml(it.data || "");
    const tipo = escapeHtml(it.tipo || "");
    const categoria = escapeHtml(it.categoria || "");
    const valor = escapeHtml(it.valor || "");
    const source = escapeHtml(it.source || "");

    const extra = it.extra
      ? `<div class="muted" style="margin-top:6px;">
           ${escapeHtml(it.extra.parcelas || "")}x • Total ${escapeHtml(it.extra.total || "")}
         </div>`
      : "";

    return `
      <div class="item">
        <div>
          <strong>${nome}</strong>
          <div class="muted">${data} • ${tipo} • ${categoria}</div>
          ${extra}
        </div>
        <div class="right">
          <div class="tag">${source}</div>
          <div style="margin-top:6px; font-weight:800;">${valor}</div>
        </div>
      </div>
    `;
  }).join("");
}

// ---------- Análise (usa action=totals) ----------
function renderAnalysisTotals(resTotals) {
  const month = resTotals?.month || "—";
  const t = resTotals?.totals || null;

  const monthLabel = document.getElementById("anaMonthLabel");
  if (monthLabel) monthLabel.textContent = month;

  if (!t) return;

  const elSaldo = document.getElementById("kpiSaldo");
  const elSaldoHint = document.getElementById("kpiSaldoHint");
  if (elSaldo) elSaldo.textContent = formatBRL(t.saldo);
  if (elSaldoHint) elSaldoHint.textContent = `Entradas ${formatBRL(t.entradas)} • Saídas ${formatBRL(t.saidas)}`;

  const elGm = document.getElementById("kpiGastosMes");
  const elGmHint = document.getElementById("kpiGastosMesHint");
  if (elGm) elGm.textContent = formatBRL(t.gastosMes);
  if (elGmHint) elGmHint.textContent = `Somente “Gastos do mês”`;

  // seu pedido: usar esse card como FIXOS
  const elFixos = document.getElementById("kpiCredito");
  if (elFixos) elFixos.textContent = formatBRL(t.fixos);

  const elParcel = document.getElementById("kpiParcelados");
  if (elParcel) elParcel.textContent = formatBRL(t.parcelados);
}

function renderTopCatsFromList(items, targetId) {
  const box = document.getElementById(targetId);
  if (!box) return;

  const mes = (items || []).filter(x => x.source === "MES");
  if (!mes.length) {
    box.innerHTML = `<div class="muted">—</div>`;
    return;
  }

  const map = new Map();
  mes.forEach(x => {
    const cat = (x.categoria || "Outros").trim() || "Outros";
    map.set(cat, (map.get(cat) || 0) + parseBRL(x.valor));
  });

  const top = [...map.entries()]
    .map(([categoria, valor]) => ({ categoria, valor }))
    .sort((a,b) => b.valor - a.valor)
    .slice(0, 5);

  const max = Math.max(...top.map(x => x.valor), 1);

  box.innerHTML = top.map(x => {
    const pct = Math.round((x.valor / max) * 100);
    return `
      <div style="display:grid; grid-template-columns: 140px 1fr 110px; gap:10px; align-items:center; margin-top:10px;">
        <div class="muted" style="font-weight:800;">${escapeHtml(x.categoria)}</div>
        <div class="barTrack"><div class="barFill" style="width:${pct}%;"></div></div>
        <div style="text-align:right; font-weight:900;">${formatBRL(x.valor)}</div>
      </div>
    `;
  }).join("");
}

function renderAnaLastFromList(items) {
  const box = document.getElementById("anaList");
  if (!box) return;

  const last = (items || []).slice(0, 6);
  if (!last.length) {
    box.innerHTML = `<div class="muted">—</div>`;
    return;
  }

  box.innerHTML = last.map(it => {
    const nome = escapeHtml(it.nome || "");
    const data = escapeHtml(it.data || "");
    const tipo = escapeHtml(it.tipo || "");
    const categoria = escapeHtml(it.categoria || "");
    const valor = escapeHtml(it.valor || "");
    const source = escapeHtml(it.source || "");
    return `
      <div class="item">
        <div>
          <strong>${nome}</strong>
          <div class="muted">${data} • ${tipo} • ${categoria}</div>
        </div>
        <div class="right">
          <div class="tag">${source}</div>
          <div style="margin-top:6px; font-weight:800;">${valor}</div>
        </div>
      </div>
    `;
  }).join("");
}

// ---------- Modal confirmação ----------
function openConfirmModal(message, proposedName) {
  pendingState = pendingState || {};
  $("confirmMsg").textContent = message || "Confirme para salvar.";
  $("nameEdit").value = proposedName || "";
  showConfirmToast("", "");
  $("backdrop").classList.add("show");
}
function closeConfirmModal() {
  $("backdrop").classList.remove("show");
  showConfirmToast("", "");
}

// ---------- Actions ----------
async function refreshList(month) {
  const token = getToken();
  if (!token) {
    showToast("Defina o token em 🔑 Token", "err");
    return null;
  }

  showToast("Atualizando lista...", "");
  const res = await apiGet("list", { limit: 30, ...(month ? { month } : {}) });

  if (!res || res.ok !== true) {
    showToast(res?.error || "Erro ao listar. Verifique token/implantação.", "err");
    return null;
  }

  $("monthLabel").textContent = res.month || "—";
  renderList(res.items || []);
  showToast("Lista atualizada ✅", "ok");

  renderTopCatsFromList(res.items || [], "barsTopCats");
  renderAnaLastFromList(res.items || []);

  return res;
}

async function refreshAnalysis(month) {
  const token = getToken();
  if (!token) {
    showToast("Defina o token em 🔑 Token", "err");
    return;
  }

  const res = await apiGet("totals", month ? { month } : {});
  if (!res || res.ok !== true) {
    console.log("totals FAIL:", res);
    showToast(res?.error || "Falha ao carregar totals (veja o console)", "err");
    return;
  }

  renderAnalysisTotals(res);
}


async function refreshAll() {
  const month = getActiveMonth();

  // mantém o select sincronizado
  const sel = document.getElementById("monthSelect");
  if (sel && sel.value !== month) sel.value = month;

  const listRes = await refreshList(month);
  const m = listRes?.month || month;
  setActiveMonth(m);

  await refreshAnalysis(m);
}

async function sendText() {
  const token = getToken();
  if (!token) {
    showToast("Defina o token em 🔑 Token", "err");
    return;
  }

  const text = ($("inputText").value || "").trim();
  if (!text) {
    showToast("Digite algo para enviar.", "err");
    return;
  }

  showToast("Enviando...", "");
  const clientId = "web";
  let res;

  try {
    res = await apiPost("process", { clientId, text });
  } catch (e) {
    showToast("Erro de rede (CORS/URL). Verifique implantação.", "err");
    return;
  }

  if (res?.needsConfirm) {
    pendingState = {
      pendingId: res.pendingId,
      proposedName: res.proposedName || "",
      message: res.message || "Confirme para salvar."
    };
    openConfirmModal(pendingState.message, pendingState.proposedName);
    showToast("Precisa confirmar o nome/descrição.", "err");
    return;
  }

  if (!res || res.ok !== true) {
    showToast(res?.error || res?.message || "Erro ao processar.", "err");
    return;
  }

  $("inputText").value = "";
  showToast(res.message || "Salvo ✅", "ok");
  await refreshAll();
}

async function confirmPending() {
  const token = getToken();
  if (!token) {
    showConfirmToast("Defina o token em 🔑 Token", "err");
    return;
  }
  if (!pendingState?.pendingId) {
    showConfirmToast("Não há pendência para confirmar.", "err");
    return;
  }

  const name = ($("nameEdit").value || "").trim();
  if (!name) {
    showConfirmToast("Digite um nome/descrição.", "err");
    return;
  }

  showConfirmToast("Confirmando...", "");
  const clientId = "web";

  let res;
  try {
    res = await apiPost("confirm", { clientId, pendingId: pendingState.pendingId, name });
  } catch (e) {
    showConfirmToast("Erro de rede (CORS/URL).", "err");
    return;
  }

  if (!res || res.ok !== true) {
    showConfirmToast(res?.error || res?.message || "Erro ao confirmar.", "err");
    return;
  }

  pendingState = null;
  showConfirmToast(res.message || "Confirmado ✅", "ok");
  closeConfirmModal();
  showToast("Salvo ✅", "ok");
  await refreshAll();
}

function cancelPending() {
  pendingState = null;
  closeConfirmModal();
  showToast("Cancelado ✅ (não salvou)", "ok");
}

// ---------- Help ----------
function showHelp() {
  const ex = [
    "Gastos do mês:",
    "• passei no mercado hoje e deu 12,50 no débito pra alimentação",
    "• fui no shopping hoje e gastei 100 reais no crédito com vestuário",
    "",
    "Parcelados:",
    "• comprei um celular de 4100 hoje parcelado em 6 vezes no crédito pra eletrônicos",
    "",
    "Fixos:",
    "• assinei netflix por 39,90 no cartão pra assinaturas",
    "",
    "Entradas:",
    "• recebi meu salário hoje 3000",
    "",
    "Consultas (ainda via texto):",
    "• resumo",
    "• saldo",
    "• total do mes",
    "• top categorias"
  ].join("\n");
  alert(ex);
}

// ---------- Init ----------
function init() {
  setTheme(getTheme());

  setNetPill(navigator.onLine);
  window.addEventListener("online", () => setNetPill(true));
  window.addEventListener("offline", () => setNetPill(false));

  $("themeBtn")?.addEventListener("click", toggleTheme);
  $("tokenBtn")?.addEventListener("click", promptToken);
  $("sendBtn")?.addEventListener("click", sendText);
  $("helpBtn")?.addEventListener("click", showHelp);
  $("refreshBtn")?.addEventListener("click", refreshAll);

  $("confirmBtn")?.addEventListener("click", confirmPending);
  $("cancelPendingBtn")?.addEventListener("click", cancelPending);

  $("inputText")?.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") sendText();
  });

  // tabs (IDs com hífen)
  document.getElementById("tab-registrar")?.addEventListener("click", () => setActiveTab("reg"));
  document.getElementById("tab-analise")?.addEventListener("click", () => setActiveTab("ana"));
  document.getElementById("tab-historico")?.addEventListener("click", () => setActiveTab("his"));

  // month select
  const sel = document.getElementById("monthSelect");
  if (sel) {
    sel.value = getActiveMonth();
    sel.addEventListener("change", () => {
      setActiveMonth(sel.value);
      refreshAll().catch(() => {});
    });
  }

  setActiveTab(getActiveTab());
  refreshAll().catch(() => {});
}

document.addEventListener("DOMContentLoaded", init);

