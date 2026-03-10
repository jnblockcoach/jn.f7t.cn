// owner-script.js - 合约所有者审核面板逻辑
(function() {
    'use strict';

    // ----- 常量配置 -----
    const JOULE_CHAIN_ID = 3666;
    // 请确保下面地址与您部署的新合约地址一致！
    const CONTRACT_ADDRESS = '0x78e87C3b4751562cacE89cA4Bc976B448D317FE2'; 

    // 完整 ABI (仅包含需要的方法，与原合约一致)
    const CONTRACT_ABI = [
        "function name() view returns (string)",
        "function symbol() view returns (string)",
        "function owner() view returns (address)",
        "function totalSupply() view returns (uint256)",
        "function tokenByIndex(uint256 index) view returns (uint256)",
        "function tokenURI(uint256 tokenId) view returns (string)",
        "function tokenURIPreview(uint256 tokenId) view returns (string)",
        "function isFinalized(uint256 tokenId) view returns (bool)",
        "function isSealed(uint256 tokenId) view returns (bool)",
        "function ownerOf(uint256 tokenId) view returns (address)",
        "function burn(uint256 tokenId)",
        "function seal(uint256 tokenId)",
        "function pendingTokenByIndex(uint256 index) view returns (uint256)",
        "function getPendingCount() view returns (uint256)",
        "function getPendingDetail(uint256 tokenId) view returns (address ownerAddress, string tokenUri)",
        "event NFTFinalized(uint256 indexed tokenId, address indexed finalizer)",
        "event NFTSealed(uint256 indexed tokenId, address indexed sealer)",
        "event NFTBurned(address indexed from, uint256 indexed tokenId)"
    ];

    // ----- DOM 元素 -----
    const connectBtn = document.getElementById('connectWalletBtn');
    const walletDisplay = document.getElementById('walletAddressDisplay');
    const contractAddressSpan = document.getElementById('contractAddressDisplay');
    const copyContractBtn = document.getElementById('copyContractBtn');
    const contractOwnerSpan = document.getElementById('contractOwnerDisplay');
    const yourIdentitySpan = document.getElementById('yourIdentityDisplay');
    const identityBadge = document.getElementById('identityBadge');
    const pendingCountSpan = document.getElementById('pendingCountDisplay');
    const supplyInfoSpan = document.getElementById('supplyInfo');
    const ownerPanel = document.getElementById('ownerPanel');
    const accessDeniedDiv = document.getElementById('accessDenied');
    const globalStatus = document.getElementById('globalStatus');
    const nftGrid = document.getElementById('nftGrid');
    const refreshBtn = document.getElementById('refreshListBtn');
    const toggleSealedBtn = document.getElementById('toggleSealedBtn');
    const prevPageBtn = document.getElementById('prevPageBtn');
    const nextPageBtn = document.getElementById('nextPageBtn');
    const pageInfoSpan = document.getElementById('pageInfo');
    const paginationBar = document.getElementById('paginationBar');

    // ----- 全局变量 -----
    let provider = null;
    let signer = null;
    let contract = null;
    let selectedAccount = null;
    let contractOwner = null;
    let isOwner = false;

    // NFT 列表数据 (缓存所有待审核 tokenId)
    let pendingTokenIds = [];
    let allTokensCache = [];            // 用于显示所有已定稿(可选)
    let currentPage = 1;
    const PAGE_SIZE = 12;
    let hideSealed = false;              // 切换显示已封存

    // ----- 辅助函数 -----
    function shortenAddress(addr) {
        if (!addr || addr.length < 10) return addr;
        return addr.slice(0, 6) + '...' + addr.slice(-4);
    }

    function updateGlobalStatus(msg, isError = false) {
        globalStatus.innerText = msg;
        globalStatus.style.color = isError ? '#faa0a0' : '#88a9f0';
        if (msg) console.log('[Status]', msg);
    }

    // 复制合约地址
    copyContractBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(CONTRACT_ADDRESS);
        updateGlobalStatus('✅ 合约地址已复制');
        setTimeout(() => updateGlobalStatus(''), 1500);
    });

    // 显示合约地址
    contractAddressSpan.innerText = shortenAddress(CONTRACT_ADDRESS);

    // ----- 连接钱包 + 验证所有者 -----
    async function connectWallet() {
        try {
            updateGlobalStatus('⏳ 连接钱包中...');
            if (typeof window.ethereum === 'undefined') {
                throw new Error('未检测到钱包 (MetaMask)');
            }

            provider = new ethers.providers.Web3Provider(window.ethereum);
            await provider.send('eth_requestAccounts', []);
            signer = provider.getSigner();
            selectedAccount = await signer.getAddress();
            walletDisplay.innerText = `📌 ${shortenAddress(selectedAccount)}`;

            // 检查网络
            const network = await provider.getNetwork();
            if (network.chainId !== JOULE_CHAIN_ID) {
                updateGlobalStatus(`⚠️ 请切换到 Jouleverse (chainId: ${JOULE_CHAIN_ID})`, true);
                // 尝试切换
                try {
                    await window.ethereum.request({
                        method: 'wallet_switchEthereumChain',
                        params: [{ chainId: '0x' + JOULE_CHAIN_ID.toString(16) }]
                    });
                    // 切换后重连
                    setTimeout(connectWallet, 1000);
                } catch (switchErr) {
                    console.warn('网络切换取消或失败');
                }
                return;
            }

            // 实例化合约
            contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

            // 获取合约所有者
            try {
                contractOwner = await contract.owner();
                contractOwnerSpan.innerText = shortenAddress(contractOwner);
            } catch (e) {
                contractOwnerSpan.innerText = '无法读取';
                throw new Error('读取合约所有者失败，请检查合约地址或ABI');
            }

            // 判断身份
            isOwner = (selectedAccount.toLowerCase() === contractOwner.toLowerCase());
            if (isOwner) {
                yourIdentitySpan.innerText = '合约所有者';
                identityBadge.innerText = '👑 审核权限';
                identityBadge.style.background = '#2f4b7c';
                accessDeniedDiv.style.display = 'none';
                ownerPanel.style.display = 'block';
                // 加载数据
                await loadContractStats();
                await loadPendingNFTs();
            } else {
                yourIdentitySpan.innerText = '普通用户';
                identityBadge.innerText = '⛔ 无权限';
                identityBadge.style.background = '#5f2f3c';
                ownerPanel.style.display = 'none';
                accessDeniedDiv.style.display = 'block';
            }

            updateGlobalStatus('✅ 连接成功');
        } catch (err) {
            console.error(err);
            updateGlobalStatus(`❌ 连接失败: ${err.message}`, true);
            walletDisplay.innerText = '连接失败';
            ownerPanel.style.display = 'none';
            accessDeniedDiv.style.display = 'none';
        }
    }

    // 加载总供应量、待审核数量等
    async function loadContractStats() {
        if (!contract || !isOwner) return;
        try {
            const total = await contract.totalSupply();
            const pending = await contract.getPendingCount();
            pendingCountSpan.innerText = pending.toString();
            supplyInfoSpan.innerText = `已封存/总量: ? / ${total.toString()}`; // 封存量需额外计算

            // 可选：尝试获取封存数量（遍历太麻烦，先占位）
        } catch (e) {
            console.warn('加载统计数据失败', e);
        }
    }

    // 获取所有待审核NFT详细信息（分页由前端实现）
    async function loadPendingNFTs() {
        if (!contract || !isOwner) return;
        try {
            nftGrid.innerHTML = '<div class="loading-spinner">🔍 读取待审核列表...</div>';
            const pendingCount = await contract.getPendingCount();
            pendingCountSpan.innerText = pendingCount.toString();

            if (pendingCount == 0) {
                nftGrid.innerHTML = '<div class="loading-spinner" style="color:#8895c0;">✨ 目前没有待审核的定稿NFT</div>';
                paginationBar.style.display = 'none';
                return;
            }

            // 获取所有待审核 tokenId (owner 方法)
            const tokenIds = [];
            for (let i = 0; i < pendingCount; i++) {
                try {
                    const tid = await contract.pendingTokenByIndex(i);
                    tokenIds.push(tid.toNumber ? tid.toNumber() : tid);
                } catch (err) {
                    console.warn(`获取第${i}个待审核token失败`, err);
                }
            }
            pendingTokenIds = tokenIds;
            // 重置为第一页
            currentPage = 1;
            renderPendingGrid();

        } catch (err) {
            console.error(err);
            nftGrid.innerHTML = `<div class="loading-spinner">❌ 加载失败: ${err.message}</div>`;
        }
    }

    // 渲染分页后的卡片
    async function renderPendingGrid() {
        if (!pendingTokenIds.length) {
            nftGrid.innerHTML = '<div class="loading-spinner">📭 待审核列表为空</div>';
            paginationBar.style.display = 'none';
            return;
        }

        const start = (currentPage - 1) * PAGE_SIZE;
        const end = Math.min(start + PAGE_SIZE, pendingTokenIds.length);
        const pageTokens = pendingTokenIds.slice(start, end);

        // 构建卡片HTML (使用异步逐个获取详细信息)
        nftGrid.innerHTML = ''; // 清空，稍后填充

        for (const tokenId of pageTokens) {
            const card = await createNFTCard(tokenId);
            nftGrid.appendChild(card);
        }

        // 分页信息
        const totalPages = Math.ceil(pendingTokenIds.length / PAGE_SIZE);
        pageInfoSpan.innerText = `第 ${currentPage} / ${totalPages} 页`;
        paginationBar.style.display = 'flex';
        prevPageBtn.disabled = currentPage <= 1;
        nextPageBtn.disabled = currentPage >= totalPages;
    }

    // 创建单个NFT卡片 DOM (async)
    async function createNFTCard(tokenId) {
        const card = document.createElement('div');
        card.className = 'nft-card';
        card.dataset.tokenId = tokenId;

        try {
            // 获取详情（使用 getPendingDetail，只有owner可调用）
            let ownerAddr = '?';
            let tokenUri = '';
            try {
                const detail = await contract.getPendingDetail(tokenId);
                ownerAddr = detail.ownerAddress;
                tokenUri = detail.tokenUri;
            } catch (err) {
                console.warn(`getPendingDetail失败 token ${tokenId}，降级查询`, err);
                // 降级：分别查询
                ownerAddr = await contract.ownerOf(tokenId);
                tokenUri = await contract.tokenURIPreview(tokenId);
            }

            const isFinalized = await contract.isFinalized(tokenId);
            const isSealed = await contract.isSealed(tokenId);

            // 预览图片 (可能很长，截断)
            let previewImg = '';
            if (tokenUri && tokenUri.startsWith('data:image')) {
                previewImg = `<img src="${tokenUri}" alt="nft preview">`;
            } else {
                previewImg = '<div style="width:100%; height:100%; background:#233053; display:flex; align-items:center; justify-content:center; color:#5e7bb3;">📦</div>';
            }

            const statusClass = isSealed ? 'badge-sealed' : (isFinalized ? 'badge-finalized' : 'badge-destroyed');
            const statusText = isSealed ? '已封存' : (isFinalized ? '已定稿' : '未知');

            card.innerHTML = `
                <div class="card-header">
                    <span class="token-id">#${tokenId}</span>
                    <div class="preview-box">${previewImg}</div>
                    <div class="token-uri-preview" title="${tokenUri}">${tokenUri.slice(0, 35)}...</div>
                </div>
                <div style="display: flex; justify-content: space-between; align-items:center;">
                    <span class="owner-address">👤 ${shortenAddress(ownerAddr)}</span>
                    <span class="status-badge ${statusClass}">${statusText}</span>
                </div>
            `;

            // 操作按钮区域
            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'card-actions';

            if (!isSealed) {
                // 未封存 => 可以销毁 和 封印
                const burnBtn = document.createElement('button');
                burnBtn.className = 'btn-action danger';
                burnBtn.innerText = '🔥 销毁';
                burnBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    executeBurn(tokenId);
                });

                const sealBtn = document.createElement('button');
                sealBtn.className = 'btn-action warning';
                sealBtn.innerText = '🔒 封印';
                sealBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    executeSeal(tokenId);
                });

                actionsDiv.appendChild(burnBtn);
                actionsDiv.appendChild(sealBtn);
            } else {
                // 已封存，只显示只读
                const sealedLabel = document.createElement('span');
                sealedLabel.className = 'btn-action';
                sealedLabel.style.background = '#2b4660';
                sealedLabel.style.opacity = '0.7';
                sealedLabel.innerText = '🔐 已永久封存';
                sealedLabel.style.cursor = 'default';
                actionsDiv.appendChild(sealedLabel);
            }

            card.appendChild(actionsDiv);
        } catch (e) {
            console.error(`创建卡片失败 token ${tokenId}:`, e);
            card.innerHTML = `<div style="color:#ffa5a5;">❌ 加载token #${tokenId} 失败</div>`;
        }
        return card;
    }

    // 执行销毁
    async function executeBurn(tokenId) {
        if (!contract || !isOwner) return;
        if (!confirm(`确定要销毁 NFT #${tokenId} 吗？\n只有未封存的NFT可以被销毁。`)) return;

        try {
            updateGlobalStatus(`⏳ 销毁 #${tokenId} 交易发送...`);
            const tx = await contract.burn(tokenId);
            await tx.wait();
            updateGlobalStatus(`✅ 销毁成功 #${tokenId}`);
            await loadPendingNFTs();    // 重新加载列表
            await loadContractStats();
        } catch (err) {
            console.error(err);
            updateGlobalStatus(`❌ 销毁失败: ${err.message.slice(0, 70)}`, true);
        }
    }

    // 执行封印
    async function executeSeal(tokenId) {
        if (!contract || !isOwner) return;
        if (!confirm(`⚠️ 封印后 NFT 将永久公开图片，任何人都无法销毁或修改。\n确认封印 #${tokenId} 吗？`)) return;

        try {
            updateGlobalStatus(`⏳ 封印 #${tokenId} 交易发送...`);
            const tx = await contract.seal(tokenId);
            await tx.wait();
            updateGlobalStatus(`✅ 封印成功 #${tokenId}`);
            await loadPendingNFTs();
            await loadContractStats();
        } catch (err) {
            console.error(err);
            updateGlobalStatus(`❌ 封印失败: ${err.message.slice(0, 70)}`, true);
        }
    }

    // 刷新列表
    refreshBtn.addEventListener('click', async () => {
        if (!isOwner) return;
        await loadContractStats();
        await loadPendingNFTs();
    });

    // 切换显示已封存 (前端过滤逻辑 - 简化: 重新加载不隐藏，但可以通过状态管理。本次先做全部显示)
    // 这里toggleSealedBtn简单重新加载（隐藏逻辑需要更复杂过滤，暂略，留作扩展）
    toggleSealedBtn.addEventListener('click', () => {
        hideSealed = !hideSealed;
        toggleSealedBtn.innerText = hideSealed ? '🔘 显示封存' : '👁️ 隐藏封存';
        // 简单重新渲染，但是前端过滤待实现
        alert('隐藏封存功能需要额外遍历，本Demo重新加载全部待审核。');
        loadPendingNFTs(); 
    });

    // 分页
    prevPageBtn.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            renderPendingGrid();
        }
    });
    nextPageBtn.addEventListener('click', () => {
        const totalPages = Math.ceil(pendingTokenIds.length / PAGE_SIZE);
        if (currentPage < totalPages) {
            currentPage++;
            renderPendingGrid();
        }
    });

    // 连接按钮
    connectBtn.addEventListener('click', connectWallet);

    // 初始时自动尝试连接 (如果有权限)
    window.addEventListener('load', () => {
        if (window.ethereum) {
            // 不自动连接，等待用户点击
        }
        // 显示默认提示
    });

    // 账户变化监听
    if (window.ethereum) {
        window.ethereum.on('accountsChanged', (accounts) => {
            console.log('账户切换', accounts);
            connectWallet(); // 重新连接验证
        });
        window.ethereum.on('chainChanged', () => window.location.reload());
    }

})();