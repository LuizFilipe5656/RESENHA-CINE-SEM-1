const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { app, BrowserWindow, dialog, ipcMain, safeStorage, shell } = require('electron');

// Keep the origin stable because the core persists add-ons in origin-scoped localStorage.
const adminMode = process.argv.includes('--admin');
if (adminMode) app.setName('CINE RESENHA Admin');
const LOCAL_SERVER_PORT = adminMode ? 32150 : 32148;
const FALLBACK_SERVER_PORT = 32153;
const buildRoot = path.join(__dirname, '..', 'build');
const webRoot = app.isPackaged ?
    path.join(process.resourcesPath, 'web') :
    fs.existsSync(path.join(buildRoot, adminMode ? 'admin' : 'app', adminMode ? 'admin.html' : 'index.html')) ?
        path.join(buildRoot, adminMode ? 'admin' : 'app') :
        buildRoot;
const contentTypes = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.ico': 'image/x-icon',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ttf': 'font/ttf',
    '.wasm': 'application/wasm',
    '.webp': 'image/webp',
    '.woff2': 'font/woff2',
};

let localServer;
let localOrigin;
let mainWindow;

const isSafeExternalUrl = (value) => {
    try {
        return ['http:', 'https:', 'mailto:'].includes(new URL(value).protocol);
    } catch {
        return false;
    }
};

const openExternalUrl = (value) => {
    if (isSafeExternalUrl(value)) {
        shell.openExternal(value).catch((error) => {
            console.error('Failed to open external URL:', error);
        });
    }
};

const startLocalServer = () => {
    if (localServer?.listening) {
        return Promise.resolve(localOrigin);
    }

    return new Promise((resolve, reject) => {
        localServer = http.createServer(async (request, response) => {
            let requestUrl;
            try {
                requestUrl = new URL(request.url, localOrigin || 'http://127.0.0.1');
            } catch {
                response.writeHead(400);
                response.end();
                return;
            }
            if (request.method !== 'GET' && request.method !== 'HEAD') {
                response.writeHead(405, { Allow: 'GET, HEAD' });
                response.end();
                return;
            }

            try {
                let pathname = decodeURIComponent(requestUrl.pathname);
                if (pathname === '/') {
                    pathname = '/index.html';
                }

                const filePath = path.resolve(webRoot, `.${pathname}`);
                const relativePath = path.relative(webRoot, filePath);
                if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
                    response.writeHead(403);
                    response.end();
                    return;
                }

                const file = await fs.promises.stat(filePath);
                if (!file.isFile()) {
                    response.writeHead(404);
                    response.end();
                    return;
                }

                response.writeHead(200, {
                    'Content-Length': file.size,
                    'Content-Type': contentTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
                    'X-Content-Type-Options': 'nosniff',
                });

                if (request.method === 'HEAD') {
                    response.end();
                    return;
                }

                fs.createReadStream(filePath).pipe(response);
            } catch (error) {
                if (error.code === 'ENOENT' || error.code === 'ENOTDIR' || error instanceof URIError) {
                    response.writeHead(404);
                    response.end();
                    return;
                }

                console.error('Failed to serve app resource:', error);
                if (!response.headersSent) {
                    response.writeHead(500);
                }
                response.end();
            }
        });

        const listen = (port, fallbackPort) => {
            const onError = (error) => {
                localServer.removeListener('listening', onListening);
                if (error.code === 'EADDRINUSE' && fallbackPort !== undefined) {
                    listen(fallbackPort);
                    return;
                }
                reject(error);
            };
            const onListening = () => {
                localServer.removeListener('error', onError);
                localOrigin = `http://127.0.0.1:${port}`;
                const address = localServer.address();
                if (!address || typeof address === 'string') {
                    reject(new Error('Could not determine the local app server address.'));
                    return;
                }

                if (address.port !== port) {
                    reject(new Error('The local app server started on an unexpected port.'));
                    return;
                }

                resolve(localOrigin);
            };
            localServer.once('error', onError);
            localServer.once('listening', onListening);
            localServer.listen(port, '127.0.0.1');
        };

        listen(LOCAL_SERVER_PORT, FALLBACK_SERVER_PORT);
    });
};

ipcMain.handle('app:set-fullscreen', (event, fullscreen) => {
    if (!mainWindow || event.sender !== mainWindow.webContents || typeof fullscreen !== 'boolean') {
        throw new Error('Invalid window fullscreen request.');
    }

    mainWindow.setFullScreen(fullscreen);
});

const requireAdminWindow = (event) => {
    if (!adminMode || !mainWindow || event.sender !== mainWindow.webContents) {
        throw new Error('Admin credential storage is only available to the admin window.');
    }
};

const rememberedCredentialsPath = () => path.join(app.getPath('userData'), 'admin-credentials.enc');

ipcMain.handle('admin:credential-storage-available', (event) => {
    requireAdminWindow(event);
    return safeStorage.isEncryptionAvailable();
});

ipcMain.handle('admin:get-remembered-credentials', async (event) => {
    requireAdminWindow(event);
    if (!safeStorage.isEncryptionAvailable()) return null;

    try {
        const encrypted = await fs.promises.readFile(rememberedCredentialsPath());
        const credentials = JSON.parse(safeStorage.decryptString(encrypted));
        if (
            typeof credentials.username !== 'string' ||
            typeof credentials.password !== 'string'
        ) {
            throw new Error('Saved admin credentials have an invalid format.');
        }
        return credentials;
    } catch (error) {
        if (error.code === 'ENOENT') return null;
        throw error;
    }
});

ipcMain.handle('admin:set-remembered-credentials', async (event, credentials) => {
    requireAdminWindow(event);
    const filePath = rememberedCredentialsPath();
    if (credentials === null) {
        await fs.promises.rm(filePath, { force: true });
        return;
    }
    if (
        !safeStorage.isEncryptionAvailable() ||
        !credentials ||
        typeof credentials.username !== 'string' ||
        typeof credentials.password !== 'string' ||
        credentials.username.length > 32 ||
        credentials.password.length > 128
    ) {
        throw new Error('Admin credentials cannot be stored securely on this device.');
    }

    const encrypted = safeStorage.encryptString(JSON.stringify(credentials));
    await fs.promises.writeFile(filePath, encrypted, { mode: 0o600 });
});

const createWindow = async () => {
    const origin = await startLocalServer();
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        title: adminMode ? 'CINE RESENHA | Painel administrativo' : 'CINE RESENHA',
        autoHideMenuBar: true,
        icon: path.join(__dirname, '..', 'assets', 'icon.ico'),
        ...(process.platform === 'win32' ? {
            titleBarStyle: 'hidden',
            titleBarOverlay: {
                color: '#170d20',
                symbolColor: '#f5f3ff',
                height: 40,
            },
        } : {}),
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    });

    mainWindow.on('enter-full-screen', () => {
        mainWindow?.webContents.send('app:fullscreen-changed', true);
    });
    mainWindow.on('leave-full-screen', () => {
        mainWindow?.webContents.send('app:fullscreen-changed', false);
    });
    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        openExternalUrl(url);
        return { action: 'deny' };
    });

    mainWindow.webContents.on('will-navigate', (event, url) => {
        if (new URL(url).origin !== origin) {
            event.preventDefault();
            openExternalUrl(url);
        }
    });

    await mainWindow.loadURL(adminMode ? `${origin}/admin.html` : origin);
    if (process.platform === 'win32') {
        await mainWindow.webContents.insertCSS(`
            body {
                box-sizing: border-box !important;
                padding-top: 40px !important;
            }

            #desktop-titlebar {
                position: fixed;
                z-index: 2147483647;
                top: 0;
                right: 0;
                left: 0;
                display: flex;
                height: 40px;
                align-items: center;
                gap: 8px;
                padding: 0 12px;
                background: #170d20;
                color: #f5f3ff;
                font: 13px "Segoe UI", sans-serif;
                -webkit-app-region: drag;
            }

            #desktop-titlebar img {
                width: 16px;
                height: 16px;
                object-fit: contain;
            }

            html.is-fullscreen body {
                padding-top: 0 !important;
            }

            html.is-fullscreen #desktop-titlebar {
                display: none;
            }
        `);
        await mainWindow.webContents.executeJavaScript(`
            const titlebar = document.createElement('div');
            titlebar.id = 'desktop-titlebar';
            const icon = document.createElement('img');
            icon.src = '/assets/icon.png';
            icon.alt = '';
            const title = document.createElement('span');
            title.textContent = ${JSON.stringify(adminMode ? 'CINE RESENHA | Painel administrativo' : 'CINE RESENHA | Filmes e Séries')};
            titlebar.append(icon, title);
            document.body.prepend(titlebar);
        `);
    }
};

const hasInstanceLock = app.requestSingleInstanceLock();

if (!hasInstanceLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (!mainWindow) return;
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
    });

    app.whenReady()
        .then(createWindow)
        .catch((error) => {
            console.error('Failed to start CINE RESENHA:', error);
            dialog.showErrorBox('CINE RESENHA', `Não foi possível iniciar o aplicativo.\n\n${error.message}`);
            app.quit();
        });

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow().catch((error) => {
                console.error('Failed to reopen CINE RESENHA:', error);
            });
        }
    });

    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') {
            app.quit();
        }
    });

    app.on('before-quit', () => {
        localServer?.close();
    });
}
