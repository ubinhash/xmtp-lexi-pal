'use client';

import React, { useState,useEffect } from 'react';
import { useXMTP } from '../contexts/XMTPContext';
import { XMTP_CONFIG } from '../config/xmtp';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { ethers } from 'ethers';
import { MessageList } from './MessageList';
import { useWalletClient } from 'wagmi';
import styles from './Messaging.module.css';

export const Messaging: React.FC = () => {
  const [message, setMessage] = useState('');
  const [dmConversationId,setDmConversationId]=useState('')
  const { 
    client, 
    isInitialized, 
    network, 
    setNetwork, 
    sendMessage,
    disconnect,
    findConversationWithAddress,
    createDM
  } = useXMTP();
  const [error, setError] = useState<string | null>(null);
  const walletClient = useWalletClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    try {
      await sendMessage(message);
      setMessage('');
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  const testFindConversation = async () => {
    try {

      const conversation = await findConversationWithAddress();
      console.log("Found conversation:", conversation);
      
      if (conversation) {
        setDmConversationId(conversation)
        console.log("Conversation ID Listing:", conversation);
      } else {
        console.log("No conversation found");
      }
    } catch (error) {
      console.error("Error testing find conversation:", error);
    }
  };
  
  // You can call this in a useEffect or add a test button
  useEffect(() => {
    if (client) {
      testFindConversation();
      // If no conversation is found, create a new DM
      if (!dmConversationId) {
        handleCreateDM();
      }
    }
  }, [client]);

  const handleCreateDM = async () => {
    try {
      setError(null);
      const conversation = await createDM();
      console.log('DM created successfully:', conversation);
      // Handle successful creation
    } catch (error) {
      console.error('Error creating DM:', error);
      setError(error instanceof Error ? error.message : 'Failed to create DM');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  if (!isInitialized) {
    return (
      <div className={styles.container}>
        <p className={styles.connectPrompt}>Please connect your wallet to start messaging</p>
        <div className={styles.connectButtonContainer}>
          <ConnectButton />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.networkSelector}>
        <label htmlFor="network" className={styles.label}>
          Network
        </label>
        <select
          id="network"
          value={network}
          onChange={(e) => setNetwork(e.target.value as 'dev' | 'production')}
          className={styles.select}
        >
          {Object.entries(XMTP_CONFIG.networks).map(([key, value]) => (
            <option key={key} value={key}>
              {value.name}
            </option>
          ))}
        </select>
        <button onClick={disconnect} className={styles.disconnectButton}>
          Disconnect
        </button>
      </div>

      <div className={styles.messageListContainer}>
        <MessageList target_conversationId={dmConversationId} walletClient={walletClient} />
      </div>

      <div className={styles.messageForm}>
          <textarea
            id="message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            className={styles.textarea}
            placeholder="Type your message here..."
          />
        <button type="submit" onClick={handleSubmit} className={styles.submitButton}>
          Send
        </button>
      </div>

      {/* <button onClick={handleCreateDM} className={styles.createDMButton}>
        Create DM
      </button> */}

      {error && (
        <div className={styles.errorMessage}>
          {error}
        </div>
      )}

    
    </div>
  );
}; 