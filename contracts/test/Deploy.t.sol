// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Deploy} from "../script/Deploy.s.sol";
import {SplatzMachine} from "../src/SplatzMachine.sol";

/// The deploy script must stop on a mistyped setting. It must never quietly deploy something else.
/// @dev Environment variables are shared by the whole test run, so every case lives in this ONE test
///      and runs in order. No other test reads or writes them.
contract DeployScriptTest is Test {
    address internal owner = makeAddr("owner");
    string internal constant GOOD_URI = "https://example.test/meta/";

    function _env(string memory baseURI, string memory priceWei) internal {
        vm.setEnv("OWNER_ADDRESS", vm.toString(owner));
        vm.setEnv("PROVENANCE", vm.toString(keccak256("provenance")));
        vm.setEnv("BASE_URI", baseURI);
        vm.setEnv("PRICE_WEI", priceWei);
    }

    /// Runs the script in a call of its own so a failure can be seen without stopping this test.
    function _runs() internal returns (bool ok, SplatzMachine machine) {
        Deploy script = new Deploy();
        bytes memory out;
        (ok, out) = address(script).call(abi.encodeCall(Deploy.run, ()));
        if (ok) machine = abi.decode(out, (SplatzMachine));
    }

    function _assertStops(string memory baseURI, string memory priceWei, string memory why) internal {
        _env(baseURI, priceWei);
        (bool ok,) = _runs();
        assertFalse(ok, why);
    }

    function test_Deploy_StopsOnBadSettingsAndDeploysGoodOnes() public {
        // Forge tests run on chain 31337 like anvil. Pretend to be Base for the real network rules.
        vm.chainId(8453);

        // A good whole number of wei is used exactly.
        _env(GOOD_URI, "350000000000000");
        (bool ok, SplatzMachine machine) = _runs();
        assertTrue(ok, "a good price deploys");
        assertEq(machine.price(), 350_000_000_000_000);
        assertEq(machine.owner(), owner);
        assertEq(machine.contractURI(), "https://example.test/meta/collection.json");
        assertFalse(machine.saleOpen());

        // Foundry reads 35e13 as the whole number 350000000000000, which is what was typed. That is used as is.
        _env(GOOD_URI, "35e13");
        (ok, machine) = _runs();
        assertTrue(ok, "35e13 is a whole number of wei");
        assertEq(machine.price(), 350_000_000_000_000);

        // A price typed the ETH way, or not a number at all, stops the script instead of using the default.
        _assertStops(GOOD_URI, "0.0003", "PRICE_WEI=0.0003 must stop the script");
        _assertStops(GOOD_URI, "", "an empty PRICE_WEI must stop the script");
        _assertStops(GOOD_URI, "abc", "PRICE_WEI=abc must stop the script");
        // Whole numbers that are far too small or far too big are typing mistakes too.
        _assertStops(GOOD_URI, "0", "PRICE_WEI=0 must stop the script");
        _assertStops(GOOD_URI, "3", "PRICE_WEI=3 (3 wei) must stop the script");
        _assertStops(GOOD_URI, "300000000000000000000", "PRICE_WEI of 300 ETH must stop the script");

        // The metadata folder address must be a real web address that ends with a slash.
        _assertStops("https://example.test/meta", "300000000000000", "a BASE_URI with no slash at the end must stop");
        _assertStops("localhost:4173/meta/ /", "300000000000000", "a BASE_URI with no https and a space must stop");
        _assertStops("https://example.test/me ta/", "300000000000000", "a BASE_URI with a space must stop");
        _assertStops("http://example.test/meta/", "300000000000000", "plain http must stop on a real network");
        _assertStops("https://", "300000000000000", "a BASE_URI with no host must stop");

        // ipfs is fine. Plain http is fine only on a local anvil chain.
        _env("ipfs://bafyexample/", "300000000000000");
        (ok,) = _runs();
        assertTrue(ok, "ipfs:// deploys");
        _assertStops("http://127.0.0.1:4610/meta/", "300000000000000", "http must stop on Base");
        vm.chainId(31337);
        _env("http://127.0.0.1:4610/meta/", "300000000000000");
        (ok,) = _runs();
        assertTrue(ok, "http:// deploys on anvil");
    }
}
