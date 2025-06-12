//TODO, more quiz modes for 1st 2nd 3rd attempt
//TODO AI shall explain the word first
//embed ? button for creating goal?
//get a list of learned word from the graph so that AI don't teach the same thing


import * as fs from "fs";
import {
  AgentKit,
  cdpApiActionProvider,
  cdpWalletActionProvider,
  CdpWalletProvider,
  erc20ActionProvider,
  walletActionProvider,
} from "@coinbase/agentkit";
import { getLangChainTools } from "@coinbase/agentkit-langchain";
import {
  createSigner,
  getEncryptionKeyFromHex,
  logAgentDetails,
  validateEnvironment,
} from "@helpers/client";
import { HumanMessage } from "@langchain/core/messages";
import { MemorySaver } from "@langchain/langgraph";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";
import {
  Client,
  type Conversation,
  type DecodedMessage,
  type XmtpEnv,
} from "@xmtp/node-sdk";
import { LanguageLearningHandler } from "./llminfo/languageLearningHandler";
import { ethers } from "ethers";
import { 
  ContentTypeWalletSendCalls,
  WalletSendCallsCodec,
  type WalletSendCallsParams 
} from "@xmtp/content-type-wallet-send-calls";
import { TransactionReferenceCodec } from "@xmtp/content-type-transaction-reference";
import { parseEther, toHex } from "viem";
import { encodeFunctionData } from "viem";
import { createPublicClient, http } from "viem";
import { base, baseSepolia } from "viem/chains";
import { VOCABULARY_WORDS, type VocabularyWord } from "./vocabulary";

const {
  WALLET_KEY,
  ENCRYPTION_KEY,
  XMTP_ENV,
  OPENAI_API_KEY,
  CDP_API_KEY_NAME,
  CDP_API_KEY_PRIVATE_KEY,
  NETWORK_ID,
  LANGUAGE_LEARNING_CONTRACT_ADDRESS,
} = validateEnvironment([
  "WALLET_KEY",
  "ENCRYPTION_KEY",
  "OPENAI_API_KEY",
  "XMTP_ENV",
  "CDP_API_KEY_NAME",
  "CDP_API_KEY_PRIVATE_KEY",
  "NETWORK_ID",
  "LANGUAGE_LEARNING_CONTRACT_ADDRESS",
]);

// Storage constants
const XMTP_STORAGE_DIR = ".data/xmtp";
const WALLET_STORAGE_DIR = ".data/wallet";

// Global stores for memory and agent instances
const memoryStore: Record<string, MemorySaver> = {};
const agentStore: Record<string, Agent> = {};
const languageLearningHandlers: Record<string, LanguageLearningHandler> = {};

interface AgentConfig {
  configurable: {
    thread_id: string;
  };
}

type Agent = ReturnType<typeof createReactAgent>;

// Store quiz state for each user
interface QuizState {
  currentWord: string;
  attempts: number;
  correctAnswers: number;
  multipleChoiceQuiz?: MultipleChoiceQuiz;
  start: boolean; // Tracks if user is in quiz mode
}

const quizStates: Record<string, QuizState> = {};

// Add this interface near the top of the file with other interfaces
interface QuizEvaluation {
  isCorrect: boolean;
  feedback: string;
  explanation: string;
}

const MASTERED_THRESHOLD = 3; // Define the mastered threshold
const FUNDING_THRESHOLD = 0.0005; // Define the minimum balance threshold in ETH

interface MultipleChoiceQuiz {
  word: string;
  correctMeaning: string;
  options: string[];
  correctOptionIndex: number;
}

// Network configuration type
type NetworkConfig = {
  chainId: `0x${string}`;
  networkId: string;
  networkName: string;
};

// Network configurations
const networks: Record<string, NetworkConfig> = {
  "base-mainnet": {
    chainId: toHex(8453),
    networkId: "base-mainnet",
    networkName: "Base Mainnet",
  },
  "base-sepolia": {
    chainId: toHex(84532),
    networkId: "base-sepolia",
    networkName: "Base Sepolia",
  },
};

// Get the current network configuration
const currentNetwork = networks[NETWORK_ID];
if (!currentNetwork) {
  throw new Error(`Invalid NETWORK_ID: ${NETWORK_ID}. Must be one of: ${Object.keys(networks).join(", ")}`);
}

/**
 * Ensure local storage directory exists
 */
function ensureLocalStorage() {
  if (!fs.existsSync(XMTP_STORAGE_DIR)) {
    fs.mkdirSync(XMTP_STORAGE_DIR, { recursive: true });
  }
  if (!fs.existsSync(WALLET_STORAGE_DIR)) {
    fs.mkdirSync(WALLET_STORAGE_DIR, { recursive: true });
  }
}

/**
 * Save wallet data to storage.
 *
 * @param userId - The unique identifier for the user
 * @param walletData - The wallet data to be saved
 */
function saveWalletData(userId: string, walletData: string) {
  const localFilePath = `${WALLET_STORAGE_DIR}/${userId}.json`;
  try {
    if (!fs.existsSync(localFilePath)) {
      console.log(`Wallet data saved for user ${userId}`);
      fs.writeFileSync(localFilePath, walletData);
    }
  } catch (error) {
    console.error(`Failed to save wallet data to file: ${error as string}`);
  }
}

/**
 * Get wallet data from storage.
 *
 * @param userId - The unique identifier for the user
 * @returns The wallet data as a string, or null if not found
 */
function getWalletData(userId: string): string | null {
  const localFilePath = `${WALLET_STORAGE_DIR}/${userId}.json`;
  try {
    if (fs.existsSync(localFilePath)) {
      return fs.readFileSync(localFilePath, "utf8");
    }
  } catch (error) {
    console.warn(`Could not read wallet data from file: ${error as string}`);
  }
  return null;
}

/**
 * Check wallet balance
 * @param address - The wallet address to check
 * @returns The balance in ETH as a string
 */
async function checkWalletBalance(address: string): Promise<string> {
  const publicClient = createPublicClient({
    chain: currentNetwork.networkId === "base-mainnet" ? base : baseSepolia,
    transport: http(),
  });

  const balance = await publicClient.getBalance({ address: address as `0x${string}` });
  return ethers.formatEther(balance);
}

/**
 * Initialize the XMTP client.
 *
 * @returns An initialized XMTP Client instance
 */
async function initializeXmtpClient() {
  const signer = createSigner(WALLET_KEY);
  const dbEncryptionKey = getEncryptionKeyFromHex(ENCRYPTION_KEY);

  const identifier = await signer.getIdentifier();
  const address = identifier.identifier;

  const client = await Client.create(signer, {
    dbEncryptionKey,
    env: XMTP_ENV as XmtpEnv,
    dbPath: XMTP_STORAGE_DIR + `/${XMTP_ENV}-${address}`,
    codecs: [new WalletSendCallsCodec(), new TransactionReferenceCodec()],
  });

  void logAgentDetails(client);

  /* Sync the conversations from the network to update the local db */
  console.log("✓ Syncing conversations...");
  await client.conversations.sync();

  return client;
}

/**
 * Initialize the agent with CDP Agentkit.
 *
 * @param userId - The unique identifier for the user
 * @returns The initialized agent and its configuration
 */
async function initializeAgent(
  userId: string,
): Promise<{ agent: Agent; config: AgentConfig; walletProvider: CdpWalletProvider }> {
  try {
    console.log("OpenAI API Key:", process.env.OPENAI_API_KEY);
    console.log("CDP API KEY NAME:", CDP_API_KEY_NAME);
    console.log("CDP API Key:", CDP_API_KEY_PRIVATE_KEY.replace(/\\n/g, "\n"));
    console.log("OpenAI API Key:", process.env.NETWORK_ID);
    const llm = new ChatOpenAI({
      // openAIApiKey: "",
      model: "gpt-4.1-mini",
    });

    const storedWalletData = getWalletData(userId);
    console.log(
      `Wallet data for ${userId}: ${storedWalletData ? "Found" : "Not found"}`,
    );

    const config = {
      apiKeyName: CDP_API_KEY_NAME,
      apiKeyPrivateKey: CDP_API_KEY_PRIVATE_KEY.replace(/\\n/g, "\n"),
      cdpWalletData: storedWalletData || undefined,
      networkId: NETWORK_ID || "base-sepolia",
    };

    const walletProvider = await CdpWalletProvider.configureWithWallet(config);
    const address = await walletProvider.getAddress();
    console.log(`Smart wallet address for ${userId}: ${address}`);

    // Initialize language learning handler with wallet provider
    languageLearningHandlers[userId] = new LanguageLearningHandler(
      LANGUAGE_LEARNING_CONTRACT_ADDRESS,
      walletProvider,
      currentNetwork.chainId,
      currentNetwork.networkId,
    );

    const agentkit = await AgentKit.from({
      walletProvider,
      actionProviders: [
        walletActionProvider(),
        erc20ActionProvider(),
        cdpApiActionProvider({
          apiKeyName: CDP_API_KEY_NAME,
          apiKeyPrivateKey: CDP_API_KEY_PRIVATE_KEY.replace(/\\n/g, "\n"),
        }),
        cdpWalletActionProvider({
          apiKeyName: CDP_API_KEY_NAME,
          apiKeyPrivateKey: CDP_API_KEY_PRIVATE_KEY.replace(/\\n/g, "\n"),
        }),
      ],
    });

    const tools = await getLangChainTools(agentkit);

    memoryStore[userId] = new MemorySaver();

    const agentConfig: AgentConfig = {
      configurable: { thread_id: userId },
    };

    const agent = createReactAgent({
      llm,
      tools,
      checkpointSaver: memoryStore[userId],
      messageModifier: `
        You are a Language Learning Assistant that helps users learn new vocabulary words.
        You can interact with the blockchain using Coinbase Developer Platform AgentKit.

        When a user interacts with you:
        1. Remind user to create a goal first using the /goal command, they can either specify the number of words to learn, duration, stake, and difficulty, or just describe their goal following the format /goal <description> and you will suggest parameters based on their goal.
        2. You can help them learn new words through interactive quizzes
        3. Behave like a friend,not a teacher and make encouragments.
        4. You can encourage them to complete their goals
        5. Request user to fund the bot wallet before learning if the user's balance is less than 0.0001 ETH, ask them to use /botfund command
        6. If user want to check their goal progress, tell them to use /checkgoal command
        7. If the user wonder what command they can use, tell them about the /checkgoal command for checking goal, /quiz command for quiz, /progress command for checking progress, /learn command for learning new words, /botfund command for funding the bot wallet, /goal command for creating a new goal.

        IMPORTANT:
        - Users need to have an active goal to start learning words
        - Users need to learn each word 3 times to master it
        - You can help them learn words by asking them to define them
        - You can check their progress on specific words
        - You can encourage them to keep learning and practicing
        - If user request to fund the bot wallet, you transfer your own wallet balance to their wallet given

        Be encouraging and helpful in all your interactions. Focus on helping users learn and master new words.
      `,
    });

    agentStore[userId] = agent;

    const exportedWallet = await walletProvider.exportWallet();
    const walletDataJson = JSON.stringify(exportedWallet);
    saveWalletData(userId, walletDataJson);

    return { agent, config: agentConfig, walletProvider };
  } catch (error) {
    console.error("Failed to initialize agent:", error);
    throw error;
  }
}

/**
 * Process a message with the agent.
 *
 * @param agent - The agent instance to process the message
 * @param config - The agent configuration
 * @param message - The message to process
 * @returns The processed response as a string
 */
async function processMessage(
  agent: Agent,
  config: AgentConfig,
  message: string,
): Promise<string> {
  let response = "";

  try {
    const stream = await agent.stream(
      { messages: [new HumanMessage(message)] },
      config,
    );

    for await (const chunk of stream) {
      if (chunk && typeof chunk === "object" && "agent" in chunk) {
        const agentChunk = chunk as {
          agent: { messages: Array<{ content: unknown }> };
        };
        response += String(agentChunk.agent.messages[0].content) + "\n";
      }
    }

    return response.trim();
  } catch (error) {
    console.error("Error processing message:", error);
    return "Sorry, I encountered an error while processing your request. Please try again later.";
  }
}

/**
 * Evaluate a user's answer for a vocabulary word using AI
 */
async function evaluateAnswer(
  agent: Agent,
  config: AgentConfig,
  word: string,
  correctMeaning: string,
  userAnswer: string,
): Promise<QuizEvaluation> {
  const evaluationPrompt = `You are evaluating a language learning quiz answer.
Word: "${word}"
Correct meaning: "${correctMeaning}"
Student's answer: "${userAnswer}"

Evaluate if the student's answer is correct. Consider:
1. If the meaning is semantically equivalent
2. If the explanation is clear and accurate
3. If there are any misconceptions
4. If the user simply repeat the word itself, mark it is incorrect and ask them to explain further
5. Mark the answer as incorrect if the student's answer is a direct copy or very close paraphrase of the "Correct meaning" provided. Encourage them to explain in their own words.

Respond with a JSON object:
{
  "isCorrect": boolean,
  "feedback": string,
  "explanation": string
}`;

  try {
    const evaluationResponse = await processMessage(agent, config, evaluationPrompt);
    const evaluation = JSON.parse(evaluationResponse) as QuizEvaluation;
    return evaluation;
  } catch (error) {
    console.error("Failed to evaluate answer:", error);
    return {
      isCorrect: false,
      feedback: "Could not evaluate answer",
      explanation: "Please try again",
    };
  }
}

/**
 * Evaluate if a user has correctly used a word in a sentence using AI
 */
async function evaluateSentenceUsage(
  agent: Agent,
  config: AgentConfig,
  word: string,
  userSentence: string,
): Promise<QuizEvaluation> {
  const evaluationPrompt = `You are evaluating a language learning quiz answer where the student needs to use a given word in a sentence.
Word: "${word}"
Student's sentence: "${userSentence}"

Evaluate if the student's sentence uses the word correctly. Consider:
1. Is the sentence grammatically correct?
2. Is the word used in a semantically appropriate context?
3. Does the sentence demonstrate understanding of the word's meaning?
4. Is the word spelled correctly in the sentence?
5. Avoid marking it correct if the sentence is too simplistic, doesn't demonstrate understanding, or simply states "I used [word] in a sentence."

Respond with a JSON object:
{
  "isCorrect": boolean,
  "feedback": string,
  "explanation": string
}`;

  try {
    const evaluationResponse = await processMessage(agent, config, evaluationPrompt);
    const evaluation = JSON.parse(evaluationResponse) as QuizEvaluation;
    return evaluation;
  } catch (error) {
    console.error("Failed to evaluate sentence usage:", error);
    return {
      isCorrect: false,
      feedback: "Could not evaluate your sentence",
      explanation: "Please try again",
    };
  }
}

async function handleProgressUpdate(
  conversation: Conversation,
  handler: LanguageLearningHandler,
  userAddress: string,
  word: string
): Promise<{ newProgress: number; isMastered: boolean } | null> {
  try {
    const { txHash, newProgress } = await handler.updateProgress(userAddress, word);
    const isMastered = newProgress >= MASTERED_THRESHOLD;
    if(isMastered){
      await conversation.send(`🎉 Congratulations! You've mastered the word "${word}"! \n Transaction: ${txHash}`);
    }
    else{
      await conversation.send(
        `Great job! Your progress for "${word}" has been updated to level ${newProgress}/${MASTERED_THRESHOLD}. \n Type /quiz again to level up further. \n Transaction: ${txHash}`
      );
    }
    return { newProgress, isMastered };
  } catch (error) {
    console.error("Error updating progress:", error);
    await conversation.send(
      "Sorry, I couldn't update your progress. Please make sure you have an active goal and the word is correct."
    );
    return null;
  }
}

// Update getUnlearnedWords to filter by difficulty
async function getUnlearnedWords(userAddress: string, handler: LanguageLearningHandler, goalDifficulty: number): Promise<typeof VOCABULARY_WORDS> {
  try {
    const learnedWords = await handler.getVocabProgress(userAddress);
    const learnedWordSet = new Set(learnedWords.map(w => w.word));
    return VOCABULARY_WORDS.filter(word => 
      !learnedWordSet.has(word.word) && word.difficulty == goalDifficulty
    );
  } catch (error) {
    console.error('Error getting learned words:', error);
    return VOCABULARY_WORDS.filter(word => word.difficulty == goalDifficulty);
  }
}

/**
 * Handle incoming XMTP messages.
 *
 * @param message - The decoded XMTP message
 * @param client - The XMTP client instance
 */
async function handleMessage(message: DecodedMessage, client: Client) {
  let conversation: Conversation | null = null;
  try {
    const senderAddress = message.senderInboxId;
    const botAddress = client.inboxId.toLowerCase();

    // Ignore messages from the bot itself
    if (senderAddress.toLowerCase() === botAddress) {
      return;
    }

    console.log(
      `Received message from ${senderAddress}: ${message.content as string}`,
    );

    const { agent, config, walletProvider } = await initializeAgent(senderAddress);
    const handler = languageLearningHandlers[senderAddress];

    // Get the user's address from their inbox ID
    const inboxState = await client.preferences.inboxStateFromInboxIds([
      senderAddress,
    ]);
    const userAddress = inboxState[0].identifiers[0].identifier;

    // Get the conversation first
    const foundConversation = await client.conversations.getConversationById(
      message.conversationId,
    );
    if (!foundConversation) {
      throw new Error(
        `Could not find conversation for ID: ${message.conversationId}`,
      );
    }

    console.log(message.conversationId)
    conversation = foundConversation as Conversation;

    // Check if the message is a command
    const content = String(message.content);
    
    if (content.startsWith("/progress")) {
      const [_, word] = content.split(" ");
      if (!word) {
        await conversation.send("Please provide a word: /progress <word>");
        return;
      }

      const progress = await handler.getWordProgress(userAddress, word);
      const activeGoalId = await handler.getActiveGoalId(userAddress);

      if (activeGoalId === 0n) {
        await conversation.send("You don't have an active goal. Please create one first!");
        return;
      }

      await conversation.send(
        `Progress for word "${word}": ${progress}/3\nActive Goal ID: ${activeGoalId}`,
      );
      return;
    }

    if (content.startsWith("/checkgoal")) {
      try {
        const goalId = await handler.getActiveGoalId(userAddress);
        if (goalId === 0n) {
          await conversation.send("You don't have an active goal. Use /goal <description> to start a new goal!");
          return;
        }

        const goalInfo = await handler.getGoalInfo(goalId);
        const startDate = new Date(Number(goalInfo.startTime) * 1000);
        const endDate = new Date(Number(goalInfo.deadline) * 1000);
        const daysLeft = Math.max(0, Math.ceil((endDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));

        const message = `📚 Goal ID: #${goalId}
        🎯 Target: ${goalInfo.targetVocab} words
        ⏱️ Duration: ${Math.ceil((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000))} days
        📅 Started: ${startDate.toLocaleDateString()}
        ⏳ Days left: ${daysLeft}
        📊 Progress: ${goalInfo.learnedCount}/${goalInfo.targetVocab} words learned
        💪 Difficulty: ${goalInfo.difficulty}/5
        💰 Stake: ${ethers.formatEther(goalInfo.stake)} ETH
        ${goalInfo.claimed ? '✅ Completed and claimed!' : '🚀 In progress...'}`;

        await conversation.send(message);
      } catch (error) {
        console.error("Error getting goal info:", error);
        await conversation.send("Sorry, I couldn't retrieve your goal information. Please try again later.");
      }
      return;
    }

    if (content.startsWith("/learn")) {
      const [_, word] = content.split(" ");
      const activeGoalId = await handler.getActiveGoalId(userAddress);
      if (activeGoalId === 0n) {
        await conversation.send("You don't have an active goal. Please create one first!");
        return;
      }

      // If user is already learning a word, show its definition
      if (quizStates[senderAddress]) {
        const currentWord = quizStates[senderAddress].currentWord;
        const wordInfo = VOCABULARY_WORDS.find(w => w.word === currentWord);
        if (wordInfo) {
          await conversation.send(
            `You're currently learning the word "${currentWord}".\n\nDefinition: ${wordInfo.meaning}\n\nType /quiz to start the quiz or /skip to try another word.`
          );
          return;
        }
      }

      // If a specific word is provided
      if (word) {
        const wordInfo = VOCABULARY_WORDS.find(w => w.word.toLowerCase() === word.toLowerCase());
        if (!wordInfo) {
          await conversation.send(`Word "${word}" not found in vocabulary. Available words: ${VOCABULARY_WORDS.map(w => w.word).join(", ")}`);
          return;
        }
        
        // Initialize quiz state with the specified word
        quizStates[senderAddress] = {
          currentWord: wordInfo.word,
          attempts: 0,
          correctAnswers: 0,
          start: false // Quiz not started yet, just learning
        };

        await conversation.send(
          `Let's learn the word "${wordInfo.word}"!\n\nDefinition: ${wordInfo.meaning}\n\nType /quiz to start the quiz or /skip to try another word.`
        );
        return;
      }

      // If no word specified, select a random unlearned word
      const goalInfo = await handler.getGoalInfo(activeGoalId);
      const unlearnedWords = await getUnlearnedWords(userAddress, handler, Number(goalInfo.difficulty));
      
      if (unlearnedWords.length === 0) {
        await conversation.send("Congratulations! You've learned all the available words. We'll add more words soon!");
        return;
      }

      const randomIndex = Math.floor(Math.random() * unlearnedWords.length);
      const selectedWord = unlearnedWords[randomIndex];
      
      // Initialize quiz state
      quizStates[senderAddress] = {
        currentWord: selectedWord.word,
        attempts: 0,
        correctAnswers: 0,
        start: false // Quiz not started yet, just learning
      };

      await conversation.send(
        `Let's learn the word "${selectedWord.word}"!\n\nDefinition: ${selectedWord.meaning}\n\nType /quiz to start the quiz or /skip to try another word.`
      );
      return;
    }

    if (content.startsWith("/skip")) {
      delete quizStates[senderAddress];
      await conversation.send("Let's try another word. Type /learn to start learning a new word!");
      return;
    }

    if (content.startsWith("/quiz")) {
      const [_, word] = content.split(" ");
      
      // Check wallet balance first
      const smartWalletAddress = await walletProvider.getAddress();
      const balance = await checkWalletBalance(smartWalletAddress);
      const balanceInEth = parseFloat(balance);
      console.log(balanceInEth,"balanceInEth")
      if (balanceInEth < FUNDING_THRESHOLD) {
        await conversation.send("To ensure bot can help track your progress on chain, you need to fund your bot wallet first! Type /botfund to fund your wallet.");
        return;
      }

      // If a specific word is provided
      if (word) {
        const wordInfo = VOCABULARY_WORDS.find(w => w.word.toLowerCase() === word.toLowerCase());
        if (!wordInfo) {
          await conversation.send(`Word "${word}" not found in vocabulary. Type /learn to see available words.`);
          return;
        }
        
        // Initialize quiz state with the specified word
        quizStates[senderAddress] = {
          currentWord: wordInfo.word,
          attempts: 0,
          correctAnswers: 0,
          start: true // Starting quiz mode immediately
        };
      } else {
        // If no word specified, check if there's an active quiz
        if (!quizStates[senderAddress]) {
          await conversation.send("You need to learn a word first! Type /learn to start or /quiz <word> to quiz on a specific word.");
          return;
        }
        
        // Set quiz mode to started
        quizStates[senderAddress].start = true;
      }

      const { currentWord } = quizStates[senderAddress];
      const wordInfo = VOCABULARY_WORDS.find(w => w.word === currentWord);
      if (!wordInfo) {
        await conversation.send("Error: Word not found. Type /learn to start over.");
        return;
      }

      // Get current progress
      const progress = await handler.getWordProgress(userAddress, currentWord);

      // Start appropriate quiz based on progress
      switch (progress) {
        case 0:
          // Quiz 1: Explain the word
          await conversation.send(
            `Quiz 1: What does the word "${currentWord}" mean?\n\nType your answer or /skip to try another word.`
          );
          break;
        case 1:
          // Quiz 2: Use the word in a sentence
          await conversation.send(
            `Quiz 2: Now, use the word "${currentWord}" in a sentence.\n\nType your sentence or /skip to try another word.`
          );
          break;
        case 2:
          // Quiz 3: Multiple-choice quiz
          const quiz = await generateMultipleChoiceQuiz(agent, config, currentWord, wordInfo.meaning);
          // Store the quiz in the quiz state for later evaluation
          quizStates[senderAddress].multipleChoiceQuiz = quiz;
          const optionsText = quiz.options.map((opt, i) => `${String.fromCharCode(65 + i)}. ${opt}`).join('\n');
          await conversation.send(
            `Quiz 3: What is the meaning of the word "${currentWord}"?\n\n${optionsText}\n\nType the letter of your answer (A, B, C, or D) or /skip to try another word.`
          );
          break;
        default:
          await conversation.send(
            `You've already mastered the word "${currentWord}"! Type /learn to start learning a new word.`
          );
          delete quizStates[senderAddress];
          return;
      }
      return;
    }

    if (content.startsWith("/update")) {
      const word = content.split(" ")[1];
      if (!word) {
        await conversation.send("Please specify a word to update progress for. Usage: /update <word>");
        return;
      }
      await handleProgressUpdate(conversation, handler, userAddress, word);
      return;
    }

    if (content.startsWith("/goal")) {
      const parts = content.split(" ");
      const isAISuggested = parts.length > 4 || (parts.length === 2 && !/^\d+$/.test(parts[1])); // Check if it's just "/create" or "/create" with text

      if (isAISuggested) {
        // Get the description from the message
        const description = content.replace("/goal", "").trim();
        if (!description) {
          await conversation.send(
            "Please provide a goal description or parameters:\n" +
            "1. /goal <description> - I'll suggest parameters based on your goal\n" +
            "2. /goal <target_vocab> <duration_days> <stake_in_eth> [difficulty] - Create goal with specific parameters"
          );
          return;
        }
        
        // Use the agent to suggest goal parameters
        const suggestionPrompt = `Based on this language learning goal description: "${description}"
        Suggest appropriate parameters for:
        1. Number of words to learn (targetVocab), if not specified suggest 10 words.
        2. Duration in days, should be less than 30 days even if user ask for longer duration. If user did not specify duration, suggest based on targetVocab and how much time user can spend on learning.
        3. Stake amount in ETH (considering difficulty and user preference)
        4. Difficulty level (1-5)

        Respond with a JSON object:
        {
          "targetVocab": number,
          "durationDays": number,
          "stake": string,
          "difficulty": number,
          "explanation": string
        }`;

        const suggestionResponse = await processMessage(agent, config, suggestionPrompt);
        const suggestion = JSON.parse(suggestionResponse);

        // Send the suggestion to the user
        await conversation.send(
          `Based on your goal, I suggest:\n` +
          `- Target: ${suggestion.targetVocab} words\n` +
          `- Duration: ${suggestion.durationDays} days\n` +
          `- Stake: ${suggestion.stake} ETH\n` +
          `- Difficulty: ${suggestion.difficulty}/5\n\n` +
          `${suggestion.explanation}\n\n` +
          `To create this goal, confirm the transaction below:\n` +
          `/goal ${suggestion.targetVocab} ${suggestion.durationDays} ${suggestion.stake} ${suggestion.difficulty}`
        );
        await sendCreateGoalTransaction(
          conversation,
          userAddress,
          suggestion.targetVocab,
          ethers.parseEther(suggestion.stake),
          suggestion.durationDays,
          suggestion.stake,
          suggestion.difficulty
        );
        return;
      }

      // Handle manual input
      const [_, targetVocab, durationDays, stake, difficulty] = parts;
      
      if (!targetVocab || !durationDays || !stake) {
        await conversation.send(
          "Please provide all required parameters: /goal <target_vocab> <duration_days> <stake_in_eth> [difficulty]\n" +
          "Or just describe your goal and I'll suggest parameters: /goal <description>"
        );
        return;
      }

      // Check for active goal first
      const activeGoalId = await handler.getActiveGoalId(userAddress);
      if (activeGoalId !== 0n) {
        const goalInfo = await handler.getGoalInfo(activeGoalId);
        const endDate = new Date(Number(goalInfo.deadline) * 1000);
        const daysLeft = Math.max(0, Math.ceil((endDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
        
        await conversation.send(
          `You already have an active goal!\n\n` +
          `Current Goal:\n` +
          `- Target: ${goalInfo.targetVocab} words\n` +
          `- Progress: ${goalInfo.learnedCount}/${goalInfo.targetVocab} words\n` +
          `- Days left: ${daysLeft}\n` +
          `- Stake: ${ethers.formatEther(goalInfo.stake)} ETH\n\n` +
          `Please complete your current goal before creating a new one.`
        );
        return;
      }

      const stakeAmount = ethers.parseEther(stake);
      const targetVocabNum = parseInt(targetVocab);
      const durationDaysNum = parseInt(durationDays);
      const difficultyNum = difficulty ? parseInt(difficulty) : 1;

      await sendCreateGoalTransaction(
        conversation,
        userAddress,
        targetVocabNum,
        stakeAmount,
        durationDaysNum,
        stake,
        difficultyNum
      );
      return;
    }

    if (content.startsWith("/botfund")) {
      try {
        const smartWalletAddress = await walletProvider.getAddress();
        const balance = await checkWalletBalance(smartWalletAddress);
        const balanceInEth = parseFloat(balance);
        
        await conversation.send(
          `💰 Smart Wallet Balance:\nAddress: ${smartWalletAddress}\nBalance: ${balance} ETH`
        );

        if (balanceInEth < FUNDING_THRESHOLD) {
          await requestFundTransaction(
            conversation,
            userAddress,
            smartWalletAddress,
            ethers.parseEther("0.0005")
          );
        }
      } catch (error) {
        console.error("Error checking wallet balance:", error);
        await conversation.send("Sorry, I couldn't check your wallet balance. Please try again later.");
      }
      return;
    }

    if (content.startsWith("/claim")) {
      try {
        const activeGoalId = await handler.getActiveGoalId(userAddress);
        if (activeGoalId === 0n) {
          await conversation.send("You don't have an active goal to claim. Create a goal first using /goal <description> command!");
          return;
        }

        const goalInfo = await handler.getGoalInfo(activeGoalId);
        const endDate = new Date(Number(goalInfo.deadline) * 1000);
        const now = new Date();
        const isDeadlinePassed = now >= endDate;
        const isGoalCompleted = goalInfo.learnedCount >= goalInfo.targetVocab;

        // Check if already claimed
        if (goalInfo.claimed) {
          await conversation.send("You have already claimed the stake for this goal!");
          return;
        }

        // Check if either condition is met
        if (!isGoalCompleted && !isDeadlinePassed) {
          const daysLeft = Math.ceil((endDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
          await conversation.send(
            `Your goal is not ready to claim yet!\n` +
            `Progress: ${goalInfo.learnedCount}/${goalInfo.targetVocab} words\n` +
            `Days left: ${daysLeft}\n\n` +
            `You can claim your stake when either:\n` +
            `1. You complete all ${goalInfo.targetVocab} words, or\n` +
            `2. The deadline (${endDate.toLocaleDateString()}) has passed`
          );
          return;
        }

        // Create and send the claim transaction
        const walletSendCalls = await handler.createClaimStakeCalls(activeGoalId.toString());
        console.log(walletSendCalls,"walletSendCalls")
        await conversation.send(walletSendCalls, ContentTypeWalletSendCalls);
        
      } catch (error) {
        console.error("Error claiming stake:", error);
        await conversation.send("Sorry, I couldn't process your claim request. Please try again later.");
      }
      return;
    }

    // Handle quiz answers only if a quiz is active
    if (quizStates[senderAddress] && quizStates[senderAddress].start) {
      const { currentWord, multipleChoiceQuiz } = quizStates[senderAddress];
      const wordInfo = VOCABULARY_WORDS.find(w => w.word === currentWord);
      if (!wordInfo) {
        await conversation.send("Error: Word not found. Type /learn to start over.");
        return;
      }

      const progress = await handler.getWordProgress(userAddress, currentWord);
      
      // Determine which quiz evaluation to use based on progress
      let evaluation: QuizEvaluation;
      if (progress === 0) {
        evaluation = await evaluateAnswer(agent, config, currentWord, wordInfo.meaning, content);
      } else if (progress === 1) {
        evaluation = await evaluateSentenceUsage(agent, config, currentWord, content);
      } else if (progress === 2 && multipleChoiceQuiz) {
        // Quiz 3: Multiple-choice evaluation
        const userAnswer = content.toUpperCase();
        const correctAnswer = String.fromCharCode(65 + multipleChoiceQuiz.correctOptionIndex);
        evaluation = {
          isCorrect: userAnswer === correctAnswer,
          feedback: userAnswer === correctAnswer ? "Correct!" : "Incorrect.",
          explanation: userAnswer === correctAnswer
            ? `You correctly identified the meaning of "${currentWord}".`
            : `The correct answer is ${correctAnswer}. The meaning of "${currentWord}" is: "${multipleChoiceQuiz.correctMeaning}".`,
        };
      } else {
        // This should not happen, but just in case
        evaluation = {
          isCorrect: false,
          feedback: "Error: Quiz state is invalid.",
          explanation: "Please type /learn to start over.",
        };
      }
   

      if (evaluation.isCorrect) {
        // Call handleProgressUpdate and check if the word was mastered
        quizStates[senderAddress].start = false;
        const updateResult = await handleProgressUpdate(conversation, handler, userAddress, currentWord);
        if (updateResult && updateResult.isMastered) {
  
          delete quizStates[senderAddress]; // Only delete if mastered
        }
      } else {
        await conversation.send(
          `${evaluation.feedback}\n\n${evaluation.explanation}\n\nTry again or type /skip to return exit quiz mode to talk to the agent.`
        );
      }
      return;
    }

    // If not a command or quiz, process with the agent
    const response = await processMessage(agent, config, content);
    await conversation.send(response);
    console.debug(`Sent response to ${senderAddress}: ${response}`);
  } catch (error) {
    console.error("Error handling message:", error);
    if (conversation) {
      await conversation.send(
        "I encountered an error while processing your request. Please try again later.",
      );
    }
  }
}

/**
 * Start listening for XMTP messages.
 *
 * @param client - The XMTP client instance
 */
async function startMessageListener(client: Client) {
  console.log("Starting message listener...");
  const stream = await client.conversations.streamAllMessages();
  for await (const message of stream) {
    if (message) {
      await handleMessage(message, client);
    }
  }
}

/**
 * Generate a multiple-choice quiz for a given word using AI
 */
async function generateMultipleChoiceQuiz(
  agent: Agent,
  config: AgentConfig,
  word: string,
  correctMeaning: string,
): Promise<MultipleChoiceQuiz> {
  const quizPrompt = `Generate a multiple-choice quiz for the word "${word}".
Correct meaning: "${correctMeaning}"

Generate a multiple-choice quiz with 4 options:
1. A rephrased version of the correct meaning (DO NOT use the exact same wording as the correct meaning)
2. Three plausible but incorrect meanings (distractors) that are related to the word's meaning or context but clearly wrong.

The distractors should be:
- Semantically related to the word's meaning
- Grammatically correct
- Plausible enough to be tempting
- Clearly incorrect upon closer inspection

Respond with a JSON object:
{
  "word": "${word}",
  "correctMeaning": "${correctMeaning}",
  "options": [
    "rephrased correct meaning",
    "distractor1",
    "distractor2",
    "distractor3"
  ]
}

Note: The rephrased correct meaning should be the first option.`;

  try {
    const quizResponse = await processMessage(agent, config, quizPrompt);
    const quiz = JSON.parse(quizResponse) as Omit<MultipleChoiceQuiz, 'correctOptionIndex'>;
    
    // Shuffle the options array
    const shuffledOptions = [...quiz.options];
    for (let i = shuffledOptions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledOptions[i], shuffledOptions[j]] = [shuffledOptions[j], shuffledOptions[i]];
    }

    // Find the new index of the correct answer
    const correctOptionIndex = shuffledOptions.indexOf(quiz.options[0]);

    return {
      word: quiz.word,
      correctMeaning: quiz.correctMeaning,
      options: shuffledOptions,
      correctOptionIndex,
    };
  } catch (error) {
    console.error("Failed to generate multiple-choice quiz:", error);
    // Fallback to a simple quiz if generation fails
    const fallbackOptions = [
      "A different way to say the correct meaning",
      "Option B",
      "Option C",
      "Option D"
    ];
    
    // Shuffle fallback options
    for (let i = fallbackOptions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [fallbackOptions[i], fallbackOptions[j]] = [fallbackOptions[j], fallbackOptions[i]];
    }

    return {
      word,
      correctMeaning,
      options: fallbackOptions,
      correctOptionIndex: 0, // In fallback, correct answer is always first option
    };
  }
}

// Function to create a transaction suggestion for creating a goal
async function sendCreateGoalTransaction(
  conversation: Conversation,
  userAddress: string,
  targetVocab: number,
  stake: bigint,
  durationDays: number,
  stakeEth: string, // Original ETH amount
  difficulty: number = 1 // Default difficulty to 1 if not specified
) {
  const walletSendCalls: WalletSendCallsParams = {
    version: "1.0",
    from: userAddress as `0x${string}`,
    chainId: currentNetwork.chainId,
    calls: [
      {
        to: LANGUAGE_LEARNING_CONTRACT_ADDRESS as `0x${string}`,
        data: encodeFunctionData({
          abi: [
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
          ],
          functionName: "createGoal",
          args: [BigInt(targetVocab), BigInt(durationDays), difficulty],
        }),
        value: toHex(BigInt(stake)),
        metadata: {
          description: `Create a language learning goal: ${targetVocab} words in ${durationDays} days with ${stakeEth} ETH stake (Difficulty: ${difficulty}/5)`,
          transactionType: "create_goal",
          stake: stakeEth,
          networkId: currentNetwork.networkId,
          networkName: currentNetwork.networkName,
        },
      },
    ],
  };

  await conversation.send(walletSendCalls, ContentTypeWalletSendCalls);
}

/**
 * Request a fund transaction to send ETH to a wallet
 * @param conversation - The XMTP conversation
 * @param fromAddress - The sender's address
 * @param toWallet - The recipient's wallet address
 * @param fund - The amount to send in wei
 */
async function requestFundTransaction(
  conversation: Conversation,
  fromAddress: string,
  toWallet: string,
  fund: bigint
) {
  const walletSendCalls: WalletSendCallsParams = {
    version: "1.0",
    from: fromAddress as `0x${string}`,
    chainId: currentNetwork.chainId,
    calls: [
      {
        to: toWallet as `0x${string}`,
        data: "0x", // Empty data for simple ETH transfer
        value: toHex(fund),
        metadata: {
          description: `Fund Bot Wallet:${toWallet} with some gas (${ethers.formatEther(fund)} ETH) `,
          transactionType: "send_eth",
          amount: ethers.formatEther(fund),
          networkId: currentNetwork.networkId,
          networkName: currentNetwork.networkName,
        },
      },
    ],
  };

  await conversation.send(walletSendCalls, ContentTypeWalletSendCalls);
}

/**
 * Main function to start the chatbot.
 */
async function main(): Promise<void> {
  console.log("Initializing Agent on XMTP...");

  ensureLocalStorage();

  const xmtpClient = await initializeXmtpClient();
  await startMessageListener(xmtpClient);
}

// Start the chatbot
main().catch(console.error);
