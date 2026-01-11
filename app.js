// 流光相册 - 完整前端（GunJS 去中心化示例）
// 说明：把这个静态站点部署到 HTTPS 的静态托管（如 GitHub Pages）即可多人访问并实时同步。
// 主要依赖：gun, sea, webRTC（CDN 引入于 HTML）

// ---------- 配置 ----------
const GUN_PEERS = ['https://gun-manhattan.herokuapp.com/gun']; // 公共 peer 列表（可补充）
const ADMIN_ALIAS = 'admin'; // 示例管理员别名（可改）
const ADMIN_PASS_DEFAULT = 'adminpass123'; // 示例管理员密码（强烈建议上线后改）
// --------------------------------

const gun = Gun({ peers: GUN_PEERS });
const user = gun.user();
let me = null; // 存储登录后用户信息：{pub,alias,...}
let localState = { photos: {}, likes: {}, profiles: {} };

// DOM
const profileCard = document.getElementById('profileCard');
const statsContent = document.getElementById('statsContent');
const hotList = document.getElementById('hotList');
const feed = document.getElementById('feed');

const uploadCard = document.getElementById('uploadCard');
const uploadBtn = document.getElementById('uploadBtn');
const closeUploadBtn = document.getElementById('closeUploadBtn');
const doUploadBtn = document.getElementById('doUploadBtn');
const fileInput = document.getElementById('fileInput');
const photoTitle = document.getElementById('photoTitle');
const photoKeywords = document.getElementById('photoKeywords');
const photoHidden = document.getElementById('photoHidden');
const uploadStatus = document.getElementById('uploadStatus');

const loginAlias = document.getElementById('loginAlias');
const loginPass = document.getElementById('loginPass');
const loginBtn = document.getElementById('loginBtn');
const registerBtn = document.getElementById('registerBtn');
const logoutBtn = document.getElementById('logoutBtn');
const editProfileBtn = document.getElementById('editProfileBtn');
const loginMsg = document.getElementById('loginMsg');

const profileEditCard = document.getElementById('profileEditCard');
const editName = document.getElementById('editName');
const editBio = document.getElementById('editBio');
const editAvatarFile = document.getElementById('editAvatarFile');
const saveProfileBtn = document.getElementById('saveProfileBtn');
const cancelEditProfileBtn = document.getElementById('cancelEditProfileBtn');

const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const profileBtn = document.getElementById('profileBtn');

const viewer = document.getElementById('viewer');
const viewerImg = document.getElementById('viewerImg');
const viewerMeta = document.getElementById('viewerMeta');
const viewerClose = document.getElementById('viewerClose');
const viewerBackdrop = document.getElementById('viewerBackdrop');

const themeBtn = document.getElementById('themeBtn');

// UI 控制
uploadBtn.onclick = ()=> { uploadCard.hidden = false; }
closeUploadBtn.onclick = ()=> { uploadCard.hidden = true; uploadStatus.innerText=''; fileInput.value=''; photoTitle.value=''; photoKeywords.value=''; photoHidden.checked=false; }
profileBtn.onclick = ()=> { showMyProfile(); }
searchBtn.onclick = ()=> { doSearch(searchInput.value.trim()); }

// 主题切换
const themes = [null,'theme-light','theme-white'];
let themeIndex = 0;
themeBtn.onclick = ()=>{
  themeIndex = (themeIndex+1) % themes.length;
  document.body.className = themes[themeIndex] || '';
  themeBtn.innerText = themes[themeIndex] ? (themes[themeIndex]==='theme-white'?'白色':'浅色') : '深色';
}

// 登录 / 注册
registerBtn.onclick = async ()=>{
  const aliasOrEmail = loginAlias.value.trim();
  const pass = loginPass.value;
  if(!aliasOrEmail || !pass){ loginMsg.innerText='请输入用户名或邮箱与密码'; return; }
  // 如果输入是邮箱（包含 @），我们把 alias 从邮箱前缀自动生成（保证唯一性），并把邮箱映射到 alias
  const isEmail = aliasOrEmail.includes('@');
  let alias = aliasOrEmail;
  if(isEmail){
    alias = aliasOrEmail.split('@')[0] + '_' + Math.floor(Math.random()*10000);
  }
  user.create(alias, pass, ack=>{
    if(ack.err){ loginMsg.innerText = '注册失败: '+ack.err; return; }
    // 登录并保存邮箱映射+基础 profile
    user.auth(alias, pass, async a=>{
      if(a.err){ loginMsg.innerText='注册但登录失败: '+a.err; return; }
      me = user.is;
      const profile = { name: alias, bio:'', avatar:'' , email: isEmail?aliasOrEmail:'' };
      gun.get('profiles').get(me.pub).put(profile);
      if(isEmail){
        gun.get('byEmail').get(aliasOrEmail).put(alias);
      }
      loginMsg.innerText = '注册并登录成功';
      afterLogin();
    });
  });
};

loginBtn.onclick = async ()=>{
  const aliasOrEmail = loginAlias.value.trim();
  const pass = loginPass.value;
  if(!aliasOrEmail || !pass){ loginMsg.innerText='请输入用户名或邮箱与密码'; return; }
  // 如果输入是邮箱，先查别名
  if(aliasOrEmail.includes('@')){
    gun.get('byEmail').get(aliasOrEmail).once(async res=>{
      if(!res){ loginMsg.innerText='该邮箱未注册'; return; }
      const alias = res;
      user.auth(alias, pass, ack=>{
        if(ack.err){ loginMsg.innerText='登录失败: '+ack.err; return; }
        me = user.is; loginMsg.innerText='登录成功'; afterLogin();
      });
    });
  } else {
    user.auth(aliasOrEmail, pass, ack=>{
      if(ack.err){ loginMsg.innerText='登录失败: '+ack.err; return; }
      me = user.is; loginMsg.innerText='登录成功'; afterLogin();
    });
  }
};

logoutBtn.onclick = ()=>{
  user.leave();
  me = null;
  loginMsg.innerText = '已登出';
  renderProfileCard();
  renderFeed(); // 隐私图片会消失
};

editProfileBtn.onclick = ()=>{
  if(!me){ loginMsg.innerText='请先登录'; return; }
  // show edit
  profileEditCard.hidden = false;
  // load current profile
  gun.get('profiles').get(me.pub).once(p=>{
    editName.value = p?.name || '';
    editBio.value = p?.bio || '';
  });
};

saveProfileBtn.onclick = async ()=>{
  if(!me){ alert('请登录'); return; }
  const name = editName.value.trim();
  const bio = editBio.value.trim();
  let avatarData = null;
  if(editAvatarFile.files && editAvatarFile.files[0]){
    avatarData = await readFileAsDataURL(editAvatarFile.files[0]);
  }
  const profile = { name, bio, avatar: avatarData || '' };
  gun.get('profiles').get(me.pub).put(profile);
  profileEditCard.hidden = true;
};

cancelEditProfileBtn.onclick = ()=>{ profileEditCard.hidden = true; }

// 管理员按钮：弹出输入对话，快速切换到 admin
document.getElementById('adminDeleteBtn').onclick = ()=>{
  const pwd = prompt('输入管理员密码 (默认示例: adminpass123) 进入管理员账号以删除图片（建议改密码）');
  if(!pwd) return;
  // 尝试登录管理员别名
  user.auth(ADMIN_ALIAS, pwd, ack=>{
    if(ack.err){
      alert('管理员登录失败：'+ack.err);
      return;
    }
    me = user.is;
    alert('已以管理员身份登录，可删除图片（慎用）');
    renderProfileCard();
  });
};

// 上传
doUploadBtn.onclick = async ()=>{
  if(!me){ uploadStatus.innerText='请先登录'; return; }
  if(!fileInput.files || !fileInput.files[0]){ uploadStatus.innerText='请选择图片'; return; }
  const keywordsRaw = photoKeywords.value.trim();
  if(!keywordsRaw){ uploadStatus.innerText='请至少填写一个关键词'; return; }
  const keywords = keywordsRaw.split(',').map(s=>s.trim()).filter(Boolean);
  if(keywords.length===0){ uploadStatus.innerText='请至少填写一个关键词'; return; }

  uploadStatus.innerText = '处理图片...';
  const file = fileInput.files[0];
  let dataURL = await readFileAsDataURL(file);
  dataURL = await downsizeImage(dataURL, 1200); // 限制尺寸以减少体积

  // 构造 photo 对象
  const id = 'p_'+Date.now()+'_'+Math.floor(Math.random()*10000);
  let payload = { id, owner: me.pub, ownerAlias: me.alias || '', title: photoTitle.value.trim(), keywords, privacy: photoHidden.checked? 'hidden':'public', likes:0, views:0, created: Date.now() };

  if(photoHidden.checked){
    // 隐私：加密图片内容，仅拥有者可解密
    uploadStatus.innerText = '加密图片...';
    const encrypted = await Gun.SEA.encrypt(dataURL, user._.sea || (await user.get()); // fallback not used
    payload.data = encrypted;
    // 标注为加密
    payload.encrypted = true;
  } else {
    payload.data = dataURL;
    payload.encrypted = false;
  }

  // 存到 photosById 节点（便于删除与更新）
  gun.get('photosById').get(id).put(payload, ack=>{
    if(ack.err){ uploadStatus.innerText = '上传失败：'+ack.err; return; }
    // 同时把 id 放到 photosList 供遍历
    gun.get('photosList').set(id);
    // 将 id 放入 tags 索引
    keywords.forEach(k=>{
      gun.get('tags').get(k.toLowerCase()).set(id);
    });
    uploadStatus.innerText = '上传成功';
    fileInput.value=''; photoTitle.value=''; photoKeywords.value=''; photoHidden.checked=false;
  });
};

// 读取 dataURL
function readFileAsDataURL(file){
  return new Promise((res,rej)=>{
    const fr = new FileReader();
    fr.onload = ()=>res(fr.result);
    fr.onerror = rej;
    fr.readAsDataURL(file);
  });
}

// 简易压缩/缩放图片
function downsizeImage(dataURL, maxWidth=1200){
  return new Promise((res)=>{
    const img = new Image();
    img.onload = ()=>{
      const ratio = Math.min(1, maxWidth / img.width);
      const cw = Math.floor(img.width*ratio);
      const ch = Math.floor(img.height*ratio);
      const canvas = document.createElement('canvas');
      canvas.width = cw; canvas.height = ch;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img,0,0,cw,ch);
      res(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.src = dataURL;
  });
}

// 监听 photosList -> photosById 的实时变化并渲染
function initRealtimeFeed(){
  // 先监听所有 photo ids
  gun.get('photosList').map().on(async (id, key)=>{
    if(!id) return;
    // 对每个 id 监听详情
    gun.get('photosById').get(id).on(async photo=>{
      if(!photo) {
        // 已删除或为空，移除
        delete localState.photos[id];
        renderFeed();
        return;
      }
      // 如果为 encrypted && current user is owner, 解密 data
      if(photo.encrypted && me && me.pub === photo.owner){
        try{
          const dec = await Gun.SEA.decrypt(photo.data, user._.sea);
          photo._decodedData = dec;
        }catch(e){ console.warn('解密失败', e); photo._decodedData = null; }
      }
      localState.photos[id] = photo;
      // 更新 profile info for owner
      gun.get('profiles').get(photo.owner).once(p=>{
        if(p) localState.profiles[photo.owner] = p;
      });
      renderFeed();
      updateStats();
      updateHot();
    });
  });
  // 监听 likes map for realtime like toggles
  gun.get('likes').map().on((v,k)=>{ // k is photoId
    if(!k) return;
    gun.get('likes').get(k).map().on((val, userpub)=>{
      // 更新本地 likes
      if(!localState.likes[k]) localState.likes[k] = {};
      localState.likes[k][userpub] = val;
      renderFeed();
      updateHot();
      updateStats();
    });
  });
  // 监听 profiles变化
  gun.get('profiles').map().on((p, pub)=>{ if(pub) { localState.profiles[pub]=p; renderFeed(); } });
}
initRealtimeFeed();

// 渲染个人卡片
function renderProfileCard(){
  profileCard.innerHTML = '';
  if(!me){
    profileCard.innerHTML = `<h3>游客</h3><p>请登录/注册以发布与管理你的作品</p>`;
    logoutBtn.hidden = true; editProfileBtn.hidden = true;
    return;
  }
  logoutBtn.hidden = false; editProfileBtn.hidden = false;
  gun.get('profiles').get(me.pub).once(p=>{
    const name = p?.name || (me.alias || '无名');
    const bio = p?.bio || '';
    const avatar = p?.avatar || '';
    profileCard.innerHTML = `
      <div style="display:flex;gap:12px;align-items:center">
        <img class="avatar" src="${avatar||'data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=64 height=64><rect width=64 height=64 fill=%23999/></svg>'}" />
        <div>
          <div style="font-weight:700">${escapeHtml(name)}</div>
          <div style="font-size:12px;color:var(--muted)">${escapeHtml(bio)}</div>
          <div style="font-size:12px;color:var(--muted);margin-top:6px">用户ID: ${me.pub.slice(0,9)}...</div>
        </div>
      </div>
    `;
  });
}

// 渲染 feed（简单实现：按照 created 时间降序）
function renderFeed(filterIDs=null, filterByUser=null){
  feed.innerHTML = '';
  // collect array
  const list = Object.values(localState.photos).filter(p=>{
    if(!p) return false;
    if(p.deleted) return false;
    // privacy: hidden -> only show if owner logged in
    if(p.privacy === 'hidden' && (!me || me.pub !== p.owner)) return false;
    if(filterIDs && !filterIDs.includes(p.id)) return false;
    if(filterByUser && p.owner !== filterByUser) return false;
    return true;
  }).sort((a,b)=> (b.created||0) - (a.created||0));
  if(list.length===0){
    feed.innerHTML = `<div class="card">没有照片，尝试上传或搜索其他用户。</div>`;
    return;
  }
  list.forEach(p=>{
    const el = document.createElement('div');
    el.className = 'photo card';
    // choose data: if encrypted and owner, use _decodedData; else use data
    let dataSrc = p.encrypted ? (p._decodedData || '') : (p.data || '');
    // if encrypted and not owner, show locked placeholder
    if(p.encrypted && (!me || me.pub !== p.owner)) dataSrc = '';
    const ownerProfile = localState.profiles[p.owner] || {};
    el.innerHTML = `
      <div style="position:relative">${dataSrc? `<img src="${dataSrc}" alt="${escapeHtml(p.title||'')}" />` : `<div style="height:200px;display:flex;align-items:center;justify-content:center;color:var(--muted);background:linear-gradient(90deg,rgba(255,255,255,0.02),rgba(0,0,0,0.03))">已隐藏或无法显示</div>`}</div>
      <div class="meta">
        <div class="row">
          <div style="display:flex;gap:8px;align-items:center">
            <img style="width:36px;height:36px;border-radius:8px;object-fit:cover" src="${ownerProfile.avatar||'data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=36 height=36><rect width=36 height=36 fill=%23777/></svg>'}" />
            <div>
              <div style="font-weight:600">${escapeHtml(ownerProfile.name||p.owner.slice(0,8))}</div>
              <div style="font-size:12px;color:var(--muted)">${new Date(p.created).toLocaleString()}</div>
            </div>
          </div>
          <div style="text-align:right">
            <div style="font-size:13px">${escapeHtml(p.title||'无标题')}</div>
            <div style="font-size:12px;color:var(--muted)">${p.privacy==='hidden'?'隐藏':'公开'}</div>
          </div>
        </div>
        <div class="row">
          <div class="tags">${(p.keywords||[]).map(k=>`<span class="tag">${escapeHtml(k)}</span>`).join('')}</div>
          <div style="display:flex;gap:6px;align-items:center">
            <button class="like-btn" data-id="${p.id}">❤ ${countLikes(p.id)}</button>
            <button class="view-btn" data-id="${p.id}">🔍 ${p.views||0}</button>
            ${ (me && (me.pub===p.owner || me.alias===ADMIN_ALIAS)) ? `<button class="delete-btn" data-id="${p.id}">删除</button>` : '' }
          </div>
        </div>
      </div>
    `;
    // event bindings
    const imgEl = el.querySelector('img');
    if(imgEl){
      imgEl.onclick = ()=>{ openViewer(dataSrc, p); incrementView(p.id); };
    }
    el.querySelectorAll('.like-btn').forEach(b=>{
      b.onclick = ()=>{ toggleLike(p.id); };
    });
    el.querySelectorAll('.view-btn').forEach(b=>{
      b.onclick = ()=>{ openViewer(dataSrc, p); incrementView(p.id); };
    });
    el.querySelectorAll('.delete-btn').forEach(b=>{
      b.onclick = ()=>{ adminDeletePhoto(p.id); };
    });
    feed.appendChild(el);
  });
}

// 打开大图查看器
function openViewer(src, photo){
  if(!src){ alert('无法查看：图片隐藏或需登录查看'); return; }
  viewer.hidden = false;
  viewerImg.src = src;
  viewerMeta.innerHTML = `<div style="padding:8px;color:var(--muted)">${escapeHtml(photo.title||'')} · 上传者: ${escapeHtml(localState.profiles[photo.owner]?.name||photo.owner.slice(0,8))}</div>`;
}
viewerClose.onclick = ()=>{ viewer.hidden = true; }
viewerBackdrop.onclick = ()=>{ viewer.hidden = true; }

// 统计更新
function updateStats(){
  const photos = Object.values(localState.photos).filter(p=>p && !p.deleted);
  const total = photos.length;
  const myCount = me ? photos.filter(p=>p.owner===me.pub).length : 0;
  const totalLikes = Object.keys(localState.likes).reduce((acc,photoId)=>{
    const map = localState.likes[photoId] || {};
    const cnt = Object.keys(map).filter(k=>map[k]).length;
    return acc + cnt;
  }, 0);
  statsContent.innerHTML = `<div>总图片：${total}</div><div>我的图片：${myCount}</div><div>总点赞：${totalLikes}</div>`;
}

// 计算点赞数
function countLikes(photoId){
  const map = localState.likes[photoId] || {};
  return Object.keys(map).filter(k=>map[k]).length;
}

// 切换喜欢（按用户 pub）
function toggleLike(photoId){
  if(!me){ alert('请登录后点赞'); return; }
  const cur = localState.likes[photoId] && localState.likes[photoId][me.pub];
  if(cur){
    // 取消
    gun.get('likes').get(photoId).get(me.pub).put(null);
  } else {
    gun.get('likes').get(photoId).get(me.pub).put(true);
  }
}

// 点击查看计数
function incrementView(photoId){
  // 增量操作：读取当前 views 字段并 +1
  gun.get('photosById').get(photoId).once(p=>{
    if(!p) return;
    const v = (p.views||0) + 1;
    gun.get('photosById').get(photoId).put({ views:v });
  });
}

// 管理员删除照片（或作者自己删除）
function adminDeletePhoto(photoId){
  if(!me){ alert('请登录管理员或作者'); return; }
  gun.get('photosById').get(photoId).once(p=>{
    if(!p){ alert('未找到'); return; }
    if(me.pub !== p.owner && me.alias !== ADMIN_ALIAS){
      alert('只有作者或管理员可删除');
      return;
    }
    if(!confirm('确认删除这张图片？（不可恢复）')) return;
    // 删除：把记录标记为 deleted，或直接置为 null
    gun.get('photosById').get(photoId).put({ deleted:true });
    // 还可以 remove tags（可选）
    (p.keywords||[]).forEach(k=>{
      // 从 tag 列表中移除 id：Gun 的 set 无法直接删除某项的引用（简化：仅标记photo为deleted）
    });
  });
}

// 搜索关键词或用户名
async function doSearch(q){
  q = q.trim().toLowerCase();
  if(!q){ renderFeed(); return; }
  // 如果 q 包含空格：按多个关键词 AND 过滤
  // 先尝试按用户名搜索 profiles
  let foundUserPub = null;
  const profilesRef = gun.get('profiles');
  // profiles.map().once 无法 filter easily; 这里用 .map().on 一次性匹配（即时）
  profilesRef.map().once(p=>{
    if(!p) return;
    if((p.name||'').toLowerCase().includes(q)) {
      // pick first match (如果多个匹配，可改为列表)
      foundUserPub = Object.keys(localState.profiles).find(k=>localState.profiles[k] && localState.profiles[k].name===p.name);
      renderFeed(null, foundUserPub);
    }
  });
  // 同时按标签搜索
  gun.get('tags').get(q).map().once(id=>{
    if(!id) return;
    renderFeed([id]);
  });
  // 若没有即刻结果，提示
  setTimeout(()=>{ if(feed.children.length===0) feed.innerHTML = `<div class="card">未找到与 "${escapeHtml(q)}" 相关的内容。</div>`; }, 800);
}

// 更新热门列表（按 likes + views 排序）
function updateHot(){
  const arr = Object.values(localState.photos).filter(p=>p && !p.deleted);
  arr.forEach(p=>{
    p._score = (countLikes(p.id) || 0) * 3 + (p.views || 0);
  });
  const top = arr.sort((a,b)=> (b._score||0) - (a._score||0)).slice(0,6);
  hotList.innerHTML = top.map(p=>`<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
    <img src="${p.encrypted? (me && me.pub===p.owner? (p._decodedData||'') : '') : (p.data||'')}" style="width:64px;height:48px;object-fit:cover;border-radius:6px" />
    <div style="flex:1"><div style="font-weight:600">${escapeHtml(p.title||'')}</div><div style="font-size:12px;color:var(--muted)">${countLikes(p.id)} ❤ · ${p.views||0} 览</div></div>
  </div>`).join('');
}

// 登录后调用
function afterLogin(){
  renderProfileCard();
  renderFeed();
  updateStats();
}

// 初始化 UI 与自动登录检测
renderProfileCard();
renderFeed();
updateStats();

// 自动尝试恢复登录状态（Gun 会自动恢复 session）
if(user.is && user.is.pub){
  me = user.is;
  renderProfileCard();
}

// 安全提示：避免直接展示 raw html
function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, function(m){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]; }); }

// 在页面关闭或切换时保存一些状态（可扩展）
// window.addEventListener('beforeunload', ()=>{ /* optional sync */ });

/* 额外说明：
 - 本示例为完全前端实现，使用 Gun 的公共 relay peers 实现浏览器间数据同步与实时更新。
 - 隐藏图片使用 SEA 加密，只有所有者登录才能解密查看。
 - 若希望别人也能查看某张隐藏图片，可实现对某些公钥的共享解密（未在此示例中实现）。
 - 若需要更坚固的 admin 权限和删除策略，建议配合后端审核或私有 peer。
*/