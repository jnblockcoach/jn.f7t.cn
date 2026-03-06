// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title PixelArtNFT (Istanbul兼容版 - 单文件无依赖)
 * @dev 像素工坊专属NFT合约 - 完全免费，无供应限制，支持定稿功能
 * 整合了所有OpenZeppelin依赖，无需外部导入
 */

// ============ 库和接口 ============

/**
 * @dev 地址相关工具库
 */
library Address {
    function isContract(address account) internal view returns (bool) {
        uint256 size;
        assembly {
            size := extcodesize(account)
        }
        return size > 0;
    }

    function sendValue(address payable recipient, uint256 amount) internal {
        require(address(this).balance >= amount, "Address: insufficient balance");
        (bool success, ) = recipient.call{value: amount}("");
        require(success, "Address: unable to send value, recipient may have reverted");
    }

    function functionCall(address target, bytes memory data) internal returns (bytes memory) {
        return functionCall(target, data, "Address: low-level call failed");
    }

    function functionCall(
        address target,
        bytes memory data,
        string memory errorMessage
    ) internal returns (bytes memory) {
        return functionCallWithValue(target, data, 0, errorMessage);
    }

    function functionCallWithValue(
        address target,
        bytes memory data,
        uint256 value
    ) internal returns (bytes memory) {
        return functionCallWithValue(target, data, value, "Address: low-level call with value failed");
    }

    function functionCallWithValue(
        address target,
        bytes memory data,
        uint256 value,
        string memory errorMessage
    ) internal returns (bytes memory) {
        require(address(this).balance >= value, "Address: insufficient balance for call");
        require(isContract(target), "Address: call to non-contract");

        (bool success, bytes memory returndata) = target.call{value: value}(data);
        return verifyCallResult(success, returndata, errorMessage);
    }

    function functionStaticCall(address target, bytes memory data) internal view returns (bytes memory) {
        return functionStaticCall(target, data, "Address: low-level static call failed");
    }

    function functionStaticCall(
        address target,
        bytes memory data,
        string memory errorMessage
    ) internal view returns (bytes memory) {
        require(isContract(target), "Address: static call to non-contract");

        (bool success, bytes memory returndata) = target.staticcall(data);
        return verifyCallResult(success, returndata, errorMessage);
    }

    function verifyCallResult(
        bool success,
        bytes memory returndata,
        string memory errorMessage
    ) internal pure returns (bytes memory) {
        if (success) {
            return returndata;
        } else {
            if (returndata.length > 0) {
                assembly {
                    let returndata_size := mload(returndata)
                    revert(add(32, returndata), returndata_size)
                }
            } else {
                revert(errorMessage);
            }
        }
    }
}

/**
 * @dev 计数器库
 */
library Counters {
    struct Counter {
        uint256 _value;
    }

    function current(Counter storage counter) internal view returns (uint256) {
        return counter._value;
    }

    function increment(Counter storage counter) internal {
        unchecked {
            counter._value += 1;
        }
    }

    function decrement(Counter storage counter) internal {
        uint256 value = counter._value;
        require(value > 0, "Counter: decrement overflow");
        unchecked {
            counter._value = value - 1;
        }
    }

    function reset(Counter storage counter) internal {
        counter._value = 0;
    }
}

/**
 * @dev 数学工具库
 */
library Math {
    function max(uint256 a, uint256 b) internal pure returns (uint256) {
        return a >= b ? a : b;
    }

    function min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }

    function average(uint256 a, uint256 b) internal pure returns (uint256) {
        return (a & b) + (a ^ b) / 2;
    }

    function ceilDiv(uint256 a, uint256 b) internal pure returns (uint256) {
        return a / b + (a % b == 0 ? 0 : 1);
    }
}

/**
 * @dev 字符串工具库
 */
library Strings {
    bytes16 private constant _HEX_SYMBOLS = "0123456789abcdef";

    function toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) {
            return "0";
        }
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }

    function toHexString(uint256 value) internal pure returns (string memory) {
        if (value == 0) {
            return "0x00";
        }
        uint256 temp = value;
        uint256 length = 0;
        while (temp != 0) {
            length++;
            temp >>= 8;
        }
        return toHexString(value, length);
    }

    function toHexString(uint256 value, uint256 length) internal pure returns (string memory) {
        bytes memory buffer = new bytes(2 * length + 2);
        buffer[0] = "0";
        buffer[1] = "x";
        for (uint256 i = 2 * length + 1; i > 1; --i) {
            buffer[i] = _HEX_SYMBOLS[value & 0xf];
            value >>= 4;
        }
        require(value == 0, "Strings: hex length insufficient");
        return string(buffer);
    }
}

// ============ 抽象合约和接口 ============

/**
 * @dev ERC165接口
 */
interface IERC165 {
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
}

/**
 * @dev ERC721接口
 */
interface IERC721 is IERC165 {
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);

    function balanceOf(address owner) external view returns (uint256 balance);
    function ownerOf(uint256 tokenId) external view returns (address owner);
    function safeTransferFrom(address from, address to, uint256 tokenId) external;
    function transferFrom(address from, address to, uint256 tokenId) external;
    function approve(address to, uint256 tokenId) external;
    function getApproved(uint256 tokenId) external view returns (address operator);
    function setApprovalForAll(address operator, bool _approved) external;
    function isApprovedForAll(address owner, address operator) external view returns (bool);
    function safeTransferFrom(address from, address to, uint256 tokenId, bytes calldata data) external;
}

/**
 * @dev ERC721接收器接口
 */
interface IERC721Receiver {
    function onERC721Received(
        address operator,
        address from,
        uint256 tokenId,
        bytes calldata data
    ) external returns (bytes4);
}

/**
 * @dev ERC721元数据接口
 */
interface IERC721Metadata is IERC721 {
    function name() external view returns (string memory);
    function symbol() external view returns (string memory);
    function tokenURI(uint256 tokenId) external view returns (string memory);
}

/**
 * @dev ERC721枚举接口
 */
interface IERC721Enumerable is IERC721 {
    function totalSupply() external view returns (uint256);
    function tokenOfOwnerByIndex(address owner, uint256 index) external view returns (uint256);
    function tokenByIndex(uint256 index) external view returns (uint256);
}

/**
 * @dev ERC165实现
 */
abstract contract ERC165 is IERC165 {
    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
        return interfaceId == type(IERC165).interfaceId;
    }
}

// ============ 上下文 ============

/**
 * @dev 提供当前执行上下文的信息
 */
abstract contract Context {
    function _msgSender() internal view virtual returns (address) {
        return msg.sender;
    }

    function _msgData() internal view virtual returns (bytes calldata) {
        return msg.data;
    }
}

// ============ 所有权 ============

/**
 * @dev 可拥有合约
 */
abstract contract Ownable is Context {
    address private _owner;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    constructor() {
        _transferOwnership(_msgSender());
    }

    function owner() public view virtual returns (address) {
        return _owner;
    }

    modifier onlyOwner() {
        require(owner() == _msgSender(), "Ownable: caller is not the owner");
        _;
    }

    function renounceOwnership() public virtual onlyOwner {
        _transferOwnership(address(0));
    }

    function transferOwnership(address newOwner) public virtual onlyOwner {
        require(newOwner != address(0), "Ownable: new owner is the zero address");
        _transferOwnership(newOwner);
    }

    function _transferOwnership(address newOwner) internal virtual {
        address oldOwner = _owner;
        _owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }
}

// ============ ERC721 核心 ============

/**
 * @dev ERC721代币标准实现
 */
contract ERC721 is Context, ERC165, IERC721, IERC721Metadata {
    using Address for address;
    using Strings for uint256;

    // 代币名称
    string private _name;
    // 代币符号
    string private _symbol;

    // 代币ID到所有者的映射
    mapping(uint256 => address) private _owners;
    // 所有者到代币数量的映射
    mapping(address => uint256) private _balances;
    // 代币ID到授权地址的映射
    mapping(uint256 => address) private _tokenApprovals;
    // 所有者到操作员授权状态的映射
    mapping(address => mapping(address => bool)) private _operatorApprovals;

    constructor(string memory name_, string memory symbol_) {
        _name = name_;
        _symbol = symbol_;
    }

    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC165, IERC165) returns (bool) {
        return
            interfaceId == type(IERC721).interfaceId ||
            interfaceId == type(IERC721Metadata).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    function balanceOf(address owner) public view virtual override returns (uint256) {
        require(owner != address(0), "ERC721: balance query for the zero address");
        return _balances[owner];
    }

    function ownerOf(uint256 tokenId) public view virtual override returns (address) {
        address owner = _owners[tokenId];
        require(owner != address(0), "ERC721: owner query for nonexistent token");
        return owner;
    }

    function name() public view virtual override returns (string memory) {
        return _name;
    }

    function symbol() public view virtual override returns (string memory) {
        return _symbol;
    }

    function tokenURI(uint256 tokenId) public view virtual override returns (string memory) {
        require(_exists(tokenId), "ERC721Metadata: URI query for nonexistent token");
        string memory baseURI = _baseURI();
        return bytes(baseURI).length > 0 ? string(abi.encodePacked(baseURI, tokenId.toString())) : "";
    }

    function _baseURI() internal view virtual returns (string memory) {
        return "";
    }

    function approve(address to, uint256 tokenId) public virtual override {
        address owner = ERC721.ownerOf(tokenId);
        require(to != owner, "ERC721: approval to current owner");

        require(
            _msgSender() == owner || isApprovedForAll(owner, _msgSender()),
            "ERC721: approve caller is not owner nor approved for all"
        );

        _approve(to, tokenId);
    }

    function getApproved(uint256 tokenId) public view virtual override returns (address) {
        require(_exists(tokenId), "ERC721: approved query for nonexistent token");
        return _tokenApprovals[tokenId];
    }

    function setApprovalForAll(address operator, bool approved) public virtual override {
        _setApprovalForAll(_msgSender(), operator, approved);
    }

    function isApprovedForAll(address owner, address operator) public view virtual override returns (bool) {
        return _operatorApprovals[owner][operator];
    }

    function transferFrom(address from, address to, uint256 tokenId) public virtual override {
        require(_isApprovedOrOwner(_msgSender(), tokenId), "ERC721: transfer caller is not owner nor approved");
        _transfer(from, to, tokenId);
    }

    function safeTransferFrom(address from, address to, uint256 tokenId) public virtual override {
        safeTransferFrom(from, to, tokenId, "");
    }

    function safeTransferFrom(address from, address to, uint256 tokenId, bytes memory data) public virtual override {
        require(_isApprovedOrOwner(_msgSender(), tokenId), "ERC721: transfer caller is not owner nor approved");
        _safeTransfer(from, to, tokenId, data);
    }

    function _safeTransfer(address from, address to, uint256 tokenId, bytes memory data) internal virtual {
        _transfer(from, to, tokenId);
        require(_checkOnERC721Received(from, to, tokenId, data), "ERC721: transfer to non ERC721Receiver implementer");
    }

    function _exists(uint256 tokenId) internal view virtual returns (bool) {
        return _owners[tokenId] != address(0);
    }

    function _isApprovedOrOwner(address spender, uint256 tokenId) internal view virtual returns (bool) {
        require(_exists(tokenId), "ERC721: operator query for nonexistent token");
        address owner = ERC721.ownerOf(tokenId);
        return (spender == owner || getApproved(tokenId) == spender || isApprovedForAll(owner, spender));
    }

    function _safeMint(address to, uint256 tokenId) internal virtual {
        _safeMint(to, tokenId, "");
    }

    function _safeMint(address to, uint256 tokenId, bytes memory data) internal virtual {
        _mint(to, tokenId);
        require(
            _checkOnERC721Received(address(0), to, tokenId, data),
            "ERC721: transfer to non ERC721Receiver implementer"
        );
    }

    function _mint(address to, uint256 tokenId) internal virtual {
        require(to != address(0), "ERC721: mint to the zero address");
        require(!_exists(tokenId), "ERC721: token already minted");

        _beforeTokenTransfer(address(0), to, tokenId, 1);

        _balances[to] += 1;
        _owners[tokenId] = to;

        emit Transfer(address(0), to, tokenId);

        _afterTokenTransfer(address(0), to, tokenId, 1);
    }

    function _burn(uint256 tokenId) internal virtual {
        address owner = ERC721.ownerOf(tokenId);

        _beforeTokenTransfer(owner, address(0), tokenId, 1);

        _approve(address(0), tokenId);

        _balances[owner] -= 1;
        delete _owners[tokenId];

        emit Transfer(owner, address(0), tokenId);

        _afterTokenTransfer(owner, address(0), tokenId, 1);
    }

    function _transfer(address from, address to, uint256 tokenId) internal virtual {
        require(ERC721.ownerOf(tokenId) == from, "ERC721: transfer from incorrect owner");
        require(to != address(0), "ERC721: transfer to the zero address");

        _beforeTokenTransfer(from, to, tokenId, 1);

        _approve(address(0), tokenId);

        _balances[from] -= 1;
        _balances[to] += 1;
        _owners[tokenId] = to;

        emit Transfer(from, to, tokenId);

        _afterTokenTransfer(from, to, tokenId, 1);
    }

    function _approve(address to, uint256 tokenId) internal virtual {
        _tokenApprovals[tokenId] = to;
        emit Approval(ERC721.ownerOf(tokenId), to, tokenId);
    }

    function _setApprovalForAll(address owner, address operator, bool approved) internal virtual {
        require(owner != operator, "ERC721: approve to caller");
        _operatorApprovals[owner][operator] = approved;
        emit ApprovalForAll(owner, operator, approved);
    }

    function _checkOnERC721Received(
        address from,
        address to,
        uint256 tokenId,
        bytes memory data
    ) private returns (bool) {
        if (to.isContract()) {
            try IERC721Receiver(to).onERC721Received(_msgSender(), from, tokenId, data) returns (bytes4 retval) {
                return retval == IERC721Receiver.onERC721Received.selector;
            } catch (bytes memory reason) {
                if (reason.length == 0) {
                    revert("ERC721: transfer to non ERC721Receiver implementer");
                } else {
                    assembly {
                        revert(add(32, reason), mload(reason))
                    }
                }
            }
        } else {
            return true;
        }
    }

    function _beforeTokenTransfer(address from, address to, uint256 tokenId, uint256 batchSize) internal virtual {}

    function _afterTokenTransfer(address from, address to, uint256 tokenId, uint256 batchSize) internal virtual {}
}

// ============ ERC721 URI存储扩展 ============

/**
 * @dev ERC721带URI存储的扩展
 */
abstract contract ERC721URIStorage is ERC721 {
    using Strings for uint256;

    mapping(uint256 => string) private _tokenURIs;

    function tokenURI(uint256 tokenId) public view virtual override returns (string memory) {
        require(_exists(tokenId), "ERC721URIStorage: URI query for nonexistent token");

        string memory _tokenURI = _tokenURIs[tokenId];
        string memory base = _baseURI();

        if (bytes(base).length == 0) {
            return _tokenURI;
        }
        if (bytes(_tokenURI).length > 0) {
            return string(abi.encodePacked(base, _tokenURI));
        }

        return super.tokenURI(tokenId);
    }

    function _setTokenURI(uint256 tokenId, string memory _tokenURI) internal virtual {
        require(_exists(tokenId), "ERC721URIStorage: URI set of nonexistent token");
        _tokenURIs[tokenId] = _tokenURI;
    }

    function _burn(uint256 tokenId) internal virtual override {
        super._burn(tokenId);

        if (bytes(_tokenURIs[tokenId]).length != 0) {
            delete _tokenURIs[tokenId];
        }
    }
}

// ============ ERC721 枚举扩展 ============

/**
 * @dev ERC721可枚举扩展
 */
abstract contract ERC721Enumerable is ERC721, IERC721Enumerable {
    // 所有代币ID的数组
    uint256[] private _allTokens;

    // 所有者到其拥有的代币列表的映射
    mapping(address => uint256[]) private _ownedTokens;
    // 代币ID到其在所有者列表中的索引的映射
    mapping(uint256 => uint256) private _ownedTokensIndex;
    // 代币ID到其在全局列表中的索引的映射
    mapping(uint256 => uint256) private _allTokensIndex;

    function supportsInterface(bytes4 interfaceId) public view virtual override(IERC165, ERC721) returns (bool) {
        return interfaceId == type(IERC721Enumerable).interfaceId || super.supportsInterface(interfaceId);
    }

    function tokenOfOwnerByIndex(address owner, uint256 index) public view virtual override returns (uint256) {
        require(index < ERC721.balanceOf(owner), "ERC721Enumerable: owner index out of bounds");
        return _ownedTokens[owner][index];
    }

    function totalSupply() public view virtual override returns (uint256) {
        return _allTokens.length;
    }

    function tokenByIndex(uint256 index) public view virtual override returns (uint256) {
        require(index < ERC721Enumerable.totalSupply(), "ERC721Enumerable: global index out of bounds");
        return _allTokens[index];
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId,
        uint256 batchSize
    ) internal virtual override {
        super._beforeTokenTransfer(from, to, tokenId, batchSize);

        if (from == address(0)) {
            _addTokenToAllTokensEnumeration(tokenId);
        } else if (from != to) {
            _removeTokenFromOwnerEnumeration(from, tokenId);
        }
        if (to == address(0)) {
            _removeTokenFromAllTokensEnumeration(tokenId);
        } else if (to != from) {
            _addTokenToOwnerEnumeration(to, tokenId);
        }
    }

    function _addTokenToOwnerEnumeration(address to, uint256 tokenId) private {
        uint256 length = ERC721.balanceOf(to);
        _ownedTokens[to].push(tokenId);
        _ownedTokensIndex[tokenId] = length;
    }

    function _addTokenToAllTokensEnumeration(uint256 tokenId) private {
        _allTokensIndex[tokenId] = _allTokens.length;
        _allTokens.push(tokenId);
    }

    function _removeTokenFromOwnerEnumeration(address from, uint256 tokenId) private {
        uint256 lastTokenIndex = ERC721.balanceOf(from) - 1;
        uint256 tokenIndex = _ownedTokensIndex[tokenId];

        if (tokenIndex != lastTokenIndex) {
            uint256 lastTokenId = _ownedTokens[from][lastTokenIndex];

            _ownedTokens[from][tokenIndex] = lastTokenId;
            _ownedTokensIndex[lastTokenId] = tokenIndex;
        }

        _ownedTokens[from].pop();
        delete _ownedTokensIndex[tokenId];
    }

    function _removeTokenFromAllTokensEnumeration(uint256 tokenId) private {
        uint256 lastTokenIndex = _allTokens.length - 1;
        uint256 tokenIndex = _allTokensIndex[tokenId];

        uint256 lastTokenId = _allTokens[lastTokenIndex];

        _allTokens[tokenIndex] = lastTokenId;
        _allTokensIndex[lastTokenId] = tokenIndex;

        delete _allTokensIndex[tokenId];
        _allTokens.pop();
    }
}

// ============ 主合约 ============

/**
 * @title PixelArtNFT
 * @dev 像素工坊专属NFT合约 - 总量10000个，支持定稿和永久封存功能
 * 简化版：只保留核心功能，无批量操作
 */
contract PixelArtNFT is ERC721, ERC721URIStorage, ERC721Enumerable, Ownable {

    // 最大供应量
    uint256 public constant MAX_SUPPLY = 10000;

    // 可用ID队列（用于回收销毁的ID）
    uint256[] private _availableIds;

    // 下一个要使用的ID（当可用队列为空时使用）
    uint256 private _nextId = 0;

    // 定稿状态映射 - true表示已定稿
    mapping(uint256 => bool) public isFinalized;

    // 永久封存状态映射 - true表示已永久封存
    mapping(uint256 => bool) public isSealed;

    // 已定稿NFT的ID列表（待审核列表，封存后移除）
    uint256[] private _finalizedTokenIds;

    // 已定稿NFT的ID到索引的映射（方便快速移除）
    mapping(uint256 => uint256) private _finalizedIndex;

    // 默认图片Base64（封存前显示的占位图）
    string constant DEFAULT_IMAGE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAAo0lEQVR4AeSSUQqAMAxDh5fS+3/VUyn5CIjYNRnsYyiE6Uzztm5bRFwztbXJTwnYj6NlUtbWBSC4F1L9R20KUIoRUPlSAIpV9SAy4IxolAqGTwIgGGbq/c35rzEFIIT6KlTnUoAaUPmGAO9DxU4zkA1wwgG1AG64BRgJtwAwU72e08PRahGLnPFHAPSdWrNFuKbUmjtwVv30yteUB4zxGVC93wAAAP//RzeAkQAAAAZJREFUAwCevYlZ3o1a6AAAAABJRU5ErkJggg==";

    // 事件
    event NFTMinted(address indexed to, uint256 indexed tokenId);
    event NFTBurned(address indexed from, uint256 indexed tokenId);
    event NFTFinalized(uint256 indexed tokenId, address indexed finalizer);
    event NFTSealed(uint256 indexed tokenId, address indexed sealer);

    constructor() ERC721("PixelArtNFT", "PixelArtNFT") Ownable() {}

    /**
     * @dev 获取下一个可用的token ID
     */
    function _getNextAvailableId() private returns (uint256) {
        if (_availableIds.length > 0) {
            uint256 lastIndex = _availableIds.length - 1;
            uint256 tokenId = _availableIds[lastIndex];
            _availableIds.pop();
            return tokenId;
        } else {
            require(_nextId < MAX_SUPPLY, "Max supply reached");
            uint256 tokenId = _nextId;
            _nextId++;
            return tokenId;
        }
    }

    /**
     * @dev 铸造NFT - 任何人都可以铸造
     */
    function mint(address to, string memory uri) public returns (uint256) {
        require(totalSupply() < MAX_SUPPLY, "Max supply reached");
        require(bytes(uri).length > 0, "URI cannot be empty");

        uint256 tokenId = _getNextAvailableId();
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, uri);

        emit NFTMinted(to, tokenId);
        return tokenId;
    }

    /**
     * @dev 定稿NFT - 任何人都可以定稿自己的NFT
     */
    function finalize(uint256 tokenId) public {
        require(_exists(tokenId), "Token does not exist");
        require(ownerOf(tokenId) == _msgSender(), "Only token owner can finalize");
        require(!isFinalized[tokenId], "Already finalized");
        require(!isSealed[tokenId], "Cannot finalize sealed token");

        isFinalized[tokenId] = true;

        // 加入审核列表并记录索引
        _finalizedIndex[tokenId] = _finalizedTokenIds.length;
        _finalizedTokenIds.push(tokenId);

        emit NFTFinalized(tokenId, _msgSender());
    }

    /**
     * @dev 永久封存NFT - 仅owner可操作，且只能在定稿后进行
     * 封存后从待审核列表中移除
     */
    function seal(uint256 tokenId) public onlyOwner {
        require(_exists(tokenId), "Token does not exist");
        require(isFinalized[tokenId], "Can only seal finalized token");
        require(!isSealed[tokenId], "Already sealed");

        isSealed[tokenId] = true;

        // 从待审核列表中移除
        _removeFromFinalizedList(tokenId);

        emit NFTSealed(tokenId, _msgSender());
    }

    /**
     * @dev 从已定稿列表中移除tokenId（内部函数）
     */
    function _removeFromFinalizedList(uint256 tokenId) private {
        uint256 index = _finalizedIndex[tokenId];
        uint256 lastIndex = _finalizedTokenIds.length - 1;

        if (index != lastIndex) {
            uint256 lastTokenId = _finalizedTokenIds[lastIndex];
            _finalizedTokenIds[index] = lastTokenId;
            _finalizedIndex[lastTokenId] = index;
        }

        _finalizedTokenIds.pop();
        delete _finalizedIndex[tokenId];
    }

    /**
     * @dev 预览TokenURI - 返回真实内容（持有者或owner可用）
     */
    function tokenURIPreview(uint256 tokenId) public view returns (string memory) {
        require(_exists(tokenId), "Token does not exist");

        // 只有持有者或owner可以预览
        address caller = _msgSender();
        address tokenOwner = ownerOf(tokenId);
        require(
            caller == tokenOwner ||
            caller == owner() ||
            isApprovedForAll(tokenOwner, caller),
            "Not authorized to preview"
        );

        return super.tokenURI(tokenId);
    }

    /**
     * @dev TokenURI - 公开查看接口
     * - 未封存：返回默认图片
     * - 已封存：返回真实内容
     */
    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (string memory)
    {
        require(_exists(tokenId), "Token does not exist");

        if (isSealed[tokenId]) {
            return super.tokenURI(tokenId);
        }
        return DEFAULT_IMAGE;
    }

   /**
    * @dev 销毁NFT - 权限控制：
    * - 未定稿：持有者（或授权）和owner都可以销毁
    * - 已定稿：仅owner可以销毁
    * - 已封存：任何人都不能销毁
    */
    function burn(uint256 tokenId) public {
        require(_exists(tokenId), "Token does not exist");

        // 封存检查：任何人都不能销毁封存的NFT
        require(!isSealed[tokenId], "Cannot burn sealed token");

        address tokenOwner = ownerOf(tokenId);
        address caller = _msgSender();

        // 记录销毁前的状态
        bool wasFinalized = isFinalized[tokenId];

        // 已定稿的NFT：只有owner可以销毁
        if (wasFinalized) {
            require(caller == owner(), "Only contract owner can burn finalized token");
        }
        // 未定稿的NFT：持有者（或授权）和owner都可以销毁
        else {
            bool isAuthorized = (caller == tokenOwner) ||
                                (getApproved(tokenId) == caller) ||
                                isApprovedForAll(tokenOwner, caller) ||
                                (caller == owner());
            require(isAuthorized, "Not authorized to burn");
        }

        // 先销毁NFT（这会删除ERC721数据）
        _burn(tokenId);

        // 销毁后清理状态（tokenId仍然存在作为key）
        if (wasFinalized) {
            _removeFromFinalizedList(tokenId);  // 从待审核列表中移除
            delete isFinalized[tokenId];        // 清除定稿状态
        }
        // 注意：isSealed[tokenId] 不需要清理，因为封存的NFT根本不允许销毁

        // 将销毁的ID加入可用队列（回收利用）
        _availableIds.push(tokenId);

        emit NFTBurned(tokenOwner, tokenId);
    }

    // ============ owner审核函数 ============

    /**
     * @dev 获取待审核NFT的总数（仅owner可调用）
     */
    function getPendingCount() public view onlyOwner returns (uint256) {
        return _finalizedTokenIds.length;
    }

    /**
     * @dev 根据索引获取待审核NFT的ID（仅owner可调用）
     * @param index 索引（从0开始）
     * @return tokenId 待审核的token ID
     */
    function pendingTokenByIndex(uint256 index) public view onlyOwner returns (uint256) {
        require(index < _finalizedTokenIds.length, "Index out of bounds");
        return _finalizedTokenIds[index];
    }

    /**
     * @dev 获取待审核NFT的详细信息（仅owner可调用）
     * @param tokenId 要查询的token ID
     * @return ownerAddress 持有者地址
     * @return tokenUri 真实内容
     */
    function getPendingDetail(uint256 tokenId)
        public
        view
        onlyOwner
        returns (address ownerAddress, string memory tokenUri)
    {
        require(_exists(tokenId), "Token does not exist");
        require(!isSealed[tokenId], "Token is already sealed");
        require(isFinalized[tokenId], "Token is not finalized");

        ownerAddress = ownerOf(tokenId);
        tokenUri = super.tokenURI(tokenId);

        return (ownerAddress, tokenUri);
    }

    /**
     * @dev 总供应量
     */
    function totalSupply() public view override(ERC721Enumerable) returns (uint256) {
        return super.totalSupply();
    }

    /**
     * @dev 可用ID数量
     */
    function availableIdsCount() public view returns (uint256) {
        return _availableIds.length;
    }

    /**
     * @dev 下一个新ID
     */
    function getNextNewId() public view returns (uint256) {
        return _nextId;
    }

    // Solidity要求的重写函数
    function _beforeTokenTransfer(address from, address to, uint256 tokenId, uint256 batchSize)
        internal
        override(ERC721, ERC721Enumerable)
    {
        super._beforeTokenTransfer(from, to, tokenId, batchSize);
    }

    function _burn(uint256 tokenId)
        internal
        override(ERC721, ERC721URIStorage)
    {
        super._burn(tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721Enumerable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
