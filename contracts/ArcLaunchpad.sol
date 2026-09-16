// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract LaunchToken is ERC20 {
    constructor(string memory name_, string memory symbol_, uint256 totalSupply_, address receiver_) ERC20(name_, symbol_) {
        _mint(receiver_, totalSupply_);
    }
}

contract ArcLaunchpad is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Launch {
        address creator;
        string name;
        string symbol;
        string description;
        uint256 totalSupply;
        uint256 pricePerToken;
        uint256 softCap;
        uint256 hardCap;
        uint256 startTime;
        uint256 endTime;
        uint256 raised;
        address tokenAddress;
        bool finalized;
        bool succeeded;
    }

    error AlreadyFinalized();
    error NotFinalized();
    error LaunchNotActive();
    error HardCapReached();
    error LaunchSucceeded();
    error LaunchFailed();
    error AlreadyClaimed();
    error NotContributor();
    error ZeroAmount();
    error InvalidTimeRange();
    error InvalidCaps();
    error InvalidLaunch();
    error InvalidAddress();
    error Unauthorized();
    error InvalidContributionAmount();

    event LaunchCreated(uint256 indexed launchId, address indexed creator, string name, string symbol);
    event Contributed(uint256 indexed launchId, address indexed contributor, uint256 amount);
    event LaunchFinalized(uint256 indexed launchId, bool succeeded, uint256 raised);
    event TokensClaimed(uint256 indexed launchId, address indexed contributor, uint256 amount);
    event RefundClaimed(uint256 indexed launchId, address indexed contributor, uint256 amount);
    event ProceedsClaimed(uint256 indexed launchId, address indexed recipient, uint256 amount);

    uint256 public constant PLATFORM_FEE_BPS = 200; // 2%
    uint256 public constant BPS_DENOMINATOR = 10_000;

    IERC20 public immutable usdc;
    uint256 public accumulatedFees;

    Launch[] public launches;

    mapping(uint256 => mapping(address => uint256)) public contributions;
    mapping(uint256 => mapping(address => bool)) public tokenClaimed;
    mapping(uint256 => mapping(address => bool)) public refundClaimed;
    mapping(uint256 => uint256) public creatorProceeds;
    mapping(uint256 => mapping(address => uint256)) public tokensPurchased;
    mapping(uint256 => uint256) public totalTokensSold;

    constructor(address usdcToken) Ownable(msg.sender) {
        if (usdcToken == address(0)) revert InvalidAddress();
        usdc = IERC20(usdcToken);
    }

    function createLaunch(
        string calldata name,
        string calldata symbol,
        string calldata description,
        uint256 totalSupply,
        uint256 pricePerToken,
        uint256 softCap,
        uint256 hardCap,
        uint256 startTime,
        uint256 endTime
    ) external returns (uint256 launchId) {
        if (totalSupply == 0 || pricePerToken == 0) revert ZeroAmount();
        if (softCap == 0 || hardCap < softCap) revert InvalidCaps();
        if (endTime <= startTime || startTime < block.timestamp) revert InvalidTimeRange();
        if (hardCap > totalSupply * pricePerToken) revert InvalidCaps();

        launchId = launches.length;
        launches.push(
            Launch({
                creator: msg.sender,
                name: name,
                symbol: symbol,
                description: description,
                totalSupply: totalSupply,
                pricePerToken: pricePerToken,
                softCap: softCap,
                hardCap: hardCap,
                startTime: startTime,
                endTime: endTime,
                raised: 0,
                tokenAddress: address(0),
                finalized: false,
                succeeded: false
            })
        );

        emit LaunchCreated(launchId, msg.sender, name, symbol);
    }

    function contribute(uint256 launchId, uint256 usdcAmount) external nonReentrant {
        if (usdcAmount == 0) revert ZeroAmount();
        if (launchId >= launches.length) revert InvalidLaunch();

        Launch storage launch = launches[launchId];

        if (launch.finalized) revert AlreadyFinalized();
        if (block.timestamp < launch.startTime || block.timestamp > launch.endTime) revert LaunchNotActive();

        uint256 availableTokens = launch.totalSupply - totalTokensSold[launchId];
        if (availableTokens == 0) revert HardCapReached();

        uint256 maxUsdc = availableTokens * launch.pricePerToken;
        if (usdcAmount > maxUsdc) revert HardCapReached();
        if (usdcAmount % launch.pricePerToken != 0) revert InvalidContributionAmount();

        uint256 tokensBought = usdcAmount / launch.pricePerToken;
        if (tokensBought == 0) revert InvalidContributionAmount();

        launch.raised += usdcAmount;
        contributions[launchId][msg.sender] += usdcAmount;
        tokensPurchased[launchId][msg.sender] += tokensBought;
        totalTokensSold[launchId] += tokensBought;

        usdc.safeTransferFrom(msg.sender, address(this), usdcAmount);

        emit Contributed(launchId, msg.sender, usdcAmount);
    }

    function finalize(uint256 launchId) external nonReentrant {
        if (launchId >= launches.length) revert InvalidLaunch();

        Launch storage launch = launches[launchId];

        if (launch.finalized) revert AlreadyFinalized();
        if (block.timestamp <= launch.endTime) revert LaunchNotActive();

        launch.finalized = true;

        if (launch.raised >= launch.softCap) {
            launch.succeeded = true;

            LaunchToken token = new LaunchToken(launch.name, launch.symbol, launch.totalSupply, address(this));
            launch.tokenAddress = address(token);

            uint256 fee = (launch.raised * PLATFORM_FEE_BPS) / BPS_DENOMINATOR;
            uint256 payout = launch.raised - fee;

            accumulatedFees += fee;
            creatorProceeds[launchId] += payout;
        } else {
            launch.succeeded = false;
        }

        emit LaunchFinalized(launchId, launch.succeeded, launch.raised);
    }

    function claimProceeds(uint256 launchId) external nonReentrant {
        if (launchId >= launches.length) revert InvalidLaunch();

        Launch storage launch = launches[launchId];

        if (!launch.finalized) revert NotFinalized();
        if (!launch.succeeded) revert LaunchFailed();
        if (msg.sender != launch.creator) revert Unauthorized();

        uint256 amount = creatorProceeds[launchId];
        if (amount == 0) revert ZeroAmount();

        creatorProceeds[launchId] = 0;
        usdc.safeTransfer(launch.creator, amount);

        emit ProceedsClaimed(launchId, msg.sender, amount);
    }

    function claimTokens(uint256 launchId) external nonReentrant {
        if (launchId >= launches.length) revert InvalidLaunch();

        Launch storage launch = launches[launchId];

        if (!launch.finalized) revert NotFinalized();
        if (!launch.succeeded) revert LaunchFailed();
        if (tokenClaimed[launchId][msg.sender]) revert AlreadyClaimed();

        uint256 tokenAmount = tokensPurchased[launchId][msg.sender];
        if (tokenAmount == 0) revert NotContributor();

        tokenClaimed[launchId][msg.sender] = true;

        IERC20(launch.tokenAddress).safeTransfer(msg.sender, tokenAmount);

        emit TokensClaimed(launchId, msg.sender, tokenAmount);
    }

    function claimRefund(uint256 launchId) external nonReentrant {
        if (launchId >= launches.length) revert InvalidLaunch();

        Launch storage launch = launches[launchId];

        if (!launch.finalized) revert NotFinalized();
        if (launch.succeeded) revert LaunchSucceeded();
        if (refundClaimed[launchId][msg.sender]) revert AlreadyClaimed();

        uint256 contributed = contributions[launchId][msg.sender];
        if (contributed == 0) revert NotContributor();

        refundClaimed[launchId][msg.sender] = true;
        usdc.safeTransfer(msg.sender, contributed);

        emit RefundClaimed(launchId, msg.sender, contributed);
    }

    function withdrawFees(address to) external onlyOwner nonReentrant {
        if (to == address(0)) revert InvalidAddress();

        uint256 amount = accumulatedFees;
        if (amount == 0) revert ZeroAmount();

        accumulatedFees = 0;
        usdc.safeTransfer(to, amount);
    }

    function getLaunchCount() external view returns (uint256) {
        return launches.length;
    }
}
