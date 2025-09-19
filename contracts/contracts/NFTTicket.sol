// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {ERC1155Burnable} from "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Burnable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title NFTTicket
 * @notice ERC-1155 play tickets that are burned when converted to game tickets
 * @dev MVP STUB - Minimal implementation for compilation, not wired to revenue splits
 * @dev Implements FR-014 (ticket burning) - OPTIONAL for MVP
 */
contract NFTTicket is ERC1155, ERC1155Burnable, Ownable, Pausable {
    /// @notice Base URI for token metadata
    string private baseTokenURI;
    
    /// @notice Mapping of token ID to ticket type name
    mapping(uint256 => string) public ticketTypes;
    
    /// @notice Counter for token type IDs
    uint256 private nextTokenTypeId = 1;

    /// @notice Events
    event TicketTypeDefined(uint256 indexed tokenId, string ticketType);
    event TicketMinted(uint256 indexed tokenId, address indexed to, uint256 amount);
    event TicketBurnedForPlay(uint256 indexed tokenId, address indexed player, uint256 amount);
    event BaseURIUpdated(string newBaseURI);

    /**
     * @notice Constructor
     * @param owner_ The owner address
     * @param uri_ The base URI for token metadata
     */
    constructor(address owner_, string memory uri_) ERC1155(uri_) Ownable(owner_) {
        baseTokenURI = uri_;
    }

    /**
     * @notice Define a new ticket type
     * @param ticketType The name/description of the ticket type
     * @return tokenId The new token ID for this ticket type
     */
    function defineTicketType(string memory ticketType) external onlyOwner returns (uint256 tokenId) {
        tokenId = nextTokenTypeId++;
        ticketTypes[tokenId] = ticketType;
        
        emit TicketTypeDefined(tokenId, ticketType);
    }

    /**
     * @notice Mint tickets to an address
     * @param to The address to mint to
     * @param tokenId The ticket type ID
     * @param amount The amount to mint
     * @param data Additional data
     */
    function mint(
        address to,
        uint256 tokenId,
        uint256 amount,
        bytes memory data
    ) external onlyOwner whenNotPaused {
        require(bytes(ticketTypes[tokenId]).length > 0, "Ticket type not defined");
        
        _mint(to, tokenId, amount, data);
        
        emit TicketMinted(tokenId, to, amount);
    }

    /**
     * @notice Batch mint tickets to an address
     * @param to The address to mint to
     * @param tokenIds Array of ticket type IDs
     * @param amounts Array of amounts to mint
     * @param data Additional data
     */
    function mintBatch(
        address to,
        uint256[] memory tokenIds,
        uint256[] memory amounts,
        bytes memory data
    ) external onlyOwner whenNotPaused {
        for (uint256 i = 0; i < tokenIds.length; i++) {
            require(bytes(ticketTypes[tokenIds[i]]).length > 0, "Ticket type not defined");
        }
        
        _mintBatch(to, tokenIds, amounts, data);
        
        for (uint256 i = 0; i < tokenIds.length; i++) {
            emit TicketMinted(tokenIds[i], to, amounts[i]);
        }
    }

    /**
     * @notice Burn tickets when converted to game tickets (FR-014)
     * @dev This would be called by the game system when a ticket is used for play
     * @param player The player address
     * @param tokenId The ticket type ID
     * @param amount The amount to burn
     */
    function burnForPlay(
        address player,
        uint256 tokenId,
        uint256 amount
    ) external onlyOwner {
        require(balanceOf(player, tokenId) >= amount, "Insufficient ticket balance");
        
        _burn(player, tokenId, amount);
        
        emit TicketBurnedForPlay(tokenId, player, amount);
    }

    /**
     * @notice Set the base URI for token metadata
     * @param newBaseURI The new base URI
     */
    function setURI(string memory newBaseURI) external onlyOwner {
        baseTokenURI = newBaseURI;
        _setURI(newBaseURI);
        emit BaseURIUpdated(newBaseURI);
    }

    /**
     * @notice Get ticket type name by token ID
     * @param tokenId The token ID
     * @return The ticket type name
     */
    function getTicketType(uint256 tokenId) external view returns (string memory) {
        return ticketTypes[tokenId];
    }

    /**
     * @notice Emergency pause functionality
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @notice Unpause functionality
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @notice Override _update to include pause functionality
     */
    function _update(
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory values
    ) internal virtual override {
        require(!paused(), "Token transfers paused");
        super._update(from, to, ids, values);
    }

    /**
     * @notice Get the URI for a token ID
     * @param tokenId The token ID
     * @return The token URI
     */
    function uri(uint256 tokenId) public view override returns (string memory) {
        return string(abi.encodePacked(baseTokenURI, _toString(tokenId)));
    }

    /**
     * @notice Convert uint256 to string
     * @param value The value to convert
     * @return The string representation
     */
    function _toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) {
            return "0";
        }
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}
