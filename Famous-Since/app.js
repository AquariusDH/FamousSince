// Famous Since — frontend-only MVP
// State
const state = {
  products: [],
  filter: "All",
  cart: JSON.parse(localStorage.getItem("fs_cart") || "[]"),
  emails: JSON.parse(localStorage.getItem("fs_emails") || "[]"),
};

const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

const isReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// --- Init ---
document.addEventListener("DOMContentLoaded", async () => {
  // Header auto-hide on scroll
  setupHeaderAutoHide();

  // Hero rotating words
  setupHeroRotator();

  // Social fake counter
  setupSocialCounter();

  // Reveal on scroll
  setupReveal();

  // Email capture
  setupEmailCapture();

  // Cart drawer interactions
  setupCartDrawer();

  // Keyboard ESC to close modal/drawer
  document.addEventListener("keydown", (e)=>{
    if(e.key === "Escape"){
      closeModal();
      closeDrawer();
    }
  });

  // Load products then render grid
  try{
    const res = await fetch("/products.json");
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
    if(video.paused){ video.play(); toggle.setAttribute("aria-pressed","true"); toggle.innerHTML = `<svg class="icon"><use href="#icon-pause"/></svg><span class="visually-hidden">Pause</span>`; }
    else { video.pause(); toggle.setAttribute("aria-pressed","false"); toggle.innerHTML = `<svg class="icon"><use href="#icon-play"/></svg><span class="visually-hidden">Play</span>`; }
  });

  // Cart button
  $(".cart-btn")?.addEventListener("click", openDrawer);
  updateCartCount();
  updateSubtotal();
});

// --- Render Product Grid ---
function renderGrid(){
  const grid = $("#grid");
  if(!grid) return;
  grid.innerHTML = ""; // clear
  let items = state.products;
  if(state.filter !== "All"){
    items = items.filter(p => p.badge === state.filter);
  }
  items.forEach((p, idx)=> grid.appendChild(renderCard(p, idx)) );
  // Swipe handlers for each card carousel
  $$(".card").forEach(setupCardSwipe);
}

// Create a product card element
function renderCard(p){
  const card = document.createElement("article");
  card.className = "card reveal";
  card.tabIndex = 0;
  card.setAttribute("role","button");
  card.setAttribute("aria-label", `${p.title}, $${p.price}`);

  const media = document.createElement("div");
  media.className = "card__media";

  const prev = document.createElement("button");
  prev.className = "carousel__btn prev";
  prev.innerHTML = `<svg class="icon"><use href="#icon-chevron"/></svg>`;
  prev.addEventListener("click", e=>{
    e.stopPropagation();
    shiftCarousel(track, -1);
  });

  const next = document.createElement("button");
  next.className = "carousel__btn next";
  next.innerHTML = `<svg class="icon"><use href="#icon-chevron"/></svg>`;
  next.addEventListener("click", e=>{
    e.stopPropagation();
    shiftCarousel(track, +1);
  });

  const track = document.createElement("div");
  track.className = "carousel__track";
  p.lookbook.slice(0,3).forEach(src=>{
    const img = new Image();
    img.src = src;
    img.alt = p.title;
    img.className = "card__img";
    img.loading = "lazy";
    track.appendChild(img);
  });

  media.appendChild(prev);
  media.appendChild(track);
  media.appendChild(next);

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
  badge.textContent = p.badge;

  const price = document.createElement("div");
  price.className = "price";
  price.textContent = `$${p.price}`;

  meta.appendChild(badge);
  meta.appendChild(price);

  body.appendChild(title);
  body.appendChild(meta);

  card.appendChild(media);
  card.appendChild(body);

  // Open modal on click/Enter
  card.addEventListener("click", ()=> openProductModal(p));
  card.addEventListener("keydown", (e)=>{
    if(e.key === "Enter" || e.key === " "){ e.preventDefault(); openProductModal(p); }
  });

  return card;
}

// Carousel shifting helper
function shiftCarousel(track, dir=1){
  let idx = Number(track.dataset.idx || "0");
  const slides = track.children.length;
  idx = (idx + dir + slides) % slides;
  track.style.transform = `translateX(${-100*idx}%)`;
  track.dataset.idx = String(idx);
}

// Swipe for card carousels
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

// --- Product Modal ---
let lastFocused = null;
function openProductModal(p){
  lastFocused = document.activeElement;
  const modal = $("#product-modal");
  const track = modal.querySelector(".modal__gallery .carousel__track");
  track.innerHTML = "";
  p.images.forEach(src=>{
    const img = new Image();
    img.src = src; img.alt = p.title; img.loading="lazy";
    track.appendChild(img);
  });
  track.style.transform = "translateX(0)";
  track.dataset.idx = "0";

  modal.querySelector(".modal__title").textContent = p.title;
  modal.querySelector(".modal__price").textContent = `$${p.price}`;

  // Sizes
  const sizesEl = modal.querySelector(".modal__sizes");
  sizesEl.innerHTML = "";
  p.sizes.forEach((s, i)=>{
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = s;
    b.setAttribute("aria-pressed", i===0 ? "true" : "false");
    b.addEventListener("click", ()=>{
      $$(".modal__sizes button").forEach(x=>x.setAttribute("aria-pressed","false"));
      b.setAttribute("aria-pressed","true");
    });
    sizesEl.appendChild(b);
  });

  // Details
  const det = modal.querySelector("#detailsContent");
  det.innerHTML = `
    <ul style="margin:0;padding-left:18px">
      <li>Fabric: ${p.details.fabric}</li>
      <li>Fit: ${p.details.fit}</li>
      <li>Care: ${p.details.care}</li>
      <li class="muted">Tags: ${p.tags.join(", ")}</li>
    </ul>
  `;

  // Qty reset
  $("#qtyInput").value = "1";

  // Add to cart handler
  const addBtn = modal.querySelector(".add-to-cart");
  addBtn.onclick = ()=>{
    const sizeBtn = $(".modal__sizes button[aria-pressed='true']");
    const size = sizeBtn ? sizeBtn.textContent : p.sizes[0];
    const qty = Math.max(1, parseInt($("#qtyInput").value||"1",10));
    addToCart(p, size, qty);
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
function closeModal(){
  const modal = $("#product-modal");
  if(modal?.hidden) return;
  modal.hidden = true;
  disableBackground(false);
  if(lastFocused) lastFocused.focus();
}

// --- Cart ---
function addToCart(p, size, qty){
  const existing = state.cart.find(i => i.id===p.id && i.size===size);
  if(existing){ existing.qty += qty; }
  else{
    state.cart.push({ id:p.id, title:p.title, price:p.price, size, qty, image:p.images[0], stripe_url: p.stripe_url });
  }
  persistCart();
  renderCart();
  updateCartCount();
  updateSubtotal();
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
    price.innerHTML = `$${(it.price*it.qty).toFixed(2)}<br>`;
    const rm = document.createElement("button");
    rm.className="remove"; rm.innerHTML = `<svg class="icon"><use href="#icon-close"/></svg>`;
    rm.setAttribute("aria-label","Remove");
    rm.onclick = ()=> { state.cart.splice(idx,1); persistCart(); renderCart(); updateCartCount(); updateSubtotal(); };

    meta.append(t, s, qty);
    li.append(img, meta, price);
    price.appendChild(rm);
    list.appendChild(li);
  });
}
function changeQty(idx, delta){
  const it = state.cart[idx]; if(!it) return;
  it.qty = Math.max(1, it.qty + delta);
  persistCart(); renderCart(); updateSubtotal();
}
function setQty(idx, val){
  const it = state.cart[idx]; if(!it) return;
  it.qty = Math.max(1, val||1);
  persistCart(); renderCart(); updateSubtotal();
}
function updateSubtotal(){
  const sub = state.cart.reduce((a,b)=> a + b.price*b.qty, 0);
  const el = $("#subtotal"); if(el) el.textContent = sub.toFixed(2);
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
  // If all items have stripe_url (non-empty), open first product url; else toast.
  const missing = state.cart.some(i => !i.stripe_url);
  if(missing) {
    showToast("Checkout not configured for one or more items.");
    return;
  }
  if(state.cart.length){
    window.open(state.cart[0].stripe_url, "_blank");
  }
}

// --- Email capture ---
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

// --- Header hide/show ---
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

// --- Reveal on scroll ---
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

// --- Hero Rotator ---
function setupHeroRotator(){
  const el = $("#rotator");
  if(!el) return;
  const words = ["Birth","Day One","No Cosign","24/7","Las Vegas","______"];
  let i = 0;
  const tick = ()=>{
    i = (i+1)%words.length;
    el.textContent = words[i];
  };
  el.textContent = words[0];
  if(!isReduced){
    setInterval(tick, 2500);
  }
}

// --- Social counter ---
function setupSocialCounter(){
  const el = $("#tagCount");
  if(!el) return;
  const base = 12000 + Math.floor(Math.random()*1000);
  el.textContent = String(base);
  // increment a bit after load
  setTimeout(()=> el.textContent = String(base + Math.floor(Math.random()*50)), 1500);
}

// --- Focus trap + inert background ---
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
  // Remove on close
  const cleanup = ()=> root.removeEventListener("keydown", handle);
  root.addEventListener("closeTrap", cleanup, {once:true});
}

// Close modal/drawer when clicking backdrop via data attributes set in HTML
$$("[data-close='modal']").forEach(btn=> btn.addEventListener("click", closeModal));

// Toast
let toastTimer = null;
function showToast(msg){
  const t = $("#toast"); if(!t) return;
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=> t.hidden = true, 2200);
}
