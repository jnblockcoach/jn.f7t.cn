// ========== script.js - PixelArtNFT 前端交互 ==========
(function(){
    'use strict';
    
    console.log('🎨 PixelArtNFT 前端启动...');

    // --- 画布配置 ---
    const CANVAS_SIZE = 24;  // 固定24x24
    const PIXEL_SIZE = 20;
    const MAX_HISTORY = 40;
    
    // --- 区块链配置 ---
    const JOULE_CHAIN_ID = 3666;
    const CONTRACT_ADDRESS = '0x78e87C3b4751562cacE89cA4Bc976B448D317FE2';
    
    // --- 合约ABI (完整版，依据 PixelArtNFT 合约生成) ---
    const CONTRACT_ABI = [
        // 基础查询
        "function name() view returns (string)",
        "function symbol() view returns (string)",
        "function balanceOf(address owner) view returns (uint256)",
        "function ownerOf(uint256 tokenId) view returns (address)",
        "function tokenURI(uint256 tokenId) view returns (string)",
        "function tokenURIPreview(uint256 tokenId) view returns (string)",
        "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
        "function totalSupply() view returns (uint256)",
        
        // 状态查询 (与合约完全一致)
        "function isFinalized(uint256 tokenId) view returns (bool)",
        "function isSealed(uint256 tokenId) view returns (bool)",
        
        // 操作函数
        "function mint(address to, string memory uri) returns (uint256)",
        "function burn(uint256 tokenId)",
        "function finalize(uint256 tokenId)",
        
        // 事件
        "event NFTMinted(address indexed to, uint256 indexed tokenId)",
        "event NFTBurned(address indexed from, uint256 indexed tokenId)",
        "event NFTFinalized(uint256 indexed tokenId, address indexed finalizer)",
        "event NFTSealed(uint256 indexed tokenId, address indexed sealer)"
    ];

    // --- 状态变量 ---
    let pixels = [];
    let currentColor = { r: 255, g: 0, b: 0 };
    let mode = 'draw';
    let drawing = false;
    let historyStack = [];
    let historyIndex = -1;
    let currentBase64 = '';
    
    // --- 区块链状态 ---
    let provider = null;
    let signer = null;
    let contract = null;
    let selectedAccount = null;

    // --- DOM 元素 ---
    const canvas = document.getElementById('pixelCanvas');
    const ctx = canvas.getContext('2d');
    
    // 工具按钮
    const drawBtn = document.getElementById('drawBtn');
    const eraseBtn = document.getElementById('eraseBtn');
    const fillBtn = document.getElementById('fillBtn');
    const undoBtn = document.getElementById('undoBtn');
    const redoBtn = document.getElementById('redoBtn');
    const clearBtn = document.getElementById('clearBtn');
    
    // 颜色相关
    const colorPickerBtn = document.getElementById('colorPickerBtn');
    const colorRgbLabel = document.getElementById('colorRgbLabel');
    
    // 保存按钮
    const savePngBtn = document.getElementById('savePngBtn');
    const saveJpgBtn = document.getElementById('saveJpgBtn');
    const saveBmpBtn = document.getElementById('saveBmpBtn');
    const saveIcoBtn = document.getElementById('saveIcoBtn');
    
    // Base64相关
    const convertBtn = document.getElementById('convertBtn');
    const base64Result = document.getElementById('base64Result');
    const copyBtn = document.getElementById('copyBtn');
    const saveTxtBtn = document.getElementById('saveTxtBtn');
    const previewImage = document.getElementById('previewImage');
    
    // 图片导入
    const imageFileInput = document.getElementById('imageFile');
    const importToCanvasBtn = document.getElementById('importToCanvasBtn');
    const importToBase64Btn = document.getElementById('importToBase64Btn');
    const fileLabel = document.getElementById('fileLabel');
    
    // NFT相关
    const connectWalletBtn = document.getElementById('connectWalletBtn');
    const walletAddressDisplay = document.getElementById('walletAddressDisplay');
    const mintNftBtn = document.getElementById('mintNftBtn');
    const mintStatus = document.getElementById('mintStatus');
    const refreshNftBtn = document.getElementById('refreshNftBtn');
    const myNftsContainer = document.getElementById('myNftsContainer');
    const nftList = document.getElementById('nftList');

    // ========== 画布初始化 ==========

    // 生成白色画布
    function createWhitePixels() {
        return Array(CANVAS_SIZE).fill().map(() => 
            Array(CANVAS_SIZE).fill().map(() => ({ r: 255, g: 255, b: 255 }))
        );
    }

    // 获取当前画布快照
    function getSnapshot() {
        return pixels.map(row => 
            row.map(c => ({ r: c.r, g: c.g, b: c.b }))
        );
    }

    // 保存到历史记录
    function pushHistory() {
        if (historyIndex < historyStack.length - 1) {
            historyStack = historyStack.slice(0, historyIndex + 1);
        }
        historyStack.push(getSnapshot());
        if (historyStack.length > MAX_HISTORY) {
            historyStack.shift();
        }
        historyIndex = historyStack.length - 1;
    }

    // 撤销
    function undo() {
        if (historyIndex > 0) {
            historyIndex--;
            pixels = historyStack[historyIndex].map(row => 
                row.map(c => ({ ...c }))
            );
            refreshCanvas();
        }
    }

    // 重做
    function redo() {
        if (historyIndex < historyStack.length - 1) {
            historyIndex++;
            pixels = historyStack[historyIndex].map(row => 
                row.map(c => ({ ...c }))
            );
            refreshCanvas();
        }
    }

    // 重置历史记录
    function resetHistory(initialPixels) {
        historyStack = [initialPixels.map(row => 
            row.map(c => ({ ...c }))
        )];
        historyIndex = 0;
    }

    // 绘制网格
    function drawGrid() {
        canvas.width = CANVAS_SIZE * PIXEL_SIZE;
        canvas.height = CANVAS_SIZE * PIXEL_SIZE;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        for (let i = 0; i < CANVAS_SIZE; i++) {
            for (let j = 0; j < CANVAS_SIZE; j++) {
                const p = pixels[i][j];
                ctx.fillStyle = `rgb(${p.r}, ${p.g}, ${p.b})`;
                ctx.fillRect(j * PIXEL_SIZE, i * PIXEL_SIZE, PIXEL_SIZE, PIXEL_SIZE);
                ctx.strokeStyle = '#aaa';
                ctx.strokeRect(j * PIXEL_SIZE, i * PIXEL_SIZE, PIXEL_SIZE, PIXEL_SIZE);
            }
        }
    }

    // 刷新画布
    function refreshCanvas() {
        drawGrid();
    }

    // 设置活动工具
    function setActiveTool(tool) {
        [drawBtn, eraseBtn, fillBtn].forEach(btn => 
            btn.classList.remove('btn-active')
        );
        
        if (tool === 'draw') drawBtn.classList.add('btn-active');
        else if (tool === 'erase') eraseBtn.classList.add('btn-active');
        else if (tool === 'fill') fillBtn.classList.add('btn-active');
        
        mode = tool;
    }

    // 获取像素坐标
    function getPixelIndex(e) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        
        let clientX, clientY;
        if (e.touches) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
            e.preventDefault();
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }
        
        const canvasX = (clientX - rect.left) * scaleX;
        const canvasY = (clientY - rect.top) * scaleY;
        
        if (canvasX < 0 || canvasY < 0 || 
            canvasX >= canvas.width || canvasY >= canvas.height) {
            return null;
        }
        
        const col = Math.floor(canvasX / PIXEL_SIZE);
        const row = Math.floor(canvasY / PIXEL_SIZE);
        
        if (row < 0 || row >= CANVAS_SIZE || col < 0 || col >= CANVAS_SIZE) {
            return null;
        }
        
        return { row, col };
    }

    // 洪水填充
    function floodFill(row, col, targetColor, newColor) {
        if (targetColor.r === newColor.r && 
            targetColor.g === newColor.g && 
            targetColor.b === newColor.b) {
            return;
        }
        
        const queue = [{ row, col }];
        const visited = new Set();
        
        while (queue.length > 0) {
            const { row: r, col: c } = queue.shift();
            const key = `${r},${c}`;
            
            if (r < 0 || r >= CANVAS_SIZE || c < 0 || c >= CANVAS_SIZE || visited.has(key)) {
                continue;
            }
            
            const current = pixels[r][c];
            if (current.r !== targetColor.r || 
                current.g !== targetColor.g || 
                current.b !== targetColor.b) {
                continue;
            }
            
            pixels[r][c] = { ...newColor };
            visited.add(key);
            
            queue.push(
                { row: r + 1, col: c },
                { row: r - 1, col: c },
                { row: r, col: c + 1 },
                { row: r, col: c - 1 }
            );
        }
    }

    // 应用绘制
    function applyDraw(row, col) {
        if (mode === 'draw') {
            pixels[row][col] = { ...currentColor };
        } else if (mode === 'erase') {
            pixels[row][col] = { r: 255, g: 255, b: 255 };
        } else if (mode === 'fill') {
            floodFill(row, col, pixels[row][col], currentColor);
        }
        refreshCanvas();
    }

    // ========== 绘画事件 ==========

    let dirty = false;

    function onStart(e) {
        e.preventDefault();
        drawing = true;
        dirty = false;
        
        const idx = getPixelIndex(e);
        if (!idx) return;
        
        if (mode === 'fill') {
            pushHistory();
            applyDraw(idx.row, idx.col);
        } else {
            const before = pixels[idx.row][idx.col];
            applyDraw(idx.row, idx.col);
            const after = pixels[idx.row][idx.col];
            
            if (before.r !== after.r || 
                before.g !== after.g || 
                before.b !== after.b) {
                dirty = true;
            }
        }
    }

    function onMove(e) {
        if (!drawing || mode === 'fill') return;
        e.preventDefault();
        
        const idx = getPixelIndex(e);
        if (!idx) return;
        
        const before = pixels[idx.row][idx.col];
        applyDraw(idx.row, idx.col);
        const after = pixels[idx.row][idx.col];
        
        if (before.r !== after.r || 
            before.g !== after.g || 
            before.b !== after.b) {
            dirty = true;
        }
    }

    function onEnd(e) {
        e.preventDefault();
        if (drawing && dirty && mode !== 'fill') {
            pushHistory();
        }
        drawing = false;
        dirty = false;
    }

    // ========== 初始化画布 ==========

    pixels = createWhitePixels();
    resetHistory(pixels);
    refreshCanvas();

    // ========== 事件监听 ==========

    // 画布事件
    canvas.addEventListener('mousedown', onStart);
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseup', onEnd);
    canvas.addEventListener('mouseleave', onEnd);
    canvas.addEventListener('touchstart', onStart, { passive: false });
    canvas.addEventListener('touchmove', onMove, { passive: false });
    canvas.addEventListener('touchend', onEnd);
    canvas.addEventListener('touchcancel', onEnd);

    // 工具按钮
    drawBtn.addEventListener('click', () => setActiveTool('draw'));
    eraseBtn.addEventListener('click', () => setActiveTool('erase'));
    fillBtn.addEventListener('click', () => setActiveTool('fill'));
    undoBtn.addEventListener('click', undo);
    redoBtn.addEventListener('click', redo);

    // 清空画布
    clearBtn.addEventListener('click', () => {
        if (confirm('确定要清空画布吗？')) {
            pushHistory();
            for (let i = 0; i < CANVAS_SIZE; i++) {
                for (let j = 0; j < CANVAS_SIZE; j++) {
                    pixels[i][j] = { r: 255, g: 255, b: 255 };
                }
            }
            refreshCanvas();
        }
    });

    // 颜色选择
    colorPickerBtn.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'color';
        input.value = '#' + ((1 << 24) + (currentColor.r << 16) + 
                      (currentColor.g << 8) + currentColor.b).toString(16).slice(1);
        
        input.addEventListener('input', (e) => {
            const hex = e.target.value;
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);
            
            currentColor = { r, g, b };
            colorPickerBtn.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
            colorRgbLabel.innerText = `RGB(${r}, ${g}, ${b})`;
        });
        
        input.click();
    });

    // 键盘快捷键
    window.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.metaKey) {
            if (e.key === 'z') {
                e.preventDefault();
                undo();
            }
            if (e.key === 'y') {
                e.preventDefault();
                redo();
            }
        }
    });

    // ========== 图片保存 ==========

    function saveAs(format) {
        const offCanvas = document.createElement('canvas');
        offCanvas.width = CANVAS_SIZE;
        offCanvas.height = CANVAS_SIZE;
        const offCtx = offCanvas.getContext('2d');
        
        for (let i = 0; i < CANVAS_SIZE; i++) {
            for (let j = 0; j < CANVAS_SIZE; j++) {
                const p = pixels[i][j];
                offCtx.fillStyle = `rgb(${p.r}, ${p.g}, ${p.b})`;
                offCtx.fillRect(j, i, 1, 1);
            }
        }
        
        let mime = 'image/png';
        let ext = 'png';
        
        if (format === 'jpg') {
            mime = 'image/jpeg';
            ext = 'jpg';
        } else if (format === 'bmp') {
            mime = 'image/bmp';
            ext = 'bmp';
        } else if (format === 'ico') {
            mime = 'image/x-icon';
            ext = 'ico';
        }
        
        offCanvas.toBlob((blob) => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `pixel.${ext}`;
            a.click();
            URL.revokeObjectURL(url);
        }, mime);
    }

    savePngBtn.addEventListener('click', () => saveAs('png'));
    saveJpgBtn.addEventListener('click', () => saveAs('jpg'));
    saveBmpBtn.addEventListener('click', () => saveAs('bmp'));
    saveIcoBtn.addEventListener('click', () => saveAs('ico'));

    // ========== Base64转换（默认带前缀）=========

    convertBtn.addEventListener('click', () => {
        const offCanvas = document.createElement('canvas');
        offCanvas.width = CANVAS_SIZE;
        offCanvas.height = CANVAS_SIZE;
        const offCtx = offCanvas.getContext('2d');
        
        for (let i = 0; i < CANVAS_SIZE; i++) {
            for (let j = 0; j < CANVAS_SIZE; j++) {
                const p = pixels[i][j];
                offCtx.fillStyle = `rgb(${p.r}, ${p.g}, ${p.b})`;
                offCtx.fillRect(j, i, 1, 1);
            }
        }
        
        // 直接使用完整的data URL
        currentBase64 = offCanvas.toDataURL('image/png');
        base64Result.value = currentBase64;
        copyBtn.disabled = false;
        saveTxtBtn.disabled = false;
        
        if (previewImage) {
            previewImage.src = currentBase64;
        }
    });

    // 复制Base64
    copyBtn.addEventListener('click', () => {
        if (currentBase64) {
            navigator.clipboard.writeText(currentBase64);
            mintStatus.innerText = '📋 已复制';
        }
    });

    // 保存TXT
    saveTxtBtn.addEventListener('click', () => {
        if (!currentBase64) return;
        
        const blob = new Blob([currentBase64], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'base64.txt';
        a.click();
        URL.revokeObjectURL(url);
    });

    // ========== 图片导入 ==========

    function loadImageFile(file, callback) {
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => callback(img);
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    function importImageToCanvas(img) {
        const offCanvas = document.createElement('canvas');
        offCanvas.width = CANVAS_SIZE;
        offCanvas.height = CANVAS_SIZE;
        const offCtx = offCanvas.getContext('2d');
        
        offCtx.drawImage(img, 0, 0, CANVAS_SIZE, CANVAS_SIZE);
        const imageData = offCtx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE).data;
        
        for (let i = 0; i < CANVAS_SIZE; i++) {
            for (let j = 0; j < CANVAS_SIZE; j++) {
                const idx = (i * CANVAS_SIZE + j) * 4;
                pixels[i][j] = {
                    r: imageData[idx],
                    g: imageData[idx + 1],
                    b: imageData[idx + 2]
                };
            }
        }
        
        pushHistory();
        refreshCanvas();
    }

    function importToBase64Only(img) {
        const offCanvas = document.createElement('canvas');
        offCanvas.width = CANVAS_SIZE;
        offCanvas.height = CANVAS_SIZE;
        const offCtx = offCanvas.getContext('2d');
        
        offCtx.drawImage(img, 0, 0, CANVAS_SIZE, CANVAS_SIZE);
        // 直接使用完整的data URL
        currentBase64 = offCanvas.toDataURL('image/png');
        
        base64Result.value = currentBase64;
        copyBtn.disabled = false;
        saveTxtBtn.disabled = false;
        
        if (previewImage) {
            previewImage.src = currentBase64;
        }
    }

    // 文件选择
    imageFileInput.addEventListener('change', (e) => {
        if (e.target.files.length) {
            fileLabel.innerText = `📁 ${e.target.files[0].name}`;
        } else {
            fileLabel.innerText = '📁 选择图片 (自动缩小至24x24)';
        }
    });

    // 导入到画布
    importToCanvasBtn.addEventListener('click', () => {
        if (!imageFileInput.files.length) {
            alert('请先选择图片');
            return;
        }
        
        loadImageFile(imageFileInput.files[0], (img) => {
            importImageToCanvas(img);
        });
    });

    // 直接转Base64
    importToBase64Btn.addEventListener('click', () => {
        if (!imageFileInput.files.length) {
            alert('请先选择图片');
            return;
        }
        
        loadImageFile(imageFileInput.files[0], (img) => {
            importToBase64Only(img);
        });
    });

    // ========== 区块链交互 ==========

    async function connectWallet() {
        console.log('🔌 连接钱包...');
        
        // 检查ethers
        if (typeof ethers === 'undefined') {
            console.error('ethers 未加载');
            mintStatus.innerText = '❌ 库加载失败，请刷新页面';
            return;
        }
        
        // 检查钱包
        if (!window.ethereum) {
            console.error('window.ethereum 不存在');
            
            // 检测是否在手机环境
            const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
            if (isMobile) {
                alert('请在钱包内置浏览器中打开');
                mintStatus.innerText = '📱 请在钱包内打开';
            } else {
                alert('请安装 MetaMask 插件');
                mintStatus.innerText = '❌ 未检测到钱包';
            }
            return;
        }
        
        try {
            mintStatus.innerText = '⏳ 连接中...';
            
            // 创建 provider
            provider = new ethers.providers.Web3Provider(window.ethereum);
            
            // 请求账户授权
            await provider.send('eth_requestAccounts', []);
            
            // 获取 signer 和账户
            signer = provider.getSigner();
            selectedAccount = await signer.getAddress();
            
            console.log('✅ 账户:', selectedAccount);
            
            // 检查网络
            const network = await provider.getNetwork();
            console.log('🌐 网络:', network);
            
            if (network.chainId !== JOULE_CHAIN_ID) {
                mintStatus.innerText = `⚠️ 请切换到 Jouleverse (${JOULE_CHAIN_ID})`;
                walletAddressDisplay.innerText = `${selectedAccount.slice(0,6)}...${selectedAccount.slice(-4)} (错误网络)`;
                
                // 尝试切换网络
                try {
                    await window.ethereum.request({
                        method: 'wallet_switchEthereumChain',
                        params: [{ chainId: '0x' + JOULE_CHAIN_ID.toString(16) }]
                    });
                    // 切换后重连
                    setTimeout(connectWallet, 1000);
                } catch (switchError) {
                    console.log('切换网络失败:', switchError);
                }
                return;
            }
            
            // 显示钱包地址
            walletAddressDisplay.innerText = `📌 ${selectedAccount.slice(0,6)}...${selectedAccount.slice(-4)}`;
            
            // 初始化合约
            contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
            
            // 测试合约连接
            try {
                const name = await contract.name();
                console.log('📄 合约:', name);
            } catch (e) {
                console.warn('合约 name() 调用失败:', e);
            }
            
            // 启用铸造按钮
            mintNftBtn.disabled = false;
            mintStatus.innerText = '✅ 已连接到 Jouleverse';
            
            // 显示并加载NFT
            myNftsContainer.style.display = 'block';
            await loadUserNFTs();
            
        } catch (err) {
            console.error('❌ 连接失败:', err);
            
            if (err.code === 4001) {
                mintStatus.innerText = '❌ 用户拒绝了请求';
            } else if (err.code === -32002) {
                mintStatus.innerText = '⏳ 钱包请求中，请查看钱包';
            } else {
                mintStatus.innerText = `❌ 连接失败: ${err.message?.slice(0, 50) || '未知错误'}`;
            }
            
            walletAddressDisplay.innerText = '连接失败';
        }
    }

    // 加载用户NFT
    async function loadUserNFTs() {
        if (!contract || !selectedAccount) {
            console.log('合约或账户未就绪');
            return;
        }
        
        try {
            console.log('加载NFT，账户:', selectedAccount);
            
            const balance = await contract.balanceOf(selectedAccount);
            console.log('NFT数量:', balance.toString());
            
            if (balance == 0) {
                nftList.innerHTML = '<div style="color:#666; text-align:center; padding:20px;">🎨 暂无NFT，开始创作吧！</div>';
                return;
            }
            
            let html = '';
            
            for (let i = 0; i < balance; i++) {
                const tokenId = await contract.tokenOfOwnerByIndex(selectedAccount, i);
                
                // 获取状态
                let finalized = false;
                let sealed = false;
                let previewUri = '';
                
                try {
                    finalized = await contract.isFinalized(tokenId);
                    sealed = await contract.isSealed(tokenId);
                } catch (e) {
                    console.log('状态查询失败:', e);
                }
                
                try {
                    previewUri = await contract.tokenURIPreview(tokenId);
                } catch {
                    previewUri = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="50" height="50"%3E%3Crect width="50" height="50" fill="%23cccccc"/%3E%3C/svg%3E';
                }
                
                // 状态徽章
                let statusBadge = '';
                let actionButtons = '';
                
                if (sealed) {
                    statusBadge = '<span style="background:#10b981; color:white; padding:4px 10px; border-radius:30px; font-size:11px;">🔒 已封存</span>';
                } else if (finalized) {
                    statusBadge = '<span style="background:#f59e0b; color:white; padding:4px 10px; border-radius:30px; font-size:11px;">📝 已定稿</span>';
                } else {
                    statusBadge = '<span style="background:#e2e8f0; color:#475569; padding:4px 10px; border-radius:30px; font-size:11px;">✏️ 草稿</span>';
                    actionButtons = `
                        <div style="display:flex; gap:6px; margin-top:8px;">
                            <button class="finalize-btn" data-tokenid="${tokenId}" style="background:#f59e0b; color:white; border:none; padding:6px 12px; border-radius:30px; font-size:12px; cursor:pointer;">📝 定稿</button>
                            <button class="burn-btn" data-tokenid="${tokenId}" style="background:#fee2e2; color:#b91c1c; border:1px solid #fecaca; padding:6px 12px; border-radius:30px; font-size:12px; cursor:pointer;">🔥 销毁</button>
                        </div>
                    `;
                }
                
                html += `
                    <div class="nft-item" data-tokenid="${tokenId}" style="border:1px solid #e2e8f0; border-radius:12px; margin-bottom:10px; padding:12px;">
                        <div style="display:flex; gap:12px;">
                            <img src="${previewUri}" style="width:60px; height:60px; border-radius:8px; background:#f0f0f0;" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'50\' height=\'50\'%3E%3Crect width=\'50\' height=\'50\' fill=\'%23cccccc\'/%3E%3C/svg%3E'">
                            <div style="flex:1;">
                                <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
                                    <span style="font-weight:600; color:#1e3c8a;">#${tokenId.toString()}</span>
                                    ${statusBadge}
                                </div>
                                ${actionButtons}
                            </div>
                        </div>
                    </div>
                `;
            }
            
            nftList.innerHTML = html;
            
            // 绑定销毁事件
            document.querySelectorAll('.burn-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const tokenId = e.target.dataset.tokenid;
                    
                    if (confirm(`确定要销毁 NFT #${tokenId} 吗？`)) {
                        try {
                            mintStatus.innerText = '⏳ 销毁中...';
                            const tx = await contract.burn(tokenId);
                            await tx.wait();
                            mintStatus.innerText = '✅ 销毁成功';
                            await loadUserNFTs();
                        } catch (err) {
                            console.error(err);
                            mintStatus.innerText = `❌ 销毁失败: ${err.message?.slice(0, 50)}`;
                        }
                    }
                });
            });
            
            // 绑定定稿事件
            document.querySelectorAll('.finalize-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const tokenId = e.target.dataset.tokenid;
                    
                    if (confirm(`确定要定稿 NFT #${tokenId} 吗？`)) {
                        try {
                            mintStatus.innerText = '⏳ 定稿中...';
                            const tx = await contract.finalize(tokenId);
                            await tx.wait();
                            mintStatus.innerText = '✅ 定稿成功';
                            await loadUserNFTs();
                        } catch (err) {
                            console.error(err);
                            mintStatus.innerText = `❌ 定稿失败: ${err.message?.slice(0, 50)}`;
                        }
                    }
                });
            });
            
        } catch (err) {
            console.error('加载NFT失败:', err);
            nftList.innerHTML = '<div style="color:#b91c1c; padding:20px;">❌ 加载失败</div>';
        }
    }

    // 连接钱包按钮
    connectWalletBtn.addEventListener('click', connectWallet);

    // 刷新NFT按钮
    refreshNftBtn.addEventListener('click', async () => {
        if (!contract || !selectedAccount) {
            mintStatus.innerText = '请先连接钱包';
            return;
        }
        await loadUserNFTs();
        mintStatus.innerText = '✅ 已刷新';
    });

    // 铸造NFT
    mintNftBtn.addEventListener('click', async () => {
        if (!contract || !selectedAccount) {
            mintStatus.innerText = '请先连接钱包';
            return;
        }
        
        if (!currentBase64) {
            mintStatus.innerText = '请先生成Base64';
            return;
        }
        
        try {
            mintStatus.innerText = '⏳ 铸造中...';
            
            // 直接使用完整的data URL
            const tx = await contract.mint(selectedAccount, currentBase64);
            mintStatus.innerText = `交易: ${tx.hash.slice(0, 10)}...`;
            
            await tx.wait();
            
            // 获取新ID
            const totalSupply = await contract.totalSupply();
            const tokenId = totalSupply - 1;
            
            mintStatus.innerText = `✅ 铸造成功! #${tokenId}`;
            await loadUserNFTs();
            
        } catch (err) {
            console.error('铸造失败:', err);
            let errorMsg = err.message || '未知错误';
            if (errorMsg.includes('execution reverted')) {
                errorMsg = '合约拒绝：可能URI无效或已达上限';
            }
            mintStatus.innerText = `❌ 铸造失败: ${errorMsg.slice(0, 60)}`;
        }
    });

    // ========== 初始化Base64 (默认白色画布) ==========

    (function initBase64() {
        const offCanvas = document.createElement('canvas');
        offCanvas.width = CANVAS_SIZE;
        offCanvas.height = CANVAS_SIZE;
        const offCtx = offCanvas.getContext('2d');
        
        offCtx.fillStyle = '#ffffff';
        offCtx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
        
        // 直接使用完整的data URL
        currentBase64 = offCanvas.toDataURL('image/png');
        base64Result.value = currentBase64;
        
        if (previewImage) {
            previewImage.src = currentBase64;
        }
    })();

    console.log('🎨 PixelArtNFT 前端初始化完成');
})();