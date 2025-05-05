// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.26;

import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {IERC20, SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

import {INiteToken} from "./interfaces/INiteToken.sol";
import {IFactory} from "./interfaces/IFactory.sol";
import {IOwnedToken} from "./interfaces/IOwnedToken.sol";

import {ERC721Booking} from "./libraries/ERC721Booking.sol";

import {OwnedToken} from "./OwnedToken.sol";

contract Property is INiteToken, ERC721Booking, Pausable, EIP712 {
    using SafeERC20 for IERC20;
    using SignatureChecker for address;

    // keccak256("Permit(address spender,uint256 tokenId,uint256 nonce,uint256 deadline)")
    bytes32 private constant PERMIT_TYPEHASH = 0x49ecf333e5b8c95c40fdafc95c1ad136e8914a8fb55e9dc8bb01eaa83a2df9ad;
    // keccak256("PermitForAll(address owner,address operator,bool approved,uint256 nonce,uint256 deadline)")
    bytes32 private constant PERMIT_FOR_ALL_TYPEHASH = 0x47ab88482c90e4bb94b82a947ae78fa91fb25de1469ab491f4c15b9a0a2677ee;

    IFactory public immutable FACTORY;
    IERC20 public immutable TRVL;  // TRVL token
    IOwnedToken public immutable STRVL; // Staked TRVL token

    uint256 public constant DENOMINATOR = 1e6;

    uint256 public baseRate; // base price, in TRVL, for a single night, before any discounts or surcharges
    address public paymentReceiver; // address where payments will be sent. It's initiated as the owner's address by default.

    // the nonces mapping is used for replay protection
    mapping(address => uint256) public sigNonces;

    constructor(address _host, address _initialApproved, address _factory,
        string memory _name, string memory _symbol, string memory _uri
    ) ERC721Booking(_host, _name, _symbol) EIP712("DtravelNT", "1") {
        if (_factory == address(0)) { revert ZeroAddress(); }
        if (_initialApproved != address(0)) { _setApprovalForAll(_host, _initialApproved, true); }
        FACTORY = IFactory(_factory);
        TRVL = IERC20(FACTORY.getTRVLAddress());
        STRVL = IOwnedToken(new OwnedToken(_name, _symbol));
        baseTokenURI = _uri;
        paymentReceiver = _host;
        _pause(); // pause token transfers by default
    }

    function _beforeTokenTransfer(address from, address to, uint256 fromId, uint256 lastId) internal override(ERC721Booking) {
        address msgSender = _msgSender();
        address o = owner();
        bool isHostOrApproved = msgSender == o || isApprovedForAll[o][msgSender];
        _collectTransferFee(fromId, lastId);
        if (isHostOrApproved) { return; }
        if (paused()) { revert TransferWhilePaused(); }
        super._beforeTokenTransfer(from, to, fromId, lastId);
    }

    function _collectTransferFee(uint256 fromId, uint256 lastId) private {
        uint256 amount = (lastId == 0) ? 1 : lastId - fromId + 1;
        uint256 fee = amount * FACTORY.feeAmountPerTransfer() * DENOMINATOR / price(); // fee in STRVL
        if (fee > 0) {
            STRVL.burn(owner(), fee); // TODO: add a free trial period.
        }
    }

    function costs(uint256 fromId, uint256 toId) public view returns (uint256 total, uint256 fee) {
        uint256 nights = (toId == 0) ? 1 : toId - fromId + 1;
        total = nights * baseRate;
        uint256 bookingFee = 5e4; // 5% TODO: get this from the factory;
        fee = total * bookingFee / DENOMINATOR; 
    }
    
    function book(address traveler, uint256 fromId, uint256 toId) public {
        (uint256 total, uint256 fee) = costs(fromId, toId);
        if (fee > 0) TRVL.safeTransferFrom(traveler, address(this), fee);
        uint256 amountToOwner = total - fee;
        if (amountToOwner > 0) TRVL.safeTransferFrom(traveler, paymentReceiver, amountToOwner);
        safeBulkTransferFrom(owner(), traveler, fromId, toId);
    }

    function bookWithOffChainPayment(address traveler, uint256 fromId, uint256 toId) public onlyOwner { // TODO: replace onlyOwner by onlyAuthorized
        (, uint256 fee) = costs(fromId, toId);
        if (fee > 0) TRVL.safeTransferFrom(owner(), address(this), fee); // we assume that the owner received the total amount off-chain and charge the fee from the owner
        safeBulkTransferFrom(owner(), traveler, fromId, toId);
    }

    function cancel(uint256 bookingId, uint256 amountToReturn) public onlyOwner { // TODO: replace onlyOwner by onlyAuthorized
        Booking memory b = bookings[bookingId];
        address booker = ownerOf(b.checkIn);
        if (amountToReturn > 0) TRVL.safeTransferFrom(owner(), booker, amountToReturn);
        safeBulkTransferFrom(booker, address(0), b.checkIn, b.checkOut - 1);
    }

    function isAvailable(uint256 tokenId) public view returns(bool) { return ownerOf(tokenId) == owner(); }

    function markAsUnavailable(uint256 fromId, uint256 toId) public onlyOwner {
        safeBulkTransferFrom(owner(), address(this), fromId, toId); // By convention, tokens owned by this contract are assumed to be unavailable.
    }

    function markAsAvailable(uint256 fromId, uint256 toId) public onlyOwner {
        safeBulkTransferFrom(address(this), owner(), fromId, toId); // By convention, tokens owned by this contract are assumed to be unavailable.
    }

    /*============================================================
                            SETTINGS
    ============================================================*/

    function setName(string calldata _name) external onlyOwner { name = _name; }
    function setBaseURI(string calldata _uri) external onlyOwner { baseTokenURI = _uri;}
    function pause() external onlyOwner { _pause(); }     // pause Nite token transfers
    function unpause() external onlyOwner { _unpause(); } // unpause Nite token transfers
    function setBaseRate(uint256 _r) external onlyOwner { baseRate = _r; }
    function setPaymentReceiver(address _a) external onlyOwner { paymentReceiver = _a; }

    /*============================================================
                            Staking
    ============================================================*/
    
    function price() public view returns (uint256) {
      uint256 s = STRVL.totalSupply();
      return s == 0 ? DENOMINATOR : TRVL.balanceOf(address(this)) * DENOMINATOR / s; 
    }
    
    function stake(uint256 amount) external {
      uint256 amountStaked = DENOMINATOR * amount / price();
      TRVL.safeTransferFrom(msg.sender, address(this), amount);
      STRVL.mint(msg.sender, amountStaked);
    }

    function unstake(uint256 amountStaked) external {
      uint256 amount = amountStaked * price() / DENOMINATOR;
      STRVL.burn(msg.sender, amountStaked);
      TRVL.safeTransfer(msg.sender, amount);
    }

    /*============================================================
                            PERMIT LOGIC
    ============================================================*/

    /**
     * @notice ERC721 Permit extension allowing approvals to be made via signatures.
     *      The nonce is incremented upon every permit execution, not allowing multiple permits to be executed
     * @dev Caller can be ANYONE
     * @param _spender The account that is being approved
     * @param _tokenId The token ID that is being approved for spending
     * @param _deadline The deadline timestamp by which the call must be mined for the approve to work
     * @param _signature The signature provided by token owner
     */
    function permit(address _spender, uint256 _tokenId, uint256 _deadline, bytes calldata _signature) public {
        address owner = ownerOf(_tokenId);
        if (owner == _spender) { revert ApprovalToCurrentOwner(); }

        bytes32 structHash = keccak256(abi.encode(PERMIT_TYPEHASH, _spender, _tokenId, sigNonces[owner]++, _deadline));
        bytes32 digest = _hashTypedDataV4(structHash);
        _validateRecoveredAddress(digest, owner, _deadline, _signature);
        _approve(_spender, _tokenId);
    }

    /**
     * @notice ERC721 Permit extension allowing all token approvals to be made via signatures.
     *      The nonce is incremented upon every permit execution, not allowing multiple permits to be executed
     * @dev Caller can be ANYONE
     * @param _owner The token owner
     * @param _operator The account that is being approved
     * @param _approved The approval status
     * @param _deadline The deadline timestamp by which the call must be mined for the approve to work
     * @param _signature The signature provided by token owner
     */
    function permitForAll(
        address _owner,
        address _operator,
        bool _approved,
        uint256 _deadline,
        bytes calldata _signature
    ) public {
        if (_operator == address(0)) {
            revert ZeroAddress();
        }

        bytes32 structHash = keccak256(
            abi.encode(PERMIT_FOR_ALL_TYPEHASH, _owner, _operator, _approved, sigNonces[_owner]++, _deadline)
        );

        bytes32 digest = _hashTypedDataV4(structHash);

        _validateRecoveredAddress(digest, _owner, _deadline, _signature);
        _setApprovalForAll(_owner, _operator, _approved);
    }

    /**
     * @notice Transfer token, using permit for approvals
     * @dev Caller must be SPENDER
     * @param _tokenId The token ID that is being approved for spending
     * @param _deadline The deadline timestamp by which the call must be mined for the approve to work
     * @param _signature The signature provided by token owner
     */
    function transferWithPermit(address _to, uint256 _tokenId, uint256 _deadline, bytes calldata _signature) external {
        permit(_msgSender(), _tokenId, _deadline, _signature);
        transferFrom(ownerOf(_tokenId), _to, _tokenId);
    }

    function _validateRecoveredAddress(
        bytes32 _digest, address _owner, uint256 _deadline, bytes calldata _signature
    ) private view {
        if (block.timestamp > _deadline) { revert PermitExpired(); }
        if (!_owner.isValidSignatureNow(_digest, _signature)) { revert InvalidPermitSignature(); }
    }
}
