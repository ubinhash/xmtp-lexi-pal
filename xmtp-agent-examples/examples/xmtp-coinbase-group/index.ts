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
const agentStore: Record<string, { agent: Agent; config: AgentConfig; walletProvider: CdpWalletProvider }> = {};
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
const FUNDING_THRESHOLD = 0.00005; // Define the minimum balance threshold in ETH

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
        1. Remind the user that you are just a language learning assistant, you are not a teacher.
        2. Player can access the quiz by typing /quiz, there's no on-chain action for group chat yet.

        IMPORTANT:
        - Be friendly and helpful in all your interactions.
        - Encourage the user to learn new words and master them.

        Be encouraging and helpful in all your interactions. Focus on helping users learn and master new words.
      `,
    });

    agentStore[userId] = { agent, config: agentConfig, walletProvider };

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
    const conversationId = message.conversationId;
    console.log(conversationId,"conversationId")

    // Ignore messages from the bot itself
    if (senderAddress.toLowerCase() === botAddress) {
      return;
    }

    console.log(
      `Received message from ${senderAddress} in conversation ${conversationId}: ${message.content as string}`,
    );

    // Get or initialize agent
    let agentData = agentStore[conversationId];
    if (!agentData) {
      agentData = await initializeAgent(conversationId);
      agentStore[conversationId] = agentData;
    }
    const { agent, config, walletProvider } = agentData;
    const handler = languageLearningHandlers[conversationId];

    // Get the conversation first
    const foundConversation = await client.conversations.getConversationById(conversationId);
    if (!foundConversation) {
      throw new Error(`Could not find conversation for ID: ${conversationId}`);
    }
    conversation = foundConversation;
    const content = String(message.content);

    // Handle quiz command
    if (content.startsWith("/quiz")) {
      // Pick a random word from vocabulary
      const randomIndex = Math.floor(Math.random() * VOCABULARY_WORDS.length);
      const selectedWord = VOCABULARY_WORDS[randomIndex];
      
      // Initialize quiz state
      quizStates[conversationId] = {
        currentWord: selectedWord.word,
        attempts: 0,
        correctAnswers: 0,
        start: true
      };

      // Generate and send multiple choice quiz
      const quiz = await generateMultipleChoiceQuiz(agent, config, selectedWord.word, selectedWord.meaning);
      quizStates[conversationId].multipleChoiceQuiz = quiz;
      const optionsText = quiz.options.map((opt, i) => `${String.fromCharCode(65 + i)}. ${opt}`).join('\n');
      await conversation.send(
        `Quiz: What is the meaning of the word "${selectedWord.word}"?\n\n${optionsText}\n\nType the letter of your answer (A, B, C, or D) or /quiz to try another word.`
      );
      return;
    }

    // Handle quiz answers
    if (quizStates[conversationId]?.start) {
      const { currentWord, multipleChoiceQuiz } = quizStates[conversationId];
      if (!multipleChoiceQuiz) {
        await conversation.send("Error: Quiz not found. Type /quiz to start over.");
        return;
      }

      const userAnswer = content.toUpperCase();
      const correctAnswer = String.fromCharCode(65 + multipleChoiceQuiz.correctOptionIndex);
      const isCorrect = userAnswer === correctAnswer;

      if (isCorrect) {
        await conversation.send(
          `🎉 Correct! The meaning of "${currentWord}" is: "${multipleChoiceQuiz.correctMeaning}"\n\nType /quiz to try another word!`
        );
      } else {
        await conversation.send(
          `❌ Incorrect. The correct answer is ${correctAnswer}. The meaning of "${currentWord}" is: "${multipleChoiceQuiz.correctMeaning}"\n\nTry again with /quiz!`
        );
      }
      delete quizStates[conversationId];
      return;
    }

    // Handle other messages with the agent
    const response = await processMessage(agent, config, content);
    await conversation.send(response);
    console.debug(`Sent response to conversation ${conversationId}: ${response}`);
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
  
  while (true) {
    try {
      console.log("Syncing conversations...");
      await client.conversations.sync();
      const conversations = await client.conversations.list();
      console.log("Conversation IDs:", conversations.map(conv => conv.id));

      console.log("Starting new message stream...");
      const stream = await client.conversations.streamAllMessages();
      for await (const message of stream) {
        console.log("new message detected");
        if (message) {
          await handleMessage(message, client);
        }
      }
    } catch (error) {
      console.error("Error in message listener:", error);
      console.log("Attempting to reconnect in 5 seconds...");
      await new Promise(resolve => setTimeout(resolve, 5000));
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
  const quizPrompt = `You are a quiz generator. Generate a multiple-choice quiz for the word "${word}" with the correct meaning "${correctMeaning}".

IMPORTANT: Respond ONLY with a JSON object in this exact format, with no additional text:
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

Rules:
1. First option must be a rephrased version of the correct meaning
2. Other options must be plausible but incorrect
3. All options must be complete sentences
4. Do not include any text outside the JSON object`;

  try {
    const quizResponse = await processMessage(agent, config, quizPrompt);
    // Try to extract JSON from the response
    const jsonMatch = quizResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in response");
    }
    
    const quiz = JSON.parse(jsonMatch[0]) as Omit<MultipleChoiceQuiz, 'correctOptionIndex'>;
    
    // Validate the quiz structure
    if (!quiz.word || !quiz.correctMeaning || !Array.isArray(quiz.options) || quiz.options.length !== 4) {
      throw new Error("Invalid quiz structure");
    }
    
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
      correctMeaning,
      "A different meaning that is incorrect",
      "Another incorrect meaning",
      "A third incorrect meaning"
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
      correctOptionIndex: fallbackOptions.indexOf(correctMeaning),
    };
  }
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
