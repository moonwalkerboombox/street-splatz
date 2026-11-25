// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {SplatzMachine} from "../src/SplatzMachine.sol";

/// @notice Deploys the Street Splatz machine. The sale starts closed.
/// @dev Reads OWNER_ADDRESS, BASE_URI, PROVENANCE and optional PRICE_WEI from the environment.
///      PRICE_WEI must be a whole number of wei. Anything else stops the script, it never falls back to the default.
///      The signing key comes from the command line (--private-key or --account), never a file.
contract Deploy is Script {
    uint256 internal constant DEFAULT_PRICE_WEI = 300_000_000_000_000; // 0.0003 ETH
    // A price outside this range is almost certainly a typing mistake. The owner can still set any price later.
    uint256 internal constant MIN_PRICE_WEI = 1_000_000_000_000; // 0.000001 ETH
    uint256 internal constant MAX_PRICE_WEI = 100_000_000_000_000_000; // 0.1 ETH

    function run() external returns (SplatzMachine machine) {
        address owner = vm.envAddress("OWNER_ADDRESS");
        string memory baseURI = vm.envString("BASE_URI");
        // envUint stops the script when the value is not a whole number, such as 0.0003, abc or empty.
        uint256 priceWei = vm.envExists("PRICE_WEI") ? vm.envUint("PRICE_WEI") : DEFAULT_PRICE_WEI;
        bytes32 provenance = vm.envBytes32("PROVENANCE");

        require(owner != address(0), "OWNER_ADDRESS is the zero address");
        bytes memory b = bytes(baseURI);
        require(b.length > 0 && b[b.length - 1] == "/", "BASE_URI must end with /");
        require(_goodScheme(baseURI), "BASE_URI must start with https:// or ipfs://");
        for (uint256 i = 0; i < b.length; i++) {
            require(uint8(b[i]) > 0x20 && uint8(b[i]) < 0x7f, "BASE_URI has a space or an odd character in it");
        }
        require(priceWei > 0, "PRICE_WEI is zero");
        require(
            priceWei >= MIN_PRICE_WEI && priceWei <= MAX_PRICE_WEI,
            "PRICE_WEI is outside 0.000001 to 0.1 ETH. It is counted in wei: 0.0003 ETH is 300000000000000"
        );
        require(provenance != bytes32(0), "PROVENANCE is zero");

        vm.startBroadcast();
        machine = new SplatzMachine(owner, baseURI, priceWei, provenance);
        vm.stopBroadcast();

        console.log("SplatzMachine deployed at:", address(machine));
        console.log("chain id:   ", block.chainid);
        console.log("owner:      ", machine.owner());
        console.log("price (wei):", machine.price());
        console.log("sale open:  ", machine.saleOpen());
        console.log("remaining:  ", machine.remaining());
        console.log("contractURI:", machine.contractURI());
        console.log("provenance:");
        console.logBytes32(machine.PROVENANCE());
    }

    /// @dev https or ipfs on a real network. Plain http is only allowed on a local test chain (anvil).
    function _goodScheme(string memory uri) internal view returns (bool) {
        return _startsWith(uri, "https://") || _startsWith(uri, "ipfs://")
            || (block.chainid == 31337 && _startsWith(uri, "http://"));
    }

    function _startsWith(string memory s, string memory prefix) internal pure returns (bool) {
        bytes memory a = bytes(s);
        bytes memory p = bytes(prefix);
        if (a.length <= p.length) return false;
        for (uint256 i = 0; i < p.length; i++) {
            if (a[i] != p[i]) return false;
        }
        return true;
    }
}
