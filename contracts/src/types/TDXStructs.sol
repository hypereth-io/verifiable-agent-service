// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title TDX Data Structures
 * @notice Structs for Intel TDX attestation data from Automata DCAP
 * @dev Based on Automata DCAP v1.1 CommonStruct.sol and TDXStruct.sol
 */

/**
 * @notice The Verified Output struct from Automata DCAP verification
 * @dev This is the structure returned by verifyAndAttestOnChain
 */
struct Output {
    uint16 quoteVersion;     // Quote version (4 for TDX)
    uint16 quoteBodyType;    // Quote body type (2 for TD10Report)
    uint8 tcbStatus;         // TCB security status
    bytes6 fmspcBytes;       // FMSPC identifier
    bytes quoteBody;         // Raw quote body data
    string[] advisoryIDs;    // Security advisories
}

/**
 * @notice TDX TD 1.0 Report Body structure
 * @dev 584 bytes total, based on Intel TDX specification
 * @dev Section A.3.2 of Intel V4 TDX DCAP API Library Documentation
 */
struct TD10ReportBody {
    bytes16 teeTcbSvn;       // TEE TCB SVN (16 bytes)
    bytes mrSeam;            // MR_SEAM measurement (48 bytes)
    bytes mrsignerSeam;      // MR_SIGNERSEAM measurement (48 bytes)
    bytes8 seamAttributes;   // SEAM attributes (8 bytes)
    bytes8 tdAttributes;     // TD attributes (8 bytes)
    bytes8 xFAM;             // XFAM field (8 bytes)
    bytes mrTd;              // MR_TD measurement (48 bytes)
    bytes mrConfigId;        // MR_CONFIGID measurement (48 bytes)
    bytes mrOwner;           // MR_OWNER measurement (48 bytes)
    bytes mrOwnerConfig;     // MR_OWNERCONFIG measurement (48 bytes)
    bytes rtMr0;             // Runtime measurement 0 (48 bytes)
    bytes rtMr1;             // Runtime measurement 1 (48 bytes)
    bytes rtMr2;             // Runtime measurement 2 (48 bytes)
    bytes rtMr3;             // Runtime measurement 3 (48 bytes)
    bytes reportData;        // Report data field (64 bytes) - Agent address here
}

/**
 * @notice Agent record stored in Registry
 * @dev Transparent log entry for registered TEE agents
 */
struct AgentRecord {
    address agentAddress;    // Agent wallet address extracted from reportData
    address registeredBy;    // Account that registered this agent
    bytes32 mrTd;           // TD measurement for identity verification
    bytes32 mrConfigId;     // Config measurement for validation
    bytes32 mrOwner;        // Owner measurement for ownership verification
    uint8 tcbStatus;        // TCB security status at registration
    uint256 timestamp;      // Block timestamp of registration
}

/**
 * @title Protocol Constants
 * @notice Constants for the TEE Agent Wallet protocol
 */
library ProtocolConstants {
    /// @notice Protocol identifier embedded in reportData
    /// @dev "HYPERLIQUID\0" as bytes12
    bytes12 public constant PROTOCOL_ID = hex"48595045524c495155494400";
    
    /// @notice Expected size of reportData field
    uint256 public constant REPORT_DATA_SIZE = 64;
    
    /// @notice Expected size of TD10ReportBody
    uint256 public constant TD10_REPORT_SIZE = 584;
    
    /// @notice Offset of reportData in TD10ReportBody
    uint256 public constant REPORT_DATA_OFFSET = 520;
    
    /// @notice Offset of protocol ID in reportData
    uint256 public constant PROTOCOL_ID_OFFSET = 32;
    
    /// @notice Offset of agent address in reportData
    uint256 public constant AGENT_ADDRESS_OFFSET = 44;
}