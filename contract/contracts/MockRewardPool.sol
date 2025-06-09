// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract MockRewardPool {
    address public owner;

    constructor() {
        owner = msg.sender;
    }

    receive() external payable {}
} 