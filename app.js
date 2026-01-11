// 全局状态
let currentTab = 'hot';
let currentPage = 0;
let isLoading = false;
let githubToken = null;
let githubGistId = null;

// 初始化应用
async function initApp() {
    try {
        // 初始化数据库
        await db.init();
        
        // 检查是否是首次使用
        const hasUsers = await db.getSetting('hasUsers');
        if (!hasUsers) {
            // 创建默认管理员账号
            const adminUser = {
                id: CryptoUtils.generateUUID(),
                username: 'admin',
                email: 'admin@photoshare.com',
                password: await CryptoUtils.hashPassword('admin123'),
                avatar: '👑',
                bio: '系统管理员',
                isAdmin: true,
                createdAt: Date.now()
            };
            await db.addUser(adminUser);
            await db.setSetting('hasUsers', true);
            console.log('默认管理员账号已创建: admin@photoshare.com / admin123');
        }
        
        // 加载当前用户
        const currentUser = SessionManager.getCurrentUser();
        if (currentUser) {
            console.log('已登录用户:', currentUser.username);
            showAdminPanel();
        }
        
        // 加载GitHub配置
        githubToken = await db.getSetting('githubToken');
        githubGistId = await db.getSetting('githubGistId');
        
        // 绑定事件
        bindEvents();
        
        // 加载初始数据
        await loadPhotos();
        
        // 隐藏加载器
        document.getElementById('loader').style.display = 'none';
        
    } catch (error) {
        console.error('初始化失败:', error);
        alert('应用初始化失败，请刷新页面重试');
    }
}

// 绑定事件
function bindEvents() {
    // 主题切换
    document.getElementById('themeToggle').addEventListener('click', toggleTheme);
    
    // 搜索
    document.getElementById('searchBtn').addEventListener('click', toggleSearch);
    document.getElementById('searchConfirm').addEventListener('click', performSearch);
    document.getElementById('searchInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') performSearch();
    });
    
    // 上传
    document.getElementById('uploadBtn').addEventListener('click', () => {
        if (!SessionManager.getCurrentUser()) {
            alert('请先登录！');
            showLoginModal();
            return;
        }
        document.getElementById('uploadModal').classList.remove('hidden');
    });
    
    // 个人中心
    document.getElementById('profileBtn').addEventListener('click', () => {
        const user = SessionManager.getCurrentUser();
        if (user) {
            showUserProfile(user.id);
        } else {
            showLoginModal();
        }
    });
    
    // 标签切换
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            currentTab = btn.dataset.tab;
            currentPage = 0;
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            loadPhotos();
        });
    });
    
    // 模态框关闭
    document.querySelectorAll('.close').forEach(close => {
        close.addEventListener('click', (e) => {
            e.target.closest('.modal').classList.add('hidden');
        });
    });
    
    // 上传表单
    document.getElementById('uploadArea').addEventListener('click', () => {
        document.getElementById('fileInput').click();
    });
    
    document.getElementById('fileInput').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            document.getElementById('uploadArea').innerHTML = `<p>已选择: ${file.name}</p>`;
        }
    });
    
    document.getElementById('uploadForm').addEventListener('submit', handleUpload);
    
    // 拖放上传
    const uploadArea = document.getElementById('uploadArea');
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = 'var(--accent-color)';
    });
    
    uploadArea.addEventListener('dragleave', () => {
        uploadArea.style.borderColor = 'var(--border-color)';
    });
    
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) {
            document.getElementById('fileInput').files = e.dataTransfer.files;
            uploadArea.innerHTML = `<p>已选择: ${file.name}</p>`;
        }
    });
    
    // 加载更多
    document.querySelector('.load-more button').addEventListener('click', () => {
        currentPage++;
        loadPhotos(true);
    });
    
    // 管理员功能
    document.getElementById('syncBtn')?.addEventListener('click', syncToGithub);
    document.getElementById('loadFromGithubBtn')?.addEventListener('click', loadFromGithub);
}

// 主题切换
function toggleTheme() {
    const body = document.body;
    const themes = ['theme-dark', 'theme-light', 'theme-white'];
    const currentTheme = themes.find(t => body.classList.contains(t));
    const currentIndex = themes.indexOf(currentTheme);
    const nextIndex = (currentIndex + 1) % themes.length;
    
    body.classList.remove(...themes);
    body.classList.add(themes[nextIndex]);
    
    // 更新图标
    const icon = document.getElementById('themeToggle');
    icon.textContent = nextIndex === 0 ? '🌙' : nextIndex === 1 ? '☀️' : '⚪';
}

// 搜索功能
function toggleSearch() {
    const searchBar = document.getElementById('searchBar');
    searchBar.classList.toggle('hidden');
    if (!searchBar.classList.contains('hidden')) {
        document.getElementById('searchInput').focus();
    }
}

async function performSearch() {
    const query = document.getElementById('searchInput').value.trim();
    if (!query) return;
    
    const grid = document.getElementById('photoGrid');
    grid.innerHTML = '<p>搜索中...</p>';
    
    // 搜索用户名
    const user = await db.getUserByEmail(query);
    if (user) {
        showUserProfile(user.id);
        return;
    }
    
    // 搜索关键词
    const photos = await db.searchPhotos(query);
    displayPhotos(photos);
}

// 加载照片
async function loadPhotos(append = false) {
    if (isLoading) return;
    isLoading = true;
    
    const grid = document.getElementById('photoGrid');
    if (!append) {
        grid.innerHTML = '<p>加载中...</p>';
    }
    
    let photos = [];
    
    try {
        switch (currentTab) {
            case 'hot':
                photos = await db.getHotPhotos(20);
                break;
            case 'latest':
                photos = await db.getLatestPhotos(20);
                break;
            case 'following':
                // 简化版：显示所有非私密照片
                photos = await db.getLatestPhotos(20);
                break;
        }
        
        displayPhotos(photos, append);
    } catch (error) {
        console.error('加载照片失败:', error);
        grid.innerHTML = '<p>加载失败，请重试</p>';
    } finally {
        isLoading = false;
    }
}

// 显示照片
function displayPhotos(photos, append = false) {
    const grid = document.getElementById('photoGrid');
    
    if (!append) {
        grid.innerHTML = '';
    }
    
    if (photos.length === 0) {
        if (!append) {
            grid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: var(--text-secondary);">暂无照片</p>';
        }
        return;
    }
    
    photos.forEach(photo => {
        const item = document.createElement('div');
        item.className = 'photo-item';
        item.innerHTML = `
            <img src="${photo.imageData}" alt="${photo.title}">
            <div class="photo-overlay">
                <div class="photo-title">${photo.title}</div>
                <div class="photo-stats">
                    <span>❤️ ${photo.likes || 0}</span>
                    <span>👤 ${photo.username}</span>
                </div>
            </div>
        `;
        
        item.addEventListener('click', () => showPhotoDetail(photo));
        grid.appendChild(item);
    });
}

// 显示图片详情
async function showPhotoDetail(photo) {
    document.getElementById('modalImage').src = photo.imageData;
    document.getElementById('photoTitleModal').textContent = photo.title;
    document.getElementById('photoKeywordsModal').textContent = `关键词: ${photo.keywords.join(', ')}`;
    document.getElementById('photoUser').textContent = photo.username;
    document.getElementById('likeCount').textContent = photo.likes || 0;
    
    const currentUser = SessionManager.getCurrentUser();
    const hasLiked = currentUser ? await db.hasLiked(currentUser.id, photo.id) : false;
    const likeBtn = document.getElementById('likeBtn');
    likeBtn.textContent = hasLiked ? '💖' : '❤️';
    
    likeBtn.onclick = () => toggleLike(photo.id);
    document.getElementById('userBtn').onclick = () => showUserProfile(photo.userId);
    
    document.getElementById('photoModal').classList.remove('hidden');
}

// 点赞功能
async function toggleLike(photoId) {
    const currentUser = SessionManager.getCurrentUser();
    if (!currentUser) {
        alert('请先登录！');
        return;
    }
    
    const photo = await db.getPhotoById(photoId);
    const hasLiked = await db.hasLiked(currentUser.id, photoId);
    
    if (hasLiked) {
        // 取消点赞
        await db.removeLike(currentUser.id, photoId);
        photo.likes = Math.max(0, (photo.likes || 0) - 1);
    } else {
        // 点赞
        await db.addLike({
            id: CryptoUtils.generateUUID(),
            userId: currentUser.id,
            photoId: photoId,
            timestamp: Date.now()
        });
        photo.likes = (photo.likes || 0) + 1;
    }
    
    await db.updatePhoto(photo);
    
    // 更新UI
    document.getElementById('likeCount').textContent = photo.likes;
    document.getElementById('likeBtn').textContent = hasLiked ? '❤️' : '💖';
    
    // 刷新列表
    loadPhotos();
}

// 上传处理
async function handleUpload(e) {
    e.preventDefault();
    
    const fileInput = document.getElementById('fileInput');
    const file = fileInput.files[0];
    
    if (!file) {
        alert('请选择图片！');
        return;
    }
    
    const title = document.getElementById('photoTitle').value;
    const keywords = document.getElementById('photoKeywords').value
        .split(' ')
        .filter(k => k.trim())
        .map(k => k.trim().toLowerCase());
    
    if (keywords.length === 0) {
        alert('至少需要一个关键词！');
        return;
    }
    
    const isPrivate = document.getElementById('isPrivate').checked;
    const currentUser = SessionManager.getCurrentUser();
    
    if (!currentUser) {
        alert('请先登录！');
        return;
    }
    
    // 压缩图片
    const reader = new FileReader();
    reader.onload = async (e) => {
        const img = new Image();
        img.onload = async () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            // 压缩到最大1080px
            const maxSize = 1080;
            let width = img.width;
            let height = img.height;
            
            if (width > maxSize || height > maxSize) {
                const ratio = Math.min(maxSize / width, maxSize / height);
                width *= ratio;
                height *= ratio;
            }
            
            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);
            
            // 转换为base64
            const imageData = canvas.toDataURL('image/jpeg', 0.8);
            
            // 保存到数据库
            const photo = {
                id: CryptoUtils.generateUUID(),
                title,
                keywords,
                isPrivate,
                imageData,
                userId: currentUser.id,
                username: currentUser.username,
                likes: 0,
                views: 0,
                timestamp: Date.now()
            };
            
            await db.addPhoto(photo);
            
            // 重置表单
            document.getElementById('uploadForm').reset();
            document.getElementById('uploadArea').innerHTML = '<p>点击或拖拽图片到此处</p>';
            document.getElementById('uploadModal').classList.add('hidden');
            
            // 刷新列表
            loadPhotos();
            
            alert('上传成功！');
        };
        img.src = e.target.result;
    };
    
    reader.readAsDataURL(file);
}

// 显示登录模态框
function showLoginModal() {
    const profileContent = document.getElementById('profileContent');
    profileContent.innerHTML = `
        <div class="auth-container">
            <h2>登录 / 注册</h2>
            <form id="authForm">
                <div class="form-group">
                    <label>邮箱：</label>
                    <input type="email" id="authEmail" required placeholder="example@email.com">
                </div>
                <div class="form-group">
                    <label>密码：</label>
                    <input type="password" id="authPassword" required placeholder="至少6位字符">
                </div>
                <div class="form-group">
                    <label>用户名（注册时需要）：</label>
                    <input type="text" id="authUsername" placeholder="可选">
                </div>
                <button type="submit" class="btn-primary" style="width: 100%; margin-bottom: 10px;">登录/注册</button>
                <button type="button" class="btn-primary" style="width: 100%; background: #24292e;" onclick="showGithubSetup()">配置GitHub同步</button>
            </form>
        </div>
    `;
    
    document.getElementById('profileModal').classList.remove('hidden');
    
    document.getElementById('authForm').addEventListener('submit', handleAuth);
}

// 认证处理
async function handleAuth(e) {
    e.preventDefault();
    
    const email = document.getElementById('authEmail').value;
    const password = document.getElementById('authPassword').value;
    const username = document.getElementById('authUsername').value;
    
    const hashedPassword = await CryptoUtils.hashPassword(password);
    const existingUser = await db.getUserByEmail(email);
    
    if (existingUser) {
        // 登录
        if (existingUser.password === hashedPassword) {
            SessionManager.setCurrentUser(existingUser);
            document.getElementById('profileModal').classList.add('hidden');
            showAdminPanel();
            alert(`欢迎回来, ${existingUser.username}!`);
            loadPhotos();
        } else {
            alert('密码错误！');
        }
    } else {
        // 注册
        if (!username) {
            alert('注册时需要填写用户名！');
            return;
        }
        
        if (password.length < 6) {
            alert('密码至少6位！');
            return;
        }
        
        const newUser = {
            id: CryptoUtils.generateUUID(),
            email,
            password: hashedPassword,
            username,
            avatar: '👤',
            bio: '这个人很懒，还没有简介...',
            isAdmin: false,
            createdAt: Date.now()
        };
        
        await db.addUser(newUser);
        SessionManager.setCurrentUser(newUser);
        document.getElementById('profileModal').classList.add('hidden');
        showAdminPanel();
        alert(`注册成功！欢迎, ${username}!`);
        loadPhotos();
    }
}

// 显示用户主页
async function showUserProfile(userId) {
    const user = await db.getUserById(userId);
    if (!user) return;
    
    const photos = await db.getPhotosByUser(userId);
    const profileContent = document.getElementById('profileContent');
    
    profileContent.innerHTML = `
        <div class="profile-header">
            <div class="profile-avatar" onclick="changeAvatar()">${user.avatar}</div>
            <h2>${user.username}</h2>
            <p>${user.bio}</p>
            <div class="profile-stats">
                <div class="stat-item">
                    <div class="stat-value">${photos.length}</div>
                    <div class="stat-label">作品</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${user.followers || 0}</div>
                    <div class="stat-label">粉丝</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${user.following || 0}</div>
                    <div class="stat-label">关注</div>
                </div>
            </div>
            ${SessionManager.getCurrentUser()?.id === userId ? `
                <button class="btn-primary" onclick="editProfile()">编辑资料</button>
                <button class="btn-primary" onclick="logout()">退出登录</button>
            ` : `<button class="btn-primary">关注</button>`}
        </div>
        <div class="photo-grid" style="margin-top: 30px;">
            ${photos.map(photo => `
                <div class="photo-item" onclick="showPhotoDetail(${JSON.stringify(photo).replace(/"/g, '&quot;')})">
                    <img src="${photo.imageData}" alt="${photo.title}" style="height: 200px;">
                </div>
            `).join('')}
        </div>
    `;
    
    document.getElementById('profileModal').classList.remove('hidden');
}

// 编辑个人资料
async function editProfile() {
    const currentUser = SessionManager.getCurrentUser();
    if (!currentUser) return;
    
    const profileContent = document.getElementById('profileContent');
    profileContent.innerHTML = `
        <h2>编辑个人资料</h2>
        <form id="profileForm">
            <div class="form-group">
                <label>用户名：</label>
                <input type="text" id="editUsername" value="${currentUser.username}" required>
            </div>
            <div class="form-group">
                <label>简介：</label>
                <input type="text" id="editBio" value="${currentUser.bio}">
            </div>
            <div class="form-group">
                <label>新密码（留空则不修改）：</label>
                <input type="password" id="newPassword" placeholder="新密码">
            </div>
            <button type="submit" class="btn-primary" style="width: 100%;">保存更改</button>
            <button type="button" class="btn-primary" style="width: 100%; margin-top: 10px; background: #dc3545;" onclick="deleteAccount()">删除账号</button>
        </form>
    `;
    
    document.getElementById('profileForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const username = document.getElementById('editUsername').value;
        const bio = document.getElementById('editBio').value;
        const newPassword = document.getElementById('newPassword').value;
        
        currentUser.username = username;
        currentUser.bio = bio;
        
        if (newPassword) {
            currentUser.password = await CryptoUtils.hashPassword(newPassword);
        }
        
        await db.updateUser(currentUser);
        SessionManager.setCurrentUser(currentUser);
        
        alert('资料更新成功！');
        showUserProfile(currentUser.id);
    });
}

// 更改头像
async function changeAvatar() {
    const currentUser = SessionManager.getCurrentUser();
    if (!currentUser) return;
    
    const emojis = ['👤', '👨', '👩', '🧑', '👦', '👧', '😎', '🤳', '🎨', '📸', '🌟', '🚀'];
    const profileContent = document.getElementById('profileContent');
    
    profileContent.innerHTML = `
        <h2>选择头像</h2>
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin: 20px 0;">
            ${emojis.map(emoji => `
                <div class="profile-avatar" style="width: 60px; height: 60px; font-size: 30px; cursor: pointer;" onclick="setAvatar('${emoji}')">
                    ${emoji}
                </div>
            `).join('')}
        </div>
        <button class="btn-primary" onclick="showUserProfile('${currentUser.id}')">返回</button>
    `;
}

async function setAvatar(emoji) {
    const currentUser = SessionManager.getCurrentUser();
    currentUser.avatar = emoji;
    await db.updateUser(currentUser);
    SessionManager.setCurrentUser(currentUser);
    alert('头像更新成功！');
    showUserProfile(currentUser.id);
}

// 退出登录
function logout() {
    if (confirm('确定要退出登录吗？')) {
        SessionManager.logout();
        document.getElementById('profileModal').classList.add('hidden');
        document.getElementById('adminPanel').classList.add('hidden');
        loadPhotos();
    }
}

// 删除账号
async function deleteAccount() {
    if (!confirm('警告：此操作将永久删除你的账号和所有数据！确定要继续吗？')) return;
    
    const currentUser = SessionManager.getCurrentUser();
    
    // 删除用户的照片
    const photos = await db.getPhotosByUser(currentUser.id);
    for (const photo of photos) {
        await db.deletePhoto(photo.id);
    }
    
    // 删除用户
    await db.deleteUser(currentUser.id);
    
    SessionManager.logout();
    document.getElementById('profileModal').classList.add('hidden');
    loadPhotos();
    
    alert('账号已删除');
}

// 显示管理员面板
function showAdminPanel() {
    if (SessionManager.isAdmin()) {
        document.getElementById('adminPanel').classList.remove('hidden');
    }
}

// GitHub同步配置
function showGithubSetup() {
    const profileContent = document.getElementById('profileContent');
    profileContent.innerHTML = `
        <h2>GitHub 同步配置</h2>
        <p style="color: var(--text-secondary); margin-bottom: 20px;">
            使用GitHub Gist实现免费云端同步：
        </p>
        <ol style="color: var(--text-secondary); margin-bottom: 20px;">
            <li>访问 github.com 并登录</li>
            <li>进入 Settings > Developer settings > Personal access tokens</li>
            <li>生成一个 Classic token，勾选 gist 权限</li>
            <li>复制token并粘贴到下方</li>
        </ol>
        <form id="githubForm">
            <div class="form-group">
                <label>GitHub Token：</label>
                <input type="password" id="githubTokenInput" placeholder="ghp_xxxxxxxxxxxx" style="font-family: monospace;">
            </div>
            <div class="form-group">
                <label>Gist ID（可选，留空则创建新的）：</label>
                <input type="text" id="gistIdInput" placeholder="已有的gist ID">
            </div>
            <div class="form-group">
                <label>加密密码（用于保护数据）：</label>
                <input type="password" id="encryptPasswordInput" placeholder="至少8位字符" required>
            </div>
            <button type="submit" class="btn-primary" style="width: 100%;">保存配置</button>
            <button type="button" class="btn-primary" style="width: 100%; margin-top: 10px; background: #28a745;" onclick="syncToGithub()">立即同步</button>
        </form>
        <button class="btn-primary" style="width: 100%; margin-top: 10px;" onclick="showLoginModal()">返回</button>
    `;
    
    document.getElementById('githubForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const token = document.getElementById('githubTokenInput').value.trim();
        const gistId = document.getElementById('gistIdInput').value.trim();
        const password = document.getElementById('encryptPasswordInput').value;
        
        if (password.length < 8) {
            alert('加密密码至少需要8位字符！');
            return;
        }
        
        await db.setSetting('githubToken', token);
        if (gistId) await db.setSetting('githubGistId', gistId);
        await db.setSetting('encryptPassword', password);
        
        githubToken = token;
        githubGistId = gistId;
        
        alert('GitHub配置已保存！');
        showLoginModal();
    });
}

// 同步到GitHub
async function syncToGithub() {
    if (!githubToken) {
        alert('请先配置GitHub Token！');
        showGithubSetup();
        return;
    }
    
    const password = await db.getSetting('encryptPassword');
    if (!password) {
        alert('请先设置加密密码！');
        return;
    }
    
    try {
        const data = await db.exportAllData();
        const encrypted = await CryptoUtils.encryptData(data, password);
        
        const gistData = {
            description: 'PhotoShare 数据备份',
            public: false,
            files: {
                'photoshare_backup.json': {
                    content: JSON.stringify(encrypted)
                }
            }
        };
        
        let url = 'https://api.github.com/gists';
        let method = 'POST';
        
        if (githubGistId) {
            url += `/${githubGistId}`;
            method = 'PATCH';
        }
        
        const response = await fetch(url, {
            method,
            headers: {
                'Authorization': `token ${githubToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(gistData)
        });
        
        if (!response.ok) throw new Error('同步失败');
        
        const result = await response.json();
        
        if (!githubGistId) {
            githubGistId = result.id;
            await db.setSetting('githubGistId', githubGistId);
        }
        
        alert('数据同步成功！');
        
    } catch (error) {
        console.error('同步失败:', error);
        alert('同步失败: ' + error.message);
    }
}

// 从GitHub加载
async function loadFromGithub() {
    if (!githubToken || !githubGistId) {
        alert('请先配置GitHub Token和Gist ID！');
        showGithubSetup();
        return;
    }
    
    const password = await db.getSetting('encryptPassword');
    if (!password) {
        alert('请先设置加密密码！');
        return;
    }
    
    if (!confirm('警告：从GitHub加载会覆盖本地数据！确定要继续吗？')) return;
    
    try {
        const response = await fetch(`https://api.github.com/gists/${githubGistId}`, {
            headers: {
                'Authorization': `token ${githubToken}`
            }
        });
        
        if (!response.ok) throw new Error('获取数据失败');
        
        const gist = await response.json();
        const encryptedData = JSON.parse(gist.files['photoshare_backup.json'].content);
        const decryptedData = await CryptoUtils.decryptData(encryptedData, password);
        
        if (!decryptedData) {
            alert('解密失败！请检查加密密码。');
            return;
        }
        
        await db.importData(decryptedData);
        
        alert('数据加载成功！');
        loadPhotos();
        
    } catch (error) {
        console.error('加载失败:', error);
        alert('加载失败: ' + error.message);
    }
}

// 启动应用
initApp();
