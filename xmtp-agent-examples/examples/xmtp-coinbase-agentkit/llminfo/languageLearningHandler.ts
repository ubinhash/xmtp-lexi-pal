import { createPublicClient, http, encodeFunctionData, keccak256, encodePacked, LocalAccount } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { baseSepolia, base } from "viem/chains";
import { CdpWalletProvider } from "@coinbase/agentkit";
import dotenv from "dotenv";

dotenv.config();

// Contract ABI for LanguageLearningGoal
const languageLearningGoalAbi = [
  {
    inputs: [{ name: "user", type: "address" }],
    name: "getActiveGoalId",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "user", type: "address" },
      { name: "word", type: "string" },
    ],
    name: "getWordProgress",
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "targetVocab", type: "uint256" },
      { name: "durationDays", type: "uint256" },
      { name: "difficulty", type: "uint8" },
    ],
    name: "createGoal",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [],
    name: "claimStake",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "goalId", type: "uint256" },
      { name: "word", type: "string" },
      { name: "signature", type: "bytes" },
    ],
    name: "updateProgress",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "goalId", type: "uint256" }],
    name: "goals",
    outputs: [
      { name: "user", type: "address" },
      { name: "targetVocab", type: "uint256" },
      { name: "stake", type: "uint256" },
      { name: "startTime", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "claimed", type: "bool" },
      { name: "learnedCount", type: "uint256" },
      { name: "difficulty", type: "uint8" }
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

export interface GoalInfo {
  user: `0x${string}`;
  targetVocab: bigint;
  stake: bigint;
  startTime: bigint;
  deadline: bigint;
  claimed: boolean;
  learnedCount: bigint;
  difficulty: number;
}

export class LanguageLearningHandler {
  private publicClient;
  private contractAddress: `0x${string}`;
  private walletProvider: CdpWalletProvider;
  private signerAccount: LocalAccount;
  private chainId: `0x${string}`;
  private networkId: string;

  constructor(contractAddress: string, walletProvider: CdpWalletProvider, chainId: `0x${string}`, networkId: string) {
    this.contractAddress = contractAddress as `0x${string}`;
    this.publicClient = createPublicClient({
      chain: networkId === "base-mainnet" ? base : baseSepolia,
      transport: http(),
    });
    this.walletProvider = walletProvider;
    this.chainId = chainId;
    this.networkId = networkId;

    // Initialize signer account from WALLET_KEY
    if (!process.env.WALLET_KEY) {
      throw new Error("WALLET_KEY environment variable is required");
    }
    this.signerAccount = privateKeyToAccount(process.env.WALLET_KEY as `0x${string}`);
  }

  /**
   * Get the active goal ID for a user
   */
  async getActiveGoalId(address: string): Promise<bigint> {
    return await this.publicClient.readContract({
      address: this.contractAddress,
      abi: languageLearningGoalAbi,
      functionName: "getActiveGoalId",
      args: [address as `0x${string}`],
    });
  }

  /**
   * Get the learning progress for a specific word
   */
  async getWordProgress(address: string, word: string): Promise<number> {
    return await this.publicClient.readContract({
      address: this.contractAddress,
      abi: languageLearningGoalAbi,
      functionName: "getWordProgress",
      args: [address as `0x${string}`, word],
    });
  }

  /**
   * Create a new language learning goal
   */
  createGoalCalls(
    fromAddress: string,
    targetVocab: number,
    durationDays: number,
    difficulty: number,
    stakeAmount: bigint,
  ) {
    return {
      version: "1.0",
      from: fromAddress as `0x${string}`,
      chainId: this.chainId,
      calls: [
        {
          to: this.contractAddress,
          data: encodeFunctionData({
            abi: languageLearningGoalAbi,
            functionName: "createGoal",
            args: [BigInt(targetVocab), BigInt(durationDays), difficulty],
          }),
          value: stakeAmount,
          metadata: {
            description: `Create language learning goal: ${targetVocab} words in ${durationDays} days (Difficulty: ${difficulty})`,
            transactionType: "createGoal",
            targetVocab,
            durationDays,
            difficulty,
            stakeAmount: stakeAmount.toString(),
          },
        },
      ],
    };
  }

  /**
   * Create calls for claiming stake
   */
  createClaimStakeCalls(fromAddress: string) {
    return {
      version: "1.0",
      from: fromAddress as `0x${string}`,
      chainId: this.chainId,
      calls: [
        {
          to: this.contractAddress,
          data: encodeFunctionData({
            abi: languageLearningGoalAbi,
            functionName: "claimStake",
            args: [],
          }),
          metadata: {
            description: "Claim stake from completed language learning goal",
            transactionType: "claimStake",
          },
        },
      ],
    };
  }

  /**
   * Update progress for a word using signature
   * @returns Object containing transaction hash and new progress level
   */
  async updateProgress(fromAddress: string, word: string): Promise<{ txHash: `0x${string}`, newProgress: number }> {
    const goalId = await this.getActiveGoalId(fromAddress);
    if (goalId === 0n) {
      throw new Error("No active goal found");
    }

    // Get current progress
    const currentProgress = await this.getWordProgress(fromAddress, word);
    const newProgress = currentProgress + 1;

    // Create the message hash in the same format as the contract
    const messageHash = keccak256(encodePacked(
      ["uint256", "string"],
      [goalId, word]
    ));

    // Sign the message locally
    const signature = await this.signerAccount.signMessage({
      message: { raw: messageHash },
    });

    // Execute the transaction with the signature
    const txHash = await this.walletProvider.sendTransaction({
      to: this.contractAddress,
      data: encodeFunctionData({
        abi: languageLearningGoalAbi,
        functionName: "updateProgress",
        args: [goalId, word, signature],
      }),
    });

    return { txHash, newProgress };
  }

  /**
   * Create calls for updating word progress
   */
  async createUpdateProgressCalls(fromAddress: string, word: string) {
    const goalId = await this.getActiveGoalId(fromAddress);
    if (goalId === 0n) {
      throw new Error("No active goal found");
    }

    // Create the message hash in the same format as the contract
    const messageHash = keccak256(encodePacked(
      ["uint256", "string"],
      [goalId, word]
    ));

    // Sign the message locally
    const signature = await this.signerAccount.signMessage({
      message: { raw: messageHash },
    });

    return {
      version: "1.0",
      from: fromAddress as `0x${string}`,
      chainId: this.chainId,
      calls: [
        {
          to: this.contractAddress,
          data: encodeFunctionData({
            abi: languageLearningGoalAbi,
            functionName: "updateProgress",
            args: [goalId, word, signature],
          }),
          metadata: {
            description: `Update progress for word "${word}"`,
            transactionType: "updateProgress",
            word,
            goalId: goalId.toString(),
          },
        },
      ],
    };
  }

  /**
   * Get information about a specific goal
   * @param goalId The ID of the goal to get information for
   * @returns Goal information including target vocabulary, duration, difficulty, etc.
   */
  async getGoalInfo(goalId: bigint): Promise<GoalInfo> {
    const goalInfo = await this.publicClient.readContract({
      address: this.contractAddress,
      abi: languageLearningGoalAbi,
      functionName: "goals",
      args: [goalId],
    });

    return {
      user: goalInfo[0],
      targetVocab: goalInfo[1],
      stake: goalInfo[2],
      startTime: goalInfo[3],
      deadline: goalInfo[4],
      claimed: goalInfo[5],
      learnedCount: goalInfo[6],
      difficulty: Number(goalInfo[7]),
    };
  }
} 