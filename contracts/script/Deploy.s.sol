// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "../src/Registry.sol";

/**
 * @title Deploy Script for TEE Agent Registry
 * @notice Deploys the Registry contract to HyperEVM
 * @dev Usage:
 *   Testnet: forge script script/Deploy.s.sol --broadcast --rpc-url hyperliquid_testnet
 *   Mainnet: forge script script/Deploy.s.sol --broadcast --rpc-url hyperliquid_mainnet
 */
contract DeployScript is Script {
    /// @notice Registry contract instance
    Registry public registry;

    function run() external {
        // Get deployment private key from environment
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        
        // Start broadcasting transactions
        vm.startBroadcast(deployerPrivateKey);

        // Deploy Registry contract
        registry = new Registry();

        // Stop broadcasting
        vm.stopBroadcast();

        // Log deployment info
        console.log("=== TEE Agent Registry Deployment ===");
        console.log("Registry deployed at:", address(registry));
        console.log("Deployer address:", vm.addr(deployerPrivateKey));
        console.log("Chain ID:", block.chainid);
        console.log("Block number:", block.number);
        
        // Verify integration with Automata
        console.log("\n=== Automata Integration ===");
        console.log("Automata DCAP Verifier:", address(registry.DCAP_VERIFIER()));
        
        // Log verification commands
        console.log("\n=== Verification Commands ===");
        if (block.chainid == 998) { // HyperEVM Testnet
            console.log("Verify on testnet:");
            console.log("forge verify-contract --rpc-url hyperliquid_testnet", address(registry), "src/Registry.sol:Registry");
        } else if (block.chainid == 99999) { // HyperEVM Mainnet (placeholder)
            console.log("Verify on mainnet:");
            console.log("forge verify-contract --rpc-url hyperliquid_mainnet", address(registry), "src/Registry.sol:Registry");
        }

        // Test basic functionality
        _testBasicFunctionality();
    }

    /**
     * @notice Test basic contract functionality after deployment
     */
    function _testBasicFunctionality() internal view {
        console.log("\n=== Basic Functionality Test ===");
        
        // Test view functions
        uint256 totalRecords = registry.getTotalRecords();
        console.log("Total records:", totalRecords);
        
        // Test fee function
        uint256 fee = registry.getAttestationFee();
        console.log("Attestation fee:", fee);
        
        // Test registry constants
        console.log("Registry deployed successfully!");
    }

    /**
     * @notice Helper function to get network name
     */
    function getNetworkName() public view returns (string memory) {
        uint256 chainId = block.chainid;
        
        if (chainId == 998) {
            return "HyperEVM Testnet";
        } else if (chainId == 99999) { // Placeholder for mainnet
            return "HyperEVM Mainnet";
        } else {
            return "Unknown Network";
        }
    }
}