(function() {
    'use strict';

    console.log('🚀 画廊启动');

    // ---------- 常量配置 ----------
    const JOULE_CHAIN_ID = 3666;
    const CONTRACT_ADDRESS = '0x78e87C3b4751562cacE89cA4Bc976B448D317FE2';
    
    // Jouleverse RPC - 使用 https
    const JOULE_RPC = 'https://rpc.jnsdao.com:8503';
    
    const CONTRACT_ABI = [
        "function tokenURI(uint256 tokenId) view returns (string)",
        "function isFinalized(uint256 tokenId) view returns (bool)",
        "function ownerOf(uint256 tokenId) view returns (address)",
        "function totalSupply() view returns (uint256)",
        "function balanceOf(address owner) view returns (uint256)",
        "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
        "function transferFrom(address from, address to, uint256 tokenId)"
    ];

    const TOTAL_PAGES = 100;
    const ITEMS_PER_PAGE = 100;
    const MAX_SUPPLY = 10000;

    const DEFAULT_IMAGE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAAo0lEQVR4AeSSUQqAMAxDh5fS+3/VUyn5CIjYNRnsYyiE6Uzztm5bRFwztbXJTwnYj6NlUtbWBSC4F1L9R20KUIoRUPlSAIpV9SAy4IxolAqGTwIgGGbq/c35rzEFIIT6KlTnUoAaUPmGAO9DxU4zkA1wwgG1AG64BRgJtwAwU72e08PRahGLnPFHAPSdWrNFuKbUmjtwVv30yteUB4zxGVC93wAAAP//RzeAkQAAAAZJREFUAwCevYlZ3o1a6AAAAABJRU5ErkJggg==";

    // ---------- DOM 元素 ----------
    // 导航
    const tabAll = document.getElementById('tabAll');
    const tabMy = document.getElementById('tabMy');
    const allView = document.getElementById('allView');
    const myView = document.getElementById('myView');
    
    // 钱包
    const connectBtn = document.getElementById('connectBtn');
    const walletAddress = document.getElementById('walletAddress');
    
    // 合约信息
    const contractAddrSpan = document.getElementById('contractAddress');
    const copyBtn = document.getElementById('copyContractBtn');
    
    // 统计
    const createdCountSpan = document.getElementById('createdCount');
    const uncreatedCountSpan = document.getElementById('uncreatedCount');
    const totalSupplySpan = document.getElementById('totalSupply');
    
    // 所有NFT视图
    const allGalleryGrid = document.getElementById('allGalleryGrid');
    const allCurrentPage = document.getElementById('allCurrentPage');
    const allPrevPage = document.getElementById('allPrevPage');
    const allNextPage = document.getElementById('allNextPage');
    const allPageNumbers = document.getElementById('allPageNumbers');
    const allJumpInput = document.getElementById('allJumpInput');
    const allJumpBtn = document.getElementById('allJumpBtn');
    
    // 我的NFT视图
    const myGalleryGrid = document.getElementById('myGalleryGrid');
    const myNftCount = document.getElementById('myNftCount');
    const refreshMyNfts = document.getElementById('refreshMyNfts');
    
    // 进度条
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    const progressContainer = document.getElementById('progressContainer');
    
    // 转账弹窗
    const transferModal = document.getElementById('transferModal');
    const transferTokenId = document.getElementById('transferTokenId');
    const transferAddress = document.getElementById('transferAddress');
    const cancelTransfer = document.getElementById('cancelTransfer');
    const confirmTransfer = document.getElementById('confirmTransfer');

    // 检查必要元素
    if (!allGalleryGrid) {
        console.error('错误: 找不到 allGalleryGrid 元素');
        return;
    }

    // ---------- 状态变量 ----------
    let provider = null;
    let contract = null;
    let signer = null;
    let selectedAccount = null;
    let allCurrentPageNum = 1;
    let currentTransferTokenId = null;
    let totalCreated = 0;

    // 显示合约地址
    if (contractAddrSpan) {
        contractAddrSpan.innerText = CONTRACT_ADDRESS.slice(0, 6) + '...' + CONTRACT_ADDRESS.slice(-4);
    }

    // 显示总量
    if (totalSupplySpan) {
        totalSupplySpan.innerText = MAX_SUPPLY;
    }

    // ---------- 工具函数 ----------
    function shortenAddress(addr) {
        if (!addr) return '未知';
        return addr.slice(0, 6) + '...' + addr.slice(-4);
    }

    function isDefaultImage(uri) {
        if (!uri) return true;
        return uri.substring(0, 100) === DEFAULT_IMAGE.substring(0, 100);
    }

    // ---------- 更新进度条 ----------
    function updateProgress(current, total, status) {
        if (!progressContainer || !progressBar || !progressText) return;
        
        const percentage = Math.round((current / total) * 100);
        progressBar.style.width = percentage + '%';
        progressText.textContent = `${status} ${current}/${total} (${percentage}%)`;
        
        if (current >= total) {
            setTimeout(() => {
                progressContainer.style.opacity = '0';
                setTimeout(() => {
                    progressContainer.style.display = 'none';
                }, 300);
            }, 500);
        } else {
            progressContainer.style.display = 'block';
            progressContainer.style.opacity = '1';
        }
    }

    // ---------- 获取NFT状态（根据新规则）----------
    async function getNFTStatus(tokenId) {
        try {
            // 尝试获取tokenURI和owner
            const [uri, owner] = await Promise.all([
                contract.tokenURI(tokenId).catch(() => null),
                contract.ownerOf(tokenId).catch(() => null)
            ]);
            
            // 如果没有owner，说明ID未占用
            if (!owner) {
                return {
                    tokenId,
                    status: 'uncreated',
                    displayType: '待创作',
                    displayText: '待创作',
                    uri: null,
                    owner: null
                };
            }
            
            // 有owner，检查是否sealed（通过图片判断）
            const isSealed = uri && !isDefaultImage(uri);
            
            if (isSealed) {
                // SEAL后显示图片
                return {
                    tokenId,
                    status: 'sealed',
                    displayType: '已封印',
                    displayText: '',
                    uri: uri,
                    owner: owner
                };
            } else {
                // 草稿或定稿状态，显示默认值
                const isFinalized = await contract.isFinalized(tokenId).catch(() => false);
                return {
                    tokenId,
                    status: isFinalized ? 'finalized' : 'draft',
                    displayType: isFinalized ? '已定稿' : '草稿',
                    displayText: '默认',
                    uri: DEFAULT_IMAGE,
                    owner: owner
                };
            }
        } catch (error) {
            // 其他错误，按未占用处理
            return {
                tokenId,
                status: 'uncreated',
                displayType: '待创作',
                displayText: '待创作',
                uri: null,
                owner: null
            };
        }
    }

    // ---------- 获取已创作数量 ----------
    async function getCreatedCount() {
        if (!contract) return 0;
        try {
            const supply = await contract.totalSupply();
            return supply.toNumber();
        } catch (error) {
            console.warn('获取totalSupply失败:', error);
            return 0;
        }
    }

    // ---------- 初始化RPC连接 ----------
    async function initRPC() {
        try {
            console.log('连接RPC:', JOULE_RPC);
            
            updateProgress(0, 1, '🔄 连接RPC...');
            
            provider = new ethers.providers.JsonRpcProvider(JOULE_RPC, {
                chainId: JOULE_CHAIN_ID,
                name: 'jouleverse'
            });
            
            contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
            
            await provider.getNetwork();
            console.log('RPC连接成功');
            
            updateProgress(1, 1, '✅ 连接成功');
            
            // 获取已创作数量
            totalCreated = await getCreatedCount();
            if (createdCountSpan) createdCountSpan.innerText = totalCreated;
            if (uncreatedCountSpan) uncreatedCountSpan.innerText = MAX_SUPPLY - totalCreated;
            
            // 加载第一页所有NFT
            await loadAllNFTs(1);
            
        } catch (error) {
            console.error('RPC连接失败:', error);
            if (allGalleryGrid) {
                allGalleryGrid.innerHTML = `<div class="error-message">❌ RPC连接失败: ${error.message}</div>`;
            }
            updateProgress(0, 1, '❌ 连接失败');
        }
    }

    // ---------- 加载所有NFT（指定页码）----------
    async function loadAllNFTs(page) {
        if (!contract || !allGalleryGrid) return;

        allGalleryGrid.innerHTML = '<div class="loading-spinner">🖼️ 加载NFT数据中...</div>';
        
        try {
            const startId = (page - 1) * ITEMS_PER_PAGE;
            const endId = Math.min(startId + ITEMS_PER_PAGE, MAX_SUPPLY);
            const total = endId - startId;
            
            updateProgress(0, total, '🔍 查询NFT状态');
            
            const results = [];
            for (let i = startId; i < endId; i += 5) {
                const batch = [];
                for (let j = 0; j < 5 && i + j < endId; j++) {
                    batch.push(getNFTStatus(i + j));
                }
                const batchResults = await Promise.all(batch);
                results.push(...batchResults);
                
                const current = i + 5 - startId;
                if (current < total) {
                    updateProgress(current, total, '🔍 查询NFT状态');
                    allGalleryGrid.innerHTML = `<div class="loading-spinner">🖼️ 加载中... ${current}/${total}</div>`;
                }
            }
            
            updateProgress(total, total, '🎨 生成画廊');
            
            let html = '';
            for (const nft of results) {
                if (nft.status === 'uncreated') {
                    // 待创作：显示"待创作"文字
                    html += `
                        <div class="nft-card status-uncreated" 
                             title="Token #${nft.tokenId} - 待创作">
                            <div class="status-text">待创作</div>
                            <div class="token-id">#${nft.tokenId}</div>
                        </div>
                    `;
                } else if (nft.status === 'sealed') {
                    // 已封印：显示图片
                    html += `
                        <div class="nft-card status-sealed" 
                             style="border-color: #10b981"
                             title="Token #${nft.tokenId} - 已封印">
                            <img src="${nft.uri}" 
                                 alt="#${nft.tokenId}" 
                                 loading="lazy"
                                 onerror="this.src='${DEFAULT_IMAGE}'">
                            <div class="token-id">#${nft.tokenId}</div>
                            <div class="status-icon">🔒</div>
                            <div class="owner-address" title="${nft.owner}">👤 ${shortenAddress(nft.owner)}</div>
                        </div>
                    `;
                } else {
                    // 草稿或定稿：显示"默认"文字
                    const borderColor = nft.status === 'finalized' ? '#f59e0b' : '#6b7280';
                    const statusIcon = nft.status === 'finalized' ? '📝' : '✏️';
                    
                    html += `
                        <div class="nft-card status-${nft.status}" 
                             style="border-color: ${borderColor}"
                             title="Token #${nft.tokenId} - ${nft.displayType}">
                            <img src="${DEFAULT_IMAGE}" 
                                alt="#${nft.tokenId}" 
                                loading="lazy">
                            <div class="token-id">#${nft.tokenId}</div>
                            <div class="status-icon">${statusIcon}</div>
                        </div>
                    `;
                }
            }
            
            allGalleryGrid.innerHTML = html;
            
            if (allCurrentPage) allCurrentPage.innerText = page;
            updateAllPagination(page);
            
            updateProgress(total, total, '✅ 加载完成');
            
        } catch (error) {
            console.error('加载失败:', error);
            allGalleryGrid.innerHTML = `<div class="error-message">❌ 加载失败: ${error.message}</div>`;
            updateProgress(0, 1, '❌ 加载失败');
        }
    }

    // ---------- 更新所有NFT分页 ----------
    function updateAllPagination(page) {
        if (!allPageNumbers) return;
        
        let startPage = Math.max(1, page - 2);
        let endPage = Math.min(TOTAL_PAGES, page + 2);
        
        let html = '';
        if (startPage > 1) {
            html += `<button class="page-btn" data-page="1">1</button>`;
            if (startPage > 2) html += `<span class="ellipsis">...</span>`;
        }
        
        for (let p = startPage; p <= endPage; p++) {
            html += `<button class="page-btn ${p === page ? 'active' : ''}" data-page="${p}">${p}</button>`;
        }
        
        if (endPage < TOTAL_PAGES) {
            if (endPage < TOTAL_PAGES - 1) html += `<span class="ellipsis">...</span>`;
            html += `<button class="page-btn" data-page="${TOTAL_PAGES}">${TOTAL_PAGES}</button>`;
        }
        
        allPageNumbers.innerHTML = html;
        
        document.querySelectorAll('#allPageNumbers .page-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const p = parseInt(btn.dataset.page);
                if (!isNaN(p)) {
                    allCurrentPageNum = p;
                    loadAllNFTs(p);
                }
            });
        });
        
        if (allPrevPage) allPrevPage.disabled = page === 1;
        if (allNextPage) allNextPage.disabled = page === TOTAL_PAGES;
    }

    // ---------- 连接钱包 ----------
    async function connectWallet() {
        try {
            if (typeof window.ethereum === 'undefined') {
                alert('请安装MetaMask钱包');
                return;
            }
            
            if (walletAddress) walletAddress.innerText = '连接中...';
            
            const web3Provider = new ethers.providers.Web3Provider(window.ethereum);
            await web3Provider.send('eth_requestAccounts', []);
            
            const network = await web3Provider.getNetwork();
            if (network.chainId !== JOULE_CHAIN_ID) {
                alert('请切换到Jouleverse网络 (chainId: 3666)');
                if (walletAddress) walletAddress.innerText = '网络错误';
                return;
            }
            
            signer = web3Provider.getSigner();
            selectedAccount = await signer.getAddress();
            if (walletAddress) {
                walletAddress.innerText = shortenAddress(selectedAccount);
            }
            
            contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
            
            console.log('钱包连接成功:', selectedAccount);
            
            if (myView && myView.classList.contains('active')) {
                await loadMyNFTs();
            }
            
        } catch (error) {
            console.error('连接钱包失败:', error);
            if (error.code === 4001) {
                if (walletAddress) walletAddress.innerText = '用户拒绝';
            } else {
                if (walletAddress) walletAddress.innerText = '连接失败';
                alert('连接钱包失败: ' + error.message);
            }
        }
    }

    // ---------- 加载我的NFT ----------
    async function loadMyNFTs() {
        if (!selectedAccount || !signer) {
            if (myGalleryGrid) {
                myGalleryGrid.innerHTML = '<div class="connect-prompt">👆 请先连接钱包</div>';
            }
            return;
        }

        if (myGalleryGrid) {
            myGalleryGrid.innerHTML = '<div class="loading-spinner">🖼️ 加载您的NFT...</div>';
        }
        
        try {
            const contractWithSigner = contract.connect(signer);
            const balance = await contractWithSigner.balanceOf(selectedAccount);
            if (myNftCount) myNftCount.innerText = balance.toString();
            
            if (balance.eq(0)) {
                if (myGalleryGrid) {
                    myGalleryGrid.innerHTML = '<div class="connect-prompt">您还没有NFT</div>';
                }
                return;
            }
            
            const tokenIds = [];
            for (let i = 0; i < balance; i++) {
                const tokenId = await contractWithSigner.tokenOfOwnerByIndex(selectedAccount, i);
                tokenIds.push(tokenId.toNumber());
            }
            
            const results = [];
            for (let i = 0; i < tokenIds.length; i += 5) {
                const batch = tokenIds.slice(i, i + 5);
                const batchPromises = batch.map(tokenId => getNFTStatus(tokenId));
                const batchResults = await Promise.all(batchPromises);
                results.push(...batchResults);
            }
            
            let html = '';
            for (const nft of results) {
                if (nft.status === 'sealed') {
                    html += `
                        <div class="nft-card status-sealed" 
                             style="border-color: #10b981"
                             title="Token #${nft.tokenId} - 已封印">
                            <img src="${nft.uri}" alt="#${nft.tokenId}" loading="lazy"
                                 onerror="this.src='${DEFAULT_IMAGE}'">
                            <div class="token-id">#${nft.tokenId}</div>
                            <div class="status-icon">🔒</div>
                            <div class="card-actions">
                                <button class="transfer-btn" data-tokenid="${nft.tokenId}">🔄 转移</button>
                            </div>
                        </div>
                    `;
                } else {
                    const borderColor = nft.status === 'finalized' ? '#f59e0b' : '#6b7280';
                    const statusIcon = nft.status === 'finalized' ? '📝' : '✏️';
                    
                    html += `
                        <div class="nft-card status-${nft.status}" 
                             style="border-color: ${borderColor}"
                             title="Token #${nft.tokenId} - ${nft.displayType}">
                            <img src="${DEFAULT_IMAGE}" 
                                alt="#${nft.tokenId}" 
                                loading="lazy">
                            <div class="token-id">#${nft.tokenId}</div>
                            <div class="status-icon">${statusIcon}</div>
                            <div class="card-actions">
                                <button class="transfer-btn" data-tokenid="${nft.tokenId}">🔄 转移</button>
                            </div>
                        </div>
                    `;
                }
            }
            
            if (myGalleryGrid) {
                myGalleryGrid.innerHTML = html;
            }
            
            document.querySelectorAll('.transfer-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const tokenId = e.target.dataset.tokenid;
                    openTransferModal(tokenId);
                });
            });
            
        } catch (error) {
            console.error('加载我的NFT失败:', error);
            if (myGalleryGrid) {
                myGalleryGrid.innerHTML = `<div class="error-message">❌ 加载失败: ${error.message}</div>`;
            }
        }
    }

    // ---------- 转账功能 ----------
    function openTransferModal(tokenId) {
        currentTransferTokenId = tokenId;
        if (transferTokenId) transferTokenId.innerText = tokenId;
        if (transferAddress) transferAddress.value = '';
        if (transferModal) transferModal.classList.add('show');
    }

    async function executeTransfer() {
        if (!currentTransferTokenId || !selectedAccount || !signer) return;
        
        const to = transferAddress.value.trim();
        if (!to || !to.startsWith('0x') || to.length !== 42) {
            alert('请输入有效的以太坊地址');
            return;
        }
        
        try {
            const contractWithSigner = contract.connect(signer);
            const tx = await contractWithSigner.transferFrom(selectedAccount, to, currentTransferTokenId);
            
            if (transferModal) transferModal.classList.remove('show');
            if (myGalleryGrid) {
                myGalleryGrid.innerHTML = '<div class="loading-spinner">⏳ 交易确认中...</div>';
            }
            
            await tx.wait();
            alert('✅ 转移成功！');
            await loadMyNFTs();
            
        } catch (error) {
            console.error('转移失败:', error);
            alert('❌ 转移失败: ' + error.message);
            if (transferModal) transferModal.classList.remove('show');
        } finally {
            currentTransferTokenId = null;
        }
    }

    // ---------- 事件绑定 ----------
    
    if (tabAll && tabMy && allView && myView) {
        tabAll.addEventListener('click', () => {
            tabAll.classList.add('active');
            tabMy.classList.remove('active');
            allView.classList.add('active');
            myView.classList.remove('active');
        });

        tabMy.addEventListener('click', () => {
            tabMy.classList.add('active');
            tabAll.classList.remove('active');
            myView.classList.add('active');
            allView.classList.remove('active');
            
            if (selectedAccount) {
                loadMyNFTs();
            } else {
                if (myGalleryGrid) {
                    myGalleryGrid.innerHTML = '<div class="connect-prompt">👆 请先连接钱包</div>';
                }
            }
        });
    }

    if (connectBtn) {
        connectBtn.addEventListener('click', connectWallet);
    }

    if (copyBtn) {
        copyBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(CONTRACT_ADDRESS);
            alert('✅ 合约地址已复制');
        });
    }

    if (allPrevPage) {
        allPrevPage.addEventListener('click', () => {
            if (allCurrentPageNum > 1) {
                allCurrentPageNum--;
                loadAllNFTs(allCurrentPageNum);
            }
        });
    }

    if (allNextPage) {
        allNextPage.addEventListener('click', () => {
            if (allCurrentPageNum < TOTAL_PAGES) {
                allCurrentPageNum++;
                loadAllNFTs(allCurrentPageNum);
            }
        });
    }

    if (allJumpBtn && allJumpInput) {
        allJumpBtn.addEventListener('click', () => {
            const page = parseInt(allJumpInput.value);
            if (!isNaN(page) && page >= 1 && page <= TOTAL_PAGES) {
                allCurrentPageNum = page;
                loadAllNFTs(page);
            }
        });
    }

    if (refreshMyNfts) {
        refreshMyNfts.addEventListener('click', () => {
            if (selectedAccount) {
                loadMyNFTs();
            }
        });
    }

    if (cancelTransfer) {
        cancelTransfer.addEventListener('click', () => {
            if (transferModal) transferModal.classList.remove('show');
            currentTransferTokenId = null;
        });
    }

    if (confirmTransfer) {
        confirmTransfer.addEventListener('click', executeTransfer);
    }

    if (transferModal) {
        window.addEventListener('click', (e) => {
            if (e.target === transferModal) {
                transferModal.classList.remove('show');
                currentTransferTokenId = null;
            }
        });
    }

    initRPC();
})();