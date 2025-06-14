
XMTP LexiPal -- Your on-chain AI agent language coach

# Project Overview 

## The Problem

Many people start learning languages and would like to expand on their vocabulary, but struggle to stay motivated. It's especially difficulty when learning alone.

Without external accountability, it’s easy to lose momentum.

* Most goal setting app rely on **self-reported progress**, which is unverifiable and doesn’t drive true accountability.
* Many vocal building apps use **static question banks** that can be easily gamed — learners, especially younger kids, may choose to guess the answer or game the system without true mastery.
* Generic AI chatbots provide interesting conversation, but lack **structured learning paths** and measurable progress, and there's **no real stake in the line** to keep people motivated.


## Our Project

What if you could stake ETH to create a language learning goal, and an **AI agent tracks your progress **and have full control over **whether you can get your stake back**?

We introduce structured vocab goals: target number of words, difficulty level, and completion deadline. The agent will help **suggest a goal** for you to confirm.

You won’t just click buttons and there's no shortcuts. The AI will test you in a free-form quiz by:
1. Asking you to define the word
2. Asking you to use it in a sentence
3. Generating multiple choice options in real time for you to select from

AI will decide whether you’ve mastered the word and provide feedbacks,  and the AI is the sole entity that may update your word progress on-chain.

You interact with the AI via **XMTP protocol** , each learning conversation happens via the messaging protocol. Behind the scenes, each conversation creates a dedicated wallet (via CDP agent kit), enabling the AI to update your learning progress, word by word. (The AI will ask you for some gas fund to get started)

If you **complete your goal**, you can claim your full stake back. If you fail, you can only claim a **partial refund** based on your progress, and the remaining stake will be sent to a public reward pool contract that can be used for future community learning events and incentives.

Leaners can also create a study group through our site — an XMTP group chat where a special group learning agent is auto-invited to make the learning experience more fun. The group agent is a separate agent and is still under development, and for now there is no on-chain component in the group chat, but it allows learners to engage together and stay motivated.

A potential use case: parents can stake ETH and set up a learning goal for their child , this will help helping **onboard younger generations on-chain**, giving them a fun and structured way to earn rewards through real effort.


# Deployment Info

Website: https://xmtp-lexi-pal.vercel.app/ (Live On Base Mainnet)

LanguageGoal Contract: https://basescan.org/address/0x4Ac4525e441A034aD0D0Fe48A03AD4F95Fe9daF8

Individual Learning Agent XMTP Address: 0x0205918b99875a7b5ae7d3060f0ad4d9afcc4c4b

Group Chat Agent XMTP Address (under development):0x55fdc82920507ed1694a79b19c1025e7f12efac4 


## Tech Stack & Tools

- XMTP protocol for messaging 
- Coinbase AI agent kit  & OpenAI API for the chat agent and agent wallet
- Next Js for Frontend (integrated with XMTP browser SDK)
- Solidity/Hardhat for smart contract
- Subgraph for indexing
- GCP for agent hosting & Vercel for frontend hosting
- Rainbowkit for Wallet Connection
- BaseName Integrated
- Live on Base Mainnet 

## Start Template Used

- The project built for the Base Batch Messaging Hackthon, it was created from scratch entirely during the hackathon. 
-  Make use of the xmtp example repo: https://github.com/ephemeraHQ/xmtp-agent-examples as starter


# Project Structure

## Architecture Diagram

![Architecture Diagram](https://github.com/ubinhash/xmtp-lexi-pal/blob/main/assets/screenshots/arch.png)

## Frontend

`npm install` to install the relevant packages
`npm run dev` to start the server 

Code in the `frontend3` folder

### Configuration

`config/contract.ts` Contains information related to contract

export const CONTRACT_ADDRESS = <Your Leaning Goal Smart Contract Here>
export const GRAPH_API_URL = <Your Subgraph Deployment URL HERE>

`config/xmtp.ts` Contains information on XMTP agent setup

  defaultRecipient: <Individual learning agent address>
  defaultGroupRecipient: <Group chat aggent address>

## Agent

`yarn install` to install the dependencies
`yarn start` to get the agent running

Individual learning agent: code in `xmtp-agent-examples/examples/xmtp-coinbase-agentkit` folder
Group chat agent: code in `xmtp-agent-examples/examples/xmtp-coinbase-group` folder


### Configuration

```
WALLET_KEY=
ENCRYPTION_KEY= <DB encryption Key>

OPENAI_API_KEY=
NETWORK_ID=base-mainnet
CDP_API_KEY_NAME= <ID for CDP API>
CDP_API_KEY_PRIVATE_KEY=
XMTP_ENV=production

LANGUAGE_LEARNING_CONTRACT_ADDRESS=<Language Learning Goal Contract>
```


## Contract

Code in the `contract` folder

Compile: `npx hardhat compile`
Deploy: `npx hardhat run scripts/deploy.js --network base`

`SIGNER_ADDRESS=<Individual Learning Agent Address>`


# Project Highlights

- We've integrated XMTP in our own frontend leveraging the XMTP browser SDK, for best accessibility and customization. This will enable to to define custom content type for messages in the future and customize display.
- AI holds you accountable: Only the AI agent decides if you’ve mastered the words and whether your stake is returned.
- On-chain vocab progress:  It's has been seamlessly integrated into the chat flow and will be displayed alongside with the chat.
- Basename integration: Basename are fully integrated into the chat interface
- XMTP Group Chat integration
- Built with Security in Mind: Logic checks are performed before handing off data to the agent.


