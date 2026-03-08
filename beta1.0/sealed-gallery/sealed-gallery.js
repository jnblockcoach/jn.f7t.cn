// sealed-gallery.js - 已封印NFT画廊逻辑（显示所有NFT，区分封印状态）
(function() {
    'use strict';

    // ---------- 常量配置 ----------
    const JOULE_CHAIN_ID = 3666;
    // 新合约地址
    const CONTRACT_ADDRESS = '0x78e87C3b4751562cacE89cA4Bc976B448D317FE2';
    
    // ABI (只需要查询功能)
    const CONTRACT_ABI = [
        "function totalSupply() view returns (uint256)",
        "function tokenByIndex(uint256 index) view returns (uint256)",
        "function isSealed(uint256 tokenId) view returns (bool)",
        "function ownerOf(uint256 tokenId) view returns (address)",
        "function tokenURI(uint256 tokenId) view returns (string)"
    ];

    // 分页配置
    const TOTAL_PAGES = 100;
    const ITEMS_PER_PAGE = 100;  // 每页100个
    const MAX_SUPPLY = 10000;     // 固定10000

    // 默认图片Base64 (从合约中复制的)
    const DEFAULT_IMAGE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAAo0lEQVR4AeSSUQqAMAxDh5fS+3/VUyn5CIjYNRnsYyiE6Uzztm5bRFwztbXJTwnYj6NlUtbWBSC4F1L9R20KUIoRUPlSAIpV9SAy4IxolAqGTwIgGGbq/c35rzEFIIT6KlTnUoAaUPmGAO9DxU4zkA1wwgG1AG64BRgJtwAwU72e08PRahGLnPFHAPSdWrNFuKbUmjtwVv30yteUB4zxGVC93wAAAP//RzeAkQAAAAZJREFUAwCevYlZ3o1a6AAAAABJRU5ErkJggg==";

    // ---------- DOM 元素 ----------
    const contractAddrSpan = document.getElementById('contractAddress');
    const copyBtn = document.getElementById('copyContractBtn');
    const sealedCountSpan = document.getElementById('sealedCount');
    const totalSupplySpan = document.getElementById('totalSupply');
    const currentPageDisplay = document.getElementById('currentPageDisplay');
    const connectBtn = document.getElementById('connectBtn');
    const walletInfo = document.getElementById('walletInfo');
    const galleryGrid = document.getElementById('galleryGrid');
    const pageNumbersDiv = document.getElementById('pageNumbers');
    const firstPageBtn = document.getElementById('firstPageBtn');
    const prevPageBtn = document.getElementById('prevPageBtn');
    const nextPageBtn = document.getElementById('nextPageBtn');
    const lastPageBtn = document.getElementById('lastPageBtn');
    const jumpInput = document.getElementById('jumpInput');
    const jumpBtn = document.getElementById('jumpBtn');

    // ---------- 状态变量 ----------
    let provider = null;
    let signer = null;
    let contract = null;
    let selectedAccount = null;
    
    // 当前页码 (1-100)
    let currentPage = 1;
    
    // 缓存当前页的NFT数据
    let currentPageData = [];

    // ---------- 初始化显示 ----------
    contractAddrSpan.innerText = CONTRACT_ADDRESS.slice(0, 6) + '...' + CONTRACT_ADDRESS.slice(-4);

    // 复制合约地址
    copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(CONTRACT_ADDRESS);
        alert('✅ 合约地址已复制');
    });

    // ---------- 连接钱包 ----------
    async function connectWallet() {
        try {
            if (typeof window.ethereum === 'undefined') {
                throw new Error('请安装MetaMask');
            }
            provider = new ethers.providers.Web3Provider(window.ethereum);
            await provider.send('eth_requestAccounts', []);
            signer = provider.getSigner();
            selectedAccount = await signer.getAddress();
            walletInfo.innerText = `📌 ${selectedAccount.slice(0,6)}...${selectedAccount.slice(-4)}`;
            
            // 检查网络
            const network = await provider.getNetwork();
            if (network.chainId !== JOULE_CHAIN_ID) {
                walletInfo.innerText += ' (网络错误)';
                // 尝试切换
                try {
                    await window.ethereum.request({
                        method: 'wallet_switchEthereumChain',
                        params: [{ chainId: '0x' + JOULE_CHAIN_ID.toString(16) }]
                    });
                } catch { /* 忽略 */ }
            }

            // 初始化合约
            contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
            
            // 加载基础数据
            await loadContractStats();
            
            // 渲染第一页
            currentPage = 1;
            await renderPage(1);
            
        } catch (err) {
            console.error(err);
            walletInfo.innerText = '连接失败';
            alert('连接钱包失败，请重试');
        }
    }

    // 加载总供应量
    async function loadContractStats() {
        if (!contract) return;
        try {
            totalSupply = await contract.totalSupply();
            totalSupplySpan.innerText = totalSupply.toString();
        } catch (e) {
            console.warn('读取totalSupply失败', e);
            totalSupplySpan.innerText = '?';
        }
    }

    // 获取单个NFT的信息
    async function getNFTInfo(tokenId) {
        try {
            // 并行查询isSealed和tokenURI
            const [isSealed, uri] = await Promise.all([
                contract.isSealed(tokenId),
                contract.tokenURI(tokenId)
            ]);
            
            return {
                tokenId,
                isSealed,
                uri
            };
        } catch (error) {
            console.warn(`查询Token #${tokenId}失败:`, error);
            return {
                tokenId,
                isSealed: false,
                uri: DEFAULT_IMAGE,
                error: true
            };
        }
    }

    // 渲染指定页码
    async function renderPage(page) {
        if (!contract) {
            galleryGrid.innerHTML = '<div class="loading-spinner">⚠️ 请先连接钱包</div>';
            return;
        }

        // 显示加载中
        galleryGrid.innerHTML = '<div class="loading-spinner">🖼️ 加载NFT数据中...</div>';

        try {
            // 计算当前页的tokenId范围 (从0开始到9999)
            const startId = (page - 1) * ITEMS_PER_PAGE;
            const endId = Math.min(startId + ITEMS_PER_PAGE, MAX_SUPPLY);
            
            // 创建当前页所有tokenId的数组
            const tokenIds = [];
            for (let i = startId; i < endId; i++) {
                tokenIds.push(i);
            }

            // 并发查询所有NFT的信息
            const promises = tokenIds.map(tokenId => getNFTInfo(tokenId));
            const results = await Promise.all(promises);
            
            // 缓存当前页数据
            currentPageData = results;
            
            // 统计当前页的封印数量
            const pageSealedCount = results.filter(nft => nft.isSealed).length;
            
            // 生成网格
            let html = '';
            for (let i = 0; i < results.length; i++) {
                const nft = results[i];
                const tokenId = nft.tokenId;
                
                // 根据封印状态决定样式和图片
                const cardClass = nft.isSealed ? 'nft-card sealed' : 'nft-card';
                const statusIcon = nft.isSealed ? '🔒' : '📄';
                
                // 确定显示的图片
                let imageSrc = nft.uri;
                if (!nft.isSealed) {
                    // 未封印的使用默认图片（但保留原始URI以备将来）
                    imageSrc = DEFAULT_IMAGE;
                }
                
                html += `
                    <div class="${cardClass}" title="Token #${tokenId} ${nft.isSealed ? '已封印' : '未封印'}">
                        <div class="preview-container">
                            <img src="${imageSrc}" 
                                 alt="#${tokenId}" 
                                 loading="lazy"
                                 onerror="this.src='${DEFAULT_IMAGE}'; this.classList.add('fallback');"
                                 style="width:100%; height:100%; object-fit:cover;">
                        </div>
                        <div class="token-info">
                            <span class="token-id">#${tokenId}</span>
                            <span class="sealed-indicator">${statusIcon}</span>
                        </div>
                    </div>
                `;
            }

            galleryGrid.innerHTML = html;
            
            // 更新统计信息
            totalSupplySpan.innerText = MAX_SUPPLY;
            sealedCountSpan.innerText = '计算中...';
            
            // 异步计算总封印数（不阻塞显示）
            calculateTotalSealed();
            
            // 更新分页信息
            currentPageDisplay.innerText = `${page}/${TOTAL_PAGES}`;
            updatePaginationControls(page);
            
        } catch (error) {
            console.error('渲染页面失败:', error);
            galleryGrid.innerHTML = `<div class="loading-spinner">❌ 加载失败: ${error.message}</div>`;
        }
    }

    // 计算总封印数量（后台执行）
    async function calculateTotalSealed() {
        if (!contract) return;
        
        try {
            let sealed = 0;
            const batchSize = 100;
            
            // 分批查询，避免一次性请求太多
            for (let start = 0; start < MAX_SUPPLY; start += batchSize) {
                const end = Math.min(start + batchSize, MAX_SUPPLY);
                const promises = [];
                
                for (let tokenId = start; tokenId < end; tokenId++) {
                    promises.push(
                        contract.isSealed(tokenId).catch(() => false)
                    );
                }
                
                const results = await Promise.all(promises);
                sealed += results.filter(v => v).length;
                
                // 更新显示
                sealedCountSpan.innerText = sealed;
            }
            
            sealedCountSpan.innerText = sealed;
        } catch (error) {
            console.warn('计算封印总数失败:', error);
            sealedCountSpan.innerText = '?';
        }
    }

    // 更新页码按钮和导航状态
    function updatePaginationControls(page) {
        const totalPages = TOTAL_PAGES;
        
        let startPage = Math.max(1, page - 2);
        let endPage = Math.min(totalPages, page + 2);
        
        let btnsHtml = '';
        if (startPage > 1) {
            btnsHtml += `<button class="page-btn" data-page="1">1</button>`;
            if (startPage > 2) btnsHtml += `<span class="page-ellipsis">...</span>`;
        }
        
        for (let p = startPage; p <= endPage; p++) {
            btnsHtml += `<button class="page-btn ${p === page ? 'active' : ''}" data-page="${p}">${p}</button>`;
        }
        
        if (endPage < totalPages) {
            if (endPage < totalPages - 1) btnsHtml += `<span class="page-ellipsis">...</span>`;
            btnsHtml += `<button class="page-btn" data-page="${totalPages}">${totalPages}</button>`;
        }
        
        pageNumbersDiv.innerHTML = btnsHtml;

        // 绑定点击事件
        document.querySelectorAll('.page-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const p = parseInt(btn.dataset.page);
                if (p && p !== currentPage) {
                    currentPage = p;
                    renderPage(currentPage);
                }
            });
        });

        // 导航按钮状态
        firstPageBtn.disabled = (page === 1);
        prevPageBtn.disabled = (page === 1);
        nextPageBtn.disabled = (page === totalPages);
        lastPageBtn.disabled = (page === totalPages);
        
        // 更新跳转输入框
        jumpInput.max = totalPages;
        jumpInput.placeholder = `1-${totalPages}`;
    }

    // 跳转到指定页
    function goToPage(page) {
        if (page < 1) page = 1;
        if (page > TOTAL_PAGES) page = TOTAL_PAGES;
        if (page !== currentPage) {
            currentPage = page;
            renderPage(currentPage);
        }
    }

    // ---------- 事件绑定 ----------
    connectBtn.addEventListener('click', connectWallet);

    // 首页
    firstPageBtn.addEventListener('click', () => goToPage(1));
    // 上一页
    prevPageBtn.addEventListener('click', () => goToPage(currentPage - 1));
    // 下一页
    nextPageBtn.addEventListener('click', () => goToPage(currentPage + 1));
    // 末页
    lastPageBtn.addEventListener('click', () => goToPage(TOTAL_PAGES));

    // 跳转
    jumpBtn.addEventListener('click', () => {
        let page = parseInt(jumpInput.value);
        if (isNaN(page) || page < 1) page = 1;
        if (page > TOTAL_PAGES) page = TOTAL_PAGES;
        goToPage(page);
        jumpInput.value = page;
    });

    jumpInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') jumpBtn.click();
    });

    // 监听账户切换
    if (window.ethereum) {
        window.ethereum.on('accountsChanged', () => {
            window.location.reload();
        });
        window.ethereum.on('chainChanged', () => {
            window.location.reload();
        });
    }

    // 初始提示
    galleryGrid.innerHTML = '<div class="loading-spinner">👆 点击"连接钱包"查看所有NFT</div>';
})();