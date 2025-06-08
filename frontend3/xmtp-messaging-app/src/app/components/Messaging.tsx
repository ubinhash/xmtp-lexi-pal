'use client';

import React, { useState } from 'react';
import { useXMTP } from '../contexts/XMTPContext';
import { XMTP_CONFIG } from '../config/xmtp';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import './Messaging.css';

export const Messaging: React.FC = () => {
  const [message, setMessage] = useState('');
  const { 
    client, 
    isInitialized, 
    network, 
    setNetwork, 
    sendMessage,
    disconnect
  } = useXMTP();

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

  if (!isInitialized) {
    return (
      <div className="message-container">
        <p className="message-text">Please connect your wallet to start messaging</p>
        <div className="connect-button-container">
          <ConnectButton />
        </div>
      </div>
    );
  }

  return (
    <div className="message-container">
      <div className="network-selector">
        <label htmlFor="network" className="label">
          Network
        </label>
        <select
          id="network"
          value={network}
          onChange={(e) => setNetwork(e.target.value as 'dev' | 'production')}
          className="select"
        >
          {Object.entries(XMTP_CONFIG.networks).map(([key, value]) => (
            <option key={key} value={key}>
              {value.name}
            </option>
          ))}
        </select>
        <button onClick={disconnect} className="button disconnect">
          Disconnect
        </button>
      </div>

      <form onSubmit={handleSubmit} className="message-form">
        <div className="form-group">
          <label htmlFor="message" className="label">
            Message
          </label>
          <textarea
            id="message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            className="textarea"
            placeholder="Type your message here..."
          />
        </div>
        <button type="submit" className="button">
          Send Message
        </button>
      </form>
    </div>
  );
}; 