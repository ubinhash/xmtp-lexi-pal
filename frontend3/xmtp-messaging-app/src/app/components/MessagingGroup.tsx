'use client';

import React, { useState,useEffect } from 'react';
import { useXMTP } from '../contexts/XMTPContext';
import { XMTP_CONFIG } from '../config/xmtp';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { ethers } from 'ethers';
import { MessageList } from './MessageList';
import { useWalletClient } from 'wagmi';
import styles from './MessagingGroup.module.css';
import { getBasename, Basename } from './basenames';
export const MessagingGroup: React.FC = () => {
  const [message, setMessage] = useState('');
  const { 
    client, 
    isInitialized, 
    network, 
    setNetwork, 
    sendMessage,
    disconnect,
    findConversationWithAddress,
    createDM,
    listGroupChats,
    createGroupchat,
    sendMessageGroup
  } = useXMTP();
  const [error, setError] = useState<string | null>(null);
  const walletClient = useWalletClient();
  const [groups, setGroups] = useState<any[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const [newGroupAddresses, setNewGroupAddresses] = useState<string>("");
  const [creating, setCreating] = useState(false);
  const [groupMembers, setGroupMembers] = useState<string[]>([]);
  const [basenames, setBasenames] = useState<Record<string, Basename>>({});

  useEffect(() => {
    const fetchMembers = async () => {
      if (!selectedGroupId) {
        setGroupMembers([]);
        return;
      }
      console.log("Fetching group emmebers",groups)
      const group = groups.find(g => g.id === selectedGroupId);
      console.log("group",group)
      if (group && typeof group.members === 'function') {
        const members = await group.members();
        console.log("Finding group members1:", members);
        const memberAddresses = members.flatMap((member: any) =>
          member.accountIdentifiers.map((id: any) => id.identifier.toLowerCase())
        );
        setGroupMembers(memberAddresses);

        // Fetch basenames for each address
        memberAddresses.forEach(async (address) => {
          if (!basenames[address]) {
            const basename = await getBasename(address);
            setBasenames(prev => ({ ...prev, [address]: basename }));
          }
        });
      } else {
        setGroupMembers([]);
      }
    };
    fetchMembers();
  }, [selectedGroupId, groups]);

  useEffect(() => {
    console.log("groupMembers Changed",groupMembers)
    groupMembers.forEach(async (address) => {
        if (!basenames[address]) {
          const basename = await getBasename(address);
          setBasenames(prev => ({ ...prev, [address]: basename }));
        }
      });
  }, [groupMembers])

  useEffect(() => {
    const fetchGroups = async () => {
      const groupList = await listGroupChats();
      setGroups(groupList);
      if (groupList.length > 0) setSelectedGroupId(groupList[0].id);
    };
    fetchGroups();
  }, [listGroupChats]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    try {
      await sendMessageGroup(message,selectedGroupId);
      setMessage('');
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleCreateGroup = async () => {
    setCreating(true);
    try {
      const addresses = newGroupAddresses.split(',').map(addr => addr.trim()).filter(Boolean);
      const newGroup = await createGroupchat(addresses);
      const groupList = await listGroupChats();
      setGroups(groupList);
      setSelectedGroupId(newGroup.id);
      setNewGroupAddresses("");
    } catch (err) {
      console.error('Error creating group:', err);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.messageListContainer}>
        {isInitialized ? (
          <>

            <div className={styles.groupActions}>
                <div>
                    <label htmlFor="group-select" className={styles.groupSelectorLabel}>Select Group:</label>
                    <select
                    id="group-select"
                    value={selectedGroupId}
                    onChange={e => setSelectedGroupId(e.target.value)}
                    className={styles.groupSelectorSelect}
                    >
                    {groups.map(group => (
                        <option key={group.id} value={group.id}>
                        {group.name || group.id}
                        </option>
                    ))}
                    </select>
                </div>
            <div className={styles.groupCreationInputContainer}>
              <input
                type="text"
                placeholder="Comma-separated addresses"
                value={newGroupAddresses}
                onChange={e => setNewGroupAddresses(e.target.value)}
                className={styles.groupCreationInput}
              />
              <button
                onClick={handleCreateGroup}
                disabled={creating || !newGroupAddresses}
                className={styles.groupCreationButton}
              >
                {creating ? "Creating..." : "Create Group Chat"}
              </button>
            </div>
            </div>
            <div className={styles.groupMainRow}>
                <div className={styles.groupMembers}>
                    <strong>Group Members:</strong>
                    <ul className={styles.groupMembersList}>
                    {groupMembers.map((addr, idx) => (
                        <li key={idx} className={styles.groupMemberItem}>
                        {basenames[addr]
                            ? `${basenames[addr]} (${addr.slice(0, 6)}...${addr.slice(-4)})`
                            : `${addr.slice(0, 6)}...${addr.slice(-4)}`}
                        </li>
                    ))}
                    </ul>
                </div>
                <div className={styles.messageGroupDonNotSeperate}>
                        <MessageList target_conversationId={selectedGroupId} walletClient={walletClient} />
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
                </div>
            </div>
          </>
        ) : (
          <div className={styles.messageContainer}>
            <p className={styles.connectPrompt}>Please connect your wallet to start messaging</p>
            <div className={styles.connectButtonContainer}>
              <ConnectButton />
            </div>
          </div>
        )}
      </div>

    
    </div>
  );
}; 