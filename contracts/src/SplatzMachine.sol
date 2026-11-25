// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC2981} from "@openzeppelin/contracts/token/common/ERC2981.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @title Street Splatz gumball machine
/// @notice Pay the price once, get one random card out of a fixed set of 100.
///         Token id equals card number, 1 to 100. All 100 are for sale.
/// @dev The pick uses public block data. It is cheap and instant but it is NOT
///      verifiable randomness. A script could predict or steer it.
///      Ownership moves in two steps: the owner names a new owner with transferOwnership,
///      and nothing changes until that wallet calls acceptOwnership. A mistyped address cannot take over.
contract SplatzMachine is ERC721, ERC2981, Ownable2Step {
    /// @notice There are 100 cards and there will never be more.
    uint256 public constant MAX_SUPPLY = 100;

    /// @notice Fingerprint (hash) of all card art and metadata files. Never changes.
    bytes32 public immutable PROVENANCE;

    /// @dev Royalty is 7 percent, in basis points (parts per 10,000).
    uint256 private constant ROYALTY_BPS = 700;

    /// @notice Price of one pull, in wei.
    uint256 public price;

    /// @notice True when the machine takes coins. Starts closed.
    bool public saleOpen;

    /// @notice How many cards are still in the machine.
    uint256 public remaining = MAX_SUPPLY;

    /// @dev Bit n is set once card n has been pulled.
    uint256 private _pulledBitmap;

    /// @dev Sparse shuffle table. Slot i holds a card number, or 0 meaning "card i + 1".
    mapping(uint256 slot => uint256 card) private _slots;

    /// @dev Folder address of the metadata files. Always ends with "/".
    string private _baseTokenURI;

    /// @notice A card left the machine.
    event Pulled(address indexed to, uint256 indexed tokenId);
    /// @notice The sale was opened or closed.
    event SaleOpenSet(bool open);
    /// @notice The price changed.
    event PriceSet(uint256 price);
    /// @notice The metadata folder address changed.
    event BaseURISet(string baseURI);
    /// @notice Proceeds were sent to the owner.
    event Withdrawn(address to, uint256 amount);

    /// @notice The sale is not open.
    error SaleClosed();
    /// @notice The payment was not exactly the price.
    error WrongPrice();
    /// @notice All 100 cards are gone.
    error SoldOut();
    /// @notice Sending the proceeds to the owner failed.
    error WithdrawFailed();
    /// @notice Ownership can be transferred but never given up.
    error RenounceDisabled();
    /// @notice The price cannot be zero. A free pull would let anyone empty the machine.
    error ZeroPrice();
    /// @notice The metadata folder address must end with "/".
    error BadBaseURI();

    /// @param initialOwner Wallet that controls the machine and receives proceeds.
    /// @param baseURI_ Folder address of the metadata files, ending with "/".
    /// @param price_ Price of one pull, in wei.
    /// @param provenance_ Fingerprint of all card files.
    constructor(address initialOwner, string memory baseURI_, uint256 price_, bytes32 provenance_)
        ERC721("Street Splatz", "SPLATZ")
        Ownable(initialOwner)
    {
        _checkBaseURI(baseURI_);
        if (price_ == 0) revert ZeroPrice();
        _baseTokenURI = baseURI_;
        price = price_;
        PROVENANCE = provenance_;
    }

    // ------------------------------------------------------------------
    // The pull
    // ------------------------------------------------------------------

    /// @notice Pay exactly the price and receive one random card from those left.
    /// @dev Makes no outside calls. Uses _mint, so any address can buy.
    /// @return tokenId The card number that came out, 1 to 100.
    function pull() external payable returns (uint256 tokenId) {
        if (!saleOpen) revert SaleClosed();
        if (msg.value != price) revert WrongPrice();
        uint256 left = remaining;
        if (left == 0) revert SoldOut();

        // Pick a slot among the cards left, using public block data.
        uint256 seed = uint256(
            keccak256(abi.encode(block.prevrandao, blockhash(block.number - 1), msg.sender, left, address(this)))
        );
        uint256 pick = seed % left;
        uint256 last = left - 1;

        // Take the card in the picked slot, then move the last card into that slot.
        tokenId = _cardAt(pick);
        if (pick != last) _slots[pick] = _cardAt(last);

        remaining = last;
        _pulledBitmap |= uint256(1) << tokenId;

        _mint(msg.sender, tokenId);
        emit Pulled(msg.sender, tokenId);
    }

    /// @dev Card number sitting in a slot. An untouched slot i holds card i + 1.
    function _cardAt(uint256 slot) private view returns (uint256 card) {
        card = _slots[slot];
        if (card == 0) card = slot + 1;
    }

    // ------------------------------------------------------------------
    // Reading
    // ------------------------------------------------------------------

    /// @notice Everything the site needs in one call.
    /// @return price_ Price of one pull, in wei.
    /// @return remaining_ Cards still in the machine.
    /// @return saleOpen_ True when the machine takes coins.
    /// @return pulledBitmap Bit n is set when card n (1 to 100) has been pulled.
    function machineState()
        external
        view
        returns (uint256 price_, uint256 remaining_, bool saleOpen_, uint256 pulledBitmap)
    {
        return (price, remaining, saleOpen, _pulledBitmap);
    }

    /// @notice Address of a card's metadata file. Fails for a card not pulled yet.
    function tokenURI(uint256 id) public view override returns (string memory) {
        _requireOwned(id);
        return string.concat(_baseTokenURI, Strings.toString(id), ".json");
    }

    /// @notice Address of the collection's metadata file.
    function contractURI() external view returns (string memory) {
        return string.concat(_baseTokenURI, "collection.json");
    }

    /// @notice Royalty info: 7 percent of the sale price, paid to the current owner.
    /// @dev Marketplaces treat this as optional.
    function royaltyInfo(uint256, uint256 salePrice) public view override returns (address, uint256) {
        return (owner(), (salePrice * ROYALTY_BPS) / 10_000);
    }

    /// @notice Says which standards this contract supports (ERC-721 and ERC-2981).
    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC2981) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    // ------------------------------------------------------------------
    // Owner controls
    // ------------------------------------------------------------------

    /// @notice Open or close the sale.
    function setSaleOpen(bool open) external onlyOwner {
        saleOpen = open;
        emit SaleOpenSet(open);
    }

    /// @notice Change the price of one pull, in wei. Zero is refused.
    function setPrice(uint256 newPrice) external onlyOwner {
        if (newPrice == 0) revert ZeroPrice();
        price = newPrice;
        emit PriceSet(newPrice);
    }

    /// @notice Point the cards at a new metadata folder. Fails unless it ends with "/".
    function setBaseURI(string calldata newBaseURI) external onlyOwner {
        _checkBaseURI(newBaseURI);
        _baseTokenURI = newBaseURI;
        emit BaseURISet(newBaseURI);
    }

    /// @notice Send the whole balance to the owner.
    function withdraw() external onlyOwner {
        address to = owner();
        uint256 amount = address(this).balance;
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert WithdrawFailed();
        emit Withdrawn(to, amount);
    }

    /// @dev A folder address is only usable if it ends with "/", because file names are added straight after it.
    function _checkBaseURI(string memory uri) private pure {
        bytes memory b = bytes(uri);
        if (b.length == 0 || b[b.length - 1] != "/") revert BadBaseURI();
    }

    /// @notice Disabled. Always fails, for everyone. Without an owner the proceeds could never be withdrawn.
    function renounceOwnership() public pure override {
        revert RenounceDisabled();
    }
}
