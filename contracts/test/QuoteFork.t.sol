// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../src/interfaces/IAutomataDcapAttestation.sol";

/**
 * @title QuoteFork Test
 * @notice Fork test to verify real TDX quote against deployed DCAP contract on Hyperliquid mainnet
 */
contract QuoteForkTest is Test {
    IAutomataDcapAttestation public dcapContract;
    
    function setUp() public {
        // Fork Hyperliquid mainnet
        vm.createSelectFork("hyperliquid_mainnet");
        
        // Initialize the deployed DCAP contract
        dcapContract = IAutomataDcapAttestation(AutomataAddresses.DCAP_ATTESTATION);
    }

    function testVerifyRealQuote() public {
        // Load the TDX quote from the binary file
        bytes memory rawQuote = vm.readFileBinary("test/tdx-quote.bin");
        
        console.log("==================================================");
        console.log("TDX Quote Verification on Hyperliquid Mainnet");
        console.log("==================================================");
        console.log("Quote size:", rawQuote.length, "bytes");
        console.log("DCAP contract:", address(dcapContract));
        console.log("--------------------------------------------------");
        
        // Call the DCAP contract to verify the quote
        (bool success, bytes memory output) = dcapContract.verifyAndAttestOnChain(rawQuote);
        
        console.log("Verification result:", success ? "PASSED" : "FAILED");
        
        if (success) {
            console.log("Output data length:", output.length, "bytes");
            
            // Parse the output to extract custom data
            // The output is ABI-encoded, so we need to decode it
            if (output.length > 0) {
                // Decode the Output struct from the Automata response
                // Note: This is a simplified parsing - actual implementation would need proper struct decoding
                
                // Try to extract the report data section which contains custom data
                // Report data is typically at offset 520 in the TD10 report body
                // Within the report data:
                // - Bytes 32-43: Protocol ID ("HYPERLIQUID\0")
                // - Bytes 44-63: Agent address (20 bytes)
                
                console.log("--------------------------------------------------");
                console.log("Attempting to parse custom data from quote...");
                
                // Log first few bytes of output for debugging
                if (output.length >= 64) {
                    console.log("Output preview (first 64 bytes):");
                    bytes memory preview = new bytes(64);
                    for (uint256 i = 0; i < 64; i++) {
                        preview[i] = output[i];
                    }
                    console.logBytes(preview);
                }
                
                // Look for the HYPERLIQUID protocol identifier in the output
                // This would be in the reportData field of the parsed TD10 report
                bytes memory protocolId = hex"48595045524c4951554944"; // "HYPERLIQUID" in hex
                
                // Search for protocol ID pattern in output
                bool found = false;
                uint256 position = 0;
                
                for (uint256 i = 0; i < output.length - 11; i++) {
                    bool matches = true;
                    for (uint256 j = 0; j < 11; j++) {
                        if (output[i + j] != protocolId[j]) {
                            matches = false;
                            break;
                        }
                    }
                    if (matches) {
                        found = true;
                        position = i;
                        console.log("Found HYPERLIQUID protocol ID at position:", position);
                        
                        // Extract agent address (20 bytes after protocol ID + 1 null byte)
                        if (position + 12 + 20 <= output.length) {
                            address agentAddress;
                            assembly {
                                let dataPtr := add(output, add(32, add(position, 12)))
                                agentAddress := shr(96, mload(dataPtr))
                            }
                            console.log("--------------------------------------------------");
                            console.log("Extracted Agent Address:", agentAddress);
                        }
                        break;
                    }
                }
                
                if (!found) {
                    console.log("Protocol ID not found in output");
                }
            }
            
            console.log("==================================================");
            console.log("TDX Quote is VALID");
        } else {
            console.log("==================================================");
            console.log("TDX Quote is INVALID");
        }
        
        // Assert the verification result
        assertTrue(success, "TDX quote verification failed");
    }
}