'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { Client } from '@xmtp/browser-sdk';
import { ethers } from 'ethers';
import { useAccount, useDisconnect } from 'wagmi';
import { XMTP_CONFIG, NetworkType } from '../config/xmtp';

interface XMTPContextType {
  client: Client | null;
  isInitialized: boolean;
  network: NetworkType;
  setNetwork: (network: NetworkType) => void;
  sendMessage: (content: string) => Promise<void>;
  disconnect: () => void;
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
  const [network, setNetwork] = useState<NetworkType>('dev');
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();

  useEffect(() => {
    const initClient = async () => {
      if (!address || !isConnected) {
        setClient(null);
        setIsInitialized(false);
        return;
      }

      try {
        const provider = new ethers.providers.Web3Provider(window.ethereum);
        const signer = provider.getSigner();
        console.log("initializing");
        
        // Create a signer that matches the XMTP browser SDK requirements
        const xmtpSigner = {
          type: 'SCW' as const,
          getIdentifier: () => ({
            identifier: address,
            identifierKind: 'Ethereum'
          }),
          signMessage: (message: Uint8Array) => {
            const messageString = Buffer.from(message).toString('utf-8');
            return signer.signMessage(messageString)
              .then(signature => {
                // Remove '0x' prefix and ensure proper signature format
                const cleanSignature = signature.startsWith('0x') ? signature.slice(2) : signature;
                return Buffer.from(cleanSignature, 'hex');
              });
          },
          getChainId: () => {
            // Force chain ID to be 0 for XMTP
            return Promise.resolve(BigInt(0));
          }
        };
        
        // Handle the Promise before creating the client
        const chainId = await provider.getNetwork().then(network => BigInt(network.chainId));
        const xmtp = await Client.create({
          ...xmtpSigner,
          getChainId: () => chainId
        }, {
          env: 'dev'
        });
        
        setClient(xmtp);
        setIsInitialized(true);
      } catch (error) {
        console.error('Failed to initialize XMTP client:', error);
        setClient(null);
        setIsInitialized(false);
      }
    };

    initClient();
  }, [address, isConnected, network]);

  const sendMessage = async (content: string) => {
    if (!client) {
      throw new Error('XMTP client not initialized');
    }

    try {
      const recipientAddress = ethers.utils.getAddress(XMTP_CONFIG.defaultRecipient);
      const conversation = await client.conversations.newDm(recipientAddress);
      console.log("new dm created")
      await conversation.send(content);
      console.log("content sent")
    } catch (error) {
      if (error instanceof Error && error.message.includes('succeeded')) {
        console.log('Message sent successfully');
        return;
      }
      console.error('Failed to send message:', error);
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
        disconnect
      }}
    >
      {children}
    </XMTPContext.Provider>
  );
}; 