// Famous Since — frontend-only MVP (upgraded, backward-compatible)

// ---------- State ----------
const state = {
  products: [],
  filter: "All",
  cart: JSON.parse(localStorage.getItem("fs_cart") || "[]"),
  emails: JSON.parse(localStorage.getItem("fs_emails") || "[]"),
};

const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
const isReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------- Init ----------
document.addEventListener("DOMContentLoaded", async () => {
  setupHeaderAutoHide();
  setupHeroRotator();
  setupSocialCounter();
  setupReveal();
  setupEmailCapture();
  setupCartDrawer();

  document.addEventListener("keydown", (e)=>{
    if(e.key === "Escape"){ closeModal(); closeDrawer(); }
  });

  // Load products then render grid
  try{
    const res = await fetch("/products.json", { cache: "no-store" });
    state.products = await res.json();
  }catch(e){
    console.error("Failed to load products.json", e);
    showToast("Could not load products. Check file paths.");
  }
  renderGrid();

  // Filter chips
  $$(".chip").forEach(chip=>{
    chip.addEventListener("click", ()=>{
      $$(".chip").forEach(c=>c.classList.remove("is-active"));
      chip.classList.add("is-active");
      state.filter = chip.dataset.filter;
      renderGrid();
    });
  });

  // Hero play/pause toggle
  const toggle = $(".hero__toggle");
  const video = $("#heroVideo");
  toggle?.addEventListener("click", ()=>{
    if(video.paused){
      video.play();
      toggle.setAttribute("aria-pressed","true");
      toggle.innerHTML = `<svg class="icon"><use href="#icon-pause"/></svg><span class="visually-hidden">Pause</span>`;
    } else {
      video.pause();
      toggle.setAttribute("aria-pressed","false");
      toggle.innerHTML = `<svg class="icon"><use href="#icon-play"/></svg><span class="visually-hidden">Play</span>`;
    }
  });

  $(".cart-btn")?.addEventListener("click", openDrawer);
  updateCartCount();
  updateSubtotal();
  updateCheckoutButton();
});

// ---------- Helpers for upgraded schema (safe fallbacks) ----------
function first(arr){ return Array.isArray(arr) && arr.length ? arr[0] : null; }

// Preferred card image (thumbnail -> media.image -> images[] -> lookbook[])
function getCardImage(p){
  if(p.thumbnail) return { src: p.thumbnail, alt: p.title };
  const m = (p.media || []).find(x => x.kind === "image") || first(p.media || []);
  if(m && m.kind === "image") return { src: m.src, alt: m.alt || p.title, srcset: m.srcset, sizes: m.sizes };
  const img = first(p.images || []);
  if(img) return { src: img, alt: p.title };
  const lb = first(p.lookbook || []);
  if(lb) return { src: lb, alt: p.title };
  return { src: "/assets/img/placeholder_600.jpg", alt: p.title || "Product" };
}

function formatPrice(n){ return `$${Number(n || 0).toFixed(2)}`; }
function hasSale(p){ return typeof p.compare_at_price === "number" && p.compare_at_price > p.price; }

// Variants support (fallback to p.sizes if variants not provided)
function getAvailableSizes(p){
  if (Array.isArray(p.variants) && p.variants.length){
    const seen = new Set();
    const sizes = [];
    p.variants.forEach(v=>{
      const s = v.options?.size || v.size || null;
      if(!s || seen.has(s)) return;
      // Determine if this size has any inventory
      const qty = (v.inventory && typeof v.inventory.qty === "number") ? v.inventory.qty : null;
      const policy = v.inventory?.policy || "deny";
      const soldOut = (qty !== null && qty <= 0 && policy === "deny");
      sizes.push({ label: s, soldOut, variant: v });
      seen.add(s);
    });
    if (sizes.length) return sizes;
  }
  // fallback to simple sizes
  return (p.sizes || []).map(s => ({ label: s, soldOut: false, variant: null }));
}

function getVariantForSize(p, sizeLabel){
  if (!Array.isArray(p.variants)) return null;
  // pick first variant that matches size & is not fully denied with zero qty
  const match = p.variants.find(v=>{
    const s = v.options?.size || v.size;
    if (s !== sizeLabel) return false;
    const qty = (v.inventory && typeof v.inventory.qty === "number") ? v.inventory.qty : null;
    const policy = v.inventory?.policy || "deny";
    if(qty !== null && qty <= 0 && policy === "deny") return false;
    return true;
  });
  return match || null;
}

function getEffectivePrice(p, variant){
  if (variant && typeof variant.price === "number") return variant.price;
  return p.price;
}

function getCompareAtPrice(p){
  // Variants could have compare_at_price later; for now use product-level
  if (typeof p.compare_at_price === "number") return p.compare_at_price;
  return null;
}

// ---------- Render Product Grid ----------
function renderGrid(){
  const grid = $("#grid");
  if(!grid) return;
  grid.setAttribute("aria-busy","true");
  grid.innerHTML = "";

  let items = state.products;
  if(state.filter !== "All"){
    items = items.filter(p => (p.badge || p.collection) === state.filter);
  }

  items.forEach((p)=> grid.appendChild(renderCard(p)) );

  // Swipe handlers for each card carousel
  $$(".card").forEach(setupCardSwipe);

  // Reveal observer will pick them up
  grid.setAttribute("aria-busy","false");
}

// ---------- Create a product card ----------
function renderCard(p){
  const card = document.createElement("article");
  card.className = "card reveal";
  card.tabIndex = 0;
  card.setAttribute("role","button");
  card.setAttribute("aria-label", `${p.title}, ${formatPrice(p.price)}`);

  // Media
  const media = document.createElement("div");
  media.className = "card__media";

  const prev = document.createElement("button");
  prev.className = "carousel__btn prev";
  prev.innerHTML = `<svg class="icon"><use href="#icon-chevron"/></svg>`;

  const next = document.createElement("button");
  next.className = "carousel__btn next";
  next.innerHTML = `<svg class="icon"><use href="#icon-chevron"/></svg>`;

  const track = document.createElement("div");
  track.className = "carousel__track";

  // Prefer media[] -> images[] -> lookbook[]
  const gallery = [];
  if (Array.isArray(p.media) && p.media.length){
    p.media.forEach(m=>{
      if(m.kind === "image" || !m.kind){
        gallery.push({ src: m.src, alt: m.alt || p.title, srcset: m.srcset, sizes: m.sizes });
      }
    });
  }
  if (!gallery.length && Array.isArray(p.images)) {
    p.images.forEach(src => gallery.push({ src, alt: p.title }));
  }
  if (!gallery.length && Array.isArray(p.lookbook)) {
    p.lookbook.forEach(src => gallery.push({ src, alt: p.title }));
  }
  if (!gallery.length){
    gallery.push({ src: "/assets/img/placeholder_600.jpg", alt: p.title || "Product" });
  }

  gallery.slice(0,3).forEach(item=>{
    const img = new Image();
    img.src = item.src;
    if(item.srcset) img.srcset = item.srcset;
    if(item.sizes) img.sizes = item.sizes;
    img.alt = item.alt || p.title;
    img.className = "card__img";
    img.loading = "lazy";
    img.decoding = "async";
    track.appendChild(img);
  });

  prev.addEventListener("click", e=>{ e.stopPropagation(); shiftCarousel(track, -1); });
  next.addEventListener("click", e=>{ e.stopPropagation(); shiftCarousel(track, +1); });

  media.append(prev, track, next);

  // Body
  const body = document.createElement("div");
  body.className = "card__body";

  const title = document.createElement("h3");
  title.textContent = p.title;
  title.style.margin = "0";
  title.style.fontFamily = "'Bebas Neue', Impact, 'Arial Black', system-ui";
  title.style.letterSpacing = ".06em";

  const meta = document.createElement("div");
  meta.className = "card__meta";

  const badge = document.createElement("span");
  badge.className = "badge";
  badge.textContent = (p.badge || p.collection || "Core");

  const price = document.createElement("div");
  price.className = "price";
  const cmp = getCompareAtPrice(p);
  if (hasSale(p)){
    price.innerHTML = `<span style="opacity:.9">${formatPrice(p.price)}</span> <s class="muted" style="margin-left:6px">${formatPrice(cmp)}</s>`;
  } else {
    price.textContent = formatPrice(p.price);
  }

  meta.append(badge, price);
  body.append(title, meta);
  card.append(media, body);

  // Open modal on click/Enter
  card.addEventListener("click", ()=> openProductModal(p));
  card.addEventListener("keydown", (e)=>{
    if(e.key === "Enter" || e.key === " "){ e.preventDefault(); openProductModal(p); }
  });

  return card;
}

// ---------- Carousel helpers ----------
function shiftCarousel(track, dir=1){
  let idx = Number(track.dataset.idx || "0");
  const slides = track.children.length;
  idx = (idx + dir + slides) % slides;
  track.style.transform = `translateX(${-100*idx}%)`;
  track.dataset.idx = String(idx);
}
function setupCardSwipe(card){
  const track = card.querySelector(".carousel__track");
  if(!track) return;
  let startX=0, dx=0;
  track.addEventListener("touchstart", e=>{ startX = e.touches[0].clientX; }, {passive:true});
  track.addEventListener("touchmove", e=>{ dx = e.touches[0].clientX - startX; }, {passive:true});
  track.addEventListener("touchend", ()=>{
    if(Math.abs(dx) > 40) shiftCarousel(track, dx>0 ? -1 : +1);
    startX=0; dx=0;
  });
}

// ---------- Product Modal ----------
let lastFocused = null;

function openProductModal(p){
  lastFocused = document.activeElement;
  const modal = $("#product-modal");
  const track = modal.querySelector(".modal__gallery .carousel__track");
  track.innerHTML = "";

  // Modal gallery: prefer media[] images, then p.images
  const modalImgs = [];
  if(Array.isArray(p.media) && p.media.length){
    p.media.forEach(m=>{
      if(m.kind === "image" || !m.kind){
        modalImgs.push({ src: m.src, alt: m.alt || p.title });
      }
    });
  }
  if (!modalImgs.length && Array.isArray(p.images)){
    p.images.forEach(src => modalImgs.push({ src, alt: p.title }));
  }
  if (!modalImgs.length && Array.isArray(p.lookbook)){
    p.lookbook.forEach(src => modalImgs.push({ src, alt: p.title }));
  }
  if (!modalImgs.length) modalImgs.push({ src: "/assets/img/placeholder_800.jpg", alt: p.title || "Product" });

  modalImgs.forEach(item=>{
    const img = new Image();
    img.src = item.src; img.alt = item.alt; img.loading="lazy";
    track.appendChild(img);
  });
  track.style.transform = "translateX(0)";
  track.dataset.idx = "0";

  // Title & price
  modal.querySelector(".modal__title").textContent = p.title;

  // Default variant (first available size)
  const sizesInfo = getAvailableSizes(p);
  const firstAvailable = sizesInfo.find(s => !s.soldOut) || sizesInfo[0] || null;
  const selectedVariant = firstAvailable ? (firstAvailable.variant || getVariantForSize(p, firstAvailable.label)) : null;

  const effectivePrice = getEffectivePrice(p, selectedVariant);
  const cmp = getCompareAtPrice(p);
  const priceEl = modal.querySelector(".modal__price");
  if (cmp && cmp > effectivePrice){
    priceEl.innerHTML = `<span>${formatPrice(effectivePrice)}</span> <s class="muted" style="margin-left:8px">${formatPrice(cmp)}</s>`;
  } else {
    priceEl.textContent = formatPrice(effectivePrice);
  }

  // Sizes
  const sizesEl = modal.querySelector(".modal__sizes");
  sizesEl.innerHTML = "";
  sizesInfo.forEach((s, i)=>{
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = s.label;
    b.setAttribute("aria-pressed", (!i || (!firstAvailable ? i===0 : s.label===firstAvailable.label)) ? "true" : "false");
    if(s.soldOut){
      b.setAttribute("disabled","true");
      b.title = "Sold out";
      b.style.opacity = ".6";
    }
    b.addEventListener("click", ()=>{
      $$(".modal__sizes button").forEach(x=>x.setAttribute("aria-pressed","false"));
      b.setAttribute("aria-pressed","true");

      // Update price if variant-level price exists
      const v = getVariantForSize(p, s.label) || s.variant;
      const newPrice = getEffectivePrice(p, v);
      if (cmp && cmp > newPrice){
        priceEl.innerHTML = `<span>${formatPrice(newPrice)}</span> <s class="muted" style="margin-left:8px">${formatPrice(cmp)}</s>`;
      } else {
        priceEl.textContent = formatPrice(newPrice);
      }

      // Preorder hint
      const pre = v?.preorder?.enabled;
      togglePreorderHint(pre, v?.preorder?.ship_window);
    });
    sizesEl.appendChild(b);
  });

  // Details
  const det = modal.querySelector("#detailsContent");
  det.innerHTML = `
    <ul style="margin:0;padding-left:18px">
      <li>Fabric: ${p.details?.fabric || "—"}</li>
      <li>Fit: ${p.details?.fit || "—"}</li>
      <li>Care: ${p.details?.care || "—"}</li>
      <li class="muted">Tags: ${(p.tags || []).join(", ")}</li>
    </ul>
  `;

  // Preorder hint (default selection)
  togglePreorderHint(selectedVariant?.preorder?.enabled, selectedVariant?.preorder?.ship_window);

  // Qty reset
  $("#qtyInput").value = "1";

  // Add to cart
  const addBtn = modal.querySelector(".add-to-cart");
  addBtn.onclick = ()=>{
    const sizeBtn = $(".modal__sizes button[aria-pressed='true']");
    const size = sizeBtn ? sizeBtn.textContent : (p.sizes ? p.sizes[0] : "OS");
    const variant = getVariantForSize(p, size) || null;
    const price = getEffectivePrice(p, variant);
    const qty = Math.max(1, parseInt($("#qtyInput").value||"1",10));
    addToCart(p, size, qty, price);
    showToast("Added to cart.");
    closeModal();
    openDrawer();
  };

  // Gallery arrows
  const [prev, next] = modal.querySelectorAll(".modal__gallery .carousel__btn");
  prev.onclick = ()=> shiftCarousel(track, -1);
  next.onclick = ()=> shiftCarousel(track, +1);

  // Open + trap focus
  modal.hidden = false;
  disableBackground(true);
  trapFocus(modal);
  modal.querySelector(".modal__close").focus();
}

function togglePreorderHint(enabled, windowText){
  let note = $(".shipping-note");
  if(!note) return;
  if(enabled){
    note.innerHTML = `Preorder: ships ${windowText || "soon"}. Free returns within 30 days.`;
  }else{
    note.textContent = "Note: Some items may not have checkout configured.";
  }
}

function closeModal(){
  const modal = $("#product-modal");
  if(modal?.hidden) return;
  modal.hidden = true;
  disableBackground(false);
  if(lastFocused) lastFocused.focus();
}

// ---------- Cart ----------
function addToCart(p, size, qty, priceOverride){
  const price = typeof priceOverride === "number" ? priceOverride : p.price;
  const existing = state.cart.find(i => i.id===p.id && i.size===size);
  if(existing){ existing.qty += qty; existing.price = price; }
  else{
    state.cart.push({
      id:p.id,
      title:p.title,
      price,
      size,
      qty,
      image:(p.images && p.images[0]) || getCardImage(p).src,
      stripe_url: p.stripe_url || ""
    });
  }
  persistCart();
  renderCart();
  updateCartCount();
  updateSubtotal();
  updateCheckoutButton();
}

function persistCart(){ localStorage.setItem("fs_cart", JSON.stringify(state.cart)); }
function updateCartCount(){
  const n = state.cart.reduce((a,b)=>a+b.qty,0);
  const cc = $(".cart-count"); if(cc) cc.textContent = String(n);
}
function renderCart(){
  const list = $(".cart-list");
  if(!list) return;
  list.innerHTML = "";
  state.cart.forEach((it, idx)=>{
    const li = document.createElement("li");
    li.className = "cart-item";

    const img = new Image();
    img.src = it.image; img.alt = it.title;

    const meta = document.createElement("div");
    meta.className = "meta";
    const t = document.createElement("div"); t.textContent = it.title;
    const s = document.createElement("div"); s.className="muted"; s.textContent = `Size: ${it.size}`;

    const qty = document.createElement("div");
    qty.className = "qty__ctrl";
    const minus = document.createElement("button"); minus.className="qty__btn"; minus.textContent="–";
    const val = document.createElement("input"); val.className="qty__input"; val.value=String(it.qty);
    const plus = document.createElement("button"); plus.className="qty__btn"; plus.textContent="+";
    minus.onclick = ()=> changeQty(idx, -1);
    plus.onclick = ()=> changeQty(idx, +1);
    val.onchange = ()=> setQty(idx, parseInt(val.value||"1",10));
    qty.append(minus, val, plus);

    const price = document.createElement("div");
    price.style.textAlign = "right";
    price.innerHTML = `${formatPrice(it.price*it.qty)}<br>`;
    const rm = document.createElement("button");
    rm.className="remove"; rm.innerHTML = `<svg class="icon"><use href="#icon-close"/></svg>`;
    rm.setAttribute("aria-label","Remove");
    rm.onclick = ()=> { state.cart.splice(idx,1); persistCart(); renderCart(); updateCartCount(); updateSubtotal(); updateCheckoutButton(); };

    meta.append(t, s, qty);
    li.append(img, meta, price);
    price.appendChild(rm);
    list.appendChild(li);
  });
}
function changeQty(idx, delta){
  const it = state.cart[idx]; if(!it) return;
  it.qty = Math.max(1, it.qty + delta);
  persistCart(); renderCart(); updateSubtotal(); updateCheckoutButton();
}
function setQty(idx, val){
  const it = state.cart[idx]; if(!it) return;
  it.qty = Math.max(1, val||1);
  persistCart(); renderCart(); updateSubtotal(); updateCheckoutButton();
}
function updateSubtotal(){
  const sub = state.cart.reduce((a,b)=> a + b.price*b.qty, 0);
  const el = $("#subtotal"); if(el) el.textContent = sub.toFixed(2);
}
function updateCheckoutButton(){
  const btn = $(".drawer .checkout");
  if(!btn) return;
  const missing = state.cart.some(i => !i.stripe_url);
  btn.disabled = missing || state.cart.length === 0;
  btn.title = btn.disabled ? "Checkout not configured for one or more items." : "";
}

// Drawer controls
function openDrawer(){
  const drawer = $("#cart-drawer");
  drawer.hidden = false;
  disableBackground(true);
  trapFocus(drawer);
  drawer.querySelector(".continue").onclick = closeDrawer;
  drawer.querySelector(".checkout").onclick = checkout;
}
function closeDrawer(){
  const drawer = $("#cart-drawer");
  if(drawer?.hidden) return;
  drawer.hidden = true;
  disableBackground(false);
}
function setupCartDrawer(){
  renderCart();
  $$(".drawer [data-close='drawer']").forEach(btn=> btn.addEventListener("click", closeDrawer));
  $(".drawer__backdrop")?.addEventListener("click", closeDrawer);
}

// Checkout logic
function checkout(){
  const missing = state.cart.some(i => !i.stripe_url);
  if(missing) { showToast("Checkout not configured for one or more items."); return; }
  if(state.cart.length){
    // Simple MVP: open the first Stripe link
    window.open(state.cart[0].stripe_url, "_blank");
  }
}

// ---------- Email capture ----------
function setupEmailCapture(){
  const form = $("#emailForm");
  const input = $("#emailInput");
  const msg = $("#emailMsg");
  form?.addEventListener("submit", (e)=>{
    e.preventDefault();
    const val = String(input.value||"").trim().toLowerCase();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)){
      msg.textContent = "Enter a valid email."; return;
    }
    if(state.emails.includes(val)){
      msg.textContent = "You’re already on the list."; return;
    }
    state.emails.push(val);
    localStorage.setItem("fs_emails", JSON.stringify(state.emails));
    msg.textContent = "Thanks — you’re in.";
    form.reset();
    showToast("Subscribed.");
  });
}

// ---------- Header hide/show ----------
function setupHeaderAutoHide(){
  const header = $(".site-header");
  if(!header) return;
  let lastY = window.scrollY;
  window.addEventListener("scroll", ()=>{
    const y = window.scrollY;
    if(y > lastY + 6 && y > 60) header.classList.add("hide");
    else if(y < lastY - 6) header.classList.remove("hide");
    lastY = y;
  }, {passive:true});
}

// ---------- Reveal on scroll ----------
function setupReveal(){
  const obs = new IntersectionObserver(entries=>{
    entries.forEach(e=>{
      if(e.isIntersecting){
        e.target.classList.add("is-visible");
        obs.unobserve(e.target);
      }
    })
  }, {threshold: .12});
  $$(".reveal").forEach(el=>obs.observe(el));
}

// ---------- Hero Rotator ----------
function setupHeroRotator(){
  const el = $("#rotator");
  if(!el) return;
  const words = ["Birth","Day One","No Cosign","24/7","Las Vegas","______"];
  let i = 0;
  const tick = ()=>{ i = (i+1)%words.length; el.textContent = words[i]; };
  el.textContent = words[0];
  if(!isReduced){ setInterval(tick, 2500); }
}

// ---------- Social counter ----------
function setupSocialCounter(){
  const el = $("#tagCount");
  if(!el) return;
  const base = 12000 + Math.floor(Math.random()*1000);
  el.textContent = String(base);
  setTimeout(()=> el.textContent = String(base + Math.floor(Math.random()*50)), 1500);
}

// ---------- Focus trap + inert background ----------
let inertEls = [];
function disableBackground(on){
  const modal = $("#product-modal");
  const drawer = $("#cart-drawer");
  const activeLayer = (!modal.hidden) ? modal : (!drawer.hidden ? drawer : null);
  const rootEls = [document.querySelector("header"), document.querySelector("main"), document.querySelector("footer")];
  if(on){
    inertEls = [];
    rootEls.forEach(el=>{
      if(el && (!activeLayer || !activeLayer.contains(el))){
        el.inert = true; inertEls.push(el);
      }
    });
  } else {
    inertEls.forEach(el=> el.inert = false);
    inertEls = [];
  }
}

function trapFocus(root){
  const FOCUSABLE = "a[href], button, input, select, textarea, [tabindex]:not([tabindex='-1'])";
  const focusables = () => Array.from(root.querySelectorAll(FOCUSABLE)).filter(el=> !el.hasAttribute("disabled"));
  let first = null, last = null;
  const refresh = ()=>{
    const list = focusables();
    first = list[0]; last = list[list.length-1];
    first?.focus();
  };
  refresh();
  const handle = (e)=>{
    if(e.key === "Tab"){
      const list = focusables();
      if(!list.length) return;
      const idx = list.indexOf(document.activeElement);
      if(e.shiftKey && (document.activeElement === first || idx === 0)){
        e.preventDefault(); last.focus();
      } else if(!e.shiftKey && (document.activeElement === last || idx === list.length-1)){
        e.preventDefault(); first.focus();
      }
    }
  };
  root.addEventListener("keydown", handle);
  const cleanup = ()=> root.removeEventListener("keydown", handle);
  root.addEventListener("closeTrap", cleanup, {once:true});
}

// Close modal/drawer when clicking backdrop via data attributes set in HTML
$$("[data-close='modal']").forEach(btn=> btn.addEventListener("click", closeModal));

// ---------- Toast ----------
let toastTimer = null;
function showToast(msg){
  const t = $("#toast"); if(!t) return;
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=> t.hidden = true, 2200);
}
