// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../src/Registry.sol";
import "../src/libraries/AttestationHelper.sol";
import "../src/types/TDXStructs.sol";
import "./mocks/MockAutomataDcapAttestation.sol";

/**
 * @title Registry Test Suite
 * @notice Comprehensive tests for the TEE Agent Registry contract
 */
contract RegistryTest is Test {
    Registry public registry;
    MockAutomataDcapAttestation public mockAutomata;
    
    // Test accounts
    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");
    address public agentAddress = makeAddr("agent");
    
    // Helper to get mock at the replaced address
    function getMockAtDcapAddress() internal view returns (MockAutomataDcapAttestation) {
        return MockAutomataDcapAttestation(payable(AutomataAddresses.DCAP_ATTESTATION));
    }
    
    // Test data
    bytes32 constant TEST_MR_TD = keccak256("test_mr_td");
    bytes32 constant TEST_MR_CONFIG = keccak256("test_mr_config");
    bytes32 constant TEST_MR_OWNER = keccak256("test_mr_owner");
    
    event AgentRegistered(
        uint256 indexed recordId,
        address indexed agentAddress,
        address indexed registeredBy,
        bytes32 mrTd,
        bytes32 mrConfigId,
        bytes32 mrOwner,
        uint8 tcbStatus
    );

    function setUp() public {
        // Deploy mock Automata contract
        mockAutomata = new MockAutomataDcapAttestation();
        
        // Replace the Automata contract address with our mock
        vm.etch(AutomataAddresses.DCAP_ATTESTATION, address(mockAutomata).code);
        
        // Deploy Registry (will now use the mocked contract)
        registry = new Registry();
        
        // Give test accounts some ETH
        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
    }

    function testInitialState() public {
        // Registry should start empty
        assertEq(registry.getTotalRecords(), 0);
        assertFalse(registry.isAgentRegistered(agentAddress));
        assertEq(registry.getAttestationFee(), 0);
    }

    function testSuccessfulAgentRegistration() public {
        // Create valid TDX quote with agent address
        bytes memory validQuote = _createValidTDXQuote(agentAddress);
        
        // Set up mock to return success at the mocked address
        getMockAtDcapAddress().setVerificationResult(true, _createValidOutput(agentAddress));
        
        vm.prank(alice);
        vm.expectEmit(true, true, true, false); // Don't check the measurement data values
        emit AgentRegistered(0, agentAddress, alice, bytes32(0), bytes32(0), bytes32(0), 0);
        
        uint256 recordId = registry.registerAgent(validQuote);
        
        // Verify registration
        assertEq(recordId, 0);
        assertTrue(registry.isAgentRegistered(agentAddress));
        assertEq(registry.getTotalRecords(), 1);
        
        // Verify record data
        AgentRecord memory record = registry.getRecord(0);
        assertEq(record.agentAddress, agentAddress);
        assertEq(record.registeredBy, alice);
        // Don't check exact measurement values since they're hashed from parsed data
        assertTrue(record.mrTd != bytes32(0)); // Just verify they're not zero
        assertTrue(record.mrConfigId != bytes32(0));
        assertTrue(record.mrOwner != bytes32(0));
        assertEq(record.tcbStatus, 0);
        assertTrue(record.timestamp > 0);
    }

    function test_RevertWhen_VerificationFails() public {
        bytes memory invalidQuote = "invalid_quote";
        
        // Mock failed verification
        getMockAtDcapAddress().setVerificationResult(false, "");
        
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Registry.QuoteVerificationFailed.selector, "Automata verification failed"));
        registry.registerAgent(invalidQuote);
    }

    function testInvalidQuoteVersion() public {
        bytes memory quote = _createValidTDXQuote(agentAddress);
        
        // Mock output with wrong quote version
        Output memory output = Output({
            quoteVersion: 3, // Wrong version (should be 4 for TDX)
            quoteBodyType: 2,
            tcbStatus: 0,
            fmspcBytes: bytes6(0x123456789ABC),
            quoteBody: _createValidTD10ReportBody(agentAddress),
            advisoryIDs: new string[](0)
        });
        
        getMockAtDcapAddress().setVerificationResult(true, abi.encode(output));
        
        vm.prank(alice);
        vm.expectRevert(AttestationHelper.InvalidQuoteVersion.selector);
        registry.registerAgent(quote);
    }

    function testInvalidQuoteBodyType() public {
        bytes memory quote = _createValidTDXQuote(agentAddress);
        
        // Mock output with wrong quote body type
        Output memory output = Output({
            quoteVersion: 4,
            quoteBodyType: 1, // Wrong type (should be 2 for TD10)
            tcbStatus: 0,
            fmspcBytes: bytes6(0x123456789ABC),
            quoteBody: _createValidTD10ReportBody(agentAddress),
            advisoryIDs: new string[](0)
        });
        
        getMockAtDcapAddress().setVerificationResult(true, abi.encode(output));
        
        vm.prank(alice);
        vm.expectRevert(AttestationHelper.InvalidQuoteBodyType.selector);
        registry.registerAgent(quote);
    }

    function testZeroAgentAddress() public {
        bytes memory quote = _createValidTDXQuote(address(0));
        getMockAtDcapAddress().setVerificationResult(true, _createValidOutput(address(0)));
        
        vm.prank(alice);
        vm.expectRevert(AttestationHelper.AgentAddressZero.selector);
        registry.registerAgent(quote);
    }

    function testInvalidProtocolId() public {
        bytes memory quote = _createValidTDXQuote(agentAddress);
        
        // Create report body with invalid protocol ID
        bytes memory reportBody = _createTD10ReportBodyWithInvalidProtocol(agentAddress);
        Output memory output = Output({
            quoteVersion: 4,
            quoteBodyType: 2,
            tcbStatus: 0,
            fmspcBytes: bytes6(0x123456789ABC),
            quoteBody: reportBody,
            advisoryIDs: new string[](0)
        });
        
        getMockAtDcapAddress().setVerificationResult(true, abi.encode(output));
        
        vm.prank(alice);
        vm.expectRevert(AttestationHelper.InvalidProtocolId.selector);
        registry.registerAgent(quote);
    }

    function testMultipleRegistrations() public {
        address agent1 = makeAddr("agent1");
        address agent2 = makeAddr("agent2");
        
        // Register first agent
        bytes memory quote1 = _createValidTDXQuote(agent1);
        getMockAtDcapAddress().setVerificationResult(true, _createValidOutput(agent1));
        
        vm.prank(alice);
        uint256 recordId1 = registry.registerAgent(quote1);
        
        // Register second agent
        bytes memory quote2 = _createValidTDXQuote(agent2);
        getMockAtDcapAddress().setVerificationResult(true, _createValidOutput(agent2));
        
        vm.prank(bob);
        uint256 recordId2 = registry.registerAgent(quote2);
        
        // Verify both registrations
        assertEq(recordId1, 0);
        assertEq(recordId2, 1);
        assertEq(registry.getTotalRecords(), 2);
        assertTrue(registry.isAgentRegistered(agent1));
        assertTrue(registry.isAgentRegistered(agent2));
        
        // Verify record details
        AgentRecord memory record1 = registry.getRecord(0);
        AgentRecord memory record2 = registry.getRecord(1);
        
        assertEq(record1.agentAddress, agent1);
        assertEq(record1.registeredBy, alice);
        assertEq(record2.agentAddress, agent2);
        assertEq(record2.registeredBy, bob);
    }

    function testGetAgentRecords() public {
        // Register same agent twice (should be allowed for re-registration)
        bytes memory quote = _createValidTDXQuote(agentAddress);
        getMockAtDcapAddress().setVerificationResult(true, _createValidOutput(agentAddress));
        
        vm.prank(alice);
        registry.registerAgent(quote);
        
        vm.prank(bob);
        registry.registerAgent(quote);
        
        // Get all records for the agent
        uint256[] memory recordIds = registry.getAgentRecordIds(agentAddress);
        assertEq(recordIds.length, 2);
        assertEq(recordIds[0], 0);
        assertEq(recordIds[1], 1);
        
        AgentRecord[] memory records = registry.getAgentRecords(agentAddress);
        assertEq(records.length, 2);
        assertEq(records[0].registeredBy, alice);
        assertEq(records[1].registeredBy, bob);
        
        // Get latest record
        AgentRecord memory latest = registry.getLatestAgentRecord(agentAddress);
        assertEq(latest.registeredBy, bob);
    }

    function testGetLatestRecordForUnregisteredAgent() public {
        vm.expectRevert("No records for agent");
        registry.getLatestAgentRecord(makeAddr("nonexistent"));
    }

    function testGetNonexistentRecord() public {
        vm.expectRevert("Record does not exist");
        registry.getRecord(999);
    }

    function testETHHandling() public {
        bytes memory quote = _createValidTDXQuote(agentAddress);
        getMockAtDcapAddress().setVerificationResult(true, _createValidOutput(agentAddress));
        
        // Send ETH with registration (for Automata fees)
        vm.prank(alice);
        registry.registerAgent{value: 0.01 ether}(quote);
        
        // Registry should handle ETH properly
        assertTrue(registry.isAgentRegistered(agentAddress));
    }

    function testRetrieveETH() public {
        // Send ETH to contract
        vm.deal(address(registry), 1 ether);
        
        uint256 balanceBefore = alice.balance;
        
        vm.prank(alice);
        registry.retrieveETH();
        
        // Alice should receive the ETH
        assertEq(alice.balance, balanceBefore + 1 ether);
        assertEq(address(registry).balance, 0);
    }

    // Helper functions for creating test data
    
    function _createValidTDXQuote(address agent) internal pure returns (bytes memory) {
        // Create a minimal valid TDX quote for testing
        return abi.encodePacked("valid_tdx_quote_", agent);
    }
    
    function _createValidOutput(address agent) internal pure returns (bytes memory) {
        Output memory output = Output({
            quoteVersion: 4,
            quoteBodyType: 2,
            tcbStatus: 0,
            fmspcBytes: bytes6(0x123456789ABC),
            quoteBody: _createValidTD10ReportBody(agent),
            advisoryIDs: new string[](0)
        });
        
        return abi.encode(output);
    }
    
    function _createValidTD10ReportBody(address agent) internal pure returns (bytes memory) {
        // Create a 584-byte TD10 report body with embedded agent address
        bytes memory reportBody = new bytes(584);
        
        // Set mrTd at offset 136
        for (uint256 i = 0; i < 32; i++) {
            reportBody[136 + i] = TEST_MR_TD[i];
        }
        
        // Set mrConfigId at offset 184
        for (uint256 i = 0; i < 32; i++) {
            reportBody[184 + i] = TEST_MR_CONFIG[i];
        }
        
        // Set mrOwner at offset 232
        for (uint256 i = 0; i < 32; i++) {
            reportBody[232 + i] = TEST_MR_OWNER[i];
        }
        
        // Set reportData at offset 520 with protocol ID and agent address
        bytes memory protocolId = "HYPERLIQUID\x00"; // 12 bytes
        bytes20 agentBytes = bytes20(agent);
        
        // Copy protocol ID to bytes 32-43 of reportData (offset 520 + 32)
        for (uint256 i = 0; i < 12; i++) {
            reportBody[520 + 32 + i] = protocolId[i];
        }
        
        // Copy agent address to bytes 44-63 of reportData (offset 520 + 44)
        for (uint256 i = 0; i < 20; i++) {
            reportBody[520 + 44 + i] = agentBytes[i];
        }
        
        return reportBody;
    }
    
    function _createTD10ReportBodyWithInvalidProtocol(address agent) internal pure returns (bytes memory) {
        // Create a 584-byte TD10 report body with invalid protocol ID
        bytes memory reportBody = new bytes(584);
        
        // Set measurements
        for (uint256 i = 0; i < 32; i++) {
            reportBody[136 + i] = TEST_MR_TD[i];
            reportBody[184 + i] = TEST_MR_CONFIG[i];
            reportBody[232 + i] = TEST_MR_OWNER[i];
        }
        
        // Set invalid protocol ID
        bytes memory invalidProtocolId = "INVALID\x00\x00\x00\x00\x00"; // 12 bytes
        bytes20 agentBytes = bytes20(agent);
        
        // Copy invalid protocol ID
        for (uint256 i = 0; i < 12; i++) {
            reportBody[520 + 32 + i] = invalidProtocolId[i];
        }
        
        // Copy agent address
        for (uint256 i = 0; i < 20; i++) {
            reportBody[520 + 44 + i] = agentBytes[i];
        }
        
        return reportBody;
    }
}