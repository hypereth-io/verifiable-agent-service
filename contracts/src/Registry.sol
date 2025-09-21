// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title TEE Agent Registry
 * @notice Registry contract for verifying Intel TDX attestation reports and managing agent wallets
 * @dev This contract will verify TEE attestation reports and maintain a registry of verified agents
 */
contract Registry {
    struct Agent {
        address agentAddress;
        bytes32 attestationHash;
        uint256 registrationTime;
        bool isActive;
    }

    struct AttestationReport {
        bytes quote;
        bytes32 mrenclave;
        bytes32 mrsigner;
        uint256 timestamp;
    }

    mapping(address => Agent) public agents;
    mapping(bytes32 => bool) public verifiedAttestations;
    mapping(address => address) public userToAgent;

    event AgentRegistered(address indexed user, address indexed agent, bytes32 attestationHash);
    event AgentDeactivated(address indexed agent);
    event AttestationVerified(bytes32 indexed attestationHash);

    error InvalidAttestation();
    error AgentAlreadyRegistered();
    error AgentNotFound();
    error UnauthorizedAgent();

    /**
     * @notice Register a new agent with TEE attestation verification
     * @param agentAddress The address of the agent wallet
     * @param attestationData The Intel TDX attestation report
     */
    function registerAgent(
        address agentAddress,
        bytes calldata attestationData
    ) external {
        if (agents[agentAddress].isActive) {
            revert AgentAlreadyRegistered();
        }

        // TODO: Implement actual Intel TDX attestation verification
        bytes32 attestationHash = keccak256(attestationData);
        
        // Placeholder verification - replace with actual TDX verification logic
        if (!_verifyTDXAttestation(attestationData)) {
            revert InvalidAttestation();
        }

        agents[agentAddress] = Agent({
            agentAddress: agentAddress,
            attestationHash: attestationHash,
            registrationTime: block.timestamp,
            isActive: true
        });

        userToAgent[msg.sender] = agentAddress;
        verifiedAttestations[attestationHash] = true;

        emit AgentRegistered(msg.sender, agentAddress, attestationHash);
        emit AttestationVerified(attestationHash);
    }

    /**
     * @notice Verify if an agent is registered and active
     * @param agentAddress The agent address to verify
     * @return isValid True if agent is registered and active
     */
    function verifyAgent(address agentAddress) external view returns (bool isValid) {
        return agents[agentAddress].isActive;
    }

    /**
     * @notice Get agent information
     * @param agentAddress The agent address
     * @return agent The agent struct
     */
    function getAgent(address agentAddress) external view returns (Agent memory agent) {
        return agents[agentAddress];
    }

    /**
     * @notice Deactivate an agent (can only be called by the registered user)
     * @param agentAddress The agent address to deactivate
     */
    function deactivateAgent(address agentAddress) external {
        if (userToAgent[msg.sender] != agentAddress) {
            revert UnauthorizedAgent();
        }
        
        if (!agents[agentAddress].isActive) {
            revert AgentNotFound();
        }

        agents[agentAddress].isActive = false;
        emit AgentDeactivated(agentAddress);
    }

    /**
     * @notice Internal function to verify Intel TDX attestation
     * @param attestationData The attestation data to verify
     * @return isValid True if attestation is valid
     * @dev This is a placeholder - implement actual TDX verification logic
     */
    function _verifyTDXAttestation(bytes calldata attestationData) internal pure returns (bool isValid) {
        // TODO: Implement actual Intel TDX attestation verification
        // This should include:
        // 1. Quote verification
        // 2. MRENCLAVE verification
        // 3. MRSIGNER verification
        // 4. TCB verification
        
        // Placeholder: just check that data is not empty
        return attestationData.length > 0;
    }
}