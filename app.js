// Photopia — app.js （完整前端逻辑，注册/登录为独立操作）
// 依赖：gun.js + sea.js 已在 index.html 中引入

// ========== 配置 ==========
const ADMIN_EMAIL = "haochenxihehaohan@outlook.com"; // 管理员邮箱（可改）
const GUN_PEERS = [
  "https://gun-manhattan.herokuapp.com/gun",
  "https://gun-us.herokuapp.com/gun",
  "https://gunjs.herokuapp.com/gun",
  "https://gun-eu.herokuapp.com/gun"
];

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

// ========== Auth UI (register & login modals) ==========
function renderAuthArea(){
  const area = $('authArea');
  area.innerHTML = '';
  if(!me){
    area.innerHTML = `
      <button onclick="openLoginModal()">登录</button>
      <button onclick="openRegisterModal()">注册</button>
    `;
  }else{
    area.innerHTML = `
      <span style="margin-right:8px">${escapeHtml(me.name || me.alias || '我')}</span>
      <button onclick="logout()">登出</button>
    `;
  }
  renderProfileCard();
}

function openRegisterModal(){
  $('regEmail').value = '';
  $('regPass').value = '';
  $('regPass2').value = '';
  $('regError').innerText = '';
  $('registerModal').style.display = 'flex';
}

function openLoginModal(){
  $('loginEmail').value = '';
  $('loginPass').value = '';
  $('loginError').innerText = '';
  $('loginModal').style.display = 'flex';
}

function closeModalById(id){
  $(id).style.display = 'none';
}
function modalBackgroundClick(ev, id){
  if(ev.target.id === id){
    closeModalById(id);
  }
}

// ===== 注册流程（独立） =====
function submitRegister(){
  const email = $('regEmail').value && $('regEmail').value.trim();
  const pass = $('regPass').value || '';
  const pass2 = $('regPass2').value || '';
  if(!email) return $('regError').innerText = '请输入邮箱作为用户名';
  if(pass.length < 6) return $('regError').innerText = '密码至少 6 位';
  if(pass !== pass2) return $('regError').innerText = '两次密码不一致';
  $('regError').innerText = '正在注册...';
  user.create(email, pass, ack => {
    if(ack.err){
      console.error('create err', ack);
      $('regError').innerText = '注册失败：' + (ack.err || '未知错误');
    }else{
      // 注册后自动登录
      user.auth(email, pass, aut => {
        if(aut.err){
          $('regError').innerText = '注册成功但自动登录失败：' + aut.err;
        }else{
          closeModalById('registerModal');
          onAuth();
        }
      });
    }
  });
}

// ===== 登录流程（独立） =====
function submitLogin(){
  const email = $('loginEmail').value && $('loginEmail').value.trim();
  const pass = $('loginPass').value || '';
  if(!email) return $('loginError').innerText = '请输入邮箱';
  if(!pass) return $('loginError').innerText = '请输入密码';
  $('loginError').innerText = '正在登录...';
  user.auth(email, pass, ack => {
    if(ack.err){
      console.error('auth err', ack);
      $('loginError').innerText = '登录失败：' + (ack.err || '错误');
    }else{
      closeModalById('loginModal');
      onAuth();
    }
  });
}

// 普通登出
function logout(){
  user.leave();
  me = null;
  renderAuthArea();
  renderFeed();
}

// ========== 自动会话恢复 ==========
user.recall({sessionStorage: true}, () => {
  if(user.is && user.is.pub){
    users.get(user.is.pub).once(profile => {
      me = profile || { pub: user.is.pub };
      me.pub = user.is.pub;
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
    actions.innerHTML = '<button onclick="openLoginModal()">登录 / 注册</button>';
  }else{
    avatar.src = me.avatar || defaultAvatar(me.pub);
    name.innerText = me.name || me.alias || me.pub;
    bio.innerText = me.bio || '这个人很懒，什么都没写';
    gun.get('userStats').get(me.pub).once(s => {
      if(!s) s = {};
      statsDiv.innerHTML = `作品: ${s.uploads||0} · 点赞数: ${s.likes||0}`;
    });
    actions.innerHTML = `
      <button onclick="editProfile()">编辑资料</button>
      <button onclick="openUpload()">上传</button>
    `;
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
        const userPair = user._ && user._.sea ? user._.sea : await Gun.SEA.pair();
        const str = JSON.stringify(payload);
        const enc = await Gun.SEA.encrypt(str, userPair).catch(async ()=> {
          const k = (Math.random()+"").slice(2);
          return Gun.SEA.encrypt(str, k);
        });
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
     