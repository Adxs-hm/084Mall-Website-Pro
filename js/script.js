// --- 084 MALL: PLATINUM ENGINE V20.13 (VIDEO RELOAD FIX) ---

// --- IDB STORAGE ENGINE ---
const IDB_STORE_NAME = 'mall_store';
const IDB = {
    open: () => new Promise((resolve, reject) => {
        if (!window.indexedDB) { resolve(null); return; }
        const req = indexedDB.open('MALL_DB', 1);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(IDB_STORE_NAME)) {
                db.createObjectStore(IDB_STORE_NAME);
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => { console.warn("IDB Open Error"); resolve(null); };
    }),
    get: async (key) => {
        const db = await IDB.open();
        if(!db) return null;
        return new Promise((resolve) => {
            const tx = db.transaction(IDB_STORE_NAME, 'readonly');
            const req = tx.objectStore(IDB_STORE_NAME).get(key);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(null);
        });
    },
    set: async (key, val) => {
        const db = await IDB.open();
        if(!db) return;
        return new Promise((resolve, reject) => {
            const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
            const req = tx.objectStore(IDB_STORE_NAME).put(val, key);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    },
    clear: async () => {
        const db = await IDB.open();
        if(!db) return;
        return new Promise((resolve) => {
             const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
             tx.objectStore(IDB_STORE_NAME).clear();
             tx.oncomplete = () => resolve();
        });
    }
};

// --- DATA INITIALIZATION STRATEGY ---
function loadInitialData() {
    const staticData = window.MALL_DATA || {};
    
    let lsConfig, lsProducts, lsTimestamp;
    try {
        lsConfig = JSON.parse(localStorage.getItem('mall_config'));
        lsProducts = JSON.parse(localStorage.getItem('mall_products'));
        lsTimestamp = parseInt(localStorage.getItem('mall_timestamp') || '0');
    } catch(e) {}

    const staticTimestamp = staticData.timestamp || 0;

    let useStatic = false;
    if (staticTimestamp >= lsTimestamp) {
        if(staticTimestamp > 0) {
             console.log(`[System] data.js (v${staticTimestamp}) is authoritative.`);
             useStatic = true;
        } else if (!lsConfig) {
             useStatic = true; 
        }
    }

    if (useStatic) {
        localStorage.removeItem('mall_config');
        localStorage.removeItem('mall_products');
        localStorage.setItem('mall_timestamp', staticTimestamp); 
        
        return {
            config: staticData.config,
            products: staticData.products,
            customAssets: staticData.customAssets || [],
            timestamp: staticTimestamp
        };
    } else {
        console.log(`[System] Using cached data (v${lsTimestamp})`);
        return {
            config: lsConfig || staticData.config,
            products: lsProducts || staticData.products,
            customAssets: JSON.parse(localStorage.getItem('mall_custom_assets')) || staticData.customAssets || [],
            timestamp: lsTimestamp
        };
    }
}

let MALL_DB = loadInitialData();

// --- CORE FUNCTIONS ---
async function saveData() {
    MALL_DB.timestamp = Date.now();
    localStorage.setItem('mall_timestamp', MALL_DB.timestamp);

    try {
        localStorage.setItem('mall_config', JSON.stringify(MALL_DB.config));
        localStorage.setItem('mall_products', JSON.stringify(MALL_DB.products));
    } catch (e) { 
        console.warn("Local Storage Full. Data saved to IDB/Memory.");
    }

    try {
        await IDB.set('mall_data_full', MALL_DB);
        console.log("Saved to IndexedDB");
    } catch(e) {
        console.error("IDB Save Failed", e);
    }
}

const config = MALL_DB.config;

// --- INIT ---
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Wait for IDB to ensure we have the absolute latest data (especially large media)
    try {
        const dbData = await IDB.get('mall_data_full');
        if (dbData && dbData.timestamp > MALL_DB.timestamp) {
            MALL_DB = dbData;
            console.log("Loaded newer data from IndexedDB");
        }
    } catch (e) { console.warn("IDB Load Error", e); }

    // 2. Initialize Features after data is settled
    initGlobalAudio();

    if (document.getElementById('admin-app')) {
        initAdminApp();
    } else {
        updateCartCount();
        const pageId = document.body.dataset.page;
        if(pageId) routePage(pageId);
        setupImageViewer(); 
    }
});

function routePage(id) {
    if(id==='home') { renderHome(); initMallScene(); }
    if(id==='list') renderList();
    if(id==='detail') renderDetail();
    if(id==='cart') renderCart();
    if(id==='about') renderAbout();
}

function renderAbout() {
    const videoEl = document.getElementById('brand-video');
    if (videoEl && MALL_DB.config.videoUrl) {
        // Directly set src and force reload to ensure player updates
        videoEl.src = MALL_DB.config.videoUrl;
        videoEl.load();
    }
}

// --- GLOBAL AUDIO PLAYER ---
let globalAudioInstance = null;

function initGlobalAudio() {
    const bgmUrl = MALL_DB.config.bgmUrl || "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3";
    
    const oldFab = document.querySelector('.music-fab-container');
    if(oldFab) oldFab.remove();

    const audio = new Audio(bgmUrl);
    audio.loop = true;
    audio.volume = 0.5;
    globalAudioInstance = audio; 
    
    const container = document.createElement('div');
    container.className = 'music-fab-container';
    document.body.appendChild(container);

    const toast = document.createElement('div');
    toast.className = 'music-toast';
    toast.innerText = 'Now Playing';
    container.appendChild(toast);

    const fab = document.createElement('div');
    fab.className = 'music-fab';
    fab.innerHTML = '🎵'; 
    fab.title = 'Play/Pause Global BGM';
    container.appendChild(fab);
    
    const showToast = (text) => {
        let name = text;
        if(name.length > 30 && name.startsWith('data:')) name = "Local Audio File";
        else if (name.length > 20) name = "..." + name.substring(name.length-20);
        
        toast.innerText = "♪ " + name;
        toast.classList.add('visible');
        setTimeout(() => toast.classList.remove('visible'), 3000);
    }

    const updateIcon = () => {
        fab.innerHTML = audio.paused ? '🎵' : '⏸';
        if(!audio.paused) fab.classList.add('playing');
        else fab.classList.remove('playing');
    }

    const isPlaying = localStorage.getItem('mall_bgm_playing') === 'true';
    const currentTime = parseFloat(localStorage.getItem('mall_bgm_time') || '0');
    
    if(isPlaying) {
        audio.currentTime = currentTime;
        audio.play().then(() => {
            updateIcon();
        }).catch(() => {
            console.log("Autoplay blocked");
            localStorage.setItem('mall_bgm_playing', 'false');
            updateIcon();
        });
    }

    fab.onclick = () => {
        if(audio.paused) {
            audio.play();
            localStorage.setItem('mall_bgm_playing', 'true');
            showToast(bgmUrl);
        } else {
            audio.pause();
            localStorage.setItem('mall_bgm_playing', 'false');
        }
        updateIcon();
    };

    setInterval(() => {
        if(!audio.paused) {
            localStorage.setItem('mall_bgm_time', audio.currentTime);
        }
    }, 1000);
}

window.updateGlobalAudioSource = function(newUrl) {
    if(globalAudioInstance && newUrl && newUrl !== globalAudioInstance.src) {
        const wasPlaying = !globalAudioInstance.paused;
        globalAudioInstance.src = newUrl;
        if(wasPlaying) {
            globalAudioInstance.play().catch(e => console.log("Playback interrupted", e));
        }
        const fab = document.querySelector('.music-fab');
        if(fab) fab.innerHTML = '⏸';
    }
}

// --- CAROUSEL LOGIC ---
let slideIndex = 0;
let slideInterval;

function initCarousel() {
    const track = document.getElementById('carousel-track');
    const dotsContainer = document.getElementById('carousel-dots');
    const currentSlides = MALL_DB.config.slides || [];

    if(track && currentSlides.length > 0) {
        track.innerHTML = currentSlides.map((s,i) => 
            `<div class="carousel-slide ${i===0?'active':''}" style="background-image:url('${s}')"></div>`
        ).join('');
        
        dotsContainer.innerHTML = currentSlides.map((_,i) => 
            `<div class="carousel-dot ${i===0?'active':''}" onclick="setSlide(${i})"></div>`
        ).join('');

        startSlideTimer();
    }
}

window.moveCarousel = function(n) {
    const slides = document.querySelectorAll('.carousel-slide');
    if(!slides.length) return;
    let newIndex = slideIndex + n;
    if (newIndex >= slides.length) newIndex = 0;
    if (newIndex < 0) newIndex = slides.length - 1;
    updateCarouselUI(newIndex);
    resetSlideTimer();
}

window.setSlide = function(n) {
    updateCarouselUI(n);
    resetSlideTimer();
}

function updateCarouselUI(n) {
    const slides = document.querySelectorAll('.carousel-slide');
    const dots = document.querySelectorAll('.carousel-dot');
    
    if(slides[slideIndex]) slides[slideIndex].classList.remove('active');
    if(dots[slideIndex]) dots[slideIndex].classList.remove('active');
    
    slideIndex = n;
    
    if(slides[slideIndex]) slides[slideIndex].classList.add('active');
    if(dots[slideIndex]) dots[slideIndex].classList.add('active');
}

function startSlideTimer() {
    slideInterval = setInterval(() => window.moveCarousel(1), 5000);
}
function resetSlideTimer() {
    clearInterval(slideInterval);
    startSlideTimer();
}

// --- SCENE ---
function initMallScene() {
    const canvas = document.getElementById('generative-canvas');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    
    let width, height;
    let shoppers = [];
    let particles = []; 
    
    const resize = () => {
        width = canvas.width = canvas.offsetWidth;
        height = canvas.height = canvas.offsetHeight;
    };
    
    class Shopper {
        constructor() {
            this.comingFromLeft = Math.random() > 0.5;
            this.x = this.comingFromLeft ? -20 : width + 20;
            this.y = height - 50; 
            this.targetX = width / 2 + (Math.random() * 40 - 20); 
            this.speed = (Math.random() * 0.3 + 0.2) * (this.comingFromLeft ? 1 : -1);
            this.color = `hsl(${Math.random()*360}, 60%, 60%)`;
            this.height = Math.random() * 10 + 20;
            this.width = 8;
            this.entered = false;
        }
        update() {
            if(this.entered) return;
            this.x += this.speed;
            if(Math.abs(this.x - this.targetX) < 5) {
                this.entered = true;
                particles.push(new MoneyParticle(this.x, this.y - 40));
            }
        }
        draw() {
            if(this.entered) return;
            ctx.fillStyle = this.color;
            ctx.fillRect(this.x - this.width/2, this.y - this.height, this.width, this.height);
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(this.x, this.y - this.height - 4, 3, 0, Math.PI*2);
            ctx.fill();
            ctx.fillStyle = '#ccc';
            const legOffset = Math.sin(Date.now() / 200) * 3;
            ctx.fillRect(this.x - 2, this.y, 2, 5 + legOffset);
            ctx.fillRect(this.x + 2, this.y, 2, 5 - legOffset);
        }
    }

    class MoneyParticle {
        constructor(x, y) {
            this.x = x;
            this.y = y;
            this.life = 1.0;
            this.amount = Math.floor(Math.random() * 500) + 100;
            this.vy = -1.0; 
        }
        update() {
            this.y += this.vy;
            this.life -= 0.01; 
            this.x += Math.sin(this.y/10) * 0.5; 
        }
        draw() {
            ctx.globalAlpha = Math.max(0, this.life);
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#ffff00';
            ctx.fillStyle = '#fff700';
            ctx.font = 'bold 24px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(`+$${this.amount}`, this.x, this.y);
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1;
            ctx.strokeText(`+$${this.amount}`, this.x, this.y);
            ctx.globalAlpha = 1.0;
            ctx.shadowBlur = 0; 
        }
    }

    function drawMall() {
        const cx = width / 2;
        const cy = height - 50;
        ctx.strokeStyle = '#0ff';
        ctx.lineWidth = 2;
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#0ff';
        ctx.beginPath();
        ctx.moveTo(cx - 100, cy);
        ctx.lineTo(cx - 100, cy - 120);
        ctx.lineTo(cx + 100, cy - 120);
        ctx.lineTo(cx + 100, cy);
        ctx.stroke();
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(cx - 30, cy - 60, 60, 60);
        ctx.strokeStyle = '#f0f';
        ctx.shadowColor = '#f0f';
        ctx.strokeRect(cx - 30, cy - 60, 60, 60);
        ctx.fillStyle = '#fff';
        ctx.font = '700 16px Arial';
        ctx.textAlign = 'center';
        ctx.shadowColor = '#fff';
        ctx.fillText('084 MALL', cx, cy - 135);
        ctx.shadowBlur = 0; 
    }

    function animate() {
        ctx.fillStyle = '#050505'; 
        ctx.fillRect(0, 0, width, height);
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, height-50);
        ctx.lineTo(width, height-50);
        ctx.stroke();
        drawMall();
        if(Math.random() < 0.02) shoppers.push(new Shopper());
        shoppers = shoppers.filter(s => !s.entered);
        shoppers.forEach(s => { s.update(); s.draw(); });
        particles = particles.filter(p => p.life > 0);
        particles.forEach(p => { p.update(); p.draw(); });
        requestAnimationFrame(animate);
    }
    
    window.addEventListener('resize', resize);
    resize();
    animate();
}

// --- STANDARD RENDERERS ---
function createProductCard(p) {
    return `
    <a href="detail.html?id=${p.id}" class="product-card">
        <div class="product-img-box">
            <img src="${p.image}" loading="lazy" alt="${p.name}">
        </div>
        <div class="product-meta">
            <div class="product-title">${p.name}</div>
            <div class="product-price">¥ ${p.price.toLocaleString()}</div>
        </div>
    </a>`;
}

function renderHome() {
    initCarousel(); 
    const _p = MALL_DB.products;
    const render = (id, cat) => { 
        const el = document.getElementById(id); 
        if(el) el.innerHTML = _p.filter(p=>cat?p.category===cat:true).slice(0,4).map(createProductCard).join(''); 
    };
    render('seckill-items', null); 
    render('grid-elec', 'elec'); 
    render('grid-fashion', 'fashion'); 
    render('grid-home', 'home');
}

function renderList() {
    const container = document.getElementById('product-list');
    const params = new URLSearchParams(window.location.search);
    const cat = params.get('cat');
    if(container) {
        const filtered = cat ? MALL_DB.products.filter(p=>p.category===cat) : MALL_DB.products;
        container.innerHTML = filtered.map(createProductCard).join('');
        const countEl = document.getElementById('item-count');
        if(countEl) countEl.innerText = filtered.length;
        
        document.querySelectorAll('.sidebar-nav a').forEach(a => {
            a.className = ''; 
            if (cat && a.href.includes(`cat=${cat}`)) a.classList.add('active');
            else if (!cat && !a.href.includes('cat=')) a.classList.add('active');
        });
    }
}

function renderDetail() {
    const id = parseInt(new URLSearchParams(window.location.search).get('id'));
    const p = MALL_DB.products.find(x => x.id === id); if (!p) return;
    
    const mainImg = document.getElementById('p-main-img');
    mainImg.src = p.image;
    document.querySelector('.detail-img-box').onclick = () => openImageViewer(mainImg.src);

    document.getElementById('p-title').innerText = p.name;
    document.getElementById('p-price-val').innerText = p.price.toLocaleString();
    
    const t = document.getElementById('p-thumbs');
    if(t) {
        let imgs = [p.image, ...(p.gallery||[])];
        t.innerHTML = imgs.map(src => `
            <div class="detail-thumb" onclick="document.getElementById('p-main-img').src='${src}'">
                <img src="${src}">
            </div>
        `).join('');
    }
    
    const btn = document.getElementById('add-action');
    if(btn) {
        btn.onclick = () => {
            let cart = JSON.parse(localStorage.getItem('cart_084')||'[]');
            let qty = parseInt(document.getElementById('p-qty').value) || 1;
            let exist = cart.find(x=>x.id===p.id);
            if(exist) exist.quantity += qty;
            else cart.push({...p, quantity: qty});
            localStorage.setItem('cart_084', JSON.stringify(cart));
            updateCartCount(); 
            alert(`已将 ${qty} 件商品加入购物袋`);
        }
    }
}

function renderCart() {
    const c = JSON.parse(localStorage.getItem('cart_084')||'[]');
    const w = document.getElementById('cart-items-wrapper');
    if(!w) return;
    
    if(c.length===0) w.innerHTML = '<div style="padding:40px; text-align:center; color:#999;">您的购物袋是空的</div>';
    else {
        let total = 0;
        w.innerHTML = c.map(i => {
            total += i.price * i.quantity;
            return `
            <div class="cart-item">
                <img src="${i.image}">
                <div style="flex:1;">
                    <div style="font-weight:600; font-size:14px; margin-bottom:4px;">${i.name}</div>
                    <div style="color:#666; font-size:12px;">单价: ¥${i.price}</div>
                    <div class="cart-qty-ctrl">
                        <button onclick="changeCartItemQty(${i.id}, -1)">-</button>
                        <span>${i.quantity}</span>
                        <button onclick="changeCartItemQty(${i.id}, 1)">+</button>
                    </div>
                </div>
                <div style="font-weight:700; font-size:15px; margin-left:20px;">¥${(i.price*i.quantity).toLocaleString()}</div>
                <button class="cart-del-btn" onclick="removeFromCart(${i.id})" title="删除">×</button>
            </div>`;
        }).join('');
        document.getElementById('cart-total').innerText = total.toLocaleString();
        document.getElementById('cart-total-copy').innerText = total.toLocaleString();
    }
}

window.changeCartItemQty = function(id, delta) {
    let cart = JSON.parse(localStorage.getItem('cart_084')||'[]');
    const idx = cart.findIndex(x => x.id === id);
    if(idx !== -1) {
        cart[idx].quantity += delta;
        if(cart[idx].quantity <= 0) cart[idx].quantity = 1;
        localStorage.setItem('cart_084', JSON.stringify(cart));
        renderCart();
        updateCartCount();
    }
}

window.removeFromCart = function(id) {
    let cart = JSON.parse(localStorage.getItem('cart_084')||'[]');
    const idx = cart.findIndex(x => x.id === id);
    if(idx !== -1) {
        if(confirm("确定从购物袋中移除此商品？")) {
            cart.splice(idx, 1);
            localStorage.setItem('cart_084', JSON.stringify(cart));
            renderCart();
            updateCartCount();
        }
    }
}

// --- UI UTILS ---
function setupImageViewer() {
    const modal = document.getElementById('img-viewer-modal');
    if(!modal) return;
    modal.onclick = (e) => {
        if(e.target === modal || e.target.classList.contains('close-viewer')) {
            modal.classList.remove('active');
        }
    };
}
window.openImageViewer = (src) => {
    const modal = document.getElementById('img-viewer-modal');
    const img = document.getElementById('viewer-img');
    if(modal && img) {
        img.src = src;
        modal.classList.add('active');
    }
}

window.handleCheckout = function(e) {
    e.preventDefault();
    const modal = document.getElementById('checkout-success-modal');
    if(modal) modal.classList.add('active');
    setTimeout(() => {
        localStorage.removeItem('cart_084');
        window.location.href = "index.html";
    }, 2000);
}

window.handleContactSubmit = function(e) {
    e.preventDefault();
    const modal = document.getElementById('contact-success-modal');
    if(modal) modal.classList.add('active');
    setTimeout(() => {
        if(modal) modal.classList.remove('active');
        e.target.reset();
    }, 2000);
}

function updateCartCount() {
    const c = JSON.parse(localStorage.getItem('cart_084')||'[]');
    const count = c.reduce((a,b)=>a+b.quantity,0);
    document.querySelectorAll('.cart-count').forEach(e => e.innerText = count);
}

// ==========================================================
// --- ADMIN SYSTEM ---
// ==========================================================

function initAdminApp() {
    renderAdminProducts(); 
    
    document.querySelectorAll('.admin-nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            const href = link.getAttribute('href');
            if(href && href.includes('index.html')) return; 
            e.preventDefault();
            const targetId = href.substring(1);
            document.querySelectorAll('.admin-nav-link').forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
            const target = document.getElementById(targetId);
            if(target) target.classList.add('active');
        });
    });

    const m = document.getElementById('set-marquee');
    if(m) m.value = MALL_DB.config.marquee || "";

    const bgm = document.getElementById('set-bgm');
    if(bgm) bgm.value = MALL_DB.config.bgmUrl || "";

    const vid = document.getElementById('set-video');
    if(vid) vid.value = MALL_DB.config.videoUrl || "";
}

// --- Admin Products & Batch Logic ---
let productViewMode = 'list';
let selectedProductIds = new Set(); 

window.switchProductView = function(mode) {
    productViewMode = mode;
    document.getElementById('btn-view-list').className = `view-btn ${mode==='list'?'active':''}`;
    document.getElementById('btn-view-grid').className = `view-btn ${mode==='grid'?'active':''}`;
    
    document.getElementById('btn-view-list').style.background = mode==='list'?'#f1f5f9':'#fff';
    document.getElementById('btn-view-grid').style.background = mode==='grid'?'#f1f5f9':'#fff';

    document.getElementById('product-view-list').style.display = mode==='list'?'block':'none';
    document.getElementById('product-view-grid').style.display = mode==='grid'?'grid':'none';
    
    selectedProductIds.clear();
    updateBatchToolbar();
    renderAdminProducts();
}

window.toggleSelectProduct = function(id) {
    if(selectedProductIds.has(id)) selectedProductIds.delete(id);
    else selectedProductIds.add(id);
    updateBatchToolbar();
}

window.toggleSelectAll = function(source) {
    const isChecked = source.checked;
    const q = (document.getElementById('product-search')?.value || "").toLowerCase();
    const filtered = MALL_DB.products.filter(p => p.name.toLowerCase().includes(q));
    
    if(isChecked) {
        filtered.forEach(p => selectedProductIds.add(p.id));
    } else {
        selectedProductIds.clear();
    }
    renderAdminProducts(); 
    updateBatchToolbar();
}

function updateBatchToolbar() {
    const toolbar = document.getElementById('batch-toolbar');
    const countSpan = document.getElementById('batch-count');
    if(selectedProductIds.size > 0) {
        toolbar.style.display = 'flex';
        countSpan.innerText = selectedProductIds.size;
    } else {
        toolbar.style.display = 'none';
        const selectAll = document.getElementById('select-all-checkbox');
        if(selectAll) selectAll.checked = false;
    }
}

window.renderAdminProducts = function() {
    const q = (document.getElementById('product-search')?.value || "").toLowerCase();
    const filtered = MALL_DB.products.filter(p => p.name.toLowerCase().includes(q));
    
    const tbody = document.getElementById('admin-product-list');
    if(tbody) {
        tbody.innerHTML = filtered.map(p => `
            <tr>
                <td width="40"><input type="checkbox" onchange="toggleSelectProduct(${p.id})" ${selectedProductIds.has(p.id) ? 'checked' : ''}></td>
                <td>${p.id}</td>
                <td>
                    <div class="table-product-info">
                        <img src="${p.image}" onclick="quickEditImage(${p.id})" title="点击修改图片" style="cursor:pointer; border:1px solid #e2e8f0;">
                        <span>${p.name}</span>
                    </div>
                </td>
                <td>¥${p.price}</td>
                <td>${p.category}</td>
                <td>${p.stock}</td>
                <td>
                    <button class="btn-secondary" onclick="editProduct(${p.id})">编辑</button>
                    <button class="btn-secondary" onclick="deleteProduct(${p.id})" style="color:#ef4444;">删除</button>
                </td>
            </tr>
        `).join('');
    }

    const grid = document.getElementById('product-view-grid');
    if(grid) {
        grid.innerHTML = filtered.map(p => `
            <div class="admin-grid-card">
                <img src="${p.image}" class="admin-grid-img" onclick="quickEditImage(${p.id})" title="点击修改图片" style="cursor:pointer;">
                <div class="admin-grid-body">
                    <div style="font-weight:700; font-size:13px; margin-bottom:5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${p.name}</div>
                    <div style="font-size:12px; color:#666; display:flex; justify-content:space-between;">
                        <span>¥${p.price}</span>
                        <span>库存: ${p.stock}</span>
                    </div>
                    <div style="margin-top:10px; display:flex; gap:5px;">
                        <button class="btn-secondary" style="flex:1;" onclick="editProduct(${p.id})">编辑</button>
                    </div>
                </div>
            </div>
        `).join('');
    }
}

window.batchUploadImage = function() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if(!file) return;
        const reader = new FileReader();
        reader.onload = async (evt) => {
            const base64 = evt.target.result;
            MALL_DB.customAssets.unshift(base64);
            let count = 0;
            MALL_DB.products.forEach(p => {
                if(selectedProductIds.has(p.id)) {
                    p.image = base64;
                    count++;
                }
            });
            await saveData();
            renderAdminProducts();
            alert(`已成功更新 ${count} 个商品的图片`);
            selectedProductIds.clear();
            updateBatchToolbar();
        };
        reader.readAsDataURL(file);
    };
    input.click();
}

let quickEditProductId = null;
window.quickEditImage = function(id) {
    quickEditProductId = id;
    document.getElementById('quick-product-upload').click();
}

window.handleQuickProductUpload = function(input) {
    if (input.files && input.files[0] && quickEditProductId !== null) {
         const reader = new FileReader();
         reader.onload = async (e) => {
             const base64 = e.target.result;
             const p = MALL_DB.products.find(x => x.id === quickEditProductId);
             if(p) {
                 p.image = base64;
                 MALL_DB.customAssets.unshift(base64);
                 await saveData();
                 renderAdminProducts();
             }
             input.value = ''; 
             quickEditProductId = null;
         };
         reader.readAsDataURL(input.files[0]);
    }
}

window.openAddProduct = function() {
    document.getElementById('edit-id').value = '';
    document.getElementById('edit-name').value = '';
    document.getElementById('edit-price').value = '';
    document.getElementById('edit-stock').value = 99;
    document.getElementById('edit-img-url').value = '';
    document.getElementById('edit-img-preview').src = '';
    document.getElementById('gallery-visual-area').innerHTML = '<span style="color:#94a3b8; font-size:12px;">保存商品后可编辑更多图片</span>';
    document.getElementById('product-modal').classList.add('active');
}

window.editProduct = function(id) {
    const p = MALL_DB.products.find(x => x.id === id);
    if(!p) return;
    document.getElementById('edit-id').value = p.id;
    document.getElementById('edit-name').value = p.name;
    document.getElementById('edit-price').value = p.price;
    document.getElementById('edit-cat').value = p.category;
    document.getElementById('edit-stock').value = p.stock;
    document.getElementById('edit-img-url').value = p.image;
    document.getElementById('edit-img-preview').src = p.image;
    const galDiv = document.getElementById('gallery-visual-area');
    const gal = p.gallery || [];
    galDiv.innerHTML = gal.map(img => `<img src="${img}" style="width:40px; height:40px; border-radius:4px; object-fit:cover; border:1px solid #ddd;">`).join('') 
                       + `<button class="btn-secondary" onclick="alert('请在图墙模式下管理详细图库')" style="margin-left:10px;">+</button>`;
    document.getElementById('product-modal').classList.add('active');
}

window.saveProduct = async function() {
    const idVal = document.getElementById('edit-id').value;
    const isNew = !idVal;
    const product = {
        id: isNew ? Date.now() : parseInt(idVal),
        name: document.getElementById('edit-name').value,
        price: parseFloat(document.getElementById('edit-price').value) || 0,
        category: document.getElementById('edit-cat').value,
        stock: parseInt(document.getElementById('edit-stock').value) || 0,
        image: document.getElementById('edit-img-url').value || 'https://via.placeholder.com/300',
        gallery: isNew ? [] : (MALL_DB.products.find(x=>x.id==idVal)?.gallery || [])
    };
    
    if(isNew) MALL_DB.products.unshift(product);
    else {
        const idx = MALL_DB.products.findIndex(x => x.id == idVal);
        if(idx !== -1) MALL_DB.products[idx] = product;
    }
    await saveData();
    closeModal();
    renderAdminProducts();
}

window.deleteProduct = async function(id) {
    if(confirm('确定要删除此商品吗？')) {
        MALL_DB.products = MALL_DB.products.filter(p => p.id !== id);
        await saveData();
        renderAdminProducts();
    }
}

let targetInputId = null;
let currentMediaType = 'all';

function getMediaType(url) {
    if(!url) return 'unknown';
    const ext = url.split('.').pop().toLowerCase();
    if(['jpg','jpeg','png','gif','webp'].includes(ext)) return 'image';
    if(['mp4','webm','ogg','mov'].includes(ext)) return 'video';
    if(['mp3','wav'].includes(ext)) return 'audio';
    if(url.includes('images.unsplash')) return 'image';
    if(url.includes('assets.mixkit') || url.includes('.mp4')) return 'video';
    if(url.includes('soundhelix') || url.includes('.mp3')) return 'audio';
    if(url.startsWith('data:image')) return 'image';
    if(url.startsWith('data:audio')) return 'audio';
    if(url.startsWith('data:video')) return 'video';
    return 'image';
}

window.openMediaLib = function(inputId, type='all') {
    targetInputId = inputId;
    currentMediaType = type;
    switchLibTab(type === 'product' ? 'product' : 'all'); 
    document.getElementById('media-lib-modal').classList.add('active');
}

window.triggerDirectUpload = function(inputId) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,video/*,audio/*';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if(!file) return;
        const reader = new FileReader();
        reader.onload = async (evt) => {
            const base64 = evt.target.result;
            MALL_DB.customAssets.unshift(base64);
            await saveData(); 
            const targetEl = document.getElementById(inputId);
            if(targetEl) {
                targetEl.value = base64;
                targetEl.dispatchEvent(new Event('input')); 
            }
        };
        reader.readAsDataURL(file);
    };
    input.click();
}

window.switchLibTab = function(tab) {
    document.querySelectorAll('.lib-tab').forEach(t => {
        t.style.borderBottom = 'none';
        t.style.color = '#64748b';
        t.style.fontWeight = '600';
    });
    const activeTab = document.getElementById(`tab-${tab}`);
    if(activeTab) {
        activeTab.style.borderBottom = '2px solid #0f172a';
        activeTab.style.color = '#0f172a';
    }

    const grid = document.getElementById('media-grid');
    const upload = document.getElementById('upload-panel');
    
    if(tab === 'custom') {
        grid.style.display = 'none';
        upload.style.display = 'block';
    } else {
        grid.style.display = 'grid';
        grid.className = 'media-grid';
        upload.style.display = 'none';
        
        const stockImg = MALL_DB.products.map(p => p.image);
        const stockGal = MALL_DB.products.flatMap(p => p.gallery || []);
        let assets = [...new Set([...MALL_DB.customAssets, ...stockImg, ...stockGal])];
        
        if(MALL_DB.config.videoUrl && !assets.includes(MALL_DB.config.videoUrl)) assets.push(MALL_DB.config.videoUrl);
        if(MALL_DB.config.bgmUrl && !assets.includes(MALL_DB.config.bgmUrl)) assets.push(MALL_DB.config.bgmUrl);

        if(tab === 'product') {
            assets = assets.filter(u => getMediaType(u) === 'image');
        } else if (tab === 'media') {
            assets = assets.filter(u => getMediaType(u) === 'video' || getMediaType(u) === 'audio');
        }

        grid.innerHTML = assets.map(url => {
            const type = getMediaType(url);
            let content = '';
            let tag = '';
            
            if(type === 'image') content = `<img src="${url}">`;
            else if (type === 'video') {
                content = `<span class="media-item-icon">🎬</span>`;
                tag = `<div class="media-item-tag">Video</div>`;
            } else if (type === 'audio') {
                content = `<span class="media-item-icon">🎵</span>`;
                tag = `<div class="media-item-tag">Audio</div>`;
            }
            
            return `
            <div class="media-item" onclick="selectMedia('${url}')" title="${url}">
                ${content}
                ${tag}
            </div>
            `;
        }).join('');
    }
}

window.selectMedia = function(url) {
    if(targetInputId) {
        const el = document.getElementById(targetInputId);
        if(el) {
            el.value = url;
            el.dispatchEvent(new Event('input')); 
        }
    }
    closeModal();
}

window.handleFileUpload = function(input) {
    if(input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = async function(e) {
            const res = e.target.result;
            MALL_DB.customAssets.unshift(res);
            await saveData();
            selectMedia(res); 
        }
        reader.readAsDataURL(input.files[0]);
    }
}

window.useCustomUrl = async function() {
    const url = document.getElementById('custom-url-input').value;
    if(url) {
        MALL_DB.customAssets.unshift(url);
        await saveData();
        selectMedia(url);
    }
}

window.saveSettings = async function() {
    MALL_DB.config.marquee = document.getElementById('set-marquee').value;
    MALL_DB.config.bgmUrl = document.getElementById('set-bgm').value;
    MALL_DB.config.videoUrl = document.getElementById('set-video').value;
    
    if(MALL_DB.config.bgmUrl) window.updateGlobalAudioSource(MALL_DB.config.bgmUrl);

    await saveData();
    alert("系统配置已更新，并已保存到本地存储。");
}

window.clearSystemCache = async function() {
    if(confirm("确定要强制清除所有本地缓存吗？\n这将重新从 data.js 加载默认数据。\n\n适用于：导出 data.js 并覆盖后，页面未更新的情况。")) {
        localStorage.clear();
        await IDB.clear();
        alert("缓存已清除。页面将刷新。");
        window.location.reload();
    }
}

window.exportSystemData = function() {
    const jsContent = `window.MALL_DATA = ${JSON.stringify(MALL_DB, null, 4)};`;
    const blob = new Blob([jsContent], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href", url);
    dlAnchorElem.setAttribute("download", "data.js");
    dlAnchorElem.click();
    URL.revokeObjectURL(url);
}

window.closeModal = closeModal;