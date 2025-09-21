// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./interfaces/IAutomataDcapAttestation.sol";
import "./libraries/AttestationHelper.sol";
import "./types/TDXStructs.sol";

/**
 * @title Registry
 * @notice Transparent append-only log of verified TEE agent wallets
 * @dev Integrates with Automata DCAP attestation for TDX quote verification
 * @dev Serves as a public registry of agent addresses extracted from verified quotes
 */
contract Registry {
    using AttestationHelper for bytes;

    /// @notice Automata DCAP Attestation contract on HyperEVM
    IAutomataDcapAttestation public constant DCAP_VERIFIER = 
        IAutomataDcapAttestation(AutomataAddresses.DCAP_ATTESTATION);

    /// @notice Append-only array of all agent records
    AgentRecord[] public agents;

    /// @notice Mapping from agent address to array of record IDs
    mapping(address => uint256[]) public agentRecords;

    /// @notice Mapping to check if an agent address is registered
    mapping(address => bool) public isRegisteredAgent;

    /// @notice Events for transparency and monitoring
    event AgentRegistered(
        uint256 indexed recordId,
        address indexed agentAddress,
        address indexed registeredBy,
        bytes32 mrTd,
        bytes32 mrConfigId,
        bytes32 mrOwner,
        uint8 tcbStatus
    );

    /// @notice Custom errors
    error QuoteVerificationFailed(string reason);
    error InvalidQuoteData();
    error AgentAddressZero();
    error AttestationCallFailed();

    /**
     * @notice Register a new TEE agent using TDX attestation quote
     * @param tdxQuote Raw TDX quote bytes containing agent address in reportData
     * @return recordId The ID of the newly created agent record
     * @dev Calls Automata DCAP for verification, then extracts and stores agent data
     */
    function registerAgent(bytes calldata tdxQuote) 
        external 
        payable 
        returns (uint256 recordId) 
    {
        // Verify TDX quote with Automata DCAP
        (bool success, bytes memory outputData) = _verifyQuoteWithAutomata(tdxQuote);
        
        if (!success) {
            revert QuoteVerificationFailed("Automata verification failed");
        }

        // Parse the verification output and extract agent data
        (
            Output memory output,
            TD10ReportBody memory reportBody,
            address agentAddress
        ) = outputData.parseQuoteAndExtractAgent();

        if (agentAddress == address(0)) {
            revert AgentAddressZero();
        }

        // Create new agent record
        recordId = agents.length;
        
        AgentRecord memory newRecord = AgentRecord({
            agentAddress: agentAddress,
            registeredBy: msg.sender,
            mrTd: keccak256(reportBody.mrTd),
            mrConfigId: keccak256(reportBody.mrConfigId),
            mrOwner: keccak256(reportBody.mrOwner),
            tcbStatus: output.tcbStatus,
            timestamp: block.timestamp
        });

        // Store the record
        agents.push(newRecord);
        agentRecords[agentAddress].push(recordId);
        isRegisteredAgent[agentAddress] = true;

        // Emit event for transparency
        emit AgentRegistered(
            recordId,
            agentAddress,
            msg.sender,
            newRecord.mrTd,
            newRecord.mrConfigId,
            newRecord.mrOwner,
            newRecord.tcbStatus
        );

        return recordId;
    }

    /**
     * @notice Get all record IDs for a specific agent address
     * @param agentAddress The agent address to query
     * @return recordIds Array of record IDs for this agent
     */
    function getAgentRecordIds(address agentAddress) 
        external 
        view 
        returns (uint256[] memory recordIds) 
    {
        return agentRecords[agentAddress];
    }

    /**
     * @notice Get all agent records for a specific agent address
     * @param agentAddress The agent address to query
     * @return records Array of AgentRecord structs
     */
    function getAgentRecords(address agentAddress) 
        external 
        view 
        returns (AgentRecord[] memory records) 
    {
        uint256[] memory recordIds = agentRecords[agentAddress];
        records = new AgentRecord[](recordIds.length);
        
        for (uint256 i = 0; i < recordIds.length; i++) {
            records[i] = agents[recordIds[i]];
        }
        
        return records;
    }

    /**
     * @notice Get the latest agent record for a specific address
     * @param agentAddress The agent address to query
     * @return record The most recent AgentRecord for this agent
     * @dev Reverts if no records exist for the agent
     */
    function getLatestAgentRecord(address agentAddress) 
        external 
        view 
        returns (AgentRecord memory record) 
    {
        uint256[] memory recordIds = agentRecords[agentAddress];
        require(recordIds.length > 0, "No records for agent");
        
        return agents[recordIds[recordIds.length - 1]];
    }

    /**
     * @notice Get total number of agent records in the registry
     * @return count Total number of records
     */
    function getTotalRecords() external view returns (uint256 count) {
        return agents.length;
    }

    /**
     * @notice Get agent record by record ID
     * @param recordId The record ID to query
     * @return record The AgentRecord struct
     */
    function getRecord(uint256 recordId) 
        external 
        view 
        returns (AgentRecord memory record) 
    {
        require(recordId < agents.length, "Record does not exist");
        return agents[recordId];
    }

    /**
     * @notice Check if an agent address has been registered
     * @param agentAddress The agent address to check
     * @return registered True if the agent is registered
     */
    function isAgentRegistered(address agentAddress) 
        external 
        view 
        returns (bool registered) 
    {
        return isRegisteredAgent[agentAddress];
    }

    /**
     * @notice Internal function to verify quote with Automata DCAP
     * @param tdxQuote Raw TDX quote bytes
     * @return success Whether verification succeeded
     * @return outputData Raw output from verification
     */
    function _verifyQuoteWithAutomata(bytes calldata tdxQuote) 
        internal 
        returns (bool success, bytes memory outputData) 
    {
        try DCAP_VERIFIER.verifyAndAttestOnChain{value: msg.value}(tdxQuote) 
            returns (bool _success, bytes memory _output) {
            return (_success, _output);
        } catch Error(string memory reason) {
            revert QuoteVerificationFailed(reason);
        } catch {
            revert AttestationCallFailed();
        }
    }

    /**
     * @notice Get the fee required for attestation (if any)
     * @dev This is a view function to help users estimate costs
     * @return fee The fee amount in wei
     */
    function getAttestationFee() external view returns (uint256 fee) {
        // Automata's fee structure may vary - this is a placeholder
        // Users should check Automata's contract directly for current fees
        return 0;
    }

    /**
     * @notice Emergency function to retrieve stuck ETH (if any)
     * @dev Only retrieves ETH that wasn't forwarded to Automata
     */
    function retrieveETH() external {
        uint256 balance = address(this).balance;
        if (balance > 0) {
            (bool success, ) = payable(msg.sender).call{value: balance}("");
            require(success, "ETH transfer failed");
        }
    }

    /**
     * @notice Fallback function to accept ETH for attestation fees
     */
    receive() external payable {}
}