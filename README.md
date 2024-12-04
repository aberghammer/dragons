# DerpyDragons NFT Ecosystem: Management Summary

## **Key Aspects**

- **Staking**: Enables users to lock their Dragons NFTs to earn points over time, which can be redeemed for new token mints.
- **Minting**: Controlled and transparent token creation process with rarity probabilities leveraged by **Pyth entropy** and dynamic adjustments based on availability.
- **Royalties**: Incorporates programmable royalties using ERC721C and BasicRoyalties, ensuring creators benefit from secondary sales.
- **Secure Ownership**: Robust access control mechanisms to manage critical functions like minting and royalties.
- **Metadata Management**: Tokens are linked to unique metadata URIs, with emergency update functionality for exceptional scenarios.
- **Future-Proof Design**: Fully compatible with ERC165 and ERC2981 standards, ensuring long-term adaptability.
- **Fairness and Transparency**: Dynamic adjustments in minting ensure fair distribution, and royalty settings maintain creator engagement.
- **Upgradeability**: Adjustments and optimization in staking and minting logik are possible because of leveraging UUPS proxy pattern. So it would be possible to upgrade the contract with new features and different logic for staking and minting after the main event ends.

The **DerpyDragons NFT ecosystem** combines innovative features such as staking, rarity-based minting, and dynamic probability adjustments to create a robust and engaging platform for users. This system is designed to reward user engagement, ensure fairness in rarity distribution, and maintain the exclusivity of limited-edition NFTs.

The core mechanism begins with staking, where users temporarily lock their NFTs in a secure digital vault. During this period, the staked NFTs generate points for the user, serving as a reward for their commitment to the ecosystem. These points accumulate over time, with higher rewards for users who stake more NFTs or leave them staked for longer durations. Importantly, the points earned are retained even if the user chooses to unstake their NFTs early, ensuring that every level of participation is recognized.

Once users have accrued enough points, they can participate in the **minting process**, which offers them the opportunity to acquire new NFTs of varying rarities. Each rarity level—ranging from "Common" to the ultra-exclusive "Mythic"—is tied to specific probabilities that determine the likelihood of obtaining it. Users select a "roll type," a predefined package that outlines the cost in points and the rarity probabilities. For example, a roll type with a lower cost might guarantee a "Common" NFT, while a higher-cost roll type offers a mix of probabilities, including a chance to obtain rarer NFTs.

To preserve the integrity and value of rarities, each level has a capped supply. Once the maximum number of NFTs for a specific rarity has been minted, the system dynamically redistributes the probabilities. This ensures that users still have a fair chance of receiving an NFT, even if some rarities are no longer available. For instance, if the "Mythic" supply is exhausted, its allocated probability is proportionally reallocated to the remaining rarities. This dynamic adjustment guarantees that the minting process remains transparent and equitable, even as rarities are minted out.

The minting process itself is straightforward. Users spend their points to initiate a roll, and the system randomly selects the rarity based on the adjusted probabilities. The minted NFT is then assigned a unique identifier and linked to metadata that corresponds to its rarity. Finally, the NFT is transferred to the user’s wallet, where it becomes fully available for trading, collection, or further staking.

The DerpyDragons platform is designed to strike a balance between accessibility and exclusivity. By rewarding consistent engagement and offering opportunities for users to acquire valuable assets, the system fosters a sense of achievement and loyalty. At the same time, the rarity caps and dynamic adjustments protect the ecosystem from inflation, ensuring that the NFTs retain their uniqueness and desirability over time.

This approach not only enhances the user experience but also establishes a sustainable framework for long-term growth. The interplay between staking, earning points, and minting rare NFTs creates a vibrant and engaging ecosystem that appeals to collectors, investors, and casual participants alike.

# DerpyDragons NFT Ecosystem: Staking Mechanism and Point Calculation

The staking mechanism in the DerpyDragons ecosystem is a key component designed to reward users for holding and locking their Dragons NFTs within the staking contract. By staking their NFTs, users accumulate points over time, which can be used to participate in the platform’s minting process.

## **How Staking Works**

Staking is initiated by the user, who selects one or more Dragons NFTs to lock in the staking contract. The staking process transfers the ownership of the NFT temporarily to the contract. Each staked NFT starts earning points immediately based on the time it remains staked.

### Key Steps of Staking:

1. The user calls the staking function with an array of token IDs representing the Dragons they wish to stake.
2. The contract verifies ownership of the tokens and ensures they are not already staked.
3. Each token is registered with the staking contract, storing:
   - The user’s address as the token owner.
   - The current timestamp (`checkInTimestamp`) to calculate points later.
4. The tokens are then transferred to the contract for safekeeping.

### Dragon Staking Points Table

The following table outlines the points earned based on the number of dragons staked, the staking duration, and the hourly point generation rate. All points are calculated using an integer value of **410 points per hour** per dragon.

| Tier | Number of Dragons | Points per Dragon per Hour | Staking Period (Days) | Total Points Earned |
| ---- | ----------------- | -------------------------- | --------------------- | ------------------- |
| 1    | 5                 | 410                        | 25                    | 246.000             |
| 2    | 10                | 410                        | 25                    | 492.000             |
| 3    | 15                | 410                        | 25                    | 3.690.000           |
| 4    | 20                | 410                        | 25                    | 4.920.000           |
| 5    | 30                | 410                        | 25                    | 7.380.000           |
| 6    | 50                | 410                        | 25                    | 12.300.000          |

### Key Features

- **Ownership Tracking**: The contract keeps track of which user staked each token.
- **Start Time Logging**: A `checkInTimestamp` is recorded to determine the duration of staking for point calculation.

## **Point Accumulation**

Points are calculated continuously based on the staking duration. Instead of accruing points daily, the contract tracks staking in smaller intervals, ensuring precise rewards for time spent staked.

### Calculation Details:

- For each staked token, the contract calculates the time elapsed since the last recorded timestamp (`checkInTimestamp`).
- Points are accumulated as follows:
  ```
  earnedPoints = (stakingDuration * pointsPerHourPerToken) / 1 hour
  ```
- The value `pointsPerHourPerToken` determines how many points a single NFT earns per hour.

### Resetting Accumulated Points:

- When a user interacts with the contract (e.g., unstaking or claiming rewards), the points for all relevant tokens are calculated and added to the user’s balance.
- The `checkInTimestamp` for the affected tokens is updated to the current time.

## **Unstaking**

Unstaking allows users to withdraw their NFTs from the staking contract. During unstaking:

- Pending points for the staked NFTs are calculated and credited to the user’s balance.
- The NFTs are returned to the user’s wallet.
- The staking record for each token is cleared.

### Key Steps of Unstaking:

1. The user calls the unstake function with an array of token IDs.
2. Pending points are calculated for all staked tokens using the recorded `checkInTimestamp`.
3. The `checkInTimestamp` for the unstaked tokens is reset to zero, and the tokens are transferred back to the user.

### Special Notes:

- Points earned prior to unstaking remain credited to the user.
- If the user has additional tokens still staked, those continue earning points without interruption.

## **Transparency and User Experience**

Users can view their pending rewards through a dedicated function without affecting the staking state. This function provides an overview of total rewards earned, combining:

- Points accumulated since the last claim or interaction.
- Points already credited to the user’s balance from prior interactions.

## **Fair and Flexible System**

This staking mechanism ensures:

1. **Precision in Rewards**: Points are calculated based on exact staking duration, allowing fair rewards even for short-term staking.
2. **Flexibility for Users**: Users can unstake at any time without losing previously earned points.
3. **Clear Transparency**: Users have real-time visibility into their rewards and staking status.

By combining these features, the DerpyDragons platform creates an engaging and rewarding environment for NFT holders while maintaining fairness and accessibility for all participants.

# DerpyDragons NFT Ecosystem: Minting, Fairness, and Rarity Calculation

The minting process in the DerpyDragons ecosystem is designed to be both fair and transparent, ensuring that users receive NFTs based on predefined probabilities while maintaining the rarity and exclusivity of the collection.

## **How Minting Works**

The minting process begins when a user requests a token mint. To do this, the user selects a roll type, which determines the cost (in points) and the probabilities of receiving a specific rarity. Each rarity has a maximum supply, ensuring that rare NFTs remain exclusive.

## **Rarity Pricing Table**

| Rarity | Price (Points) | Explanation                                                   |
| ------ | -------------- | ------------------------------------------------------------- |
| 6      | 492,000        | Affordable with Tier 4, 5, and 6 setups.                      |
| 5      | 369,000        | Affordable with Tier 3, 4, 5, and 6 setups.                   |
| 4      | 246,000        | Affordable with Tier 2, 3, 4, 5, and 6 setups.                |
| 3      | 123,000        | Affordable with all tiers.                                    |
| 2      | 492,000        | Same as Rarity 6 for strategic parity in point allocation.    |
| 1      | 246,000        | Affordable for Tier 2 setups upwards, ensuring accessibility. |

---

## **Minting Scenarios after 25 days**

### **Tier 1 (5 Dragons, 123,000 Points)**

- **Example 1**: Mint 1x Rarity 3 (123,000 points).

### **Tier 2 (10 Dragons, 246,000 Points)**

- **Example 1**: Mint 1x Rarity 4 (246,000 points).
- **Example 2**: Mint 2x Rarity 3 (123,000 points each).
- **Example 3**: Mint 1x Rarity 3 (123,000 points) and save remaining points.

### **Tier 3 (15 Dragons, 369,000 Points)**

- **Example 1**: Mint 1x Rarity 5 (369,000 points).
- **Example 2**: Mint 1x Rarity 4 (246,000 points) and 1x Rarity 3 (123,000 points).
- **Example 3**: Mint 3x Rarity 3 (123,000 points each).

### **Tier 4 (20 Dragons, 492,000 Points)**

- **Example 1**: Mint 1x Rarity 6 (492,000 points).
- **Example 2**: Mint 2x Rarity 4 (246,000 points each).
- **Example 3**: Mint 4x Rarity 3 (123,000 points each).

### **Tier 5 (30 Dragons, 738,000 Points)**

- **Example 1**: Mint 1x Rarity 6 (492,000 points) and 1x Rarity 4 (246,000 points).
- **Example 2**: Mint 3x Rarity 4 (246,000 points each).
- **Example 3**: Mint 6x Rarity 3 (123,000 points each).

### **Tier 6 (50 Dragons, 1,230,000 Points)**

- **Example 1**: Mint 1x Rarity 6 (492,000 points) and 1x Rarity 2 (492,000 points).
- **Example 2**: Mint 2x Rarity 6 (492,000 points each) and 1x Rarity 3 (123,000 points).
- **Example 3**: Mint 3x Rarity 4 (246,000 points each) and 2x Rarity 3 (123,000 points each).

---

By following this pricing structure, users can strategically plan their staking and minting activities to achieve their desired rarities while ensuring fairness across tiers.

### Steps in the Minting Process:

1. **Token Request**:  
   The user initiates a mint by specifying a roll type and paying the required points. The system checks if the roll type is valid and if there is minting capacity left for at least one rarity within that roll type.
2. **Points Deduction**:  
   The contract calculates the user's total available points, including pending rewards from staked NFTs. If the user has sufficient points, the required amount is deducted from their balance.

3. **Randomness Request**:  
   A request for randomness is sent to the entropy provider. This randomness will later be used to determine the rarity of the minted token.

4. **Rarity Selection and Minting**:  
   Once randomness is received, the contract calculates the rarity based on the roll type's probabilities and the available rarities. The selected rarity is verified to have minting capacity, and the token is minted with a unique metadata URI.

## **Fairness and Rarity Calculation**

The system ensures fairness through a combination of predefined probabilities and dynamic adjustments based on availability. The key aspects of rarity calculation are as follows:

### Predefined Probabilities:

- Each roll type defines a set of probabilities for each rarity. For example, a roll type might have a 60% chance of minting a "Common" NFT and a 5% chance of minting a "Mythic" NFT.
- These probabilities are used to guide the randomness-based rarity selection.

### Dynamic Adjustments:

- If a rarity is fully minted, it is removed from the selection pool, and the probabilities for the remaining rarities are recalculated dynamically.
- If the system cannot find a rarity with minting capacity after several attempts, the user's points are refunded, and the mint request is marked as failed.

### Ensuring Rarity Caps:

- Each rarity has a predefined maximum supply (e.g., "Common" might have 100 tokens, while "Mythic" might have only 5 tokens). The contract tracks the number of minted tokens for each rarity to enforce these limits.

### Transparency:

- Users can view the status of their mint requests at any time, including the randomness used, the selected rarity, and the token metadata URI.

## **Additional Features**

1. **Mint Request Cancellation**:  
   Users can cancel a mint request if the entropy provider does not complete it within 24 hours. In such cases, the user’s points are refunded.

2. **Entropy-Based Randomness**:  
   The system leverages [Pyth](https://www.pyth.network/) an external entropy provider to generate randomness, ensuring that the rarity selection process is unbiased and unpredictable.

3. **Unique Metadata**:  
   Each minted NFT is assigned a unique metadata URI based on its rarity and token ID. For example, a token with ID 101 and rarity "Rare" might have the URI:  
   `ar://rare-folder/101.json`

4. **Refund on Failure**:  
   If the system cannot mint a token due to capacity constraints, the user’s points are fully refunded, maintaining fairness and user trust.

## **Key Benefits**

- **Fair Distribution**: Predefined probabilities and dynamic adjustments ensure that all users have a fair chance of receiving high-rarity tokens.
- **Rarity Preservation**: Maximum supply limits protect the exclusivity of rare NFTs.
- **User-Centric Design**: Features like point refunds and transparency tools enhance the user experience and build trust.

Through this carefully designed minting mechanism, the DerpyDragons ecosystem provides a fair, transparent, and engaging platform for NFT collectors and enthusiasts.

# DerpyDragons NFT Ecosystem: Token Contract and Royalty Mechanism

The DerpyDragons token contract is at the core of the ecosystem, facilitating the creation, ownership, and management of the NFT collection. Built on the **ERC721C** standard, it incorporates advanced functionality for programmable royalties and access control.

## **ERC721C and Basic Royalties**

### Why ERC721C?

The contract extends the **ERC721C** standard, a specialized implementation of ERC721 tailored for creators. This standard offers several enhancements over the traditional ERC721, including support for programmable royalties and efficient token management. The use of ERC721C ensures compatibility with existing platforms and marketplaces while adding advanced features that benefit creators and users alike.

### Basic Royalties

The contract leverages **BasicRoyalties**, a module that simplifies the process of implementing royalty payments for NFTs. Royalties ensure that creators or designated recipients earn a percentage of the sales revenue whenever an NFT is resold. This feature is particularly valuable in fostering long-term incentives for creators.

- **Default Royalties**:  
  The contract allows the owner to define a default royalty percentage (in basis points) and a recipient address. These settings apply to all tokens unless overridden for specific tokens.

- **Token-Specific Royalties**:  
  For greater flexibility, the contract also supports setting royalties for individual tokens. This is useful for adjusting royalties based on the value or significance of specific NFTs.

## **Core Functionalities**

### Minting Tokens

The minting process is tightly controlled through integration with the **DragonLair** contract. Only the DragonLair contract is authorized to call the mint function, ensuring that tokens are created in alignment with the broader ecosystem rules.

- **Token Count**:  
  The contract maintains a counter (`tokenCount`) that tracks the total number of minted tokens, ensuring each token has a unique identifier.

- **Metadata Assignment**:  
  Each minted token is assigned a unique URI, linking it to its metadata stored externally. The contract allows for emergency updates to metadata via the `setTokenURI` function, although this function is intended for exceptional cases only.

### Ownership and Access Control

The contract includes robust access control mechanisms through the **OwnableBasic** module, ensuring that only authorized entities can perform critical operations such as setting royalties or managing the DragonLair address.

### Royalty Management

The contract provides two primary functions for managing royalties:

1. **Set Default Royalties**:  
   Allows the contract owner to define default royalty settings for all tokens.
2. **Set Token-Specific Royalties**:  
   Enables customization of royalties for individual tokens.

### Compatibility and Transparency

The contract supports interface standards defined by **ERC165**, ensuring interoperability with platforms and tools. Users can query the contract to check its supported interfaces, providing transparency and trust.

## **Key Benefits**

1. **Enhanced Creator Rewards**:  
   The royalty mechanism ensures that creators continue to benefit from secondary sales, incentivizing their participation in the ecosystem.

2. **Secure and Controlled Minting**:  
   The integration with the DragonLair contract adds an additional layer of security and control over token creation.

3. **Flexibility and Customization**:  
   The ability to set both default and token-specific royalties offers unparalleled flexibility for managing the collection.

4. **Future-Proof Design**:  
   By leveraging ERC721C and supporting royalty standards like ERC2981, the contract is designed to remain compatible with evolving marketplace requirements.

Through these features, the DerpyDragons token contract establishes a robust foundation for the ecosystem, ensuring fairness, transparency, and sustainability for both creators and collectors.
