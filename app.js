const DATA = { site: "./data/site.json", posts: "./data/posts.json" };
const state = { site: {}, posts: [], filter: "全部", categoryFilter: "全部", query: "" };
const $ = (selector, root = document) => root.querySelector(selector);
const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[char]));
const safeURL = value => { try { const url = new URL(value, location.href); return ["http:", "https:"].includes(url.protocol) ? url.href : ""; } catch { return ""; } };
function relativeMedia(path) {
  if (!path) return "";
  return path.startsWith("http://") || path.startsWith("https://") || path.startsWith("data:") ? path : `./${path.replace(/^\.\//, "").replace(/^\//, "")}`;
}
function dateLabel(value) {
  const date = new Date(`${String(value || "").slice(0,10)}T00:00:00`);
  if (Number.isNaN(date.valueOf())) return "持续更新";
  return new Intl.DateTimeFormat("zh-CN", { year:"numeric", month:"2-digit", day:"2-digit" }).format(date).replaceAll("/", ".");
}
function setSite(site) {
  state.site = site || {};
  document.title = `${site.title || "知页"} · 知识分享`;
  document.querySelectorAll("[data-site]").forEach(node => {
    const value = site[node.dataset.site];
    if (typeof value === "string" && value.trim()) node.textContent = value;
  });
  const desc = site.description || site.intro;
  if (desc) $("meta[name=description]")?.setAttribute("content", desc);
}
function filteredPosts() {
  const query = state.query.trim().toLocaleLowerCase();
  return state.posts
    .filter(post => state.filter === "全部" || post.type === state.filter)
    .filter(post => state.categoryFilter === "全部" || post.category === state.categoryFilter)
    .filter(post => !query || [post.title, post.category, post.excerpt, post.body].join(" ").toLocaleLowerCase().includes(query))
    .sort((a,b) => String(b.date || "").localeCompare(String(a.date || "")));
}
function coverMarkup(post, featured = false) {
  const cover = relativeMedia(post.cover || "media/cover-notes.svg");
  return `<div class="${featured ? "featured-cover" : "post-cover"}"><img src="${escapeHTML(cover)}" alt="" loading="${featured ? "eager" : "lazy"}"><span class="cover-label">${escapeHTML(post.type || "分享")}　/　${escapeHTML(post.category || "随笔")}</span></div>`;
}
function cardMarkup(post, featured = false) {
  const title = escapeHTML(post.title || "未命名分享");
  const excerpt = escapeHTML(post.excerpt || "");
  const date = escapeHTML(dateLabel(post.date));
  const label = post.type === "视频" ? "观看内容" : post.type === "图解" ? "查看图解" : "阅读全文";
  return `<article class="${featured ? "featured-card" : "post-card"}" data-id="${escapeHTML(post.id)}" tabindex="0" role="button" aria-label="打开：${title}">
    ${coverMarkup(post, featured)}<div class="${featured ? "featured-copy" : "post-copy"}">
    <div class="meta-line"><span>${date}</span><i></i><span>${escapeHTML(post.category || "知识分享")}</span></div>
    <h3>${title}</h3><p>${excerpt}</p><span class="read-more">${label}<b aria-hidden="true">→</b></span></div></article>`;
}
function renderCategories() {
  const categories = [...new Set(state.posts.map(post => String(post.category || "").trim()).filter(Boolean))];
  const options = ["全部", ...categories];
  $("#category-filters").innerHTML = options.map(category => {
    const active = category === state.categoryFilter;
    const count = category === "全部" ? state.posts.length : state.posts.filter(post => post.category === category).length;
    return `<button class="filter${active ? " is-active" : ""}" type="button" data-category="${escapeHTML(category)}" aria-pressed="${String(active)}">${escapeHTML(category)} <span>${String(count).padStart(2,"0")}</span></button>`;
  }).join("");
}
function renderLibrary() {
  renderCategories();
  const posts = filteredPosts();
  const selected = state.filter === "全部" && !state.query ? posts : [];
  const featured = selected.find(post => post.featured) || selected[0];
  $("#featured-slot").innerHTML = featured ? cardMarkup(featured, true) : "";
  const rest = posts.filter(post => !featured || post.id !== featured.id);
  $("#post-grid").innerHTML = rest.map(post => cardMarkup(post)).join("");
  $("#empty-state").hidden = posts.length > 0;
  $("#post-count").textContent = `${String(posts.length).padStart(2,"0")} 条分享 · 持续更新中`;
  document.querySelectorAll("#filters .filter").forEach(button => {
    const active = button.dataset.filter === state.filter;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  document.querySelectorAll("[data-id]").forEach(card => {
    const open = () => openPost(card.dataset.id);
    card.addEventListener("click", open);
    card.addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(); } });
  });
}
function inlineMarkdown(text) {
  return escapeHTML(text).replace(/`([^`]+)`/g,"<code>$1</code>").replace(/\*\*([^*]+)\*\*/g,"<strong>$1</strong>").replace(/\*([^*]+)\*/g,"<em>$1</em>").replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,'<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}
function markdownToHTML(markdown) {
  const lines = String(markdown || "").replace(/\r/g,"").split("\n");
  const output = []; let paragraph = []; let list = null;
  const flushParagraph = () => { if (paragraph.length) { output.push(`<p>${paragraph.map(inlineMarkdown).join("<br>")}</p>`); paragraph = []; } };
  const closeList = () => { if (list) { output.push(`</${list}>`); list = null; } };
  const tableCells = line => line.trim().replace(/^\|/,"").replace(/\|$/,"").split("|").map(cell => cell.trim());
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const next = lines[index + 1] || "";
    const headers = tableCells(line);
    const separators = tableCells(next);
    if (line.includes("|") && next.includes("|") && headers.length === separators.length && separators.every(cell => /^:?-{3,}:?$/.test(cell))) {
      flushParagraph(); closeList();
      output.push(`<div class="table-wrap"><table><thead><tr>${headers.map(cell => `<th scope="col">${inlineMarkdown(cell)}</th>`).join("")}</tr></thead><tbody>`);
      index += 2;
      while (index < lines.length && lines[index].includes("|")) {
        const cells = tableCells(lines[index]);
        output.push(`<tr>${headers.map((_, cellIndex) => `<td>${inlineMarkdown(cells[cellIndex] || "")}</td>`).join("")}</tr>`);
        index++;
      }
      output.push("</tbody></table></div>");
      index--;
      continue;
    }
    const heading = /^(#{2,4})\s+(.+)$/.exec(line);
    const item = /^\s*[-*+]\s+(.+)$/.exec(line);
    const quote = /^>\s?(.*)$/.exec(line);
    if (!line.trim()) { flushParagraph(); closeList(); continue; }
    if (heading) { flushParagraph(); closeList(); const level = Math.min(4, heading[1].length); output.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`); continue; }
    if (item) { flushParagraph(); if (!list) { list="ul"; output.push("<ul>"); } output.push(`<li>${inlineMarkdown(item[1])}</li>`); continue; }
    if (quote) { flushParagraph(); closeList(); output.push(`<blockquote>${inlineMarkdown(quote[1])}</blockquote>`); continue; }
    const image = /^!\[([^\]]*)\]\((https?:\/\/[^\s)]+|media\/[^\s)]+)\)$/.exec(line);
    if (image) { flushParagraph(); closeList(); output.push(`<img src="${escapeHTML(relativeMedia(image[2]))}" alt="${escapeHTML(image[1])}" loading="lazy">`); continue; }
    closeList(); paragraph.push(line);
  }
  flushParagraph(); closeList();
  return output.join("");
}
function videoMarkup(url) {
  const valid = safeURL(url);
  if (!valid) return `<div class="video-frame"><div class="video-placeholder"><b>▶</b><span>在管理后台添加视频链接</span><small>支持哔哩哔哩、YouTube 或 MP4 地址</small></div></div>`;
  const parsed = new URL(valid);
  const path = parsed.pathname;
  let embed = "";
  if (parsed.hostname.endsWith("youtu.be")) embed = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(path.slice(1))}`;
  else if (parsed.hostname.includes("youtube.com") && parsed.searchParams.get("v")) embed = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(parsed.searchParams.get("v"))}`;
  else if (parsed.hostname.includes("bilibili.com")) {
    const bvid = path.match(/BV[\w]+/i)?.[0];
    const aid = parsed.searchParams.get("aid");
    if (bvid) embed = `https://player.bilibili.com/player.html?bvid=${encodeURIComponent(bvid)}&high_quality=1&danmaku=0`;
    else if (aid) embed = `https://player.bilibili.com/player.html?aid=${encodeURIComponent(aid)}&high_quality=1&danmaku=0`;
  }
  if (embed) return `<div class="video-frame"><iframe src="${escapeHTML(embed)}" title="视频播放器" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`;
  if (/\.(mp4|webm|ogg)(\?.*)?$/i.test(path)) return `<div class="video-frame"><video src="${escapeHTML(valid)}" controls playsinline preload="metadata"></video></div>`;
  return `<div class="video-frame"><div class="video-placeholder"><b>▶</b><span>视频链接已添加</span><a href="${escapeHTML(valid)}" target="_blank" rel="noopener noreferrer">在新窗口打开 ↗</a></div></div>`;
}
function openPost(id) {
  const post = state.posts.find(item => String(item.id) === String(id));
  if (!post) return;
  const media = post.type === "视频" ? videoMarkup(post.mediaUrl) : "";
  const image = post.type === "图解" && post.mediaUrl ? `<figure class="dialog-image"><img src="${escapeHTML(relativeMedia(post.mediaUrl))}" alt="${escapeHTML(post.imageAlt || post.title || "分享图片")}" loading="lazy"></figure>` : "";
  const body = markdownToHTML(post.body || "");
  $("#dialog-content").innerHTML = `${coverMarkup(post,true)}<article class="dialog-body"><div class="meta-line"><span>${escapeHTML(dateLabel(post.date))}</span><i></i><span>${escapeHTML(post.category || "知识分享")}</span><i></i><span>${escapeHTML(post.author || state.site.author || "站长")}</span></div><h2 id="dialog-title">${escapeHTML(post.title || "分享")}</h2><p class="dialog-excerpt">${escapeHTML(post.excerpt || "")}</p>${media}${image}<div class="dialog-prose">${body || "<p>这篇分享还没有补充正文，稍后会在管理后台完善。</p>"}</div><div class="dialog-footer"><span>知页 · 知识分享</span><span>${escapeHTML(post.type || "内容")}</span></div></article>`;
  const dialog = $("#content-dialog");
  dialog.showModal();
  document.body.classList.add("dialog-open");
}
async function loadData() {
  try {
    const dataVersion = `?v=${Date.now()}`;
    const [siteResponse, postsResponse] = await Promise.all([
      fetch(`${DATA.site}${dataVersion}`, { cache: "no-store" }),
      fetch(`${DATA.posts}${dataVersion}`, { cache: "no-store" })
    ]);
    if (!siteResponse.ok || !postsResponse.ok) throw new Error("内容文件暂时不可用");
    const [site, posts] = await Promise.all([siteResponse.json(), postsResponse.json()]);
    setSite(site);
    state.posts = Array.isArray(posts) ? posts : [];
  } catch (error) {
    console.error("Unable to load site content:", error);
    state.posts = [];
    $("#post-count").textContent = "内容暂时无法加载";
  }
  renderLibrary();
}
document.addEventListener("DOMContentLoaded", () => {
  $("#year").textContent = new Date().getFullYear();
  loadData();
  $("#category-filters").addEventListener("click", event => {
    const button = event.target.closest("[data-category]");
    if (!button) return;
    state.categoryFilter = button.dataset.category;
    renderLibrary();
  });
  $("#filters").addEventListener("click", event => {
    const button = event.target.closest("[data-filter]");
    if (!button) return;
    state.filter = button.dataset.filter;
    renderLibrary();
  });
  $("#search").addEventListener("input", event => { state.query = event.target.value; renderLibrary(); });
  const dialog = $("#content-dialog");
  $("#dialog-close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener("close", () => document.body.classList.remove("dialog-open"));
  $("#menu-toggle").addEventListener("click", event => {
    const button = event.currentTarget; const nav = $("#main-nav");
    const open = nav.classList.toggle("is-open"); button.setAttribute("aria-expanded", String(open));
  });
  $("#main-nav").addEventListener("click", event => { if (event.target.closest("a")) { $("#main-nav").classList.remove("is-open"); $("#menu-toggle").setAttribute("aria-expanded", "false"); } });
});
