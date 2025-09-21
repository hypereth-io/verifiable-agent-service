// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../src/libraries/AttestationHelper.sol";
import "../src/types/TDXStructs.sol";

/**
 * @title AttestationHelper Test Suite
 * @notice Tests for the AttestationHelper library functions
 */
contract AttestationHelperTest is Test {
    using AttestationHelper for bytes;
    
    address constant TEST_AGENT = 0x742d35cC6bc9C46a2d8a5C70d6E5c8C8A7f6b3e1;
    
    function testParseValidOutput() public {
        // Create valid output data
        Output memory expectedOutput = Output({
            quoteVersion: 4,
            quoteBodyType: 2,
            tcbStatus: 0,
            fmspcBytes: bytes6(0x123456789ABC),
            quoteBody: _createValidTD10ReportBody(),
            advisoryIDs: new string[](0)
        });
        
        bytes memory outputData = abi.encode(expectedOutput);
        
        Output memory parsedOutput = AttestationHelper.parseOutput(outputData);
        
        assertEq(parsedOutput.quoteVersion, 4);
        assertEq(parsedOutput.quoteBodyType, 2);
        assertEq(parsedOutput.tcbStatus, 0);
        assertEq(parsedOutput.fmspcBytes, bytes6(0x123456789ABC));
    }
    
    function testParseOutputInvalidVersion() public {
        Output memory invalidOutput = Output({
            quoteVersion: 3, // Invalid version
            quoteBodyType: 2,
            tcbStatus: 0,
            fmspcBytes: bytes6(0x123456789ABC),
            quoteBody: _createValidTD10ReportBody(),
            advisoryIDs: new string[](0)
        });
        
        bytes memory outputData = abi.encode(invalidOutput);
        
        vm.expectRevert(AttestationHelper.InvalidQuoteVersion.selector);
        AttestationHelper.parseOutput(outputData);
    }
    
    function testParseOutputInvalidBodyType() public {
        Output memory invalidOutput = Output({
            quoteVersion: 4,
            quoteBodyType: 1, // Invalid body type
            tcbStatus: 0,
            fmspcBytes: bytes6(0x123456789ABC),
            quoteBody: _createValidTD10ReportBody(),
            advisoryIDs: new string[](0)
        });
        
        bytes memory outputData = abi.encode(invalidOutput);
        
        vm.expectRevert(AttestationHelper.InvalidQuoteBodyType.selector);
        AttestationHelper.parseOutput(outputData);
    }
    
    function testParseEmptyOutput() public {
        bytes memory emptyData = "";
        
        vm.expectRevert(AttestationHelper.InvalidOutputData.selector);
        AttestationHelper.parseOutput(emptyData);
    }
    
    function testParseTD10Report() public {
        bytes memory validReportBody = _createValidTD10ReportBody();
        
        TD10ReportBody memory parsedReport = AttestationHelper.parseTD10Report(validReportBody);
        
        // Verify reportData was extracted correctly
        bytes memory reportDataBytes = abi.encodePacked(parsedReport.reportData);
        
        // Check protocol ID (bytes 32-43)
        bytes12 protocolId;
        assembly {
            protocolId := mload(add(reportDataBytes, 64)) // 32 + 32 for length
        }
        assertEq(protocolId, ProtocolConstants.PROTOCOL_ID);
        
        // Check agent address (bytes 44-63)
        address extractedAgent;
        assembly {
            extractedAgent := mload(add(reportDataBytes, 76)) // 44 + 32 for length
        }
        assertEq(extractedAgent, TEST_AGENT);
    }
    
    function testParseTD10ReportInvalidSize() public {
        bytes memory invalidSizeReport = new bytes(500); // Wrong size
        
        vm.expectRevert(AttestationHelper.InvalidTD10ReportSize.selector);
        AttestationHelper.parseTD10Report(invalidSizeReport);
    }
    
    function testHasValidProtocolId() public {
        bytes memory reportData = _createValidReportData();
        
        bool isValid = AttestationHelper.hasValidProtocolId(reportData);
        assertTrue(isValid);
    }
    
    function testHasInvalidProtocolId() public {
        bytes memory reportData = _createInvalidReportData();
        
        bool isValid = AttestationHelper.hasValidProtocolId(reportData);
        assertFalse(isValid);
    }
    
    function testExtractAgentAddressValid() public {
        bytes memory reportData = _createValidReportData();
        
        address extractedAgent = AttestationHelper.extractAgentAddress(reportData);
        assertEq(extractedAgent, TEST_AGENT);
    }
    
    function testExtractAgentAddressInvalidProtocol() public {
        bytes memory reportData = _createInvalidReportData();
        
        vm.expectRevert(AttestationHelper.InvalidProtocolId.selector);
        AttestationHelper.extractAgentAddress(reportData);
    }
    
    function testExtractAgentAddressZero() public {
        bytes memory reportData = _createValidReportDataWithZeroAddress();
        
        vm.expectRevert(AttestationHelper.AgentAddressZero.selector);
        AttestationHelper.extractAgentAddress(reportData);
    }
    
    function testParseQuoteAndExtractAgentComplete() public {
        // Create complete valid data
        Output memory output = Output({
            quoteVersion: 4,
            quoteBodyType: 2,
            tcbStatus: 1,
            fmspcBytes: bytes6(0x123456789ABC),
            quoteBody: _createValidTD10ReportBody(),
            advisoryIDs: new string[](0)
        });
        
        bytes memory outputData = abi.encode(output);
        
        (
            Output memory parsedOutput,
            TD10ReportBody memory reportBody,
            address agentAddress
        ) = AttestationHelper.parseQuoteAndExtractAgent(outputData);
        
        // Verify all parsed data
        assertEq(parsedOutput.quoteVersion, 4);
        assertEq(parsedOutput.quoteBodyType, 2);
        assertEq(parsedOutput.tcbStatus, 1);
        assertEq(agentAddress, TEST_AGENT);
        
        // Verify reportData was parsed correctly
        address extractedFromReport = AttestationHelper.extractAgentAddress(reportBody.reportData);
        assertEq(extractedFromReport, TEST_AGENT);
    }
    
    function testProtocolConstants() public {
        // Test protocol constants
        assertEq(ProtocolConstants.PROTOCOL_ID, hex"48595045524c495155494400");
        assertEq(ProtocolConstants.REPORT_DATA_SIZE, 64);
        assertEq(ProtocolConstants.TD10_REPORT_SIZE, 584);
        assertEq(ProtocolConstants.REPORT_DATA_OFFSET, 520);
        assertEq(ProtocolConstants.PROTOCOL_ID_OFFSET, 32);
        assertEq(ProtocolConstants.AGENT_ADDRESS_OFFSET, 44);
    }
    
    // Helper functions
    
    function _createValidTD10ReportBody() internal pure returns (bytes memory) {
        bytes memory reportBody = new bytes(ProtocolConstants.TD10_REPORT_SIZE);
        
        // Set reportData at offset 520
        bytes memory reportData = _createValidReportData();
        for (uint256 i = 0; i < ProtocolConstants.REPORT_DATA_SIZE; i++) {
            reportBody[ProtocolConstants.REPORT_DATA_OFFSET + i] = reportData[i];
        }
        
        return reportBody;
    }
    
    function _createValidReportData() internal pure returns (bytes memory) {
        bytes memory reportData = new bytes(ProtocolConstants.REPORT_DATA_SIZE);
        
        // Bytes 0-31: Reserved (zeros)
        // Bytes 32-43: Protocol ID
        bytes memory protocolId = abi.encodePacked(ProtocolConstants.PROTOCOL_ID);
        for (uint256 i = 0; i < 12; i++) {
            reportData[ProtocolConstants.PROTOCOL_ID_OFFSET + i] = protocolId[i];
        }
        
        // Bytes 44-63: Agent address
        bytes20 agentBytes = bytes20(TEST_AGENT);
        for (uint256 i = 0; i < 20; i++) {
            reportData[ProtocolConstants.AGENT_ADDRESS_OFFSET + i] = agentBytes[i];
        }
        
        return reportData;
    }
    
    function _createInvalidReportData() internal pure returns (bytes memory) {
        bytes memory reportData = new bytes(ProtocolConstants.REPORT_DATA_SIZE);
        
        // Set invalid protocol ID
        bytes12 invalidId = hex"494e56414c49440000000000";
        bytes memory invalidIdBytes = abi.encodePacked(invalidId);
        for (uint256 i = 0; i < 12; i++) {
            reportData[ProtocolConstants.PROTOCOL_ID_OFFSET + i] = invalidIdBytes[i];
        }
        
        // Set agent address
        bytes20 agentBytes = bytes20(TEST_AGENT);
        for (uint256 i = 0; i < 20; i++) {
            reportData[ProtocolConstants.AGENT_ADDRESS_OFFSET + i] = agentBytes[i];
        }
        
        return reportData;
    }
    
    function _createValidReportDataWithZeroAddress() internal pure returns (bytes memory) {
        bytes memory reportData = new bytes(ProtocolConstants.REPORT_DATA_SIZE);
        
        // Set valid protocol ID
        bytes memory protocolId = abi.encodePacked(ProtocolConstants.PROTOCOL_ID);
        for (uint256 i = 0; i < 12; i++) {
            reportData[ProtocolConstants.PROTOCOL_ID_OFFSET + i] = protocolId[i];
        }
        
        // Agent address remains zero (default)
        
        return reportData;
    }
}