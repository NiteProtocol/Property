// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.29;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20, SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IPayment} from "./interfaces/IPayment.sol";

contract Payment is IPayment, Ownable {
    using SafeERC20 for IERC20;

    uint256 private constant FEE_DENOMINATOR = 10 ** 4;

    address public treasury;

    // fee = feeNumerator / FEE_DENOMINATOR
    uint256 public feeNumerator;

    // mapping from supported token address to fixed fee (address(0) = native coin)
    mapping(address => uint256) public fixedFees;

    constructor(address _treasury, uint256 _feeNumerator) Ownable(msg.sender) {
        if (_treasury == address(0)) {
            revert ZeroAddress();
        }
        treasury = _treasury;
        feeNumerator = _feeNumerator;
    }

    /**
     * @notice Set treasury address
     * @dev    Caller must be CONTRACT OWNER
     * @param _addr The new treasury address
     */
    function setTreasury(address _addr) external onlyOwner {
        if (_addr == address(0)) {
            revert ZeroAddress();
        }
        treasury = _addr;
        emit NewTreasury(_addr);
    }

    /**
     * @notice Set fee
     * @dev    Caller must be CONTRACT OWNER
     * @param _feeNumerator the fee numerator
     */
    function setFee(uint256 _feeNumerator) external onlyOwner {
        feeNumerator = _feeNumerator;
        emit NewFeeNumerator(_feeNumerator);
    }

    /**
     * @notice Set fixed fee
     * @dev    Caller must be CONTRACT OWNER
     * @param _token the token address
     * @param _fee the fixed fee
     */
    function setFixedFee(address _token, uint256 _fee) external onlyOwner {
        fixedFees[_token] = _fee;
        emit NewFixedFee(_token, _fee);
    }

    /**
     * @notice Make an on-chain payment
     * @dev Caller can be ANYONE
     */
    function makePayment(uint256 _paymentId, Payment[] calldata _payments) public payable {
        uint256 n = _payments.length;
        if (n == 0) {
            revert EmptyPaymentList();
        }

        address msgSender = _msgSender();
        emit MakePayment(_paymentId, msgSender, _payments);

        address _treasury = treasury;
        uint256 _feeNumerator = feeNumerator;

        address token;
        uint256 fixedFee;
        for (uint256 i; i < n; ) {
            token = _payments[i].token;
            fixedFee = fixedFees[token];
            if (fixedFee > 0) {
                // charge the fixed fee, regardless of payment amount
                _payment(token, msgSender, _treasury, fixedFee);
            }

            if (_payments[i].amount > 0) {
                // process the payment
                _payment(token, msgSender, _payments[i].receiver, _payments[i].amount);

                // charge the commission fee
                _payment(token, msgSender, _treasury, (_payments[i].amount * _feeNumerator) / FEE_DENOMINATOR);
            }
            unchecked {
                ++i;
            }
        }
    }

    function _payment(address _paymentToken, address _from, address _to, uint256 _amount) private {
        if (_paymentToken == address(0)) {
            // solhint-disable-next-line avoid-low-level-calls
            (bool sent, ) = payable(_to).call{value: _amount}("");
            if (!sent) {
                revert TransferFailed();
            }
        } else {
            IERC20(_paymentToken).safeTransferFrom(_from, _to, _amount);
        }
    }
}
