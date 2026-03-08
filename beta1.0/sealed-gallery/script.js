// script.js - 强制通过钱包连接（解决CORS问题）
(function() {
    'use strict';

    console.log('🚀 脚本开始执行');

    // ---------- 常量配置 ----------
    const JOULE_CHAIN_ID = 3666;
    const CONTRACT_ADDRESS = '0x78e87C3b4751562cacE89cA4Bc976B448D317FE2';
    
    const CONTRACT_ABI = [
        "function tokenURI(uint256 tokenId) view returns (string)",
        "function isFinalized(uint256 tokenId) view returns (bool)",
        "function ownerOf(uint256 tokenId) view returns (address)",
        "function transferFrom(address from, address to, uint256 tokenId)",
        "function balanceOf(address owner) view returns (uint256)",
        "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)"
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
    const sealedCountSpan = document.getElementById('sealedCount');
    const finalizedCountSpan = document.getElementById('finalizedCount');
    const draftCountSpan = document.getElementById('draftCount');
    const totalSupplySpan = document.getElementById('totalSupply');
    
    // 所有NFT视图
    const allGalleryGrid = document.getElementById('allGalleryGrid');
    const allCurrentPage = document.getElementById('allCurrentPage');
    const allFirstPage = document.getElementById('allFirstPage');
    const allPrevPage = document.getElementById('allPrevPage');
    const allNextPage = document.getElementById('allNextPage');
    const allLastPage = document.getElementById('allLastPage');
    const allPageNumbers = document.getElementById('allPageNumbers');
    const allJumpInput = document.getElementById('allJumpInput');
    const allJumpBtn = document.getElementById('allJumpBtn');
    
    // 我的NFT视图
    const myGalleryGrid = document.getElementById('myGalleryGrid');
    const myNftCount = document.getElementById('myNftCount');
    const refreshMyNfts = document.getElementById('refreshMyNfts');
    
    // 转账弹窗
    const transferModal = document.getElementById('transferModal');
    const transferTokenId = document.getElementById('transferTokenId');
    const transferAddress = document.getElementById('transferAddress');
    const cancelTransfer = document.getElementById('cancelTransfer');
    const confirmTransfer = document.getElementById('confirmTransfer');

    // ---------- 状态变量 ----------
    let provider = null;
    let contract = null;
    let signer = null;
    let selectedAccount = null;
    let allCurrentPageNum = 1;
    let currentTransferTokenId = null;

    // 显示合约地址
    contractAddrSpan.innerText = CONTRACT_ADDRESS.slice(0, 6) + '...' + CONTRACT_ADDRESS.slice(-4);

    // ---------- 工具函数 ----------
    function isDefaultImage(uri) {
        if (!uri) return true;
        // 比较前100个字符
        return uri.substring(0, 100) === DEFAULT_IMAGE.substring(0, 100);
    }

    // ---------- 获取NFT状态（通过钱包连接）----------
    async function getNFTStatus(tokenId) {
        try {
            // 1. 先查询tokenURI
            const uri = await contract.tokenURI(tokenId);
            
            // 2. 判断是否是默认图片
            const isSealed = !isDefaultImage(uri);
            
            if (isSealed) {
                // 已封印：返回真实图片
                return {
                    tokenId,
                    status: 'sealed',
                    uri: uri,
                    isSealed: true,
                    isFinalized: false
                };
            } else {
                // 3. 如果是默认图片，查询是否已定稿
                const isFinalized = await contract.isFinalized(tokenId);
                
                return {
                    tokenId,
                    status: isFinalized ? 'finalized' : 'draft',
                    uri: DEFAULT_IMAGE,
                    isSealed: false,
                    isFinalized: isFinalized
                };
            }
        } catch (error) {
            console.warn(`查询Token #${tokenId}失败:`, error);
            return {
                tokenId,
                status: 'draft',
                uri: DEFAULT_IMAGE,
                isSealed: false,
                isFinalized: false,
                error: true
            };
        }
    }

    // ---------- 连接钱包（必须先连接才能查看）----------
    async function connectWallet() {
        try {
            if (typeof window.ethereum === 'undefined') {
                alert('请安装MetaMask');
                return false;
            }
            
            // 显示加载状态
            walletAddress.innerText = '连接中...';
            
            // 创建provider
            provider = new ethers.providers.Web3Provider(window.ethereum);
            
            // 请求账户
            await provider.send('eth_requestAccounts', []);
            
            // 检查网络
            const network = await provider.getNetwork();
            console.log('当前网络:', network);
            
            if (network.chainId !== JOULE_CHAIN_ID) {
                alert(`请切换到Jouleverse网络 (chainId: ${JOULE_CHAIN_ID})`);
                walletAddress.innerText = '网络错误';
                return false;
            }
            
            // 获取signer和账户
            signer = provider.getSigner();
            selectedAccount = await signer.getAddress();
            walletAddress.innerText = selectedAccount.slice(0, 6) + '...' + selectedAccount.slice(-4);
            
            // 创建合约实例
            contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
            
            console.log('✅ 连接成功:', selectedAccount);
            
            // 启用所有视图
            enableAllViews();
            
            return true;
            
        } catch (error) {
            console.error('连接钱包失败:', error);
            walletAddress.innerText = '连接失败';
            alert('连接钱包失败: ' + error.message);
            return false;
        }
    }

    // ---------- 启用所有视图（连接后）----------
    function enableAllViews() {
        // 移除所有禁用状态
        allFirstPage.disabled = false;
        allPrevPage.disabled = false;
        allNextPage.disabled = false;
        allLastPage.disabled = false;
        allJumpBtn.disabled = false;
        refreshMyNfts.disabled = false;
        
        // 加载第一页
        loadAllNFTs(1);
        
        // 开始加载统计数据
        loadAllStats();
    }

    // ---------- 加载所有NFT ----------
    async function loadAllNFTs(page) {
        if (!contract) {
            allGalleryGrid.innerHTML = '<div class="connect-prompt">👆 请先连接钱包</div>';
            return;
        }

        allGalleryGrid.innerHTML = '<div class="loading-spinner">🖼️ 加载NFT数据中...</div>';
        
        try {
            const startId = (page - 1) * ITEMS_PER_PAGE;
            const endId = Math.min(startId + ITEMS_PER_PAGE, MAX_SUPPLY);
            
            console.log(`加载页面 ${page}, Token范围: ${startId} - ${endId-1}`);
            
            const tokenIds = [];
            for (let i = startId; i < endId; i++) {
                tokenIds.push(i);
            }

            // 分批查询
            const results = [];
            for (let i = 0; i < tokenIds.length; i += 5) {
                const batch = tokenIds.slice(i, i + 5);
                const batchPromises = batch.map(tokenId => getNFTStatus(tokenId));
                
                const batchResults = await Promise.all(batchPromises);
                results.push(...batchResults);
                
                // 更新进度
                if (i + 5 < tokenIds.length) {
                    allGalleryGrid.innerHTML = `<div class="loading-spinner">🖼️ 加载中... ${Math.min(i+5, tokenIds.length)}/${tokenIds.length}</div>`;
                }
            }
            
            // 生成HTML
            let html = '';
            for (const nft of results) {
                const borderColor = nft.status === 'sealed' ? '#10b981' : 
                                   nft.status === 'finalized' ? '#f59e0b' : '#6b7280';
                const statusIcon = nft.status === 'sealed' ? '🔒' :
                                  nft.status === 'finalized' ? '📝' : '✏️';
                const statusText = nft.status === 'sealed' ? '已封印' :
                                  nft.status === 'finalized' ? '已定稿' : '草稿';
                
                html += `
                    <div class="nft-card status-${nft.status}" 
                         style="border-color: ${borderColor}"
                         title="Token #${nft.tokenId} - ${statusText}">
                        <div class="preview-container">
                            <img src="${nft.uri}" 
                                 alt="#${nft.tokenId}" 
                                 loading="lazy"
                                 onerror="this.src='${DEFAULT_IMAGE}';">
                        </div>
                        <div class="token-info">
                            <span class="token-id">#${nft.tokenId}</span>
                            <span class="status-indicator">${statusIcon}</span>
                        </div>
                    </div>
                `;
            }
            
            allGalleryGrid.innerHTML = html;
            allCurrentPage.innerText = page;
            updateAllPagination(page);
            
        } catch (error) {
            console.error('加载失败:', error);
            allGalleryGrid.innerHTML = `<div class="loading-spinner">❌ 加载失败: ${error.message}</div>`;
        }
    }

    // ---------- 加载统计数据 ----------
    async function loadAllStats() {
        if (!contract) return;
        
        try {
            let sealed = 0, finalized = 0, draft = 0;
            
            // 只统计前1000个，避免太久
            for (let start = 0; start < 1000; start += 20) {
                const promises = [];
                for (let i = 0; i < 20 && start + i < 1000; i++) {
                    const tokenId = start + i;
                    promises.push(getNFTStatus(tokenId));
                }
                
                const results = await Promise.all(promises);
                for (const r of results) {
                    if (r.status === 'sealed') sealed++;
                    else if (r.status === 'finalized') finalized++;
                    else draft++;
                }
                
                sealedCountSpan.innerText = sealed;
                finalizedCountSpan.innerText = finalized;
                draftCountSpan.innerText = draft;
            }
            
            console.log(`统计(前1000): 封印=${sealed}, 定稿=${finalized}, 草稿=${draft}`);
        } catch (error) {
            console.warn('统计失败:', error);
        }
    }

    // ---------- 更新分页 ----------
    function updateAllPagination(page) {
        let startPage = Math.max(1, page - 2);
        let endPage = Math.min(TOTAL_PAGES, page + 2);
        
        let btnsHtml = '';
        if (startPage > 1) {
            btnsHtml += `<button class="page-btn" data-page="1">1</button>`;
            if (startPage > 2) btnsHtml += `<span class="page-ellipsis">...</span>`;
        }
        
        for (let p = startPage; p <= endPage; p++) {
            btnsHtml += `<button class="page-btn ${p === page ? 'active' : ''}" data-page="${p}">${p}</button>`;
        }
        
        if (endPage < TOTAL_PAGES) {
            if (endPage < TOTAL_PAGES - 1) btnsHtml += `<span class="page-ellipsis">...</span>`;
            btnsHtml += `<button class="page-btn" data-page="${TOTAL_PAGES}">${TOTAL_PAGES}</button>`;
        }
        
        allPageNumbers.innerHTML = btnsHtml;
        
        document.querySelectorAll('#allPageNumbers .page-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const p = parseInt(btn.dataset.page);
                allCurrentPageNum = p;
                loadAllNFTs(p);
            });
        });

        allFirstPage.disabled = page === 1;
        allPrevPage.disabled = page === 1;
        allNextPage.disabled = page === TOTAL_PAGES;
        allLastPage.disabled = page === TOTAL_PAGES;
    }

    // ---------- 加载我的NFT ----------
    async function loadMyNFTs() {
        if (!selectedAccount || !signer) {
            myGalleryGrid.innerHTML = '<div class="connect-prompt">👆 请先连接钱包</div>';
            return;
        }

        myGalleryGrid.innerHTML = '<div class="loading-spinner">🖼️ 加载您的NFT...</div>';
        
        try {
            const contractWithSigner = contract.connect(signer);
            const balance = await contractWithSigner.balanceOf(selectedAccount);
            myNftCount.innerText = balance.toString();
            
            if (balance.eq(0)) {
                myGalleryGrid.innerHTML = '<div class="connect-prompt">您还没有NFT</div>';
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
                const borderColor = nft.status === 'sealed' ? '#10b981' : 
                                   nft.status === 'finalized' ? '#f59e0b' : '#6b7280';
                const statusIcon = nft.status === 'sealed' ? '🔒' :
                                  nft.status === 'finalized' ? '📝' : '✏️';
                
                html += `
                    <div class="nft-card status-${nft.status}" 
                         style="border-color: ${borderColor}">
                        <div class="preview-container">
                            <img src="${nft.uri}" alt="#${nft.tokenId}" loading="lazy"
                                 onerror="this.src='${DEFAULT_IMAGE}'">
                        </div>
                        <div class="token-info">
                            <span class="token-id">#${nft.tokenId}</span>
                            <span class="status-indicator">${statusIcon}</span>
                        </div>
                        <div class="card-actions">
                            <button class="transfer-btn" data-tokenid="${nft.tokenId}">🔄 转移</button>
                        </div>
                    </div>
                `;
            }
            
            myGalleryGrid.innerHTML = html;
            
            document.querySelectorAll('.transfer-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const tokenId = e.target.dataset.tokenid;
                    openTransferModal(tokenId);
                });
            });
            
        } catch (error) {
            console.error('加载我的NFT失败:', error);
            myGalleryGrid.innerHTML = `<div class="connect-prompt">❌ 加载失败: ${error.message}</div>`;
        }
    }

    // ---------- 转账功能 ----------
    function openTransferModal(tokenId) {
        currentTransferTokenId = tokenId;
        transferTokenId.innerText = tokenId;
        transferAddress.value = '';
        transferModal.classList.add('show');
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
            
            transferModal.classList.remove('show');
            myGalleryGrid.innerHTML = '<div class="loading-spinner">⏳ 交易确认中...</div>';
            
            await tx.wait();
            alert('✅ 转移成功！');
            await loadMyNFTs();
            
        } catch (error) {
            console.error('转移失败:', error);
            alert('❌ 转移失败: ' + error.message);
            transferModal.classList.remove('show');
        } finally {
            currentTransferTokenId = null;
        }
    }

    // ---------- 事件绑定 ----------
    
    // 连接按钮
    connectBtn.addEventListener('click', connectWallet);

    // 标签切换
    tabAll.addEventListener('click', () => {
        tabAll.classList.add('active');
        tabMy.classList.remove('active');
        allView.classList.add('active');
        myView.classList.remove('active');
        
        // 如果已经连接，加载所有NFT
        if (contract) {
            loadAllNFTs(allCurrentPageNum);
        }
    });

    tabMy.addEventListener('click', () => {
        tabMy.classList.add('active');
        tabAll.classList.remove('active');
        myView.classList.add('active');
        allView.classList.remove('active');
        
        if (selectedAccount && contract) {
            loadMyNFTs();
        }
    });

    copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(CONTRACT_ADDRESS);
        alert('✅ 合约地址已复制');
    });

    allFirstPage.addEventListener('click', () => {
        if (!contract) {
            alert('请先连接钱包');
            return;
        }
        allCurrentPageNum = 1;
        loadAllNFTs(1);
    });

    allPrevPage.addEventListener('click', () => {
        if (!contract) {
            alert('请先连接钱包');
            return;
        }
        if (allCurrentPageNum > 1) {
            allCurrentPageNum--;
            loadAllNFTs(allCurrentPageNum);
        }
    });

    allNextPage.addEventListener('click', () => {
        if (!contract) {
            alert('请先连接钱包');
            return;
        }
        if (allCurrentPageNum < TOTAL_PAGES) {
            allCurrentPageNum++;
            loadAllNFTs(allCurrentPageNum);
        }
    });

    allLastPage.addEventListener('click', () => {
        if (!contract) {
            alert('请先连接钱包');
            return;
        }
        allCurrentPageNum = TOTAL_PAGES;
        loadAllNFTs(TOTAL_PAGES);
    });

    allJumpBtn.addEventListener('click', () => {
        if (!contract) {
            alert('请先连接钱包');
            return;
        }
        const page = parseInt(allJumpInput.value);
        if (page >= 1 && page <= TOTAL_PAGES) {
            allCurrentPageNum = page;
            loadAllNFTs(page);
        }
    });

    refreshMyNfts.addEventListener('click', () => {
        if (selectedAccount && contract) {
            loadMyNFTs();
        }
    });

    cancelTransfer.addEventListener('click', () => {
        transferModal.classList.remove('show');
        currentTransferTokenId = null;
    });

    confirmTransfer.addEventListener('click', executeTransfer);

    window.addEventListener('click', (e) => {
        if (e.target === transferModal) {
            transferModal.classList.remove('show');
            currentTransferTokenId = null;
        }
    });

    // 初始显示
    allGalleryGrid.innerHTML = '<div class="connect-prompt">👆 请先点击"连接钱包"</div>';
    myGalleryGrid.innerHTML = '<div class="connect-prompt">👆 请先连接钱包</div>';

    console.log('初始化完成');
})();