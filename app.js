/* =========================
   Finanças PWA (MVP) - app.js
   Compatível com o seu index.html (tabs + análise)
   - Token via querystring (NÃO usa header custom)
   - API esperada:
     GET  ?action=list&limit=30&token=...
     POST ?action=process&token=...   body: { clientId, text }
     POST ?action=confirm&token=...   body: { clientId, pendingId, name }
========================= */

const API_BASE = "https://noisy-flower-1665.luca02699.workers.dev"; // sem barra no final é ok

const LS_TOKEN = "fin_api_token";
const LS_THEME = "fin_theme";
const LS_TAB = "fin_active_tab"; // viewReg | viewAna | viewHis

let pendingState = null; // { pendingId, proposedName, message }

const $ = (id) => document.getElementById(id);

// ---------- Helpers ----------
function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function parseBRL(v) {
  // aceita "R$ 12,50" / "12,50" / 12.5
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

// ---------- Toast ----------
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
  refreshList().catch(() => {});
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
  const cur = getTheme();
  setTheme(cur === "dark" ? "light" : "dark");
}

// ---------- Tabs (bate com seu index) ----------
function getActiveTab() {
  return localStorage.getItem(LS_TAB) || "viewReg";
}

function setActiveTab(viewId) {
  localStorage.setItem(LS_TAB, viewId);

  const tabs = [
    { btn: "tabReg", view: "viewReg" },
    { btn: "tabAna", view: "viewAna" },
    { btn: "tabHis", view: "viewHis" },
  ];

  tabs.forEach(t => {
    const b = document.getElementById(t.btn);
    const v = document.getElementById(t.view);
    if (b) b.classList.toggle("active", t.view === viewId);
    if (v) v.classList.toggle("show", t.view === viewId);
  });
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

// ---------- List (Registrar) ----------
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

// ---------- Análise ----------
function renderAnalysis(res) {
  const items = res?.items || [];
  const month = res?.month || "—";

  const mes = items.filter(x => x.source === "MES");
  const fixos = items.filter(x => x.source === "FIXOS");
  const parc = items.filter(x => x.source === "PARCELADOS");

  const totalMes = mes.reduce((a, x) => a + parseBRL(x.valor), 0);
  const totalFixos = fixos.reduce((a, x) => a + parseBRL(x.valor), 0);
  const totalParc = parc.reduce((a, x) => a + parseBRL(x.valor), 0);

  const totalCredito = mes
    .filter(x => String(x.tipo || "").toLowerCase().includes("crédito"))
    .reduce((a, x) => a + parseBRL(x.valor), 0);

  // saldo estimado (por enquanto)
  const saldoEstimado = 0 - (totalMes + totalFixos + totalParc);

  $("anaMonthLabel") && ($("anaMonthLabel").textContent = month);

  $("kpiGastosMes") && ($("kpiGastosMes").textContent = formatBRL(totalMes));
  $("kpiCredito") && ($("kpiCredito").textContent = formatBRL(totalCredito));
  $("kpiParcelados") && ($("kpiParcelados").textContent = formatBRL(totalParc));
  $("kpiSaldo") && ($("kpiSaldo").textContent = formatBRL(saldoEstimado));

  $("kpiGastosMesHint") && ($("kpiGastosMesHint").textContent = "Somente lançamentos do mês (MES).");
  $("kpiSaldoHint") && ($("kpiSaldoHint").textContent = "Saldo estimado (vamos conectar no saldo real depois).");

  // top categorias (MES)
  const catMap = new Map();
  mes.forEach(x => {
    const cat = (x.categoria || "Outros").trim() || "Outros";
    catMap.set(cat, (catMap.get(cat) || 0) + parseBRL(x.valor));
  });

  const topCats = [...catMap.entries()]
    .map(([categoria, valor]) => ({ categoria, valor }))
    .sort((a,b) => b.valor - a.valor)
    .slice(0, 5);

  const barsBox = $("barsTopCats");
  if (barsBox) {
    if (!topCats.length) {
      barsBox.innerHTML = `<div class="muted">—</div>`;
    } else {
      const max = Math.max(...topCats.map(x => x.valor), 1);
      barsBox.innerHTML = topCats.map(x => {
        const pct = Math.round((x.valor / max) * 100);
        return `
          <div style="display:grid; grid-template-columns: 140px 1fr 120px; gap:10px; align-items:center; margin-top:10px;">
            <div class="muted" style="font-weight:800;">${escapeHtml(x.categoria)}</div>
            <div class="barTrack"><div class="barFill" style="width:${pct}%;"></div></div>
            <div style="text-align:right; font-weight:900;">${formatBRL(x.valor)}</div>
          </div>
        `;
      }).join("");
    }
  }

  // últimos (6)
  const lastBox = $("anaList");
  if (lastBox) {
    const last = items.slice(0, 6);
    if (!last.length) lastBox.innerHTML = `<div class="muted">—</div>`;
    else lastBox.innerHTML = last.map(it => {
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
async function refreshList() {
  const token = getToken();
  if (!token) {
    showToast("Defina o token em 🔑 Token", "err");
    return;
  }

  showToast("Atualizando lista...", "");
  const res = await apiGet("list", { limit: 30 });

  if (!res || res.ok !== true) {
    showToast(res?.error || "Erro ao listar. Verifique token/implantação.", "err");
    return;
  }

  $("monthLabel").textContent = res.month || "—";
  renderList(res.items || []);
  renderAnalysis(res);

  showToast("Lista atualizada ✅", "ok");
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
  await refreshList();
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
    res = await apiPost("confirm", {
      clientId,
      pendingId: pendingState.pendingId,
      name
    });
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
  await refreshList();
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
  ].join("\n");

  alert(ex);
}

// ---------- Init ----------
function init() {
  // tema
  setTheme(getTheme());

  // net pill
  setNetPill(navigator.onLine);
  window.addEventListener("online", () => setNetPill(true));
  window.addEventListener("offline", () => setNetPill(false));

  // binds registrar
  $("themeBtn")?.addEventListener("click", toggleTheme);
  $("tokenBtn")?.addEventListener("click", promptToken);
  $("sendBtn")?.addEventListener("click", sendText);
  $("helpBtn")?.addEventListener("click", showHelp);
  $("refreshBtn")?.addEventListener("click", refreshList);

  // modal
  $("confirmBtn")?.addEventListener("click", confirmPending);
  $("cancelPendingBtn")?.addEventListener("click", cancelPending);

  // enter para enviar (Ctrl+Enter)
  $("inputText")?.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") sendText();
  });

  // tabs
  document.getElementById("tabReg")?.addEventListener("click", () => setActiveTab("viewReg"));
  document.getElementById("tabAna")?.addEventListener("click", () => {
    setActiveTab("viewAna");
    refreshList().catch(() => {});
  });
  document.getElementById("tabHis")?.addEventListener("click", () => setActiveTab("viewHis"));

  // ativa tab salva
  setActiveTab(getActiveTab());

  // carrega lista inicial
  refreshList().catch(() => {});
}

document.addEventListener("DOMContentLoaded", init);
