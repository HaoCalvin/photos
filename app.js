// Photopia — app.js （完整前端逻辑，注册与登录分开，增加注册后自动登录开关）
// 依赖：gun.js + sea.js 已在 index.html 中引入

// ========== 配置 ==========
const ADMIN_EMAIL = "haochenxihehaohan@outlook.com"; // 管理员邮箱（可改）
const GUN_PEERS = [
  // 使用公开的 HTTPS relay peers（这些是公共节点，用于去中心化同步）
  "https://gun-manhattan.herokuapp.com/gun",
  "https://gun-us.herokuapp.com/gun",
  "https://gunjs.herokuapp.com/gun",
  "https://gun-eu.herokuapp.com/gun"];

// ========== 全局 ==========
const gun = Gun({ peers: GUN_PEERS });
const user = gun.user();
const images = gun.get('images'); // imageId -> imageNode
const keywordsIndex = gun.get('keywords'); // keyword -> set of imageIds
const users = gun.get('users'); // alias/email -> profile info
const likes = gun.get('likes'); // imageId -> set of pubkeys
const stats = gun.get('stats'); // global stats
let me = null; // 当前用户数据
let theme = localStorage.getItem('photopia_theme') || 'dark';
document.documentElement.setAttribute('data-theme', theme);
document.getElementById('themeSelect').value = theme;
document.getElementById('adminEmailDisplay').innerText = ADMIN_EMAIL;

// ========== UI helpers ==========
function $(id){ return document.getElementById(id); }
function goHome(){ renderFeed(); }

// Debounce for search input
let searchTimer = null;
function debouncedSearch(){
  clearTimeout(searchTimer);
  searchTimer = setTimeout(doSearch, 400);
}

// ========== Auth ==========
function renderAuthArea(){
  const area = $('authArea');
  area.innerHTML = '';
  if(!me){
    // 明确标注注册不会自动登录，避免用户误解
    area.innerHTML = `
      <button onclick="openLogin()">登录</button>
      <button onclick="openRegister()">注册（不自动登录）</button>
    `;
  }else{
    area.innerHTML = `
      <span style="margin-right:8px">${escapeHtml(me.name || me.alias || '我')}</span>
      <button onclick="logout()">登出</button>
    `;
  }
  renderProfileCard();
}

function openRegister(){
  // 注册仅创建账号；是否自动登录由“注册后自动登录”开关决定
  const email = prompt("注册邮箱（会作为用户名）:");
  if(!email) return alert("需要邮箱作为用户名");
  const pass = prompt("密码（至少 6 位）:");
  if(!pass || pass.length < 6) return alert("密码太短");
  user.create(email, pass, ack => {
    if(ack.err){
      alert("注册出错: " + ack.err);
    }else{
      // 读取用户设置，决定是否自动登录
      const auto = localStorage.getItem('photopia_autoLoginAfterRegister') === '1';
      if(auto){
        // 自动登录
        user.auth(email, pass, aut => {
          if(aut.err){
            alert("注册成功，但自动登录失败： " + aut.err + " 请手动登录。");
          }else{
            alert("注册并已自动登录。");
            onAuth();
          }
        });
      }else{
        alert("注册成功。请使用 登录 按钮 用相同的邮箱/密码进行登录。");
      }
    }
  });
}

function openLogin(){
  const email = prompt("邮箱:");
  if(!email) return;
  const pass = prompt("密码:");
  if(!pass) return;
  user.auth(email, pass, ack => {
    if(ack.err){ alert("登录失败: " + ack.err); }
    else onAuth();
  });
}

function onAuth(){
  user.recall({sessionStorage: true}, () => {
    user.get('alias').once(alias => {
      users.get(user.is.pub).once(profile => {
        me = profile || {};
        me.pub = user.is.pub;
        me.alias = alias || me.alias || user.is.pub;
        renderAuthArea();
        renderFeed(); // refresh feed so private items appear
      });
    });
  });
}

function logout(){
  user.leave();
  me = null;
  renderAuthArea();
  renderFeed();
}

// keep session if already authed
user.get('alias').on(()=>{});
user.map().once(()=>{});
user.recall('sessionStorage', ack => {
  if(user.is && user.is.pub){
    users.get(user.is.pub).once(profile => {
      me = profile || { pub: user.is.pub };
      renderAuthArea();
    });
  }else{
    renderAuthArea();
  }
});

// ========== Profile ==========
function renderProfileCard(){
  const avatar = $('profileAvatar');
  const name = $('profileName');
  const bio = $('profileBio');
  const statsDiv = $('profileStats');
  const actions = $('profileActions');
  if(!me){
    avatar.src = '';
    name.innerText = '未登录';
    bio.innerText = '请登录以发布与管理你的照片';
    statsDiv.innerHTML = '';
    actions.innerHTML = '<button onclick="openLogin()">登录 / 注册</button>';
  }else{
    avatar.src = me.avatar || defaultAvatar(me.pub);
    name.innerText = me.name || me.alias || me.pub;
    bio.innerText = me.bio || '这个人很懒，什么都没写';
    gun.get('userStats').get(me.pub).once(s => {
      if(!s) s = {};
      statsDiv.innerHTML = `作品: ${s.uploads||0} · 点赞数: ${s.likes||0}`;
    });

    // 显示“注册后自动登录”开关（保存在 localStorage）
    const auto = localStorage.getItem('photopia_autoLoginAfterRegister') === '1';
    actions.innerHTML = `
      <button onclick="editProfile()">编辑资料</button>
      <button onclick="openUpload()">上传</button>
      <div style="margin-top:8px;font-size:13px">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
          <input type="checkbox" id="autoLoginAfterRegister" ${auto ? 'checked' : ''} />
          <span>注册后自动登录</span>
        </label>
      </div>
    `;
    // 绑定开关事件
    const chk = $('autoLoginAfterRegister');
    if(chk){
      chk.onchange = () => {
        localStorage.setItem('photopia_autoLoginAfterRegister', chk.checked ? '1' : '0');
        alert('设置已保存：注册后自动登录 ' + (chk.checked ? '已启用' : '已禁用'));
      };
    }
  }
}

function editProfile(){
  if(!me) return alert("请先登录");
  const newName = prompt("姓名：", me.name || "");
  const newBio = prompt("简介：", me.bio || "");
  const newAvatar = prompt("头像 URL（留空保留现状）：", me.avatar || "");
  const updated = Object.assign({}, me, { name: newName, bio: newBio, avatar: newAvatar || me.avatar });
  users.get(user.is.pub).put(updated);
  users.get(user.is.pub).once(p=>{
    me = updated;
    renderProfileCard();
    alert("已更新");
  });
}

// ========== Upload ==========
function openUpload(){
  window.location.hash = "#upload";
  $('fileInput').scrollIntoView({behavior:'smooth'});
}

function defaultAvatar(seed){
  const c = document.createElement('canvas'), w=64; c.width=c.height=w;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#123456';
  ctx.fillRect(0,0,w,w);
  ctx.fillStyle = '#fff'; ctx.font='bold 28px sans-serif';
  ctx.fillText((seed||'U').slice(0,1).toUpperCase(), 18,44);
  return c.toDataURL();
}

async function doUpload(){
  if(!user.is || !user.is.pub) return alert("请先登录后上传（注册/登录）");
  const files = $('fileInput').files;
  const keywordsRaw = $('keywordsInput').value || '';
  const privateFlag = $('privateCheck').checked;
  if(!files || files.length === 0) return alert("请选择至少一张图片");
  const keywords = keywordsRaw.split(',').map(s=>s.trim()).filter(Boolean);
  if(keywords.length === 0) return alert("至少填写一个关键词");
  $('uploadStatus').innerText = "正在上传...";
  for(let f of files){
    try{
      const dataUrl = await readAndResizeImage(f, 1600);
      let payload = { dataUrl, mime: f.type || 'image/jpeg' };
      let stored;
      if(privateFlag){
        const userPair = user._?.sea;
        let enc;
        try{
          enc = await Gun.SEA.encrypt(JSON.stringify(payload), userPair || (await Gun.SEA.pair()));
        }catch(e){
          enc = await Gun.SEA.encrypt(JSON.stringify(payload), (Math.random()+"").slice(2));
        }
        stored = {encrypt: true, cipher: enc};
      }else{
        stored = {encrypt: false, dataUrl: payload.dataUrl};
      }

      const id = 'img_' + Date.now() + '_' + Math.random().toString(36).slice(2,9);
      const node = {
        id,
        owner: user.is.pub,
        ownerAlias: user.is.alias || user.is.pub,
        createdAt: new Date().toISOString(),
        keywords,
        private: !!privateFlag,
        content: stored,
        views: 0,
        likes: 0
      };
      images.get(id).put(node);
      for(let k of keywords){
        keywordsIndex.get(k.toLowerCase()).set(id);
      }
      gun.get('userStats').get(user.is.pub).once(s=>{
        s = s || {}; s.uploads = (s.uploads || 0) + 1;
        gun.get('userStats').get(user.is.pub).put(s);
      });
      stats.get('uploads').put(Gun.time());
      $('uploadStatus').innerText = `已上传 ${f.name}`;
    }catch(e){
      console.error(e);
      $('uploadStatus').innerText = "上传错误：" + e;
    }
  }
  $('uploadStatus').innerText += " 完成。";
  $('fileInput').value = '';
  $('keywordsInput').value = '';
  setTimeout(()=>renderFeed(), 800);
}

function readAndResizeImage(file, maxDim=1600){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onload = function(e){
      const img = new Image();
      img.onload = function(){
        let w = img.width, h = img.height;
        if(Math.max(w,h) > maxDim){
          const ratio = maxDim / Math.max(w,h);
          w = Math.round(w * ratio); h = Math.round(h * ratio);
        }
        const c = document.createElement('canvas'); c.width=w; c.height=h;
        const ctx = c.getContext('2d');
        ctx.drawImage(img,0,0,w,h);
        const q = 0.85;
        resolve(c.toDataURL('image/jpeg', q));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ========== Feed rendering & real-time ==========
let renderedIds = new Set();

function renderFeed(onlyIds){
  const feed = $('feedArea');
  feed.innerHTML = '';
  renderedIds = new Set();
  images.map().on((img, id)=>{
    if(!img || !img.id) return;
    if(img.private && (!me || me.pub !== img.owner) && (me && me.pub !== ADMIN_EMAIL && (me && me.pub !== ADMIN_EMAIL))) {
      return;
    }
    if(onlyIds && !onlyIds.includes(img.id)) return;
    if(renderedIds.has(img.id)) return;
    renderedIds.add(img.id);
    addCardToFeed(img);
  });
  updateGlobalStats();
  loadHotList();
}

function addCardToFeed(img){
  const tpl = document.getElementById('cardTpl').content.cloneNode(true);
  const card = tpl.querySelector('.card');
  const imgEl = card.querySelector('.card-image img');
  const authorImg = card.querySelector('.small-avatar');
  const authorName = card.querySelector('.author-name');
  const keys = card.querySelector('.card-keys');
  const likeBtn = card.querySelector('.like-btn');
  const likeCount = card.querySelector('.like-count');
  const viewBtn = card.querySelector('.view-btn');
  const moreBtn = card.querySelector('.more-btn');

  authorImg.src = defaultAvatar(img.owner);
  authorName.innerText = img.ownerAlias || img.owner;
  keys.innerText = (img.keywords || []).slice(0,4).join(' · ');

  if(img.content && img.content.encrypt){
    imgEl.src = placeholderForEncrypted();
  }else{
    imgEl.src = img.content && img.content.dataUrl ? img.content.dataUrl : placeholderForEncrypted();
  }

  likes.get(img.id).map().once((v, k)=>{
    let count = 0;
    likes.get(img.id).once(lm=>{
      if(!lm) lm = {};
      count = Object.keys(lm).length;
      likeCount.innerText = count;
    });
  });

  likeBtn.onclick = (e) => {
    e.stopPropagation();
    if(!user.is || !user.is.pub) return alert("请登录后点赞");
    likes.get(img.id).get(user.is.pub).once(v=>{
      if(v){
        likes.get(img.id).get(user.is.pub).put(null);
      }else{
        likes.get(img.id).get(user.is.pub).put(true);
      }
    });
  };

  viewBtn.onclick = (e) => {
    e.stopPropagation();
    images.get(img.id).get('views').put((img.views || 0) + 1);
    openModal(img.id);
  };

  moreBtn.onclick = (e) => {
    e.stopPropagation();
    const menu = [];
    if(me && me.pub === img.owner) menu.push("删除（自己）");
    if(me && me.email === ADMIN_EMAIL) menu.push("管理员删除");
    menu.push("复制链接");
    const sel = prompt("操作：" + menu.join(" / "));
    if(!sel) return;
    if(sel.includes('删除')) {
      if(confirm("确认删除？")){
        images.get(img.id).put(null);
        alert("已请求删除（同步到网络）");
      }
    }else if(sel.includes('复制')){
      navigator.clipboard && navigator.clipboard.writeText(location.href + "#img=" + img.id);
      alert("已复制链接（可能需要用户打开页面并带参数查看）");
    }
  };

  imgEl.onclick = () => openModal(img.id);

  $('feedArea').prepend(card);
}

function placeholderForEncrypted(){
  return 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="100%" height="100%" fill="#222"/><text x="50%" y="50%" fill="#888" font-size="28" font-family="Arial" text-anchor="middle" alignment-baseline="middle">受保护的图片</text></svg>');
}

// ========== Modal (查看大图) ==========
async function openModal(id){
  const modal = $('imageModal');
  const imgNode = await new Promise(res => images.get(id).once(res));
  if(!imgNode) return alert("图片不存在或已被删除");
  if(imgNode.private && (!me || me.pub !== imgNode.owner)){
    return alert("该图片为私密，仅上传者可见");
  }
  const modalImg = $('modalImage');
  const modalAuthor = $('modalAuthor');
  const modalActions = $('modalActions');
  modalAuthor.innerText = `作者：${imgNode.ownerAlias || imgNode.owner} · ${new Date(imgNode.createdAt).toLocaleString()}`;

  if(imgNode.content && imgNode.content.encrypt){
    if(me && me.pub === imgNode.owner){
      try{
        const pair = user._.sea;
        const decrypted = await Gun.SEA.decrypt(imgNode.content.cipher, pair).catch(()=>null);
        if(decrypted){
          const payload = JSON.parse(decrypted);
          modalImg.src = payload.dataUrl;
        }else{
          modalImg.src = placeholderForEncrypted();
        }
      }catch(e){
        modalImg.src = placeholderForEncrypted();
      }
    }else{
      modalImg.src = placeholderForEncrypted();
    }
  }else{
    modalImg.src = imgNode.content && imgNode.content.dataUrl ? imgNode.content.dataUrl : placeholderForEncrypted();
  }

  modalActions.innerHTML = '';
  const likeBtn = document.createElement('button'); likeBtn.innerText = '❤ 点赞';
  likeBtn.onclick = () => {
    if(!user.is || !user.is.pub) return alert("请登录点赞");
    likes.get(id).get(user.is.pub).put(true);
  };
  modalActions.appendChild(likeBtn);

  if(!imgNode.private){
    const dl = document.createElement('button'); dl.innerText = '下载';
    dl.onclick = () => {
      const a = document.createElement('a'); a.href = modalImg.src; a.download = id + '.jpg'; a.click();
    };
    modalActions.appendChild(dl);
  }

  if(me && (me.pub === imgNode.owner || me.email === ADMIN_EMAIL)){
    const del = document.createElement('button'); del.innerText = '删除';
    del.onclick = () => {
      if(confirm("确认删除这张图片？")){
        images.get(id).put(null);
        modal.style.display = 'none';
        alert("已删除（同步）");
      }
    };
    modalActions.appendChild(del);
  }

  modal.style.display = 'flex';
}

function closeModal(ev){
  if(ev.target.id === 'imageModal' || ev.target.classList.contains('modal')){
    $('imageModal').style.display = 'none';
  }
}

// ========== Search ==========
async function doSearch(){
  const q = $('searchInput').value.trim();
  if(!q){ renderFeed(); return; }
  if(q.startsWith('@')){
    const name = q.slice(1);
    const foundIds = [];
    gun.get('users').map().once((u, k)=>{
      if(!u) return;
      if((u.name && u.name.includes(name)) || (u.alias && u.alias.includes(name))){
        images.map().once((img, id)=>{
          if(img && img.owner === k) foundIds.push(img.id);
        });
      }
    });
    setTimeout(()=>renderFeed(foundIds), 1000);
    return;
  }
  const kw = q.toLowerCase();
  const ids = [];
  keywordsIndex.get(kw).map().once((v, k)=>{
    if(v) ids.push(v);
  });
  gun.get('users').map().once((u,k)=>{
    if(!u) return;
    if((u.name && u.name.toLowerCase().includes(kw)) || (u.alias && u.alias.toLowerCase().includes(kw))){
      images.map().once((img,id)=>{
        if(img && img.owner === k) ids.push(img.id);
      });
    }
  });
  setTimeout(()=>renderFeed([...new Set(ids)]), 800);
}

// ========== Hot / Stats ==========
function loadHotList(){
  const hot = $('hotList');
  hot.innerHTML = '加载中...';
  const arr = [];
  images.map().once((img, id)=>{
    if(!img || !img.id) return;
    arr.push(img);
  });
  setTimeout(()=>{
    const list = arr.sort((a,b)=> ((b.likes||0)+(b.views||0)) - ((a.likes||0)+(a.views||0))).slice(0,6);
    hot.innerHTML = '';
    for(let it of list){
      const d = document.createElement('div');
      d.className = 'hot-item';
      d.innerHTML = `<img src="${it.content && it.content.dataUrl ? it.content.dataUrl : placeholderForEncrypted()}" style="width:100%;height:60px;object-fit:cover;border-radius:6px" onclick="openModal('${it.id}')" />`;
      hot.appendChild(d);
    }
  }, 600);
}

function updateGlobalStats(){
  const g = $('globalStats');
  let uploads = 0, usersCount = 0, imagesCount = 0;
  stats.get('uploads').once(v=>{ if(v) uploads++; });
  users.map().once((u,k)=>{ if(u) usersCount++; });
  images.map().once((i,k)=>{ if(i) imagesCount++; });
  setTimeout(()=>{ g.innerText = `用户: ${usersCount} · 图片: ${imagesCount} · 上传记录: ${uploads}`; }, 800);
}

// ========== Utilities ==========
function escapeHtml(s){ if(!s) return ''; return String(s).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[m])); }

function changeTheme(t){
  theme = t; localStorage.setItem('photopia_theme', theme);
  document.documentElement.setAttribute('data-theme', theme);
}

// initial render
renderAuthArea();
renderFeed();

// handle hash links for opening a specific image or profile
window.addEventListener('hashchange', handleHash);
function handleHash(){
  const h = location.hash.slice(1);
  if(!h) return;
  if(h.startsWith('img=')){
    openModal(h.split('=')[1]);
  }else if(h.startsWith('user=')){
    const pub = h.split('=')[1];
    const ids = [];
    images.map().once((img,id)=>{
      if(img && img.owner === pub) ids.push(id);
    });
    setTimeout(()=>renderFeed(ids), 600);
  }
}
handleHash();