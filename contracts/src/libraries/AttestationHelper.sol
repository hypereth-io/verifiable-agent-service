// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "../types/TDXStructs.sol";

/**
 * @title AttestationHelper
 * @notice Library for parsing TDX attestation data and extracting agent information
 * @dev Handles the protocol for embedding agent addresses in TDX report data
 */
library AttestationHelper {
    /// @notice Custom errors for attestation parsing
    error InvalidOutputData();
    error InvalidQuoteVersion();
    error InvalidQuoteBodyType();
    error InvalidReportDataSize();
    error InvalidTD10ReportSize();
    error InvalidProtocolId();
    error AgentAddressZero();

    /**
     * @notice Parse Automata DCAP verification output
     * @param outputData Raw output bytes from verifyAndAttestOnChain
     * @return output Parsed Output struct
     */
    function parseOutput(bytes memory outputData) 
        internal 
        pure 
        returns (Output memory output) 
    {
        if (outputData.length == 0) {
            revert InvalidOutputData();
        }
        
        // Decode the output using ABI decoding
        output = abi.decode(outputData, (Output));
        
        // Validate quote version and type
        if (output.quoteVersion != 4) {
            revert InvalidQuoteVersion();
        }
        
        if (output.quoteBodyType != 2) {
            revert InvalidQuoteBodyType();
        }
    }

    /**
     * @notice Parse TD10 Report Body from quote body bytes
     * @param quoteBody Raw quote body bytes from Output.quoteBody
     * @return reportBody Parsed TD10ReportBody struct
     */
    function parseTD10Report(bytes memory quoteBody) 
        internal 
        pure 
        returns (TD10ReportBody memory reportBody) 
    {
        if (quoteBody.length != ProtocolConstants.TD10_REPORT_SIZE) {
            revert InvalidTD10ReportSize();
        }
        
        // Extract reportData from the end of the quote body
        // reportData is at offset 520 (64 bytes)
        bytes memory reportData = new bytes(ProtocolConstants.REPORT_DATA_SIZE);
        
        assembly {
            // Copy 64 bytes from offset 520 in quoteBody to reportData
            let src := add(quoteBody, add(0x20, 520)) // 0x20 for length prefix + 520 offset
            let dst := add(reportData, 0x20)          // 0x20 for length prefix
            
            // Copy 64 bytes (2 words of 32 bytes each)
            mstore(dst, mload(src))
            mstore(add(dst, 0x20), mload(add(src, 0x20)))
        }
        
        reportBody.reportData = reportData;
        
        // Extract key measurements for verification
        // mrTd at offset 136 (48 bytes)
        bytes memory mrTdData = new bytes(48);
        assembly {
            let src := add(quoteBody, add(0x20, 136))
            let dst := add(mrTdData, 0x20)
            
            // Copy 48 bytes (1.5 words)
            mstore(dst, mload(src))
            mstore(add(dst, 0x20), mload(add(src, 0x20)))
            // Copy remaining 16 bytes
            let remaining := and(mload(add(src, 0x30)), 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF00000000000000000000000000000000)
            mstore(add(dst, 0x30), remaining)
        }
        reportBody.mrTd = mrTdData;
        
        // mrConfigId at offset 184 (48 bytes)
        bytes memory mrConfigIdData = new bytes(48);
        assembly {
            let src := add(quoteBody, add(0x20, 184))
            let dst := add(mrConfigIdData, 0x20)
            
            // Copy 48 bytes
            mstore(dst, mload(src))
            mstore(add(dst, 0x20), mload(add(src, 0x20)))
            let remaining := and(mload(add(src, 0x30)), 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF00000000000000000000000000000000)
            mstore(add(dst, 0x30), remaining)
        }
        reportBody.mrConfigId = mrConfigIdData;
        
        // mrOwner at offset 232 (48 bytes)
        bytes memory mrOwnerData = new bytes(48);
        assembly {
            let src := add(quoteBody, add(0x20, 232))
            let dst := add(mrOwnerData, 0x20)
            
            // Copy 48 bytes
            mstore(dst, mload(src))
            mstore(add(dst, 0x20), mload(add(src, 0x20)))
            let remaining := and(mload(add(src, 0x30)), 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF00000000000000000000000000000000)
            mstore(add(dst, 0x30), remaining)
        }
        reportBody.mrOwner = mrOwnerData;
    }

    /**
     * @notice Validate protocol identifier in report data
     * @param reportData 64-byte report data from TD10ReportBody
     * @return valid True if protocol ID matches expected value
     */
    function hasValidProtocolId(bytes memory reportData) 
        internal 
        pure 
        returns (bool valid) 
    {
        require(reportData.length == ProtocolConstants.REPORT_DATA_SIZE, "Invalid reportData size");
        bytes memory data = reportData;
        
        // Extract bytes 32-43 (12 bytes for protocol ID)
        bytes12 extractedId;
        assembly {
            // Load from offset 32 + 32 (length prefix) = 64
            extractedId := mload(add(data, 64))
        }
        
        return extractedId == ProtocolConstants.PROTOCOL_ID;
    }

    /**
     * @notice Extract agent wallet address from report data
     * @param reportData 64-byte report data from TD10ReportBody
     * @return agentAddress Agent wallet address (20 bytes)
     */
    function extractAgentAddress(bytes memory reportData) 
        internal 
        pure 
        returns (address agentAddress) 
    {
        // Validate protocol ID first
        if (!hasValidProtocolId(reportData)) {
            revert InvalidProtocolId();
        }
        
        bytes memory data = reportData;
        
        // Extract bytes 44-63 (20 bytes for address)
        assembly {
            // Load 32 bytes starting from offset 44 + 32 (length prefix) = 76
            // The address is in the first 20 bytes, so we shift right by 12 bytes (96 bits)
            let word := mload(add(data, add(32, 44)))
            agentAddress := shr(96, word)
        }
        
        if (agentAddress == address(0)) {
            revert AgentAddressZero();
        }
    }

    /**
     * @notice Complete parsing of TDX quote and agent extraction
     * @param outputData Raw output from Automata DCAP verification
     * @return output Parsed Output struct
     * @return reportBody Parsed TD10ReportBody
     * @return agentAddress Extracted agent address
     */
    function parseQuoteAndExtractAgent(bytes memory outputData)
        internal
        pure
        returns (
            Output memory output,
            TD10ReportBody memory reportBody,
            address agentAddress
        )
    {
        // Parse Automata output
        output = parseOutput(outputData);
        
        // Parse TD10 report body
        reportBody = parseTD10Report(output.quoteBody);
        
        // Extract agent address from report data
        agentAddress = extractAgentAddress(reportBody.reportData);
    }
}