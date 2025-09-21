// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "../../src/interfaces/IAutomataDcapAttestation.sol";

/**
 * @title MockAutomataDcapAttestation
 * @notice Mock contract for testing Registry without actual Automata integration
 * @dev Simulates the behavior of Automata DCAP attestation contract
 */
contract MockAutomataDcapAttestation is IAutomataDcapAttestation {
    
    // State variables for controlling mock behavior
    bool public mockSuccess = true;
    bytes public mockOutput = "";
    uint256 public callCount = 0;
    
    // Events for testing
    event VerificationCalled(bytes rawQuote, uint256 value);
    event VerificationCalledWithTcb(bytes rawQuote, uint32 tcbEvalNumber, uint256 value);
    
    /**
     * @notice Set the mock verification result
     * @param success Whether verification should succeed
     * @param output The output to return on successful verification
     */
    function setVerificationResult(bool success, bytes memory output) external {
        mockSuccess = success;
        mockOutput = output;
    }
    
    /**
     * @notice Mock implementation of verifyAndAttestOnChain
     * @param rawQuote Raw TDX quote bytes (ignored in mock)
     * @return success Mock success value
     * @return output Mock output data
     */
    function verifyAndAttestOnChain(bytes calldata rawQuote)
        external
        payable
        override
        returns (bool success, bytes memory output)
    {
        callCount++;
        emit VerificationCalled(rawQuote, msg.value);
        
        if (mockSuccess) {
            return (true, mockOutput);
        } else {
            return (false, "Mock verification failed");
        }
    }
    
    /**
     * @notice Mock implementation of verifyAndAttestOnChain with TCB evaluation number
     * @param rawQuote Raw TDX quote bytes (ignored in mock)
     * @param tcbEvaluationDataNumber TCB evaluation data number (ignored in mock)
     * @return success Mock success value
     * @return output Mock output data
     */
    function verifyAndAttestOnChain(bytes calldata rawQuote, uint32 tcbEvaluationDataNumber)
        external
        payable
        override
        returns (bool success, bytes memory output)
    {
        callCount++;
        emit VerificationCalledWithTcb(rawQuote, tcbEvaluationDataNumber, msg.value);
        
        if (mockSuccess) {
            return (true, mockOutput);
        } else {
            return (false, "Mock verification failed");
        }
    }
    
    /**
     * @notice Get the number of times verification was called
     * @return count Number of verification calls
     */
    function getCallCount() external view returns (uint256 count) {
        return callCount;
    }
    
    /**
     * @notice Reset call count for testing
     */
    function resetCallCount() external {
        callCount = 0;
    }
    
    /**
     * @notice Allow contract to receive ETH for fee simulation
     */
    receive() external payable {}
}