
/* =========================
   Finanças PWA (MVP) - app.js
   Compatível com o seu index.html
   - Sem CORS: token via querystring (NÃO usa header custom)
   - API esperada:
     GET  ?action=list&limit=30&token=...
     POST ?action=process&token=...   body: { clientId, text }
     POST ?action=confirm&token=...   body: { clientId, pendingId, name }
========================= */

const API_BASE = "https://noisy-flower-1665.luca02699.workers.dev";

const LS_TOKEN = "fin_api_token";
const LS_THEME = "fin_theme";
const LS_TAB = "fin_active_tab"; // registrar | analise | historico

let pendingState = null; // { pendingId, proposedName, message }

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

// ---------- Tabs ----------
function getActiveTab() {
  return localStorage.getItem(LS_TAB) || "registrar";
}

function setActiveTab(tab) {
  localStorage.setItem(LS_TAB, tab);

  // botões
  ["registrar", "analise", "historico"].forEach((t) => {
    const btn = document.getElementById(`tab-${t}`);
    if (btn) btn.classList.toggle("active", t === tab);
  });

  // views
  ["registrar", "analise", "historico"].forEach((t) => {
    const view = document.getElementById(`view-${t}`);
    if (view) view.style.display = t === tab ? "" : "none";
  });
}

// ---------- API (SEM header custom => evita preflight) ----------
function buildUrl(action, params = {}) {
  const token = getToken().trim();
  const qs = new URLSearchParams({ action, token, ...params });
  return `${API_BASE}/?${qs.toString()}`;
}

async function apiGet(action, params = {}) {
  const url = buildUrl(action, params);
  const resp = await fetch(url);
  const text = await resp.text();
  try {
    return JSON.parse(text);
  } catch {
    return { ok: false, error: "Resposta inválida do servidor.", raw: text };
  }
}

async function apiPost(action, body = {}) {
  const url = buildUrl(action);

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" }, // ✅ evita preflight
    body: JSON.stringify(body || {}),
  });

  const text = await resp.text();
  try {
    return JSON.parse(text);
  } catch {
    return { ok: false, error: "Resposta inválida do servidor.", raw: text };
  }
}

// ---------- Render list ----------
function renderList(items = []) {
  const box = $("list");
  if (!box) return;

  if (!items.length) {
    box.innerHTML = `<div class="muted">—</div>`;
    return;
  }

  box.innerHTML = items
    .map((it) => {
      const nome = escapeHtml(it.nome || "");
      const data = escapeHtml(it.data || "");
      const tipo = escapeHtml(it.tipo || "");
      const categoria = escapeHtml(it.categoria || "");
      const valor = escapeHtml(it.valor || "");
      const source = escapeHtml(it.source || "");

      const extra = it.extra
        ? `<div class="muted" style="margin-top:6px;">
             ${escapeHtml(it.extra.parcelas || "")}x • Total ${escapeHtml(
            it.extra.total || ""
          )}
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
    })
    .join("");
}

// ---------- ANÁLISE ----------
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
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function buildAnalysis(items = []) {
  const mes = items.filter((x) => x.source === "MES");
  const fixos = items.filter((x) => x.source === "FIXOS");
  const parc = items.filter((x) => x.source === "PARCELADOS");

  const totalMes = mes.reduce((acc, x) => acc + parseBRL(x.valor), 0);
  const totalFixos = fixos.reduce((acc, x) => acc + parseBRL(x.valor), 0);
  const totalParc = parc.reduce((acc, x) => acc + parseBRL(x.valor), 0);

  const totalCredito = mes
    .filter((x) => String(x.tipo || "").toLowerCase().includes("crédito"))
    .reduce((acc, x) => acc + parseBRL(x.valor), 0);

  const catMap = new Map();
  mes.forEach((x) => {
    const cat = (x.categoria || "Outros").trim() || "Outros";
    const v = parseBRL(x.valor);
    catMap.set(cat, (catMap.get(cat) || 0) + v);
  });

  const topCats = [...catMap.entries()]
    .map(([categoria, valor]) => ({ categoria, valor }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 5);

  return {
    totalMes,
    totalFixos,
    totalParc,
    totalCredito,
    topCats,
    ultimos: items.slice(0, 6),
  };
}

function renderAnalysis(res) {
  const items = res?.items || [];
  const month = res?.month || "—";
  const a = buildAnalysis(items);

  const elMonth = document.getElementById("analiseMonthLabel");
  if (elMonth) elMonth.textContent = month;

  const elGastosMes = document.getElementById("cardGastosMes");
  if (elGastosMes) elGastosMes.textContent = formatBRL(a.totalMes);

  const elCredito = document.getElementById("cardCredito");
  if (elCredito) elCredito.textContent = formatBRL(a.totalCredito);

  const elParcelados = document.getElementById("cardParcelados");
  if (elParcelados) elParcelados.textContent = formatBRL(a.totalParc);

  const elFixos = document.getElementById("cardFixos");
  if (elFixos) elFixos.textContent = formatBRL(a.totalFixos);

  const topBox = document.getElementById("topCats");
  if (topBox) {
    if (!a.topCats.length) {
      topBox.innerHTML = `<div class="muted">—</div>`;
    } else {
      const max = Math.max(...a.topCats.map((x) => x.valor), 1);
      topBox.innerHTML = a.topCats
        .map((x) => {
          const pct = Math.round((x.valor / max) * 100);
          return `
            <div class="catRow">
              <div class="catName">${escapeHtml(x.categoria)}</div>
              <div class="catBar"><div class="catFill" style="width:${pct}%;"></div></div>
              <div class="catVal">${formatBRL(x.valor)}</div>
            </div>
          `;
        })
        .join("");
    }
  }

  const lastBox = document.getElementById("analiseLast");
  if (lastBox) {
    const last = a.ultimos || [];
    if (!last.length) lastBox.innerHTML = `<div class="muted">—</div>`;
    else
      lastBox.innerHTML = last
        .map((it) => {
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
        })
        .join("");
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
      message: res.message || "Confirme para salvar.",
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
    "",
    "Consultas:",
    "• resumo",
    "• saldo",
    "• total do mes",
    "• top categorias",
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
  $("refreshBtn")?.addEventListener("click", refreshList);

  $("confirmBtn")?.addEventListener("click", confirmPending);
  $("cancelPendingBtn")?.addEventListener("click", cancelPending);

  $("inputText")?.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") sendText();
  });

  document.getElementById("tab-registrar")?.addEventListener("click", () => setActiveTab("registrar"));
  document.getElementById("tab-analise")?.addEventListener("click", () => setActiveTab("analise"));
  document.getElementById("tab-historico")?.addEventListener("click", () => setActiveTab("historico"));

  setActiveTab(getActiveTab());

  refreshList().catch(() => {});
}

document.addEventListener("DOMContentLoaded", init);
