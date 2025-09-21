// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title IAutomataDcapAttestation
 * @notice Interface for Automata DCAP Attestation contract
 * @dev Based on Automata DCAP v1.1 deployed on HyperEVM
 * @dev Contract address: 0xaDdeC7e85c2182202b66E331f2a4A0bBB2cEEa1F
 */
interface IAutomataDcapAttestation {
    /**
     * @notice Verify Intel TDX quote on-chain
     * @param rawQuote Raw TDX quote bytes
     * @return success Whether verification succeeded
     * @return output Verification output containing parsed quote data
     * @dev Calls the deployed Automata contract for full on-chain verification
     */
    function verifyAndAttestOnChain(bytes calldata rawQuote)
        external
        payable
        returns (bool success, bytes memory output);

    /**
     * @notice Verify Intel TDX quote on-chain with specific TCB evaluation number
     * @param rawQuote Raw TDX quote bytes
     * @param tcbEvaluationDataNumber TCB evaluation data number (0 for default)
     * @return success Whether verification succeeded
     * @return output Verification output containing parsed quote data
     */
    function verifyAndAttestOnChain(bytes calldata rawQuote, uint32 tcbEvaluationDataNumber)
        external
        payable
        returns (bool success, bytes memory output);
}

/**
 * @title Automata Contract Addresses
 * @notice Deployed addresses for Automata DCAP contracts on HyperEVM
 */
library AutomataAddresses {
    /// @notice Main attestation contract with fee collection
    address public constant DCAP_ATTESTATION = 0xaDdeC7e85c2182202b66E331f2a4A0bBB2cEEa1F;
    
    /// @notice V4 Quote Verifier for TDX quotes
    address public constant V4_QUOTE_VERIFIER = 0x2aDDd89aEbFE01d4aae4a73f31E7197152a9D99e;
    
    /// @notice PCCS Router for collateral data
    address public constant PCCS_ROUTER = 0xB0483A77543dF107aa6DfF1BFb6316dBE0ceFbf2;
}