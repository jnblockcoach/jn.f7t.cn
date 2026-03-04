// ========== script.js ==========
(function(){
    // --- 像素画配置 (固定24x24) ---
    const rows = 24, cols = 24;  // 固定大小
    const PIXEL_SIZE = 20;
    let currentColor = { r:255, g:0, b:0 };
    let mode = 'draw';
    let drawing = false;
    let pixels = [];

    // 历史记录
    let historyStack = [];
    let historyIndex = -1;
    const MAX_HISTORY = 40;

    // 定稿标志 (上链后设为true，隐藏销毁按钮)
    let isFinalized = false;

    // 获取快照
    function getSnapshot() {
        return pixels.map(row => row.map(c => ({r:c.r, g:c.g, b:c.b})));
    }
    
    // 推入历史记录
    function pushHistory() {
        if (historyIndex < historyStack.length-1) historyStack = historyStack.slice(0, historyIndex+1);
        historyStack.push(getSnapshot());
        if (historyStack.length > MAX_HISTORY) historyStack.shift();
        historyIndex = historyStack.length-1;
    }
    
    // 撤销
    function undo() {
        if (historyIndex > 0) { 
            historyIndex--; 
            pixels = historyStack[historyIndex].map(r=>r.map(c=>({...c}))); 
            refreshCanvas(); 
        }
    }
    
    // 重做
    function redo() {
        if (historyIndex < historyStack.length-1) { 
            historyIndex++; 
            pixels = historyStack[historyIndex].map(r=>r.map(c=>({...c}))); 
            refreshCanvas(); 
        }
    }
    
    // 重置历史记录
    function resetHistory(initial) {
        historyStack = [initial.map(r=>r.map(c=>({...c})))];
        historyIndex = 0;
    }

    // 生成白色画布
    function whitePixels(r,c) {
        return Array(r).fill().map(()=>Array(c).fill().map(()=>({r:255,g:255,b:255})));
    }
    
    // 初始化像素
    pixels = whitePixels(rows, cols);
    resetHistory(pixels);

    // DOM 元素
    const canvas = document.getElementById('pixelCanvas');
    const ctx = canvas.getContext('2d');
    const drawBtn = document.getElementById('drawBtn');
    const eraseBtn = document.getElementById('eraseBtn');
    const fillBtn = document.getElementById('fillBtn');
    const undoBtn = document.getElementById('undoBtn');
    const redoBtn = document.getElementById('redoBtn');
    const clearBtn = document.getElementById('clearBtn');
    const colorPickerBtn = document.getElementById('colorPickerBtn');
    const colorRgbLabel = document.getElementById('colorRgbLabel');
    const savePngBtn = document.getElementById('savePngBtn');
    const saveJpgBtn = document.getElementById('saveJpgBtn');
    const saveBmpBtn = document.getElementById('saveBmpBtn');
    const saveIcoBtn = document.getElementById('saveIcoBtn');
    const convertBtn = document.getElementById('convertBtn');
    const base64Result = document.getElementById('base64Result');
    const copyBtn = document.getElementById('copyBtn');
    const saveTxtBtn = document.getElementById('saveTxtBtn');
    const previewImage = document.getElementById('previewImage');
    const withPrefix = document.querySelector('input[value="with_prefix"]');
    const pureBase64 = document.querySelector('input[value="pure"]');
    const imageFileInput = document.getElementById('imageFile');
    const importToCanvasBtn = document.getElementById('importToCanvasBtn');
    const importToBase64Btn = document.getElementById('importToBase64Btn');
    const fileLabel = document.getElementById('fileLabel');

    // NFT 相关
    const connectWalletBtn = document.getElementById('connectWalletBtn');
    const walletAddressDisplay = document.getElementById('walletAddressDisplay');
    const mintNftBtn = document.getElementById('mintNftBtn');
    const mintStatus = document.getElementById('mintStatus');
    const nftNameInput = document.getElementById('nftNameInput');
    const refreshNftBtn = document.getElementById('refreshNftBtn');
    const myNftsContainer = document.getElementById('myNftsContainer');
    const nftList = document.getElementById('nftList');
    const finalizedIndicator = document.getElementById('finalizedIndicator');

    // Jouleverse 配置
    const JOULE_CHAIN_ID = 3666;
    const CONTRACT_ADDRESS = '0x2f74D6f474DC7C81BA863A32B1E5DfF9338ef21a';
    
    // 合约ABI (包含mint, burn, 以及查询函数)
    const CONTRACT_ABI = [
        "function mint(address to, string memory uri) public returns (uint256)",
        "function burn(uint256 tokenId) public",
        "function balanceOf(address owner) view returns (uint256)",
        "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
        "function tokenURI(uint256 tokenId) view returns (string)",
        "function ownerOf(uint256 tokenId) view returns (address)",
        "function totalSupply() view returns (uint256)",
        "event NFTMinted(address indexed to, uint256 indexed tokenId, string tokenURI)",
        "event NFTBurned(address indexed from, uint256 indexed tokenId)"
    ];

    let currentBase64 = '';
    let provider, signer, contract;
    let selectedAccount = null;

    // 绘制网格
    function drawGrid() {
        canvas.width = cols * PIXEL_SIZE;
        canvas.height = rows * PIXEL_SIZE;
        ctx.clearRect(0,0,canvas.width,canvas.height);
        for(let i=0;i<rows;i++) {
            for(let j=0;j<cols;j++) {
                let p = pixels[i][j];
                ctx.fillStyle = `rgb(${p.r},${p.g},${p.b})`;
                ctx.fillRect(j*PIXEL_SIZE, i*PIXEL_SIZE, PIXEL_SIZE, PIXEL_SIZE);
                ctx.strokeStyle = '#aaa';
                ctx.strokeRect(j*PIXEL_SIZE, i*PIXEL_SIZE, PIXEL_SIZE, PIXEL_SIZE);
            }
        }
    }
    
    // 刷新画布
    function refreshCanvas() { 
        drawGrid(); 
    }

    // 设置活动工具
    function setActive(tool) {
        [drawBtn, eraseBtn, fillBtn].forEach(b=>b.classList.remove('btn-active'));
        if(tool==='draw') drawBtn.classList.add('btn-active');
        else if(tool==='erase') eraseBtn.classList.add('btn-active');
        else if(tool==='fill') fillBtn.classList.add('btn-active');
        mode = tool;
    }

    // 获取像素索引
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
        if (canvasX<0 || canvasY<0 || canvasX>=canvas.width || canvasY>=canvas.height) return null;
        const col = Math.floor(canvasX / PIXEL_SIZE);
        const row = Math.floor(canvasY / PIXEL_SIZE);
        if (row<0 || row>=rows || col<0 || col>=cols) return null;
        return {row, col};
    }

    // 洪水填充
    function floodFill(row, col, target, newC) {
        if (target.r===newC.r && target.g===newC.g && target.b===newC.b) return;
        let q = [{row,col}], visited = new Set();
        while(q.length) {
            let {row:r, col:c} = q.shift();
            let key = r+','+c;
            if (r<0||r>=rows||c<0||c>=cols||visited.has(key)) continue;
            let cur = pixels[r][c];
            if (cur.r!==target.r || cur.g!==target.g || cur.b!==target.b) continue;
            pixels[r][c] = {r:newC.r, g:newC.g, b:newC.b};
            visited.add(key);
            q.push({row:r+1,col:c},{row:r-1,col:c},{row:r,col:c+1},{row:r,col:c-1});
        }
    }

    // 应用绘制
    function applyDraw(row, col) {
        if (mode==='draw') pixels[row][col] = {...currentColor};
        else if (mode==='erase') pixels[row][col] = {r:255,g:255,b:255};
        else if (mode==='fill') floodFill(row, col, pixels[row][col], currentColor);
        refreshCanvas();
    }

    let dirty = false;
    
    // 开始绘制
    function onStart(e) {
        e.preventDefault();
        drawing = true;
        dirty = false;
        let idx = getPixelIndex(e);
        if (!idx) return;
        if (mode === 'fill') { 
            pushHistory(); 
            applyDraw(idx.row, idx.col); 
        }
        else {
            let before = pixels[idx.row][idx.col];
            applyDraw(idx.row, idx.col);
            let after = pixels[idx.row][idx.col];
            if (before.r!==after.r||before.g!==after.g||before.b!==after.b) dirty = true;
        }
    }
    
    // 移动绘制
    function onMove(e) {
        if (!drawing || mode==='fill') return;
        e.preventDefault();
        let idx = getPixelIndex(e);
        if (!idx) return;
        let before = pixels[idx.row][idx.col];
        applyDraw(idx.row, idx.col);
        let after = pixels[idx.row][idx.col];
        if (before.r!==after.r||before.g!==after.g||before.b!==after.b) dirty = true;
    }
    
    // 结束绘制
    function onEnd(e) {
        e.preventDefault();
        if (drawing && dirty && mode!=='fill') pushHistory();
        drawing = false;
        dirty = false;
    }

    // 画布事件监听
    canvas.addEventListener('mousedown', onStart);
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseup', onEnd);
    canvas.addEventListener('mouseleave', onEnd);
    canvas.addEventListener('touchstart', onStart, {passive:false});
    canvas.addEventListener('touchmove', onMove, {passive:false});
    canvas.addEventListener('touchend', onEnd);
    canvas.addEventListener('touchcancel', onEnd);

    // 工具按钮事件
    drawBtn.addEventListener('click', ()=>setActive('draw'));
    eraseBtn.addEventListener('click', ()=>setActive('erase'));
    fillBtn.addEventListener('click', ()=>setActive('fill'));

    // 撤销/重做
    undoBtn.addEventListener('click', undo);
    redoBtn.addEventListener('click', redo);
    
    // 清空画布
    clearBtn.addEventListener('click', () => {
        if (confirm('确定要清空画布吗？所有像素将变为白色。')) {
            pushHistory(); // 保存当前状态到历史记录
            
            // 将所有像素设置为白色
            for (let i = 0; i < rows; i++) {
                for (let j = 0; j < cols; j++) {
                    pixels[i][j] = { r: 255, g: 255, b: 255 };
                }
            }
            
            refreshCanvas();
            mintStatus.innerText = '✅ 画布已清空';
        }
    });

    // 颜色选择
    colorPickerBtn.addEventListener('click', ()=>{
        let input = document.createElement('input');
        input.type = 'color';
        input.value = '#'+((1<<24)+(currentColor.r<<16)+(currentColor.g<<8)+currentColor.b).toString(16).slice(1);
        input.addEventListener('input', (e)=>{
            let hex = e.target.value;
            let r = parseInt(hex.slice(1,3),16);
            let g = parseInt(hex.slice(3,5),16);
            let b = parseInt(hex.slice(5,7),16);
            currentColor = {r,g,b};
            colorPickerBtn.style.backgroundColor = `rgb(${r},${g},${b})`;
            colorRgbLabel.innerText = `RGB(${r},${g},${b})`;
        });
        input.click();
    });

    // 键盘快捷键
    window.addEventListener('keydown', (e)=>{
        if (e.ctrlKey || e.metaKey) {
            if (e.key === 'z') { e.preventDefault(); undo(); }
            if (e.key === 'y') { e.preventDefault(); redo(); }
            if (e.key === 'Delete' && e.shiftKey) {
                e.preventDefault();
                clearBtn.click();
            }
        }
    });

    // 保存图片
    function saveAs(format) {
        let off = document.createElement('canvas');
        off.width = cols; off.height = rows;
        let octx = off.getContext('2d');
        for(let i=0;i<rows;i++) for(let j=0;j<cols;j++) { 
            let p=pixels[i][j]; 
            octx.fillStyle=`rgb(${p.r},${p.g},${p.b})`; 
            octx.fillRect(j,i,1,1); 
        }
        let mime = 'image/png', ext='png';
        if(format==='jpg') { mime='image/jpeg'; ext='jpg'; }
        else if(format==='bmp') { mime='image/bmp'; ext='bmp'; }
        else if(format==='ico') { mime='image/x-icon'; ext='ico'; }
        off.toBlob(blob=>{
            let url = URL.createObjectURL(blob);
            let a = document.createElement('a');
            a.href = url; a.download = `pixel.${ext}`; a.click();
            URL.revokeObjectURL(url);
        }, mime);
    }
    
    savePngBtn.addEventListener('click', ()=>saveAs('png'));
    saveJpgBtn.addEventListener('click', ()=>saveAs('jpg'));
    saveBmpBtn.addEventListener('click', ()=>saveAs('bmp'));
    saveIcoBtn.addEventListener('click', ()=>saveAs('ico'));

    // 转换Base64
    convertBtn.addEventListener('click', ()=>{
        let off = document.createElement('canvas');
        off.width = cols; off.height = rows;
        let octx = off.getContext('2d');
        for(let i=0;i<rows;i++) for(let j=0;j<cols;j++) { 
            let p=pixels[i][j]; 
            octx.fillStyle=`rgb(${p.r},${p.g},${p.b})`; 
            octx.fillRect(j,i,1,1); 
        }
        off.toBlob(blob=>{
            let reader = new FileReader();
            reader.onloadend = ()=>{
                let base64 = reader.result.split(',')[1];
                let prefix = 'data:image/png;base64,';
                currentBase64 = withPrefix.checked ? prefix+base64 : base64;
                base64Result.value = currentBase64;
                copyBtn.disabled = false;
                saveTxtBtn.disabled = false;
                previewImage.src = off.toDataURL('image/png');
            };
            reader.readAsDataURL(blob);
        }, 'image/png');
    });

    // 复制Base64
    copyBtn.addEventListener('click', ()=>{
        if (currentBase64) { 
            navigator.clipboard.writeText(currentBase64);
            mintStatus.innerText = '📋 已复制到剪贴板';
        }
    });
    
    // 保存TXT
    saveTxtBtn.addEventListener('click', ()=>{
        if (!currentBase64) return;
        let blob = new Blob([currentBase64], {type:'text/plain'});
        let url = URL.createObjectURL(blob);
        let a = document.createElement('a');
        a.href = url; a.download = 'base64.txt'; a.click();
        URL.revokeObjectURL(url);
    });

    // 加载图片文件
    function loadImageFile(file, callback) {
        if (!file) return;
        let reader = new FileReader();
        reader.onload = (e) => {
            let img = new Image();
            img.onload = () => callback(img);
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    // 导入图片到画布
    function importImageToCanvas(img) {
        let off = document.createElement('canvas');
        off.width = cols; off.height = rows;
        let octx = off.getContext('2d');
        octx.drawImage(img, 0, 0, cols, rows);
        let imageData = octx.getImageData(0, 0, cols, rows).data;
        for (let i=0; i<rows; i++) {
            for (let j=0; j<cols; j++) {
                let idx = (i * cols + j) * 4;
                pixels[i][j] = { r: imageData[idx], g: imageData[idx+1], b: imageData[idx+2] };
            }
        }
        pushHistory();
        refreshCanvas();
        mintStatus.innerText = '✅ 图片已导入到画布';
    }

    // 导入图片并转Base64
    function importToBase64Only(img) {
        let off = document.createElement('canvas');
        off.width = cols; off.height = rows;
        let octx = off.getContext('2d');
        octx.drawImage(img, 0, 0, cols, rows);
        let base64 = off.toDataURL('image/png');
        let pure = base64.split(',')[1];
        currentBase64 = withPrefix.checked ? base64 : pure;
        base64Result.value = currentBase64;
        copyBtn.disabled = false;
        saveTxtBtn.disabled = false;
        previewImage.src = base64;
        mintStatus.innerText = '✅ 图片已转换为Base64';
    }

    // 文件选择事件
    imageFileInput.addEventListener('change', (e) => {
        if (e.target.files.length) {
            fileLabel.innerText = `📁 ${e.target.files[0].name}`;
        } else {
            fileLabel.innerText = '📁 选择图片 (自动缩小至24x24)';
        }
    });

    // 导入到画布按钮
    importToCanvasBtn.addEventListener('click', () => {
        if (!imageFileInput.files.length) { 
            alert('请先选择图片'); 
            return; 
        }
        loadImageFile(imageFileInput.files[0], (img) => {
            importImageToCanvas(img);
        });
    });

    // 直接转Base64按钮
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
    
    // 连接钱包
    async function connectWallet() {
        if (!window.ethereum) {
            alert('请安装MetaMask或兼容钱包');
            return;
        }
        try {
            provider = new ethers.providers.Web3Provider(window.ethereum);
            await provider.send('eth_requestAccounts', []);
            signer = provider.getSigner();
            selectedAccount = await signer.getAddress();
            
            const network = await provider.getNetwork();
            if (network.chainId !== JOULE_CHAIN_ID) {
                mintStatus.innerText = '⚠️ 请切换到Jouleverse网络 (ChainID 3666)';
                mintNftBtn.disabled = true;
                walletAddressDisplay.innerText = `${selectedAccount.substring(0,10)}... (错误网络)`;
                return;
            }
            
            walletAddressDisplay.innerText = `📌 ${selectedAccount.substring(0,10)}...${selectedAccount.substring(38)}`;
            mintNftBtn.disabled = false;
            mintStatus.innerText = '✅ 已连接到Jouleverse';
            
            contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
            
            loadUserNFTs();
            myNftsContainer.style.display = 'block';
        } catch (err) {
            console.error(err);
            walletAddressDisplay.innerText = '连接失败';
        }
    }

    // 定稿功能：隐藏所有销毁按钮
    function applyFinalized() {
        isFinalized = true;
        document.querySelectorAll('.nft-burn-btn').forEach(btn => {
            btn.style.display = 'none';
        });
        finalizedIndicator.innerText = '🔒 已定稿 (销毁已隐藏)';
        mintStatus.innerText = '🔒 已定稿，销毁按钮已隐藏';
    }

    // 加载用户NFT
    async function loadUserNFTs() {
        if (!contract || !selectedAccount) return;
        try {
            const balance = await contract.balanceOf(selectedAccount);
            if (balance == 0) {
                nftList.innerHTML = '<div style="color:#666; text-align:center;">暂无NFT，铸造一个吧</div>';
                return;
            }
            
            let html = '';
            for (let i = 0; i < balance; i++) {
                const tokenId = await contract.tokenOfOwnerByIndex(selectedAccount, i);
                const uri = await contract.tokenURI(tokenId);
                
                html += `
                    <div class="nft-item" data-tokenid="${tokenId}">
                        <img src="${uri.startsWith('data:') ? uri : 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2250%22%20height%3D%2250%22%3E%3Crect%20width%3D%2250%22%20height%3D%2250%22%20fill%3D%22%23cccccc%22%2F%3E%3C%2Fsvg%3E'}" onerror="this.src='data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2250%22%20height%3D%2250%22%3E%3Crect%20width%3D%2250%22%20height%3D%2250%22%20fill%3D%22%23cccccc%22%2F%3E%3C%2Fsvg%3E'">
                        <div class="nft-item-info">
                            <div class="nft-item-id">#${tokenId.toString()}</div>
                            <div style="font-size:11px; color:#666;">${uri.substring(0,30)}...</div>
                        </div>
                        <button class="nft-burn-btn" data-tokenid="${tokenId}">🔥 销毁</button>
                    </div>
                `;
            }
            nftList.innerHTML = html;
            
            // 如果已经定稿，隐藏销毁按钮
            if (isFinalized) {
                document.querySelectorAll('.nft-burn-btn').forEach(btn => {
                    btn.style.display = 'none';
                });
            }
            
            // 绑定销毁事件（仅当未定稿时有效）
            document.querySelectorAll('.nft-burn-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    if (isFinalized) {
                        alert('此NFT已定稿，无法销毁');
                        return;
                    }
                    const tokenId = e.target.dataset.tokenid;
                    if (confirm(`确定要销毁 NFT #${tokenId} 吗？`)) {
                        try {
                            const tx = await contract.burn(tokenId);
                            mintStatus.innerText = '⏳ 销毁交易发送中...';
                            await tx.wait();
                            mintStatus.innerText = '✅ 销毁成功';
                            loadUserNFTs(); // 刷新列表
                        } catch (err) {
                            mintStatus.innerText = `❌ 销毁失败: ${err.message.substring(0,50)}`;
                        }
                    }
                });
            });
        } catch (err) {
            console.error(err);
            nftList.innerHTML = '<div style="color:#b91c1c;">加载失败</div>';
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
        mintStatus.innerText = '✅ NFT列表已刷新';
    });

    // 铸造NFT按钮
    mintNftBtn.addEventListener('click', async () => {
        if (!contract || !selectedAccount) {
            mintStatus.innerText = '请先连接钱包';
            return;
        }
        if (!currentBase64) {
            mintStatus.innerText = '请先生成Base64 (转换当前画作)';
            return;
        }
        
        let tokenURI = currentBase64;
        if (!tokenURI.startsWith('data:image')) {
            tokenURI = 'data:image/png;base64,' + tokenURI;
        }
        
        try {
            mintStatus.innerText = '⏳ 铸造交易发送中...';
            const tx = await contract.mint(selectedAccount, tokenURI);
            mintStatus.innerText = `交易已发送: ${tx.hash.substring(0,10)}... 等待确认`;
            await tx.wait();
            mintStatus.innerText = `✅ 铸造成功! Token ID: ${(await contract.totalSupply()).toString()}`;
            
            // 铸造成功后显示定稿按钮
            if (!document.getElementById('finalizeBtn')) {
                const finalizeBtn = document.createElement('button');
                finalizeBtn.id = 'finalizeBtn';
                finalizeBtn.className = 'btn btn-small';
                finalizeBtn.innerHTML = '🔒 定稿 (隐藏销毁)';
                finalizeBtn.style.marginLeft = '10px';
                finalizeBtn.addEventListener('click', () => {
                    applyFinalized();
                });
                document.querySelector('.nft-row').appendChild(finalizeBtn);
            }
            
            await loadUserNFTs();
        } catch (err) {
            console.error(err);
            mintStatus.innerText = `❌ 铸造失败: ${err.message.substring(0,60)}`;
        }
    });

    // 初始化
    refreshCanvas();
    setActive('draw');
    
    // 预设默认Base64为空白画布
    (function initBase64() {
        let off = document.createElement('canvas');
        off.width = cols; off.height = rows;
        let octx = off.getContext('2d');
        for(let i=0;i<rows;i++) {
            for(let j=0;j<cols;j++) {
                octx.fillStyle='#ffffff';
                octx.fillRect(j,i,1,1);
            }
        }
        currentBase64 = off.toDataURL('image/png').split(',')[1];
        currentBase64 = withPrefix.checked ? 'data:image/png;base64,' + currentBase64 : currentBase64;
        base64Result.value = currentBase64;
        previewImage.src = off.toDataURL('image/png');
    })();
})();