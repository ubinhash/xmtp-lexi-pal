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

// Sample vocabulary words for testing (we'll replace this with a file later)
const VOCABULARY_WORDS = [
  { word: "hello", meaning: "a greeting" },
  { word: "world", meaning: "the earth and all life upon it" },
  { word: "learn", meaning: "to gain knowledge or skill" },
  { word: "language", meaning: "a system of communication" },
  { word: "practice", meaning: "to do something repeatedly to improve" },
];

// Store quiz state for each user
interface QuizState {
  currentWord: string;
  attempts: number;
  correctAnswers: number;
}

const quizStates: Record<string, QuizState> = {};

// Add this interface near the top of the file with other interfaces
interface QuizEvaluation {
  isCorrect: boolean;
  feedback: string;
  explanation: string;
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
): Promise<{ agent: Agent; config: AgentConfig }> {
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
      walletProvider
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
        1. You can check their current learning progress
        2. You can help them learn new words through interactive quizzes
        3. You can track their progress on specific words
        4. You can encourage them to complete their goals

        IMPORTANT:
        - Users need to have an active goal to start learning words
        - Users need to learn each word 3 times to master it
        - You can help them learn words by asking them to define them
        - You can check their progress on specific words
        - You can encourage them to keep learning and practicing

        Be encouraging and helpful in all your interactions. Focus on helping users learn and master new words.
      `,
    });

    agentStore[userId] = agent;

    const exportedWallet = await walletProvider.exportWallet();
    const walletDataJson = JSON.stringify(exportedWallet);
    saveWalletData(userId, walletDataJson);

    return { agent, config: agentConfig };
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

async function handleProgressUpdate(
  conversation: Conversation,
  handler: LanguageLearningHandler,
  userAddress: string,
  word: string
): Promise<void> {
  try {
    const { txHash, newProgress } = await handler.updateProgress(userAddress, word);
    await conversation.send(
      `Great job! Your progress for "${word}" has been updated to level ${newProgress}/3. Transaction: ${txHash}`
    );
  } catch (error) {
    console.error("Error updating progress:", error);
    await conversation.send(
      "Sorry, I couldn't update your progress. Please make sure you have an active goal and the word is correct."
    );
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

    const { agent, config } = await initializeAgent(senderAddress);
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

    if (content.startsWith("/learn")) {
      const activeGoalId = await handler.getActiveGoalId(userAddress);
      if (activeGoalId === 0n) {
        await conversation.send("You don't have an active goal. Please create one first!");
        return;
      }

      // Select a random word
      const randomWord = VOCABULARY_WORDS[Math.floor(Math.random() * VOCABULARY_WORDS.length)];
      
      // Initialize quiz state
      quizStates[senderAddress] = {
        currentWord: randomWord.word,
        attempts: 0,
        correctAnswers: 0,
      };

      await conversation.send(
        `Let's learn the word "${randomWord.word}"!\n\nWhat does this word mean?\n\nType your answer or /skip to try another word.`,
      );
      return;
    }

    if (content.startsWith("/skip")) {
      delete quizStates[senderAddress];
      await conversation.send("Let's try another word. Type /learn to start learning a new word!");
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
      try {
        const goalId = await handler.getActiveGoalId(userAddress);
        if (goalId === 0n) {
          await conversation.send("You don't have an active goal. Use /create to start a new goal!");
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

    // Check if user is in a quiz
    const quizState = quizStates[senderAddress];
    if (quizState) {
      const word = VOCABULARY_WORDS.find(w => w.word === quizState.currentWord);
      if (!word) {
        delete quizStates[senderAddress];
        await conversation.send("Something went wrong. Type /learn to start learning a new word!");
        return;
      }

      // Use the AI agent to check if the answer is correct
      const evaluation = await evaluateAnswer(
        agent,
        config,
        quizState.currentWord,
        word.meaning,
        content,
      );

      if (evaluation.isCorrect) {
        // Update progress on the blockchain
        await handleProgressUpdate(conversation, handler, userAddress, quizState.currentWord);
        
        quizState.correctAnswers++;
        if (quizState.correctAnswers >= 2) {
          // User has mastered the word
          await conversation.send(
            `Great job! You've mastered the word "${quizState.currentWord}"!\n\n${evaluation.feedback}\n\nType /learn to learn another word.`,
          );
          delete quizStates[senderAddress];
        } else {
          await conversation.send(
            `Correct! ${evaluation.feedback}\n\nLet's practice one more time to make sure you remember it.\n\nWhat does "${quizState.currentWord}" mean?`,
          );
        }
      } else {
        quizState.attempts++;
        if (quizState.attempts >= 3) {
          await conversation.send(
            `The meaning of "${quizState.currentWord}" is: "${word.meaning}"\n\n${evaluation.explanation}\n\nLet's try another word. Type /learn to continue.`,
          );
          delete quizStates[senderAddress];
        } else {
          await conversation.send(
            `${evaluation.feedback}\n\nTry again! What does "${quizState.currentWord}" mean?\n\nType /skip to try another word.`,
          );
        }
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
