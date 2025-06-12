'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { Client,Identifier, Signer  } from '@xmtp/browser-sdk';
import { ethers } from 'ethers';
import { useAccount, useDisconnect, useWalletClient } from 'wagmi';
import { XMTP_CONFIG, NetworkType } from '../config/xmtp';


interface XMTPContextType {
  client: Client | null;
  isInitialized: boolean;
  network: NetworkType;
  setNetwork: (network: NetworkType) => void;
  sendMessage: (content: string) => Promise<void>;
  disconnect: () => void;
  streamMessages: (callback: (message: any) => void) => Promise<void>;
  findConversationWithAddress: () => Promise<string | null>;
  createDM: () => Promise<any>;
}

const XMTPContext = createContext<XMTPContextType | null>(null);

export const useXMTP = () => {
  const context = useContext(XMTPContext);
  if (!context) {
    throw new Error('useXMTP must be used within an XMTPProvider');
  }
  return context;
};

export const XMTPProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [client, setClient] = useState<Client | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [network, setNetwork] = useState<NetworkType>('production');
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { data: walletClient } = useWalletClient();

  useEffect(() => {
    const initClient = async () => {
      if (!address || !isConnected || !walletClient) {
        setClient(null);
        setIsInitialized(false);
        return;
      }
      

      try {
        
        const provider = new ethers.providers.Web3Provider(window.ethereum);
        const accounts = await provider.listAccounts();
        console.log("Available accounts:", accounts);
        // if (accounts.length === 0) {
        //   throw new Error("No account connected — cannot initialize XMTP client.");
        // }
        // const signer = provider.getSigner();
        console.log("initializing");


        
        // Create a signer that matches the XMTP browser SDK requirements
        // const xmtpSigner = {
        //   type: 'SCW' as const,
        //   getIdentifier: () => ({
        //     identifier: address,
        //     identifierKind: 'Ethereum'
        //   }),
        //   signMessage: (message: Uint8Array) => {
        //     const messageString = Buffer.from(message).toString('utf-8');
        //     return walletClient.signMessage({ message: messageString })
        //       .then(signature => {
        //         // Remove '0x' prefix and ensure proper signature format
        //         const cleanSignature = signature.startsWith('0x') ? signature.slice(2) : signature;
        //         return Buffer.from(cleanSignature, 'hex');
        //       });
        //   },
        //   getChainId: () => {
        //     // Force chain ID to be 0 for XMTP
        //     // return Promise.resolve(chainId);
        //     return Promise.resolve(BigInt(1));
        //   }
        // };
        
        // Handle the Promise before creating the client
        
        const chainId = await provider.getNetwork().then(network => BigInt(network.chainId));
        const xmtpSigner2: Signer = {
          type: "EOA",
          getIdentifier: () => ({
            identifier: address,
            identifierKind: 'Ethereum'
          }),
          signMessage: async (message: Uint8Array | string): Promise<Uint8Array> => {
            if (typeof message !== "string") {
              message = new TextDecoder().decode(message);
            }
        
            const signature = await walletClient.signMessage({ message: message });
        
            // Convert hex string to Uint8Array
            return Uint8Array.from(Buffer.from(signature!.slice(2), 'hex'));
          },
        };

        const xmtp = await Client.create({
          ...xmtpSigner2,
        }, {
          env: 'production'
        });

        setClient(xmtp);
        setIsInitialized(true);
      } catch (error) {
        console.error('Failed to initialize XMTP client:', error);
        setClient(null);
        setIsInitialized(false);
      }
    };

    if (address && isConnected && walletClient) {
      initClient();
    }

    return () => {
      if (client) {
        client.close();
      }
    };
  }, [address, isConnected, network, walletClient]);

  const sendMessage = async (content: string) => {
    if (!client) {
      throw new Error('XMTP client not initialized');
    }
    if(!address){
      throw new Error('Could not find my address');
     }
     

    try {
      const normalizedAddress = ethers.utils.getAddress(address);
      const recipientAddress = ethers.utils.getAddress(XMTP_CONFIG.defaultRecipient);
      // const recipientAddress="0x9e680f3D7566464B3b3e63C9ad37dc2B9e5452e2"
      const myIdentity = {
        identifier: normalizedAddress,
        identifierKind: 'Ethereum' as const
      };
      const recipientIdentity = {
        identifier: recipientAddress,
        identifierKind: 'Ethereum' as const
      };
      
      const canMessageMap = await client.canMessage([recipientIdentity]);
      console.log("Can message map:", canMessageMap); // Debug log
      console.log("Map keys:", Array.from(canMessageMap.keys())); // Debug log to see all keys
      console.log("Map entries:", Array.from(canMessageMap.entries())); // Debug log to see all entries
      
      // Try to get the value using the exact key from the map
      const mapKey = Array.from(canMessageMap.keys())[0]; // Get the first key from the map
      const canMessage = canMessageMap.get(mapKey);
      console.log("Using key:", mapKey); // Debug log
      console.log("Can message result:", canMessage); // Debug log
      console.log("canMessage", canMessageMap,canMessage,recipientIdentity)
       if (!canMessage) {
        console.log("recipient is not reachable")
         throw new Error('Recipient is not reachable on XMTP');
       }

     
       const myInboxId = await client.findInboxIdByIdentifier(myIdentity);
      if (!myInboxId) {
        throw new Error('Could not find my inbox ID');
      }
       const recipientInboxId = await client.findInboxIdByIdentifier(recipientIdentity);
      if (!recipientInboxId) {
        throw new Error('Could not find recipient inbox ID');
      }
        console.log("recipientInboxId",recipientInboxId)
    
      // const conversation = await client.conversations.newGroup([myInboxId,recipientInboxId]);

   
      const conversation = await client.conversations.newDm(recipientInboxId);
      // const conversation = await client.conversations.newDmWithIdentifier(recipientIdentity)
      await new Promise(resolve => setTimeout(resolve, 1000));


      const all = await client.conversations.list();
      console.log("all convo 0",all);

      const dmlist = await client.conversations.listDms();
      console.log("client info",client)
      console.log("all convo",client.conversations)
      console.log("dmlist",dmlist)
      console.log("new dm created", content, conversation);
      console.log("Conversation ID:", conversation.id);
      console.log("Conversation members:", await conversation.members());
    
      const msgid = await conversation.send(content);
      console.log("content sent", msgid);
    } catch (error) {
      if (error instanceof Error && error.message.includes('succeeded')) {
        console.log('Message sent successfully');
        console.log(error);
        return;
      }
      console.error('Failed to send message:', error);
      throw error;
    }
  };

  const findConversationWithAddress = async () => {
    if (!client) {
      throw new Error('XMTP client not initialized');
    }
    if(!address){
      throw new Error('Could not find my address');
     }
  
    try {
      // Get all conversations
      const conversations = await client.conversations.listDms();
      console.log("Found conversations list:", conversations.length);
      const recipientAddress = ethers.utils.getAddress(XMTP_CONFIG.defaultRecipient);
  
      // For each conversation, check its members
      for (const conversation of conversations) {
        const members = await conversation.members();
        console.log("Finding Conversation members1:", members);
        const memberAddresses = members.flatMap(member => 
          member.accountIdentifiers.map(id => id.identifier.toLowerCase())
        );

      
        // console.log("Conversation members address1:", memberAddresses);
        // Check if both addresses are in the members list
        if (memberAddresses.includes(address.toLowerCase()) && memberAddresses.includes(recipientAddress.toLowerCase())) {
          return conversation.id;
        }
      }
  
      console.log("No existing conversation found");
      return null;
    } catch (error) {
      console.error('Error finding conversation:', error);
      throw error;
    }
  };



  const streamMessages = async (callback: (message: any) => void) => {
    console.log("Starting message stream...");
    if (!client) {
      throw new Error('XMTP client not initialized');
    }

    try {
      // First get existing conversations
      const conversations = await client.conversations.list();
      console.log("Found conversations:", conversations.length);

      // Set up streaming for each conversation
      for (const conversation of conversations) {
        const stream = await conversation.streamMessages();
        console.log("Streaming messages for conversation:", conversation.peerAddress);
        
        for await (const message of stream) {
          console.log("Received message:", message);
          callback(message);
        }
      }
    } catch (error) {
      console.error('Failed to stream messages:', error);
      throw error;
    }
  };

  const disconnectXMTP = async () => {
    if (client) {
      try {
        await client.close();
        setClient(null);
        setIsInitialized(false);
      } catch (error) {
        console.error('Error closing XMTP client:', error);
      }
    }
    disconnect();

  };
  
  const createDM = async (): Promise<any> => {
    if (!client) {
      throw new Error('XMTP client not initialized');
    }

    try {
      const recipientAddress = ethers.utils.getAddress(XMTP_CONFIG.defaultRecipient);
      const conversation = await client.conversations.newDm(recipientAddress);
      console.log('Created new DM conversation:', conversation);
      return conversation;
    } catch (error) {
      console.error('Error creating DM:', error);
      throw error;
    }
  };

  return (
    <XMTPContext.Provider 
      value={{ 
        client, 
        isInitialized, 
        network, 
        setNetwork, 
        sendMessage,
        disconnect:disconnectXMTP,
        streamMessages,
        findConversationWithAddress,
        createDM
      }}
    >
      {children}
    </XMTPContext.Provider>
  );
}; 