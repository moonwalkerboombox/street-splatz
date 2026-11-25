// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test, console, Vm} from "forge-std/Test.sol";
import {SplatzMachine} from "../src/SplatzMachine.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC721Metadata} from "@openzeppelin/contracts/token/ERC721/extensions/IERC721Metadata.sol";
import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {IERC2981} from "@openzeppelin/contracts/interfaces/IERC2981.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

/// A buyer that is a contract and does NOT implement onERC721Received.
contract PlainContractBuyer {
    function buy(SplatzMachine machine) external payable returns (uint256) {
        return machine.pull{value: msg.value}();
    }
}

/// An owner that refuses ETH, to make withdraw fail.
contract RejectingOwner {
    function callWithdraw(SplatzMachine machine) external {
        machine.withdraw();
    }
}

contract SplatzMachineTest is Test {
    SplatzMachine internal machine;

    address internal owner = makeAddr("owner");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");
    address internal dave = makeAddr("dave");

    string internal constant BASE = "https://example.test/meta/";
    uint256 internal constant PRICE = 0.0003 ether;
    bytes32 internal constant PROV = keccak256("provenance");

    event Pulled(address indexed to, uint256 indexed tokenId);
    event SaleOpenSet(bool open);
    event PriceSet(uint256 price);
    event BaseURISet(string baseURI);
    event Withdrawn(address to, uint256 amount);

    function setUp() public {
        machine = new SplatzMachine(owner, BASE, PRICE, PROV);
        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
        vm.deal(carol, 10 ether);
        vm.deal(dave, 10 ether);
        vm.roll(1000);
    }

    // ---------------------------------------------------------------- helpers

    function _open() internal {
        vm.prank(owner);
        machine.setSaleOpen(true);
    }

    /// Ownership moves in two steps: the owner names the new owner, then the new owner accepts.
    function _handOver(address newOwner) internal {
        vm.prank(owner);
        machine.transferOwnership(newOwner);
        assertEq(machine.owner(), owner, "nothing moves until the new owner accepts");
        vm.prank(newOwner);
        machine.acceptOwnership();
    }

    function _buyer(uint256 i) internal view returns (address) {
        address[4] memory b = [alice, bob, carol, dave];
        return b[i % 4];
    }

    /// Moves to a new block with new randomness, like a real chain does.
    function _nextBlock(uint256 salt) internal {
        vm.roll(block.number + 1);
        vm.prevrandao(keccak256(abi.encode("rand", salt)));
    }

    function _bitmap() internal view returns (uint256 bm) {
        (,,, bm) = machine.machineState();
    }

    /// Rebuilds the bitmap from ownerOf and checks it matches the contract.
    function _assertBitmapMatchesOwnership() internal view {
        uint256 expected;
        uint256 minted;
        for (uint256 id = 1; id <= 100; id++) {
            try machine.ownerOf(id) returns (address) {
                expected |= uint256(1) << id;
                minted++;
            } catch {}
        }
        (, uint256 remaining_,, uint256 bm) = machine.machineState();
        assertEq(bm, expected, "bitmap != set of minted ids");
        assertEq(remaining_, 100 - minted, "remaining != 100 - minted");
        assertEq(bm & 1, 0, "bit 0 must never be set");
        assertEq(bm >> 101, 0, "bits above 100 must never be set");
    }

    // ---------------------------------------------------------------- initial state

    function test_InitialState() public view {
        assertEq(machine.name(), "Street Splatz");
        assertEq(machine.symbol(), "SPLATZ");
        assertEq(machine.MAX_SUPPLY(), 100);
        assertEq(machine.PROVENANCE(), PROV);
        assertEq(machine.owner(), owner);
        assertEq(machine.price(), PRICE);
        assertFalse(machine.saleOpen());
        assertEq(machine.remaining(), 100);
        (uint256 p, uint256 r, bool open, uint256 bm) = machine.machineState();
        assertEq(p, PRICE);
        assertEq(r, 100);
        assertFalse(open);
        assertEq(bm, 0);
    }

    function test_SupportsInterfaces() public view {
        assertTrue(machine.supportsInterface(type(IERC165).interfaceId));
        assertTrue(machine.supportsInterface(type(IERC721).interfaceId));
        assertTrue(machine.supportsInterface(type(IERC721Metadata).interfaceId));
        assertTrue(machine.supportsInterface(type(IERC2981).interfaceId));
        assertFalse(machine.supportsInterface(0xffffffff));
    }

    // ---------------------------------------------------------------- pull rules

    function test_Pull_RevertsWhenSaleClosed() public {
        vm.prank(alice);
        vm.expectRevert(SplatzMachine.SaleClosed.selector);
        machine.pull{value: PRICE}();
    }

    function test_Pull_RevertsAfterSaleClosedAgain() public {
        _open();
        vm.prank(alice);
        machine.pull{value: PRICE}();
        vm.prank(owner);
        machine.setSaleOpen(false);
        vm.prank(alice);
        vm.expectRevert(SplatzMachine.SaleClosed.selector);
        machine.pull{value: PRICE}();
    }

    function test_Pull_RevertsUnderPrice() public {
        _open();
        vm.prank(alice);
        vm.expectRevert(SplatzMachine.WrongPrice.selector);
        machine.pull{value: PRICE - 1}();
    }

    function test_Pull_RevertsOverPrice() public {
        _open();
        vm.prank(alice);
        vm.expectRevert(SplatzMachine.WrongPrice.selector);
        machine.pull{value: PRICE + 1}();
    }

    function test_Pull_RevertsZeroValue() public {
        _open();
        vm.prank(alice);
        vm.expectRevert(SplatzMachine.WrongPrice.selector);
        machine.pull();
    }

    function testFuzz_Pull_OnlyExactPriceAccepted(uint256 value) public {
        value = bound(value, 0, 1 ether);
        vm.assume(value != PRICE);
        _open();
        vm.prank(alice);
        vm.expectRevert(SplatzMachine.WrongPrice.selector);
        machine.pull{value: value}();
    }

    function test_Pull_MintsAndEmits() public {
        _open();
        vm.recordLogs();
        vm.prank(alice);
        uint256 id = machine.pull{value: PRICE}();

        assertGe(id, 1);
        assertLe(id, 100);
        assertEq(machine.ownerOf(id), alice);
        assertEq(machine.balanceOf(alice), 1);
        assertEq(machine.remaining(), 99);
        assertEq(address(machine).balance, PRICE);
        assertEq(_bitmap(), uint256(1) << id);

        // Logs: ERC721 Transfer, then Pulled(to, tokenId).
        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(logs.length, 2);
        Vm.Log memory last = logs[1];
        assertEq(last.emitter, address(machine));
        assertEq(last.topics[0], keccak256("Pulled(address,uint256)"));
        assertEq(address(uint160(uint256(last.topics[1]))), alice);
        assertEq(uint256(last.topics[2]), id);
    }

    function test_Pull_NoPerWalletCap() public {
        _open();
        for (uint256 i = 0; i < 30; i++) {
            _nextBlock(i);
            vm.prank(alice);
            machine.pull{value: PRICE}();
        }
        assertEq(machine.balanceOf(alice), 30);
    }

    function test_Pull_SameSenderSameBlockGetsDifferentCards() public {
        _open();
        vm.startPrank(alice);
        uint256 a = machine.pull{value: PRICE}();
        uint256 b = machine.pull{value: PRICE}();
        uint256 c = machine.pull{value: PRICE}();
        vm.stopPrank();
        assertTrue(a != b && b != c && a != c);
        _assertBitmapMatchesOwnership();
    }

    function test_Pull_ContractBuyerWithoutReceiverHookWorks() public {
        _open();
        PlainContractBuyer buyer = new PlainContractBuyer();
        uint256 id = buyer.buy{value: PRICE}(machine);
        assertEq(machine.ownerOf(id), address(buyer));
    }

    // ---------------------------------------------------------------- full mint out

    function test_FullMintOut_EveryIdOnce_BitmapTracks_ThenSoldOut() public {
        _open();
        bool[101] memory seen;
        uint256 expectedBitmap;

        for (uint256 i = 0; i < 100; i++) {
            _nextBlock(i);
            address buyer = _buyer(i);
            vm.prank(buyer);
            uint256 id = machine.pull{value: PRICE}();

            assertTrue(id >= 1 && id <= 100, "id out of range");
            assertFalse(seen[id], "id minted twice");
            seen[id] = true;
            expectedBitmap |= uint256(1) << id;
            assertEq(machine.ownerOf(id), buyer);
            assertEq(machine.remaining(), 99 - i);
            assertEq(_bitmap(), expectedBitmap);

            // Full recount from ownerOf at several checkpoints.
            if (i == 0 || i == 9 || i == 49 || i == 98 || i == 99) _assertBitmapMatchesOwnership();
        }

        for (uint256 id = 1; id <= 100; id++) {
            assertTrue(seen[id], "an id was never minted");
        }
        assertEq(machine.remaining(), 0);
        // Bits 1..100 set, nothing else.
        assertEq(_bitmap(), ((uint256(1) << 101) - 1) ^ 1);
        assertEq(address(machine).balance, 100 * PRICE);
        assertEq(
            machine.balanceOf(alice) + machine.balanceOf(bob) + machine.balanceOf(carol) + machine.balanceOf(dave), 100
        );

        // The 101st pull fails.
        _nextBlock(100);
        vm.prank(alice);
        vm.expectRevert(SplatzMachine.SoldOut.selector);
        machine.pull{value: PRICE}();

        // Token 0 and 101 never exist.
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, 0));
        machine.ownerOf(0);
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, 101));
        machine.ownerOf(101);
    }

    /// Mint out again with completely different randomness, as a second check.
    function testFuzz_FullMintOut_AnySeed(uint256 seed) public {
        _open();
        uint256 expectedBitmap;
        for (uint256 i = 0; i < 100; i++) {
            vm.roll(block.number + 1);
            vm.prevrandao(keccak256(abi.encode(seed, i)));
            address buyer = address(uint160(uint256(keccak256(abi.encode(seed, "buyer", i % 7)))));
            vm.deal(buyer, PRICE);
            vm.prank(buyer);
            uint256 id = machine.pull{value: PRICE}();
            assertTrue(id >= 1 && id <= 100);
            assertEq(expectedBitmap & (uint256(1) << id), 0, "repeat");
            expectedBitmap |= uint256(1) << id;
        }
        assertEq(_bitmap(), ((uint256(1) << 101) - 1) ^ 1);
        assertEq(machine.remaining(), 0);
    }

    // ---------------------------------------------------------------- randomness

    /// Whatever the block randomness, the sender and the number of cards already
    /// gone, the pick is always a valid card that nobody has yet.
    function testFuzz_PickIsAlwaysValidUnmintedId(uint256 prevrandao, address sender, uint8 alreadyPulled) public {
        vm.assume(sender != address(0));
        uint256 n = bound(alreadyPulled, 0, 99);
        _open();
        for (uint256 i = 0; i < n; i++) {
            _nextBlock(i);
            vm.prank(_buyer(i));
            machine.pull{value: PRICE}();
        }
        uint256 before = _bitmap();

        vm.roll(block.number + 1);
        vm.prevrandao(bytes32(prevrandao));
        vm.deal(sender, PRICE);
        vm.prank(sender);
        uint256 id = machine.pull{value: PRICE}();

        assertTrue(id >= 1 && id <= 100, "id out of range");
        assertEq(before & (uint256(1) << id), 0, "id was already minted");
        assertEq(machine.ownerOf(id), sender);
        assertEq(_bitmap(), before | (uint256(1) << id));
        assertEq(machine.remaining(), 99 - n);
    }

    /// Rough sanity check, not a statistics proof: over many fresh machines with
    /// different seeds the first pull lands all over the range.
    function test_Distribution_FirstPullIsSpreadOut() public {
        uint256 runs = 400;
        uint256[101] memory hits;
        uint256 distinct;
        uint256 maxHits;
        uint256 lowHalf;

        for (uint256 i = 0; i < runs; i++) {
            SplatzMachine m = new SplatzMachine(owner, BASE, PRICE, PROV);
            vm.prank(owner);
            m.setSaleOpen(true);
            vm.roll(block.number + 1);
            vm.prevrandao(keccak256(abi.encode("dist", i)));
            vm.prank(alice);
            uint256 id = m.pull{value: PRICE}();
            if (hits[id] == 0) distinct++;
            hits[id]++;
            if (hits[id] > maxHits) maxHits = hits[id];
            if (id <= 50) lowHalf++;
        }

        console.log(
            "distribution: %s first pulls hit %s distinct ids, busiest id hit %s times", runs, distinct, maxHits
        );
        console.log("distribution: ids 1-50 got %s, ids 51-100 got %s", lowHalf, runs - lowHalf);
        // With a fair pick, about 98 distinct ids and a max near 10 are expected.
        assertGe(distinct, 85, "first pull is not spread out");
        assertLe(maxHits, 20, "one id comes up far too often");
        assertGt(lowHalf, 150, "low half under represented");
        assertLt(lowHalf, 250, "low half over represented");
    }

    /// Same machine state, different sender or different block randomness: different pick is possible.
    function test_Distribution_SeedDependsOnSenderAndPrevrandao() public {
        _open();
        uint256 snap = vm.snapshotState();
        uint256 distinctBySender;
        uint256 distinctByRandao;
        bool[101] memory seenS;
        bool[101] memory seenR;
        for (uint256 i = 0; i < 20; i++) {
            address s = vm.addr(0x1000 + i);
            vm.deal(s, PRICE);
            vm.prank(s);
            uint256 id = machine.pull{value: PRICE}();
            if (!seenS[id]) {
                seenS[id] = true;
                distinctBySender++;
            }
            vm.revertToState(snap);

            vm.prevrandao(bytes32(i + 1));
            vm.prank(alice);
            id = machine.pull{value: PRICE}();
            if (!seenR[id]) {
                seenR[id] = true;
                distinctByRandao++;
            }
            vm.revertToState(snap);
        }
        assertGe(distinctBySender, 10);
        assertGe(distinctByRandao, 10);
    }

    // ---------------------------------------------------------------- owner controls

    function test_OnlyOwner_AllOwnerFunctions() public {
        bytes memory err = abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice);
        vm.startPrank(alice);
        vm.expectRevert(err);
        machine.setSaleOpen(true);
        vm.expectRevert(err);
        machine.setPrice(1);
        vm.expectRevert(err);
        machine.setBaseURI("https://evil.test/");
        vm.expectRevert(err);
        machine.withdraw();
        vm.expectRevert(err);
        machine.transferOwnership(alice);
        vm.stopPrank();
    }

    function test_SetSaleOpen_TogglesAndEmits() public {
        vm.startPrank(owner);
        vm.expectEmit(address(machine));
        emit SaleOpenSet(true);
        machine.setSaleOpen(true);
        assertTrue(machine.saleOpen());
        vm.expectEmit(address(machine));
        emit SaleOpenSet(false);
        machine.setSaleOpen(false);
        assertFalse(machine.saleOpen());
        vm.stopPrank();
    }

    function test_SetPrice_TakesEffect() public {
        _open();
        uint256 newPrice = 0.0005 ether;
        vm.expectEmit(address(machine));
        emit PriceSet(newPrice);
        vm.prank(owner);
        machine.setPrice(newPrice);
        assertEq(machine.price(), newPrice);
        (uint256 p,,,) = machine.machineState();
        assertEq(p, newPrice);

        vm.prank(alice);
        vm.expectRevert(SplatzMachine.WrongPrice.selector);
        machine.pull{value: PRICE}(); // old price no longer works

        vm.prank(alice);
        uint256 id = machine.pull{value: newPrice}();
        assertEq(machine.ownerOf(id), alice);
        assertEq(address(machine).balance, newPrice);
    }

    /// A free pull would let anyone empty the machine for gas only.
    function test_SetPrice_ZeroReverts() public {
        _open();
        vm.prank(owner);
        vm.expectRevert(SplatzMachine.ZeroPrice.selector);
        machine.setPrice(0);
        assertEq(machine.price(), PRICE);

        vm.prank(alice);
        vm.expectRevert(SplatzMachine.WrongPrice.selector);
        machine.pull();
        assertEq(machine.remaining(), 100);

        // The smallest real price is still allowed.
        vm.prank(owner);
        machine.setPrice(1);
        assertEq(machine.price(), 1);
    }

    function test_Constructor_ZeroPriceReverts() public {
        vm.expectRevert(SplatzMachine.ZeroPrice.selector);
        new SplatzMachine(owner, BASE, 0, PROV);
    }

    /// Without the slash every card address would run into the folder name, such as ".../meta50.json".
    function test_SetBaseURI_MustEndWithSlash() public {
        _open();
        vm.prank(alice);
        uint256 id = machine.pull{value: PRICE}();

        vm.startPrank(owner);
        vm.expectRevert(SplatzMachine.BadBaseURI.selector);
        machine.setBaseURI("https://x.test/meta");
        vm.expectRevert(SplatzMachine.BadBaseURI.selector);
        machine.setBaseURI("");
        vm.expectRevert(SplatzMachine.BadBaseURI.selector);
        machine.setBaseURI("https://x.test/meta/ ");
        vm.stopPrank();

        // Nothing changed.
        assertEq(machine.tokenURI(id), string.concat(BASE, vm.toString(id), ".json"));
        assertEq(machine.contractURI(), string.concat(BASE, "collection.json"));
    }

    function test_Constructor_BaseURIMustEndWithSlash() public {
        vm.expectRevert(SplatzMachine.BadBaseURI.selector);
        new SplatzMachine(owner, "https://x.test/meta", PRICE, PROV);
        vm.expectRevert(SplatzMachine.BadBaseURI.selector);
        new SplatzMachine(owner, "", PRICE, PROV);
    }

    function test_SetBaseURI_ChangesTokenAndContractURI() public {
        _open();
        vm.prank(alice);
        uint256 id = machine.pull{value: PRICE}();

        vm.expectEmit(address(machine));
        emit BaseURISet("ipfs://bafyexample/");
        vm.prank(owner);
        machine.setBaseURI("ipfs://bafyexample/");

        assertEq(machine.tokenURI(id), string.concat("ipfs://bafyexample/", vm.toString(id), ".json"));
        assertEq(machine.contractURI(), "ipfs://bafyexample/collection.json");
    }

    // ---------------------------------------------------------------- withdraw

    function test_Withdraw_SendsFullBalanceToOwner() public {
        _open();
        for (uint256 i = 0; i < 5; i++) {
            _nextBlock(i);
            vm.prank(_buyer(i));
            machine.pull{value: PRICE}();
        }
        assertEq(address(machine).balance, 5 * PRICE);
        uint256 before = owner.balance;

        vm.expectEmit(address(machine));
        emit Withdrawn(owner, 5 * PRICE);
        vm.prank(owner);
        machine.withdraw();

        assertEq(address(machine).balance, 0);
        assertEq(owner.balance, before + 5 * PRICE);
    }

    function test_Withdraw_WithZeroBalanceIsHarmless() public {
        vm.prank(owner);
        machine.withdraw();
        assertEq(address(machine).balance, 0);
    }

    function test_Withdraw_WorksAfterOwnershipTransfer() public {
        _open();
        vm.prank(alice);
        machine.pull{value: PRICE}();

        address newOwner = makeAddr("newOwner");
        _handOver(newOwner);
        assertEq(machine.owner(), newOwner);

        // Old owner is locked out.
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, owner));
        machine.withdraw();

        uint256 oldOwnerBefore = owner.balance;
        vm.prank(newOwner);
        machine.withdraw();
        assertEq(newOwner.balance, PRICE);
        assertEq(owner.balance, oldOwnerBefore);
        assertEq(address(machine).balance, 0);
    }

    function test_Withdraw_RevertsWithdrawFailedWhenOwnerCannotReceive() public {
        RejectingOwner bad = new RejectingOwner();
        _handOver(address(bad));
        vm.prank(address(bad));
        machine.setSaleOpen(true);
        vm.prank(alice);
        machine.pull{value: PRICE}();

        vm.expectRevert(SplatzMachine.WithdrawFailed.selector);
        bad.callWithdraw(machine);
        assertEq(address(machine).balance, PRICE); // funds stay put, owner can transfer ownership and retry
    }

    // ---------------------------------------------------------------- ownership

    function test_RenounceOwnership_AlwaysReverts() public {
        vm.prank(owner);
        vm.expectRevert(SplatzMachine.RenounceDisabled.selector);
        machine.renounceOwnership();

        vm.prank(alice);
        vm.expectRevert(SplatzMachine.RenounceDisabled.selector);
        machine.renounceOwnership();

        assertEq(machine.owner(), owner);
    }

    /// Naming the zero address never hands the machine over. With two step ownership it only clears a pending offer.
    function test_TransferOwnership_ToZeroNeverMovesOwnership() public {
        vm.prank(owner);
        machine.transferOwnership(alice);
        vm.prank(owner);
        machine.transferOwnership(address(0));
        assertEq(machine.owner(), owner);
        assertEq(machine.pendingOwner(), address(0));

        // The cancelled offer can no longer be accepted.
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        machine.acceptOwnership();
        assertEq(machine.owner(), owner);
    }

    /// A wrong address in transferOwnership must not lose the machine. Nothing moves until the new owner accepts.
    function test_TransferOwnership_WrongAddressDoesNotLoseTheMachine() public {
        _open();
        vm.prank(alice);
        machine.pull{value: PRICE}();

        // The owner mistypes and names the machine itself, which can never accept.
        vm.prank(owner);
        machine.transferOwnership(address(machine));
        assertEq(machine.owner(), owner);
        assertEq(machine.pendingOwner(), address(machine));

        // The owner still has every control and still receives the royalties.
        (address royaltyTo,) = machine.royaltyInfo(1, 1 ether);
        assertEq(royaltyTo, owner);
        uint256 before = owner.balance;
        vm.prank(owner);
        machine.withdraw();
        assertEq(owner.balance, before + PRICE);

        // The owner fixes the mistake by naming the right wallet.
        vm.prank(owner);
        machine.transferOwnership(bob);
        assertEq(machine.pendingOwner(), bob);
        assertEq(machine.owner(), owner);
    }

    function test_AcceptOwnership_OnlyTheNamedWallet() public {
        vm.prank(owner);
        vm.expectEmit(address(machine));
        emit Ownable2Step.OwnershipTransferStarted(owner, bob);
        machine.transferOwnership(bob);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        machine.acceptOwnership();
        assertEq(machine.owner(), owner);

        vm.prank(bob);
        machine.acceptOwnership();
        assertEq(machine.owner(), bob);
        assertEq(machine.pendingOwner(), address(0));

        // The old owner is locked out, the new one is in.
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, owner));
        machine.setSaleOpen(true);
        vm.prank(bob);
        machine.setSaleOpen(true);
        assertTrue(machine.saleOpen());
    }

    function test_Constructor_ZeroOwnerReverts() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableInvalidOwner.selector, address(0)));
        new SplatzMachine(address(0), BASE, PRICE, PROV);
    }

    // ---------------------------------------------------------------- metadata

    function test_TokenURI_And_ContractURI_Strings() public {
        _open();
        assertEq(machine.contractURI(), "https://example.test/meta/collection.json");
        for (uint256 i = 0; i < 100; i++) {
            _nextBlock(i);
            vm.prank(alice);
            uint256 id = machine.pull{value: PRICE}();
            assertEq(machine.tokenURI(id), string.concat(BASE, vm.toString(id), ".json"));
        }
        // No leading zeros, plain decimal.
        assertEq(machine.tokenURI(1), "https://example.test/meta/1.json");
        assertEq(machine.tokenURI(42), "https://example.test/meta/42.json");
        assertEq(machine.tokenURI(100), "https://example.test/meta/100.json");
    }

    function test_TokenURI_RevertsForUnminted() public {
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, 7));
        machine.tokenURI(7);
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, 0));
        machine.tokenURI(0);
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, 101));
        machine.tokenURI(101);
    }

    // ---------------------------------------------------------------- royalty

    function test_RoyaltyInfo_SevenPercentToCurrentOwner() public {
        (address to, uint256 amount) = machine.royaltyInfo(1, 1 ether);
        assertEq(to, owner);
        assertEq(amount, 0.07 ether);

        (to, amount) = machine.royaltyInfo(100, 10_000);
        assertEq(to, owner);
        assertEq(amount, 700);

        address newOwner = makeAddr("newOwner");
        vm.prank(owner);
        machine.transferOwnership(newOwner);
        (to,) = machine.royaltyInfo(55, 2 ether);
        assertEq(to, owner, "royalties stay with the old owner until the new one accepts");
        vm.prank(newOwner);
        machine.acceptOwnership();
        (to, amount) = machine.royaltyInfo(55, 2 ether);
        assertEq(to, newOwner);
        assertEq(amount, 0.14 ether);
    }

    function testFuzz_RoyaltyInfo(uint256 tokenId, uint128 salePrice) public view {
        (address to, uint256 amount) = machine.royaltyInfo(tokenId, salePrice);
        assertEq(to, owner);
        assertEq(amount, (uint256(salePrice) * 7) / 100);
    }

    // ---------------------------------------------------------------- transfers still work

    function test_HolderCanTransferCard() public {
        _open();
        vm.prank(alice);
        uint256 id = machine.pull{value: PRICE}();
        vm.prank(alice);
        machine.transferFrom(alice, bob, id);
        assertEq(machine.ownerOf(id), bob);
        // A transfer does not change machine state.
        assertEq(machine.remaining(), 99);
        assertEq(_bitmap(), uint256(1) << id);
    }

    // ---------------------------------------------------------------- gas report

    /// Prints deploy and pull gas. Run with -vv to see it.
    function test_GasReport() public {
        uint256 g = gasleft();
        SplatzMachine m = new SplatzMachine(owner, BASE, PRICE, PROV);
        uint256 deployGas = g - gasleft();

        vm.prank(owner);
        m.setSaleOpen(true);

        uint256 first;
        uint256 minGas = type(uint256).max;
        uint256 maxGas;
        uint256 total;
        for (uint256 i = 0; i < 100; i++) {
            vm.roll(block.number + 1);
            vm.prevrandao(keccak256(abi.encode("gas", i)));
            // A fresh buyer each time, which is the expensive case for the buyer's balance slot.
            address buyer = vm.addr(0xB0B0000 + i);
            vm.deal(buyer, PRICE);
            vm.prank(buyer);
            uint256 g0 = gasleft();
            m.pull{value: PRICE}();
            uint256 used = g0 - gasleft();
            if (i == 0) first = used;
            if (used < minGas) minGas = used;
            if (used > maxGas) maxGas = used;
            total += used;
        }

        console.log("GAS deploy (execution, excludes 21000 base and calldata):", deployGas);
        console.log("GAS pull, first pull by a new buyer:", first);
        console.log("GAS pull, min over full mint out:  ", minGas);
        console.log("GAS pull, max over full mint out:  ", maxGas);
        console.log("GAS pull, average over 100 pulls:  ", total / 100);
        console.log("(pull numbers are execution gas for the call. A wallet transaction adds about 21000.)");

        // The gas a pull needs depends on which card comes out, so a wallet's estimate can come up short.
        // The site therefore sends every pull with a fixed limit of 200,000 gas (PULL_GAS_LIMIT in
        // site/src/chain.js). Keep a wide margin under it. If this fails, raise the site's limit.
        assertLt(maxGas + 21_000, 150_000, "pull gas is too close to the site's fixed limit");
    }
}
