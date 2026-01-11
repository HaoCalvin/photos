// IndexedDB 封装
class PhotoDB {
    constructor() {
        this.dbName = 'PhotoShareDB';
        this.version = 1;
        this.db = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // 用户表
                if (!db.objectStoreNames.contains('users')) {
                    const userStore = db.createObjectStore('users', { keyPath: 'id' });
                    userStore.createIndex('email', 'email', { unique: true });
                    userStore.createIndex('username', 'username', { unique: true });
                }
                
                // 照片表
                if (!db.objectStoreNames.contains('photos')) {
                    const photoStore = db.createObjectStore('photos', { keyPath: 'id' });
                    photoStore.createIndex('userId', 'userId');
                    photoStore.createIndex('keywords', 'keywords', { multiEntry: true });
                    photoStore.createIndex('timestamp', 'timestamp');
                    photoStore.createIndex('likes', 'likes');
                }
                
                // 点赞表
                if (!db.objectStoreNames.contains('likes')) {
                    const likeStore = db.createObjectStore('likes', { keyPath: 'id' });
                    likeStore.createIndex('userId', 'userId');
                    likeStore.createIndex('photoId', 'photoId');
                }
                
                // 设置表
                if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings', { keyPath: 'key' });
                }
            };
        });
    }

    // 用户相关
    async addUser(user) {
        const tx = this.db.transaction('users', 'readwrite');
        await tx.objectStore('users').add(user);
        await tx.done;
    }

    async getUserByEmail(email) {
        const tx = this.db.transaction('users', 'readonly');
        const index = tx.objectStore('users').index('email');
        return await index.get(email);
    }

    async getUserById(id) {
        const tx = this.db.transaction('users', 'readonly');
        return await tx.objectStore('users').get(id);
    }

    async updateUser(user) {
        const tx = this.db.transaction('users', 'readwrite');
        await tx.objectStore('users').put(user);
        await tx.done;
    }

    // 照片相关
    async addPhoto(photo) {
        const tx = this.db.transaction('photos', 'readwrite');
        await tx.objectStore('photos').add(photo);
        await tx.done;
    }

    async getPhotoById(id) {
        const tx = this.db.transaction('photos', 'readonly');
        return await tx.objectStore('photos').get(id);
    }

    async getPhotosByUser(userId, limit = 50) {
        const tx = this.db.transaction('photos', 'readonly');
        const index = tx.objectStore('photos').index('userId');
        const photos = [];
        let count = 0;
        
        await new Promise((resolve) => {
            const request = index.openCursor(IDBKeyRange.only(userId), 'prev');
            request.onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor && count < limit) {
                    photos.push(cursor.value);
                    count++;
                    cursor.continue();
                } else {
                    resolve();
                }
            };
        });
        
        return photos;
    }

    async getHotPhotos(limit = 20) {
        const tx = this.db.transaction('photos', 'readonly');
        const index = tx.objectStore('photos').index('likes');
        const photos = [];
        
        await new Promise((resolve) => {
            const request = index.openCursor(null, 'prev');
            request.onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor && photos.length < limit && !cursor.value.isPrivate) {
                    photos.push(cursor.value);
                    cursor.continue();
                } else if (!cursor) {
                    resolve();
                } else {
                    cursor.continue();
                }
            };
        });
        
        return photos;
    }

    async getLatestPhotos(limit = 20) {
        const tx = this.db.transaction('photos', 'readonly');
        const index = tx.objectStore('photos').index('timestamp');
        const photos = [];
        
        await new Promise((resolve) => {
            const request = index.openCursor(null, 'prev');
            request.onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor && photos.length < limit && !cursor.value.isPrivate) {
                    photos.push(cursor.value);
                    cursor.continue();
                } else if (!cursor) {
                    resolve();
                } else {
                    cursor.continue();
                }
            };
        });
        
        return photos;
    }

    async searchPhotos(keyword, limit = 50) {
        const tx = this.db.transaction('photos', 'readonly');
        const index = tx.objectStore('photos').index('keywords');
        const photos = [];
        const unique = new Set();
        
        await new Promise((resolve) => {
            const request = index.openCursor(keyword);
            request.onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor && unique.size < limit) {
                    const photo = cursor.value;
                    if (!photo.isPrivate && !unique.has(photo.id)) {
                        photos.push(photo);
                        unique.add(photo.id);
                    }
                    cursor.continue();
                } else {
                    resolve();
                }
            };
        });
        
        return photos;
    }

    async updatePhoto(photo) {
        const tx = this.db.transaction('photos', 'readwrite');
        await tx.objectStore('photos').put(photo);
        await tx.done;
    }

    async deletePhoto(id) {
        const tx = this.db.transaction('photos', 'readwrite');
        await tx.objectStore('photos').delete(id);
        await tx.done;
    }

    // 点赞相关
    async addLike(like) {
        const tx = this.db.transaction('likes', 'readwrite');
        await tx.objectStore('likes').add(like);
        await tx.done;
    }

    async removeLike(userId, photoId) {
        const tx = this.db.transaction('likes', 'readwrite');
        const index = tx.objectStore('likes').index('userId');
        
        await new Promise((resolve) => {
            const request = index.openCursor(userId);
            request.onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor) {
                    if (cursor.value.photoId === photoId) {
                        cursor.delete();
                        resolve();
                    } else {
                        cursor.continue();
                    }
                } else {
                    resolve();
                }
            };
        });
        
        await tx.done;
    }

    async hasLiked(userId, photoId) {
        const tx = this.db.transaction('likes', 'readonly');
        const index = tx.objectStore('likes').index('userId');
        
        return await new Promise((resolve) => {
            const request = index.openCursor(userId);
            request.onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor) {
                    if (cursor.value.photoId === photoId) {
                        resolve(true);
                        return;
                    }
                    cursor.continue();
                } else {
                    resolve(false);
                }
            };
        });
    }

    // 设置相关
    async setSetting(key, value) {
        const tx = this.db.transaction('settings', 'readwrite');
        await tx.objectStore('settings').put({ key, value });
        await tx.done;
    }

    async getSetting(key) {
        const tx = this.db.transaction('settings', 'readonly');
        const result = await tx.objectStore('settings').get(key);
        return result ? result.value : null;
    }

    // 获取所有数据（用于导出）
    async exportAllData() {
        const data = {
            users: [],
            photos: [],
            likes: [],
            settings: []
        };
        
        // 读取所有数据
        for (const storeName of ['users', 'photos', 'likes', 'settings']) {
            const tx = this.db.transaction(storeName, 'readonly');
            data[storeName] = await tx.objectStore(storeName).getAll();
        }
        
        return data;
    }

    // 导入数据
    async importData(data) {
        for (const storeName of ['users', 'photos', 'likes', 'settings']) {
            const tx = this.db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            
            // 清空现有数据
            await store.clear();
            
            // 导入新数据
            for (const item of data[storeName]) {
                await store.add(item);
            }
        }
    }
}

// 全局数据库实例
const db = new PhotoDB();
