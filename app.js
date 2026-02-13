
/* ============================
   Notícias Falsas Das Taipas ®
   CMS + Supabase (DB + Storage)
   Admin login LOCAL (email + pass)
   Comentários com respostas (thread infinito) e moderação
   ============================ */

/* ---------- Supabase ---------- */
const SUPABASE_URL = "https://mozhiiozmvogvvwhllns.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1vemhpaW96bXZvZ3Z2d2hsbG5zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4MTI2NDksImV4cCI6MjA4NjM4ODY0OX0.CjvhktQMJ9LmmKMbaFO3YKMmLcssNtm5HUwBfrIJL5M".replace("JzdXBh","JzdXBh"); // noop (kept as literal)
const sb = window.supabase?.createClient ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;



async function uploadNewsImage(file){
  if(!file) return null;
  try{
    const fileName = Date.now() + "_" + file.name;
    const { error: uploadError } = await sb.storage.from('news-images').upload(fileName, file, { cacheControl:'3600', upsert:false });
    if(uploadError){
      console.error("Upload erro:", uploadError.message);
      return null;
    }
    const { data } = sb.storage.from('news-images').getPublicUrl(fileName);
    return data?.publicUrl || null;
  }catch(err){
    console.error("Erro inesperado upload:", err);
    return null;
  }
}

const TABLE_NEWS = "news";
const TABLE_COMMENTS = "comments";
const TABLE_SETTINGS = "site_settings";
const TABLE_NEWSLETTER = "newsletter_subscriptions";
const TABLE_JOURNALISTS = "journalists";
const TABLE_COMMENTATORS = "commentators";
const BUCKET_IMAGES = "news-images";

/* ---------- Admin (LOCAL) ---------- */
const ADMIN_EMAIL = "gervasiocaldelas@protonmail.com";
const ADMIN_PASS  = "Caldasdastaipas+1940";
const LS_ADMIN = "nft_admin_logged";

function isAdmin(){ return localStorage.getItem(LS_ADMIN) === "true"; }
function setAdmin(v){ localStorage.setItem(LS_ADMIN, v ? "true" : "false"); }
function adminLogout(){
  localStorage.removeItem(LS_ADMIN);
  closeAuth();
  closeAdminDrawer();
  location.hash = "#/";
  route();
}

/* ---------- Helpers ---------- */
const el = (id)=>document.getElementById(id);

function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}
function formatDate(ts){
  try{ return new Date(ts).toLocaleDateString("pt-PT", { year:"numeric", month:"short", day:"2-digit" }); }
  catch{ return ""; }
}
function slugify(str){
  return String(str||"")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[^a-z0-9\s-]/g,"")
    .trim()
    .replace(/\s+/g,"-")
    .replace(/-+/g,"-")
     || ("noticia-" + Date.now());
}
function setMsg(id, msg, kind){
  const m = el(id); if(!m) return;
  m.textContent = msg || "";
  m.className = "msg " + (kind||"");
}

function requireSb(){
  if(!sb) throw new Error("Supabase não carregou (sem internet ou bloqueado).");
  return sb;
}

/* ---------- Settings (key/value) ---------- */
const DEFAULT_SETTINGS = {
  climate: "Clima: 23ºC, humidade de boato, vento de “ouvi dizer”.",
  breakingLabel: "ÚLTIMA HORA",
  tickerOverride: "",
  adText: "",
  journalistIntro: "",
  commentatorIntro: "",
  newsletterSubject: "",
  newsletterBody: ""
};

async function getSetting(key){
  requireSb();
  const { data, error } = await sb.from(TABLE_SETTINGS).select("key,value").eq("key", key).maybeSingle();
  if(error){ console.error(error); return; }
  return data?.value ?? null;
}
async function setSetting(key, value){
  requireSb();
  const payload = { key, value: String(value ?? "") };
  const { error } = await sb.from(TABLE_SETTINGS).upsert(payload, { onConflict: "key" });
  if(error){ console.error(error); return; }
}
async function loadAllSettings(){
  requireSb();
  const { data, error } = await sb.from(TABLE_SETTINGS).select("key,value");
  if(error){ console.error(error); return; }
  const out = { ...DEFAULT_SETTINGS };
  (data||[]).forEach(r=>{
    if(r.key === "climate") out.climate = r.value || out.climate;
    if(r.key === "breaking_label") out.breakingLabel = r.value || out.breakingLabel;
    if(r.key === "ticker_override") out.tickerOverride = r.value || "";
    if(r.key === "ad_text") out.adText = r.value || "";
    if(r.key === "journalist_intro") out.journalistIntro = r.value || "";
    if(r.key === "commentator_intro") out.commentatorIntro = r.value || "";
    if(r.key === "newsletter_subject") out.newsletterSubject = r.value || "";
    if(r.key === "newsletter_body") out.newsletterBody = r.value || "";
  });
  return out;
}
function applySettingsToUI(s){
  el("climateText") && (el("climateText").textContent = s.climate);
  el("breakingLabel") && (el("breakingLabel").textContent = s.breakingLabel);
}

/* ---------- News ---------- */
async function fetchNews(){
  // Full fetch (used for admin/ticker cache). Keep as-is to avoid changing existing behavior.
  requireSb();
  const { data, error } = await sb
    .from(TABLE_NEWS)
    .select("*")
    .order("created_at", { ascending:false });
  if(error){ console.error(error); return; }
  return data || [];
}

const FEED_PAGE = 30;
async function fetchNewsPage({ category="Todas", sinceDays=null, offset=0, limit=FEED_PAGE }={}){
  requireSb();
  let q = sb
    .from(TABLE_NEWS)
    .select("*")
    .order("created_at", { ascending:false })
    .range(offset, offset + limit - 1);

  if(category && category !== "Todas"){
    q = q.eq("category", category);
  }
  if(typeof sinceDays === "number" && sinceDays > 0){
    const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();
    q = q.gte("created_at", since);
  }

  const { data, error } = await q;
  if(error){ console.error(error); return; }
  return data || [];
}
async function fetchOneBySlug(slug){
  requireSb();
  const { data, error } = await sb
    .from(TABLE_NEWS)
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if(error){ console.error(error); return; }
  return data || null;
}
async function upsertNews(payload){
  requireSb();
  const { error } = await sb.from(TABLE_NEWS).upsert(payload);
  if(error){ console.error(error); return; }
}
async function deleteNews(id){
  requireSb();
  const { error } = await sb.from(TABLE_NEWS).delete().eq("id", id);
  if(error){ console.error(error); return; }
}

/* ---------- Storage ---------- */
async function uploadImage(file){
  requireSb();
  if(!file) return null;
  const safe = (file.name||"imagem").replace(/[^\w.\-]/g,"_");
  const path = `news/${Date.now()}_${safe}`;
  const { error } = await sb.storage.from(BUCKET_IMAGES).upload(path, file, { upsert:false });
  if(error){ console.error(error); return; }
  const { data } = sb.storage.from(BUCKET_IMAGES).getPublicUrl(path);
  return data.publicUrl;
}

/* ---------- Journalists / Commentators ---------- */
async function listPeople(table){
  requireSb();
  const { data, error } = await sb.from(table).select("*").order("created_at", { ascending:false });
  if(error){ console.error(error); return; }
  return data || [];
}
async function upsertPerson(table, payload){
  requireSb();
  const { error } = await sb.from(table).upsert(payload);
  if(error){ console.error(error); return; }
}
async function deletePerson(table, id){
  requireSb();
  const { error } = await sb.from(table).delete().eq("id", id);
  if(error){ console.error(error); return; }
}

async function syncPeopleToSidebar(){
  // Acrescenta automaticamente ao texto existente (sem o alterar)
  const jEl = el("extraJournalists");
  const cEl = el("extraCommentators");
  if(!jEl && !cEl) return;

  try{
    const journalists = await listPeople(TABLE_JOURNALISTS);
    const names = (journalists||[]).filter(j=>j.active!==false).map(j=>j.name).filter(Boolean);
    if(jEl){
      if(names.length){
        jEl.innerHTML = `<br/><br/><strong>Outros jornalistas:</strong> ${escapeHtml(names.join(", "))}`;
      }else{
        jEl.innerHTML = "";
      }
    }
  }catch{ if(jEl) jEl.innerHTML = ""; }

  try{
    const commentators = await listPeople(TABLE_COMMENTATORS);
    const names = (commentators||[]).filter(c=>c.active!==false).map(c=>c.name).filter(Boolean);
    if(cEl){
      if(names.length){
        cEl.innerHTML = `<br/><br/><strong>Outros comentadores:</strong> ${escapeHtml(names.join(", "))}`;
      }else{
        cEl.innerHTML = "";
      }
    }
  }catch{ if(cEl) cEl.innerHTML = ""; }
}

/* ---------- Comments (thread infinito) ---------- */
const COMMENTS_PAGE = 20;

async function fetchTopComments(newsId, offset=0, limit=COMMENTS_PAGE){
  requireSb();
  const { data, error } = await sb
    .from(TABLE_COMMENTS)
    .select("*")
    .eq("news_id", newsId)
    .is("parent_id", null)
    .order("created_at", {ascending:true})
    .range(offset, offset + limit - 1);
  if(error){ console.error(error); return; }
  return data || [];
}
async function fetchAllChildren(newsId, parentIds){
  if(!parentIds.length) return [];
  requireSb();
  const { data, error } = await sb
    .from(TABLE_COMMENTS)
    .select("*")
    .eq("news_id", newsId)
    .in("parent_id", parentIds)
    .order("created_at", {ascending:true});
  if(error){ console.error(error); return; }
  return data || [];
}
async function addComment({ news_id, parent_id=null, author=null, body }){
  requireSb();
  const payload = { news_id, parent_id, author, body };
  const { error } = await sb.from(TABLE_COMMENTS).insert(payload);
  if(error){ console.error(error); return; }
}

async function deleteComment(comment_id, news_id){

  // garantir que apenas admin executa
  if(typeof isAdmin !== "function" || !isAdmin()){
    alert("Sem permissões.");
    return;
  }

  try{
    const { error } = await sb
      .from("comments")
      .delete()
      .eq("id", comment_id);

    if(error){ console.error(error); return; }

    await loadComments(news_id);

  }catch(err){
    console.error(err);
    
  }
}


async function loadThreadForTop(newsId, topComments){
  // BFS load all descendants for these top comments
  const byParent = new Map();
  let frontier = topComments.map(c=>c.id);
  while(frontier.length){
    const kids = await fetchAllChildren(newsId, frontier);
    if(!kids.length) break;
    for(const k of kids){
      const p = k.parent_id;
      if(!byParent.has(p)) byParent.set(p, []);
      byParent.get(p).push(k);
    }
    frontier = kids.map(k=>k.id);
  }
  return byParent;
}

function renderCommentNode(c, childrenMap, depth){
  const delBtn = isAdmin() ? `<button class="btn tiny danger" data-del="${c.id}" type="button">Apagar</button>` : "";
  const children = childrenMap.get(c.id) || [];
  const repliesHtml = children.map(ch=>renderCommentNode(ch, childrenMap, depth+1)).join("");

  return `
    <div class="${depth===0 ? "comment" : "reply"}" data-cid="${c.id}">
      <div class="cmeta">
        <strong>${escapeHtml(c.author || "Anónimo")}</strong>
        <span class="dot">•</span>
        <span class="muted">${formatDate(c.created_at)}</span>
        ${delBtn}
      </div>
      <div class="cbody">${escapeHtml(c.body).replaceAll("\n","<br/>")}</div>

      <form class="replyForm form" data-parent="${c.id}">
        <div class="row">
          <input class="input grow" name="author" maxlength="40" placeholder="Nome (opcional)"/>
        </div>
        <textarea class="input" name="body" maxlength="500" placeholder="Responder (máx. 500 caracteres)"></textarea>
        <div class="row">
          <button class="btn" type="submit">Responder</button>
        </div>
      </form>

      ${children.length ? `<div class="replies">${repliesHtml}</div>` : ``}
    </div>
  `;
}

/* ---------- Newsletter ---------- */
async function addNewsletter(email){
  requireSb();
  const clean = String(email||"").trim().toLowerCase();
  if(!clean || !clean.includes("@")) throw new Error("Email inválido.");
  const { error } = await sb.from(TABLE_NEWSLETTER).insert({ email: clean });
  if(error){ console.error(error); return; }
  // envio automático real via Edge Function fica preparado, mas opcional
}

/* ---------- Routes ---------- */
function showRoute(name){
  document.querySelectorAll(".route").forEach(r=>r.classList.add("hidden"));
  if(name === "home") el("routeHome")?.classList.remove("hidden");
  if(name === "article") el("routeArticle")?.classList.remove("hidden");
}
function getHash(){
  return location.hash || "#/";
}
async function route(){
  const h = getHash();
  if(h.startsWith("#/n/")){
    const slug = decodeURIComponent(h.split("#/n/")[1] || "");
    showRoute("article");
    await renderArticle(slug);
    return;
  }
  // admin is drawer, not a route section
  showRoute("home");
  await renderHome();
}

/* ---------- UI: Home ---------- */
let cachedNews = [];
let cachedSettings = { ...DEFAULT_SETTINGS };
let activeCategory = "Todas";

let feedState = {
  category: "Todas",
  sinceDays: 7,
  offset: 0,
  done: false,
  loading: false,
  observer: null
};

function resetFeedState({ category, sinceDays }){
  feedState.category = category;
  feedState.sinceDays = sinceDays;
  feedState.offset = 0;
  feedState.done = false;
  feedState.loading = false;
  try{ feedState.observer?.disconnect?.(); }catch{}
  feedState.observer = null;
}

function renderFeedItems(items){
  return (items||[]).map(n=>{
    return `
      <div class="news-horizontal">
        <span class="meta">${escapeHtml(n.category||"")} • ${formatDate(n.created_at)}</span>
        <span class="title">${escapeHtml(n.title||"")}</span>
        <a class="read" href="#/n/${encodeURIComponent(n.slug)}">Ler</a>
      </div>
    `;
  }).join("");
}

async function loadNextFeedPage(){
  const feed = el("feed");
  if(!feed || feedState.loading || feedState.done) return;
  feedState.loading = true;
  try{
    const page = await fetchNewsPage({
      category: feedState.category,
      sinceDays: feedState.sinceDays,
      offset: feedState.offset,
      limit: FEED_PAGE
    });
    if(!page.length){
      if(feedState.offset === 0){
        feed.innerHTML = `<div class="muted">Sem notícias ainda.</div>`;
      }
      feedState.done = true;
      return;
    }
    feed.insertAdjacentHTML("beforeend", renderFeedItems(page));
    feedState.offset += page.length;
    if(page.length < FEED_PAGE) feedState.done = true;
  }catch(err){
    console.error(err);
  }finally{
    feedState.loading = false;
  }
}

function bindCategoryNav(){
  document.querySelectorAll(".sections a").forEach(a=>{
    a.addEventListener("click",(e)=>{
      e.preventDefault();
      activeCategory = a.dataset.cat || "Todas";
      // If already on home route, force re-render (hashchange won't fire)
      if(location.hash === "#/" || location.hash === "" || location.hash === "#"){
        route();
      }else{
        location.hash = "#/";
      }
    });
  });
}

function updateNavActive(){
  document.querySelectorAll(".sections a").forEach(a=>{
    const cat = a.dataset.cat || "Todas";
    a.classList.toggle("active", cat === activeCategory);
  });
}
function setTicker(){
  const s = cachedSettings;
  // label
  el("breakingLabel") && (el("breakingLabel").textContent = s.breakingLabel || "ÚLTIMA HORA");

  const tickerTextEl = el("tickerText");
  if(!tickerTextEl) return;

  const manual = (s.tickerOverride||"").trim();
  if(manual){
    tickerTextEl.innerHTML = escapeHtml(manual);
    return;
  }
  const breaking = cachedNews.filter(n=>!!n.breaking);
  if(!breaking.length){
    tickerTextEl.innerHTML = "Sem últimas horas (por enquanto).";
    return;
  }
  tickerTextEl.innerHTML = breaking.map(n=>`<span class="ticker-item">${escapeHtml(n.title)}</span>`).join(" <span class='dot'>•</span> ");
}

async function renderHome(){
  if(!cachedNews.length){
    try{ cachedNews = await fetchNews(); }catch(err){ console.error(err); }
  }
  // Title ("Últimas" no centro; nos separadores, o nome do separador)
  el("feedTitle") && (el("feedTitle").textContent = activeCategory === "Todas" ? "Últimas" : activeCategory);
  updateNavActive();

  // Página principal: só últimos 7 dias; separadores: sem limite de dias
  const sinceDays = activeCategory === "Todas" ? 7 : null;
  resetFeedState({ category: activeCategory, sinceDays });

  const feed = el("feed");
  if(feed) feed.innerHTML = "";

  await loadNextFeedPage();

  const sentinel = el("feedSentinel");
  if(sentinel){
    feedState.observer = new IntersectionObserver(async (entries)=>{
      if(entries.some(e=>e.isIntersecting)){
        await loadNextFeedPage();
      }
    }, { root: null, rootMargin: "800px 0px", threshold: 0 });
    feedState.observer.observe(sentinel);
  }
}

async function renderSidebarPeople(){
  // Append added journalists/commentators to the resident presentation text (without altering the resident text).
  const jEl = el("extraJournalists");
  const cEl = el("extraCommentators");
  if(!jEl && !cEl) return;
  if(!sb) return;
  try{
    const [js, cs] = await Promise.all([
      listPeople(TABLE_JOURNALISTS).catch(()=>[]),
      listPeople(TABLE_COMMENTATORS).catch(()=>[])
    ]);

    if(jEl){
      const names = (js||[]).filter(p=>p.active!==false).map(p=>p.name).filter(Boolean);
      jEl.innerHTML = names.length ? `<br/><br/><strong>Jornalistas:</strong> ${escapeHtml(names.join(" • "))}` : "";
    }
    if(cEl){
      const names = (cs||[]).filter(p=>p.active!==false).map(p=>p.name).filter(Boolean);
      cEl.innerHTML = names.length ? `<br/><br/><strong>Comentadores:</strong> ${escapeHtml(names.join(" • "))}` : "";
    }
  }catch(err){
    console.error(err);
  }
}

/* ---------- UI: Article ---------- */
async function resolveJournalistName(news){
  // if news has journalist_name, use it; else try journalist_id; else default
  if(news.journalist_name) return news.journalist_name;
  if(news.journalist_id){
    try{
      const { data } = await sb.from(TABLE_JOURNALISTS).select("name").eq("id", news.journalist_id).maybeSingle();
      if(data?.name) return data.name;
    }catch{}
  }
  return "Tomé Caldelas";
}

async function renderArticle(slug){
  let n = null;
  try{ n = await fetchOneBySlug(slug); }catch(err){ console.error(err); }
  const root = el("routeArticle");
  if(!root) return;
  if(!n){
    root.innerHTML = `<div class="card"><h2>Notícia não encontrada.</h2><p class="muted">Volta ao <a href="#/">início</a>.</p></div>`;
    return;
  }
  const journalist = await resolveJournalistName(n);
  const img = n.image_url ? `<img class="article-img" src="${escapeHtml(n.image_url)}" alt="${escapeHtml(n.title||"")}"/>` : "";
  root.innerHTML = `
    <article class="card article">
      <div class="article-nav">
        <button id="btnBack" class="btn-voltar" type="button">Voltar</button>
      </div>
      <header class="article-head">
        <h1>${escapeHtml(n.title||"")}</h1>
        <div class="kicker">${escapeHtml(n.category||"Todas")} • ${formatDate(n.created_at)} ${n.breaking? " • <strong>ÚLTIMA HORA</strong>":""}</div>
      </header>

      ${img}

      <div class="article-body">${escapeHtml(n.content||"").replaceAll("\n","<br/>")}</div>
      <div class="article-sign">— ${escapeHtml(journalist)}</div>

      <section class="comments">
        <h3>Comentários</h3>
        <form id="commentForm" class="form">
          <div class="row">
            <input id="commentAuthor" class="input grow" maxlength="40" placeholder="Nome (opcional)" />
          </div>
          <textarea id="commentBody" class="input" maxlength="500" placeholder="Escreve um comentário (máx. 500 caracteres)"></textarea>
          <div class="row">
            <button class="btn primary" type="submit">Publicar</button>
            <span id="commentMsg" class="msg"></span>
          </div>
        </form>

        <div id="commentsList" class="comments-list"></div>
        <div class="row">
          <button id="commentsMore" class="btn ghost" type="button">Carregar mais</button>
        </div>
      </section>
    </article>
  `;

  // voltar
  el("btnBack")?.addEventListener("click", ()=>{
    // prefer browser history if available; fallback to home
    try{
      if(history.length > 1) history.back();
      else location.hash = "#/";
    }catch{
      location.hash = "#/";
    }
  });

  // bind comments
  let offset = 0;
  const list = el("commentsList");
  const moreBtn = el("commentsMore");

  async function renderBatch(reset=false){
    if(reset){
      offset = 0;
      list.innerHTML = "";
      moreBtn.style.display = "inline-flex";
    }
    const top = await fetchTopComments(n.id, offset, COMMENTS_PAGE);
    if(!top.length){
      if(offset===0) list.innerHTML = `<p class="muted">Ainda não há comentários.</p>`;
      moreBtn.style.display = "none";
      return;
    }
    const childrenMap = await loadThreadForTop(n.id, top);
    for(const c of top){
      const wrap = document.createElement("div");
      wrap.innerHTML = renderCommentNode(c, childrenMap, 0);
      list.appendChild(wrap.firstElementChild);
    }
    offset += top.length;
    moreBtn.style.display = top.length < COMMENTS_PAGE ? "none" : "inline-flex";
  }

  await renderBatch();

  moreBtn?.addEventListener("click", async ()=>{ await renderBatch(); });

  el("commentForm")?.addEventListener("submit", async (e)=>{
    e.preventDefault();
    setMsg("commentMsg","");
    const author = el("commentAuthor")?.value?.trim() || null;
    const body = el("commentBody")?.value?.trim() || "";
    if(!body){ setMsg("commentMsg","Escreve algo.","bad"); return; }
    
    try{
      await addComment({ news_id: n.id, author, body });
      el("commentBody").value = "";
      await renderBatch(true);
    }catch(err){
      console.error(err);
      setMsg("commentMsg", err.message || "Erro", "bad");
    }
  });

  // reply + delete (event delegation)
  list?.addEventListener("submit", async (e)=>{
    const form = e.target;
    if(!(form && form.classList && form.classList.contains("replyForm"))) return;
    e.preventDefault();
    const parent_id = form.dataset.parent;
    const author = (form.querySelector('input[name="author"]')?.value || "").trim() || null;
    const body = (form.querySelector('textarea[name="body"]')?.value || "").trim();
    if(!body) return;
    if(body.length > 500) return;
    try{
      await addComment({ news_id: n.id, parent_id, author, body });
      await renderBatch(true);
    }catch(err){ console.error(err); }
  });

  list?.addEventListener("click", async (e)=>{
    const btn = e.target;
    if(!(btn && btn.dataset && btn.dataset.del)) return;
    if(!isAdmin()) return;
    const id = btn.dataset.del;
    if(!confirm("Apagar comentário? (respostas também)")) return;
    try{
      await deleteComment(id);
      await renderBatch(true);
    }catch(err){ console.error(err); }
  });
}

/* ---------- Auth Modal ---------- */
function openAuth(){
  el("authModal")?.classList.remove("hidden");
  setMsg("authMsg","");
}
function closeAuth(){ el("authModal")?.classList.add("hidden"); }

async function handleLogin(email, pass){
  if(email === ADMIN_EMAIL && pass === ADMIN_PASS){
    setAdmin(true);
    return true;
  }
  return false;
}

/* ---------- Admin Drawer ---------- */
function openAdminDrawer(){
  const drawer = el("routeAdmin");
  if(!drawer) return;
  drawer.classList.remove("hidden");
  drawer.setAttribute("aria-hidden","false");
  document.body.classList.add("admin-open");
}
function closeAdminDrawer(){
  const drawer = el("routeAdmin");
  if(!drawer) return;
  drawer.classList.add("hidden");
  drawer.setAttribute("aria-hidden","true");
  document.body.classList.remove("admin-open");
}

/* ---------- Admin CMS logic ---------- */
function bindAdminTabs(){
  const tabs = document.querySelectorAll(".admin-tabs .tab");
  tabs.forEach(t=>{
    t.addEventListener("click", ()=>{
      tabs.forEach(x=>x.classList.remove("active"));
      t.classList.add("active");
      const name = t.dataset.tab;
      document.querySelectorAll(".admin-panels .panel").forEach(p=>{
        p.classList.toggle("active", p.dataset.panel === name);
      });
    });
  });
}

async function loadJournalistsIntoSelect(){
  const sel = el("journalistSelect");
  if(!sel) return;
  try{
    const journalists = await listPeople(TABLE_JOURNALISTS);
    const options = [
      `<option value="">Tomé Caldelas (padrão)</option>`,
      ...journalists.filter(j=>j.active!==false).map(j=>`<option value="${j.id}">${escapeHtml(j.name)}</option>`)
    ];
    sel.innerHTML = options.join("");
  }catch(err){
    // table may not exist yet
    sel.innerHTML = `<option value="">Tomé Caldelas (padrão)</option>`;
  }
}

function newsPayloadFromForm(imageUrl=null){
  const id = el("newsId")?.value?.trim() || null;
  const title = el("title")?.value?.trim() || "";
  const lead = el("lead")?.value?.trim() || "";
  const content = el("content")?.value?.trim() || "";
  const category = el("category")?.value || "Todas";
  const breaking = !!el("isBreaking")?.checked;

  const journalist_id = el("journalistSelect")?.value || null;

  const slug = slugify(title);
  const payload = { title, content, category, breaking, slug };
  if(journalist_id) payload.journalist_id = journalist_id;
  if(imageUrl !== null) payload.image_url = imageUrl;

  if(id) payload.id = id;
  return payload;
}

async function refreshAdminNewsList(){
  const wrap = el("adminNewsList"); if(!wrap) return;
  try{
    const data = await fetchNews();
    cachedNews = data;
    setTicker();
    wrap.innerHTML = data.length ? data.map(n=>`
      <div class="admin-item">
        <div><strong>${escapeHtml(n.title||"")}</strong></div>
        <div class="muted">${escapeHtml(n.category||"")} • ${formatDate(n.created_at)} ${n.breaking? "• ÚLTIMA HORA":""}</div>
        <div class="row">
          <button class="btn tiny" data-edit="${n.id}" type="button">Editar</button>
          <a class="btn tiny ghost" href="#/n/${encodeURIComponent(n.slug)}">Abrir</a>
          <button class="btn tiny danger" data-delnews="${n.id}" type="button">Apagar</button>
        </div>
      </div>
    `).join("") : `<p class="muted">Sem notícias.</p>`;
  }catch(err){
    console.error(err);
    wrap.innerHTML = `<p class="muted">Erro a carregar notícias.</p>`;
  }
}

async function loadSettingsToForm(){
  try{
    cachedSettings = await loadAllSettings();
    applySettingsToUI(cachedSettings);

    el("setClimate") && (el("setClimate").value = cachedSettings.climate || "");
    el("setBreakingLabel") && (el("setBreakingLabel").value = cachedSettings.breakingLabel || "");
    el("setTickerOverride") && (el("setTickerOverride").value = cachedSettings.tickerOverride || "");
    el("setAdText") && (el("setAdText").value = cachedSettings.adText || "");
    el("setJournalistIntro") && (el("setJournalistIntro").value = cachedSettings.journalistIntro || "");
    el("setCommentatorIntro") && (el("setCommentatorIntro").value = cachedSettings.commentatorIntro || "");

    el("nlSubject") && (el("nlSubject").value = cachedSettings.newsletterSubject || "");
    el("nlBody") && (el("nlBody").value = cachedSettings.newsletterBody || "");
  }catch(err){
    console.error(err);
  }
}

async function refreshPeopleList(table, listElId, kind){
  const wrap = el(listElId); if(!wrap) return;
  try{
    const data = await listPeople(table);
    wrap.innerHTML = data.length ? data.map(p=>`
      <div class="admin-item">
        <div><strong>${escapeHtml(p.name||"")}</strong> ${p.active===false? `<span class="pill">inativo</span>`:""}</div>
        <div class="muted">${escapeHtml(p.bio||"")}</div>
        <div class="row">
          <button class="btn tiny" data-pedit="${p.id}" data-ptable="${table}" type="button">Editar</button>
          <button class="btn tiny danger" data-pdel="${p.id}" data-ptable="${table}" type="button">Apagar</button>
        </div>
      </div>
    `).join("") : `<p class="muted">Sem ${kind}.</p>`;
  }catch(err){
    wrap.innerHTML = `<p class="muted">Tabela '${table}' ainda não existe (cria no SQL Editor).</p>`;
  }
}

async function refreshModerationList(){
  const wrap = el("modCommentsList"); if(!wrap) return;
  const q = (el("modSearch")?.value||"").trim().toLowerCase();
  try{
    let query = sb.from(TABLE_COMMENTS).select("*").order("created_at",{ascending:false}).limit(200);
    const { data, error } = await query;
    if(error){ console.error(error); return; }
    const filtered = (data||[]).filter(c=>{
      if(!q) return true;
      return String(c.author||"").toLowerCase().includes(q) || String(c.body||"").toLowerCase().includes(q);
    });
    wrap.innerHTML = filtered.length ? filtered.map(c=>`
      <div class="admin-item">
        <div><strong>${escapeHtml(c.author||"Anónimo")}</strong> <span class="muted">• ${formatDate(c.created_at)}</span></div>
        <div class="muted">news_id: ${escapeHtml(c.news_id)}</div>
        <div>${escapeHtml(c.body||"")}</div>
        <div class="row">
          <button class="btn tiny danger" data-delc="${c.id}" type="button">Apagar</button>
        </div>
      </div>
    `).join("") : `<p class="muted">Sem comentários.</p>`;
  }catch(err){
    wrap.innerHTML = `<p class="muted">Erro a carregar comentários.</p>`;
    console.error(err);
  }
}

async function loadSubscriptions(){
  const wrap = el("subsList"); if(!wrap) return;
  try{
    const { data, error } = await sb.from(TABLE_NEWSLETTER).select("*").order("created_at",{ascending:false}).limit(500);
    if(error){ console.error(error); return; }
    wrap.innerHTML = data?.length ? data.map(s=>`
      <div class="admin-item">
        <div><strong>${escapeHtml(s.email||"")}</strong></div>
        <div class="muted">${formatDate(s.created_at)}</div>
      </div>
    `).join("") : `<p class="muted">Sem subscrições.</p>`;
  }catch(err){
    wrap.innerHTML = `<p class="muted">Tabela de newsletter ainda não existe.</p>`;
  }
}

/* ---------- Init ---------- */
function setToday(){
  const d = new Date();
  el("today") && (el("today").textContent = d.toLocaleDateString("pt-PT", { weekday:"long", year:"numeric", month:"long", day:"2-digit" }));
  el("year") && (el("year").textContent = String(d.getFullYear()));
}

document.addEventListener("DOMContentLoaded", async ()=>{
  setToday();
  bindCategoryNav();

  // Route changes
  window.addEventListener("hashchange", ()=>{ route(); });

  // Load settings + news
  try{
    cachedSettings = await loadAllSettings();
    applySettingsToUI(cachedSettings);
  }catch(err){ console.error(err); }

  // Sidebar: acrescentar jornalistas/comentadores guardados
  try{ await syncPeopleToSidebar(); }catch{}
  try{
    cachedNews = await fetchNews();
  }catch(err){ console.error(err); }
  setTicker();

  // Basic nav buttons
  el("btnHome")?.addEventListener("click", ()=>{ activeCategory = "Todas"; location.hash = "#/"; });
  el("btnAdmin")?.addEventListener("click", ()=>{
    // always open login modal first unless already admin
    if(isAdmin()){
      openAdminDrawer();
      openAdminSection("news");
      adminBoot();
    }else{
      openAuth();
    }
  });

  // Auth modal close
  el("authClose")?.addEventListener("click", closeAuth);
  el("authModal")?.addEventListener("click",(e)=>{ if(e.target && e.target.id==="authModal") closeAuth(); });

  // Auth submit
  el("authForm")?.addEventListener("submit", async (e)=>{
    e.preventDefault();
    setMsg("authMsg","");
    const email = el("authEmail").value.trim();
    const pass  = el("authPass").value;
    const ok = await handleLogin(email, pass);
    if(!ok){
      setMsg("authMsg","Credenciais inválidas.","bad");
      return;
    }
    closeAuth();
    openAdminDrawer();
    openAdminSection("news");
    await adminBoot();
  });

  // Admin drawer controls
  el("btnAdminClose")?.addEventListener("click", closeAdminDrawer);
  el("btnLogout")?.addEventListener("click", adminLogout);
  bindAdminTabs();

  // Admin forms
  el("btnCancel")?.addEventListener("click", ()=>{
    el("newsId").value="";
    el("title").value="";
    el("lead").value="";
    el("content").value="";
    el("imageFile").value="";
    el("isBreaking").checked=false;
    el("category").value="Todas";
    el("journalistSelect").value="";
    setMsg("newsMsg","");
  });

  el("newsForm")?.addEventListener("submit", async (e)=>{
    e.preventDefault();
    if(!isAdmin()){ alert("Sem permissões."); return; }
    setMsg("newsMsg","");
    try{
      const file = el("imageFile")?.files?.[0] || null;
      let imgUrl = null;
      if(file){
        imgUrl = await uploadImage(file);
      }
      const payload = newsPayloadFromForm(imgUrl);
      // if editing and no new image selected, keep old image_url
      if(payload.id && imgUrl === null){
        delete payload.image_url;
      }
      await upsertNews(payload);
      setMsg("newsMsg","Guardado com sucesso.","ok");
      // refresh cache
      cachedNews = await fetchNews();
      setTicker();
      await refreshAdminNewsList();
    }catch(err){
      console.error(err);
      setMsg("newsMsg", err.message || "Erro","bad");
    }
  });

  // Settings form
  el("settingsForm")?.addEventListener("submit", async (e)=>{
    e.preventDefault();
    if(!isAdmin()){ alert("Sem permissões."); return; }
    setMsg("settingsMsg","");
    try{
      await setSetting("climate", el("setClimate").value || "");
      await setSetting("breaking_label", el("setBreakingLabel").value || "");
      await setSetting("ticker_override", el("setTickerOverride").value || "");
      await setSetting("journalist_intro", el("setJournalistIntro").value || "");
      await setSetting("commentator_intro", el("setCommentatorIntro").value || "");
      cachedSettings = await loadAllSettings();
      applySettingsToUI(cachedSettings);
      setTicker();
      setMsg("settingsMsg","Guardado.","ok");
    }catch(err){
      console.error(err);
      setMsg("settingsMsg", err.message || "Erro","bad");
    }
  });

  // Newsletter template form
  el("newsletterTemplateForm")?.addEventListener("submit", async (e)=>{
    e.preventDefault();
    if(!isAdmin()){ alert("Sem permissões."); return; }
    setMsg("nlMsg","");
    try{
      await setSetting("newsletter_subject", el("nlSubject").value || "");
      await setSetting("newsletter_body", el("nlBody").value || "");
      setMsg("nlMsg","Guardado.","ok");
    }catch(err){
      console.error(err);
      setMsg("nlMsg", err.message || "Erro","bad");
    }
  });

  el("btnLoadSubs")?.addEventListener("click", loadSubscriptions);

  // Journalist form
  el("journalistCancel")?.addEventListener("click", ()=>{
    el("journalistId").value="";
    el("journalistName").value="";
    el("journalistBio").value="";
    el("journalistAvatar").value="";
    el("journalistActive").checked=true;
    setMsg("journalistMsg","");
  });
  el("journalistForm")?.addEventListener("submit", async (e)=>{
    e.preventDefault();
    if(!isAdmin()){ alert("Sem permissões."); return; }
    setMsg("journalistMsg","");
    try{
      const payload = {
        id: el("journalistId").value || undefined,
        name: el("journalistName").value.trim(),
        bio: el("journalistBio").value.trim() || null,
        avatar_url: el("journalistAvatar").value.trim() || null,
        active: !!el("journalistActive").checked,
      };
      if(!payload.name) throw new Error("Nome obrigatório.");
      await upsertPerson(TABLE_JOURNALISTS, payload);
      setMsg("journalistMsg","Guardado.","ok");
      await refreshPeopleList(TABLE_JOURNALISTS, "journalistsList", "jornalistas");
      await loadJournalistsIntoSelect();
      await syncPeopleToSidebar();
      el("journalistCancel").click();
    }catch(err){
      console.error(err);
      setMsg("journalistMsg", err.message || "Erro","bad");
    }
  });

  // Commentator form
  el("commentatorCancel")?.addEventListener("click", ()=>{
    el("commentatorId").value="";
    el("commentatorName").value="";
    el("commentatorBio").value="";
    el("commentatorAvatar").value="";
    el("commentatorActive").checked=true;
    setMsg("commentatorMsg","");
  });
  el("commentatorForm")?.addEventListener("submit", async (e)=>{
    e.preventDefault();
    if(!isAdmin()){ alert("Sem permissões."); return; }
    setMsg("commentatorMsg","");
    try{
      const payload = {
        id: el("commentatorId").value || undefined,
        name: el("commentatorName").value.trim(),
        bio: el("commentatorBio").value.trim() || null,
        avatar_url: el("commentatorAvatar").value.trim() || null,
        active: !!el("commentatorActive").checked,
      };
      if(!payload.name) throw new Error("Nome obrigatório.");
      await upsertPerson(TABLE_COMMENTATORS, payload);
      setMsg("commentatorMsg","Guardado.","ok");
      await refreshPeopleList(TABLE_COMMENTATORS, "commentatorsList", "comentadores");
      await syncPeopleToSidebar();
      el("commentatorCancel").click();
    }catch(err){
      console.error(err);
      setMsg("commentatorMsg", err.message || "Erro","bad");
    }
  });

  // Moderation
  el("modRefresh")?.addEventListener("click", refreshModerationList);
  el("modSearch")?.addEventListener("input", ()=>{
    // debounce-ish
    clearTimeout(window.__modt);
    window.__modt = setTimeout(refreshModerationList, 250);
  });

  // Admin list click actions (news edit/delete)
  el("adminNewsList")?.addEventListener("click", async (e)=>{
    const t = e.target;
    if(t?.dataset?.edit){
      const id = t.dataset.edit;
      const n = cachedNews.find(x=>x.id===id);
      if(!n) return;
      el("newsId").value = n.id;
      el("title").value = n.title || "";
      el("lead").value = n.lead || "";
      el("content").value = n.content || "";
      el("category").value = n.category || "Todas";
      el("isBreaking").checked = !!n.breaking;
      el("journalistSelect").value = n.journalist_id || "";
      setMsg("newsMsg","A editar…","ok");
      openAdminSection("news");
    }
    if(t?.dataset?.delnews){
      const id = t.dataset.delnews;
      if(!confirm("Apagar notícia?")) return;
      try{
        await deleteNews(id);
        cachedNews = await fetchNews();
        setTicker();
        await refreshAdminNewsList();
      }catch(err){ console.error(err); }
    }
  });

  // People list actions
  document.addEventListener("click", async (e)=>{
    const t = e.target;
    if(t?.dataset?.pdel && t.dataset.ptable){
      if(!confirm("Apagar?")) return;
      try{
        await deletePerson(t.dataset.ptable, t.dataset.pdel);
        if(t.dataset.ptable===TABLE_JOURNALISTS){
          await refreshPeopleList(TABLE_JOURNALISTS,"journalistsList","jornalistas");
          await loadJournalistsIntoSelect();
        }else{
          await refreshPeopleList(TABLE_COMMENTATORS,"commentatorsList","comentadores");
        }
      }catch(err){ console.error(err); }
    }
    if(t?.dataset?.pedit && t.dataset.ptable){
      const table = t.dataset.ptable;
      const id = t.dataset.pedit;
      try{
        const { data, error } = await sb.from(table).select("*").eq("id", id).maybeSingle();
        if(error){ console.error(error); return; }
        if(!data) return;
        if(table===TABLE_JOURNALISTS){
          el("journalistId").value = data.id;
          el("journalistName").value = data.name || "";
          el("journalistBio").value = data.bio || "";
          el("journalistAvatar").value = data.avatar_url || "";
          el("journalistActive").checked = data.active !== false;
          openAdminSection("journalists");
        }else{
          el("commentatorId").value = data.id;
          el("commentatorName").value = data.name || "";
          el("commentatorBio").value = data.bio || "";
          el("commentatorAvatar").value = data.avatar_url || "";
          el("commentatorActive").checked = data.active !== false;
          openAdminSection("commentators");
        }
      }catch(err){ console.error(err); }
    }
    if(t?.dataset?.delc){
      if(!isAdmin()) return;
      if(!confirm("Apagar comentário?")) return;
      try{
        await deleteComment(t.dataset.delc);
        await refreshModerationList();
      }catch(err){ console.error(err); }
    }
  });

  // Newsletter subscribe on public sidebar (existing elements)
  el("newsletterForm")?.addEventListener("submit", async (e)=>{
    e.preventDefault();
    const email = el("newsletterEmail")?.value || "";
    setMsg("newsletterMsg","");
    try{
      await addNewsletter(email);
      setMsg("newsletterMsg","Subscrito!","ok");
      el("newsletterEmail").value="";
    }catch(err){
      console.error(err);
      setMsg("newsletterMsg", err.message || "Erro","bad");
    }
  });

  // Start route
  await route();

  // If user navigates directly to #/admin
  if(location.hash === "#/admin"){
    if(isAdmin()){
      openAdminDrawer();
      await adminBoot();
    }else{
      openAuth();
    }
  }
});

function openAdminSection(name){
  document.querySelectorAll(".admin-tabs .tab").forEach(t=>{
    t.classList.toggle("active", t.dataset.tab === name);
  });
  document.querySelectorAll(".admin-panels .panel").forEach(p=>{
    p.classList.toggle("active", p.dataset.panel === name);
  });
}

async function adminBoot(){
  if(!isAdmin()) return;
  await loadSettingsToForm();
  await loadJournalistsIntoSelect();
  await refreshAdminNewsList();
  await refreshPeopleList(TABLE_JOURNALISTS,"journalistsList","jornalistas");
  await refreshPeopleList(TABLE_COMMENTATORS,"commentatorsList","comentadores");
  await syncPeopleToSidebar();
  await refreshModerationList();
}



// ===== Publicidade (CMS + Header) =====
async function loadAdText(){
  try{
    if(!sb) return;
    const { data, error } = await sb
      .from("site_settings")
      .select("value")
      .eq("key","ad_text")
      .maybeSingle();
    if(error){ console.error(error); return; }
    const box = el("adTicker");
    if(box) box.textContent = (data?.value || "Se o seu negócio nas Caldas das Taipas está pronto para conquistar o mundo… ou pelo menos a sua tia e dois vizinhos curiosos, aproveite esta oportunidade irrepetível de publicidade 100% gratuita (sim, leu bem, zero euros, nem trocos do café).\n\nEnvie já um email para gervasiocaldelas@protonmail.com e prepare-se para a avalanche de notoriedade, fama instantânea e, com sorte, um “gosto” acidental às três da manhã.");
  }catch(err){ console.error(err); }
}

document.addEventListener("DOMContentLoaded", ()=>{
  loadAdText();

  el("adsForm")?.addEventListener("submit", async (e)=>{
    e.preventDefault();
    if(!sb) return alert("Supabase não iniciado.");
    try{
      // usa helper já existente, se houver
      if(typeof setSetting === "function") {
        await setSetting("ad_text", el("setAdText").value || "");
      } else {
        await sb.from("site_settings").upsert({ key:"ad_text", value: el("setAdText").value || "" });
      }
      await loadAdText();
      setMsg && setMsg("adsMsg","Guardado.","ok");
    }catch(err){ console.error(err);  }
  });
});

function saveAd(){
  const text = document.getElementById('ad-editor').value;
  localStorage.setItem('siteAd', text);
  document.getElementById('ad-display').innerHTML = text;
  
}
document.addEventListener("DOMContentLoaded", function(){
  const saved = localStorage.getItem('siteAd');
  if(saved){
    if(document.getElementById('ad-display')) document.getElementById('ad-display').innerHTML = saved;
    
  }
});

async function saveAdText(){
  const text = document.getElementById("adTextArea").value;
  await sb.from("site_settings").upsert({key:"ad_text",value:text});
  document.getElementById("adTicker").innerHTML = text;
}

document.addEventListener("DOMContentLoaded", async ()=>{
  const { data } = await sb.from("site_settings")
    .select("value")
    .eq("key","ad_text")
    .maybeSingle();
  if(data && document.getElementById("adTicker")){
    document.getElementById("adTicker").innerHTML = data.value;
  }
});








/* ===== AUTO MOBILE DETECT ===== */
function isMobile(){
  return window.innerWidth <= 768;
}
window.addEventListener("load", ()=>{
  if(isMobile()){
    document.body.classList.add("mobile");
  }
});

/* ===== FILTRO 7 DIAS EM ÚLTIMAS ===== */
async function loadUltimas(){
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate()-7);

  const { data } = await sb.from("news")
    .select("*")
    .order("created_at",{ascending:false});

  const recentes = data.filter(n=> new Date(n.created_at) >= sevenDaysAgo);

  renderNews(recentes);
}

/* ===== JORNALISTAS ===== */
async function addJournalist(){
  const name = prompt("Nome do jornalista:");
  if(!name) return;
  await sb.from("journalists").insert({name:name});
  const el = document.getElementById("journalistPresentation");
  if(el) el.innerHTML += "<br>"+name;
}

async function addCommentator(){
  const name = prompt("Nome do comentador:");
  if(!name) return;
  await sb.from("commentators").insert({name:name});
  const el = document.getElementById("commentatorPresentation");
  if(el) el.innerHTML += "<br>"+name;
}


/* ===== Texto residente (sidebar) para Jornalistas/Comentadores ===== */
const DEFAULT_RESIDENT_JOURNALISTS = `Jornalista residente Tomé Caldelas jornalista reconhecido mundialmente (especialmente entre a pastelaria e o multibanco), sobrevivente de uma épica tentativa de “mande-o calar” que só serviu para aumentar o volume. Ativista de causa nenhuma mas com manifesto pronto, campeão olímpico de sueca ao domingo no Café Club com análise tática digna de Liga dos Campeões, árbitro internacional de campeonatos de pitanga com VAR feito à régua da escola primária, e correspondente de guerra nos conflitos históricos entre Taipas e “o resto do mundo”. Ídolo local, figura mítica e ódio de estimação oficial de quem tem Wi-Fi e tempo a mais — um verdadeiro património cultural taipense em versão comentador omnisciente.`;
const DEFAULT_RESIDENT_COMMENTATORS = `Comentador residente Gildásio Stalin é um atento analista político em permanência, sempre em missão de esclarecimento nacional, mesmo quando ninguém pediu. Especialista em tudo o que mexe no panorama partidário, acompanha com particular fervor aquele partido mais à direita do hemiciclo, relação essa que já ultrapassa o campo ideológico e roça o cardio diário.

Figura controversa e intensamente convicto, vive na firme crença de que é alvo de uma perseguição internacional organizada, desde vizinhos, comentadores de redes sociais, até senhoras na fila do talho que, segundo consta, “andam a conspirar”. Não há esquina onde não sinta olhares, nem debate onde não identifique uma cabala montada exclusivamente para o contrariar.

Gildásio mantém-se, ainda assim, destemido, microfone numa mão, indignação na outra, pronto para enfrentar o mundo que, na sua perspetiva muito pessoal, acorda todos os dias com um único objetivo contrariá-lo. E, claro, tudo isto acompanhado pelo seu comentário sempre “assertivo” — tão assertivo que por vezes acerta.`;

async function loadResidentTexts(){
  if(!sb) return;
  const { data, error } = await sb.from(TABLE_SETTINGS).select("key,value").in("key", ["resident_journalists_text","resident_commentators_text"]);
  if(error){ console.error(error); return; }
  const map = {};
  (data||[]).forEach(r=>{ map[r.key]=r.value; });

  const jText = map["resident_journalists_text"] || DEFAULT_RESIDENT_JOURNALISTS;
  const cText = map["resident_commentators_text"] || DEFAULT_RESIDENT_COMMENTATORS;

  const jEl = el("residentJournalistsText");
  if(jEl){
    const safe = escapeHtml(jText).replace(/\n\n/g,'</p><p>').replace(/\n/g,'<br>');
    jEl.innerHTML = `<p><strong>Jornalista residente Tomé Caldelas</strong> ${safe}</p>`;
  }
  const cEl = el("residentCommentatorsText");
  if(cEl){
    const safe = escapeHtml(cText).replace(/\n\n/g,'</p><p>').replace(/\n/g,'<br>');
    cEl.innerHTML = `<p><strong>Comentador residente Gildásio Stalin</strong> ${safe}</p>`;
  }

  const je = el("residentJournalistsEditor");
  if(je) je.value = jText;
  const ce = el("residentCommentatorsEditor");
  if(ce) ce.value = cText;
}

async function saveResidentText(key, value, msgId){
  try{
    const { error } = await sb.from(TABLE_SETTINGS).upsert({ key, value });
    if(error){ console.error(error); return; }
    setMsg(msgId,"Guardado.","ok");
    await loadResidentTexts();
  }catch(err){
    console.error(err);
    setMsg(msgId, err.message || "Erro","bad");
  }
}

document.addEventListener("DOMContentLoaded", ()=>{
  loadResidentTexts();

  el("btnSaveResidentJournalists")?.addEventListener("click", ()=>{
    if(!isAdmin()) return alert("Sem permissões.");
    saveResidentText("resident_journalists_text", el("residentJournalistsEditor").value, "residentJournalistsMsg");
  });

  el("btnSaveResidentCommentators")?.addEventListener("click", ()=>{
    if(!isAdmin()) return alert("Sem permissões.");
    saveResidentText("resident_commentators_text", el("residentCommentatorsEditor").value, "residentCommentatorsMsg");
  });
});


/* Logout apenas quando clicar em SAIR */
document.addEventListener("DOMContentLoaded", ()=>{
  const btn = document.getElementById("btnLogout");
  if(btn){
    btn.addEventListener("click", ()=>{
      localStorage.removeItem("nft_admin_logged");
      location.reload();
    });
  }
});
