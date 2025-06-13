'use client';

import { useEffect, useState, useRef } from 'react';
import { useXMTP } from '../contexts/XMTPContext';
import { DecodedMessage } from '@xmtp/browser-sdk';
import styles from './MessageList.module.css';
import { getBasename, Basename } from './basenames';
import { useWalletClient } from 'wagmi';

interface Message {
  id: string;
  content: string;
  senderAddress: string;
  sent: Date;
  conversationId: string;
}

interface MessageListProps {
  target_conversationId: string;
}

export function MessageList({ target_conversationId }: MessageListProps) {
  const { client } = useXMTP();
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [basenames, setBasenames] = useState<Record<string, Basename>>({});
  const { data: walletClient } = useWalletClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom();
    }
  }, [messages]);

  // Function to fetch basename for an address
  const fetchBasename = async (address: string) => {
    try {
      const basename = await getBasename(address as `0x${string}`);
      console.log("basename",address,basename)
      if (basename) {
        setBasenames(prev => ({
          ...prev,
          [address]: basename
        }));
      }
    } catch (error) {
      console.error('Error fetching basename:', error);
    }
  };

  // Add this function before the useEffect
  const handleWalletSendCall = (content: any) => {
    try {
      const jsonString = new TextDecoder().decode(content);
      const txData = JSON.parse(jsonString);
      
      return (
        <div className={styles.walletSendCall}>
           <p>Please review the transaction details below</p> 
          <div className={styles.walletSendCallInfo}>
            {/* <p><strong>From:</strong> {txData.from}</p>
            <p><strong>Chain ID:</strong> {txData.chainId}</p> */}
            
            <p><strong>Description:</strong> {txData.calls[0].metadata.description}</p>
          </div>
          <button
            onClick={() => handleTransactionSubmit(txData.calls[0])}
            disabled={!walletClient || isSubmitting}
            className={styles.submitButton}
          >
            {isSubmitting ? 'Submitting...' : 'Submit Transaction'}
          </button>
          {error && (
            <p className={styles.errorMessage}>{error}</p>
          )}
        </div>
      );
    } catch (error) {
      console.error('Error parsing wallet send call:', error);
      return 'Error parsing wallet send call';
    }
  };

  // Add this function to handle the transaction submission
  const handleTransactionSubmit = async (call: any) => {
    if (!walletClient) {
      setError('Please connect your wallet first');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const { to, data, value } = call;
      const hash = await walletClient.sendTransaction({
        to,
        data,
        value: BigInt(value || 0),
      });

      console.log('Transaction submitted:', hash);
      // You might want to show a success message here
    } catch (error) {
      console.error('Error submitting transaction:', error);
      // Handle specific error cases
      if (error instanceof Error) {
        if (error.message.includes('user rejected')) {
          setErrorMsg('Transaction was rejected by user');
        } else if (error.message.includes('insufficient funds')) {
          setErrorMsg('Insufficient funds for transaction');
        } else {
          setErrorMsg(error.message || 'Failed to submit transaction');
        }
      } else {
        setErrorMsg('Failed to submit transaction');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (!client) return;

    let isStreamingActive = true;
    const messageStreams = new Set<AsyncGenerator<DecodedMessage>>();

    const setupMessageStream = async () => {
      try {
        setError(null);
        await client.conversations.sync();
        console.log("Synced conversations")
        const conversations = await client.conversations.list();
        console.log("Found conversations:", conversations.length);
        
        const allMessages: Message[] = [];
        
        for (const conversation of conversations) {
          console.log("conversation",conversation)
          if (conversation.id !== target_conversationId) continue;

          try {
            const conversationMessages = await conversation.messages();
            console.log(`Loaded ${conversationMessages.length} messages from conversation ${conversation.id}`);
            console.log(conversationMessages)
            const members = await conversation.members();
              console.log("Finding Conversation members1:", members);
              const memberAddresses = members.flatMap(member => 
                member.accountIdentifiers.map(id => id.identifier.toLowerCase())
              );
              const inboxIdToAddress = new Map(
                members.map(member => [member.inboxId, member.accountIdentifiers[0]?.identifier])
              );

            console.log("memberAddresses",memberAddresses,inboxIdToAddress)
            
            const currentTimeNs = BigInt(Date.now()) * BigInt(1000000);
            allMessages.push(...conversationMessages.map(msg => {
              let content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
              
              // Handle wallet send calls
              if (msg.contentType?.typeId === 'walletSendCalls') {
                content = handleWalletSendCall(msg.encodedContent.content);
              }

              return {
                id: msg.id,
                content,
                senderAddress: inboxIdToAddress.get(msg.senderInboxId) || '',
                senderInboxId: msg.senderInboxId || '',
                sent: msg.sentAtNs ? new Date(Number(msg.sentAtNs / BigInt(1000000))) : new Date(),
                conversationId: conversation.id
              };
            }));

            // Fetch basename for each unique sender address

            for (const address of memberAddresses) {
              if (!basenames[address]) {
                await fetchBasename(address);
              }
            }

            if (isStreamingActive) {
              
              const stream = await conversation.stream();
              messageStreams.add(stream);
              
              (async () => {
                try {
                  for await (const message of stream) {
                    if (!isStreamingActive) break;
                    const currentTimeNs = BigInt(Date.now()) * BigInt(1000000);
                    
                    console.log("New message received:", message);
                    setMessages(prevMessages => {
                      let content = typeof message.content === 'string' ? message.content : JSON.stringify(message.content);
                      
                      // Handle wallet send calls
                      if (message.contentType?.typeId === 'walletSendCalls') {
                        content = handleWalletSendCall(message.encodedContent.content);
                      }

                      const newMessage = {
                        id: message.id,
                        content,
                        senderAddress: inboxIdToAddress.get(message.senderInboxId) || '',
                        senderInboxId: message.senderInboxId || '',
                        sent: message.sentAtNs ? new Date(Number(message.sentAtNs / BigInt(1000000))) : new Date(),
                        conversationId: conversation.id
                      };
                      
                      if (prevMessages.some(m => m.id === message.id)) {
                        return prevMessages;
                      }
                      
                      const updatedMessages = [newMessage, ...prevMessages];
                      console.log("updated messsage")
                      return updatedMessages.sort((a, b) => a.sent.getTime() - b.sent.getTime());
                    });
                  }
                } catch (error) {
                  setIsStreaming(false);
                  console.error('Message stream error:', error);
                  setError('Error streaming messages');
                }
              })();
            }
          } catch (error) {
            console.error(`Error loading messages for conversation ${conversation.id}:`, error);
          }
        }

        allMessages.sort((a, b) => a.sent.getTime() - b.sent.getTime());
        setMessages(allMessages);
        setIsStreaming(true);

      } catch (error) {
        console.error('Failed to setup message stream:', error);
        setError('Failed to load messages');
        setIsStreaming(false);
      }
    };

    setupMessageStream();

    return () => {
      isStreamingActive = false;
      setIsStreaming(false);
      messageStreams.forEach(stream => {
        try {
          stream.return?.();
        } catch (error) {
          console.error('Error closing stream:', error);
        }
      });
      messageStreams.clear();
    };
  }, [client, target_conversationId, refreshKey]);

  const handleSyncAndReload = () => {
    setRefreshKey(k => k + 1);
    window.location.reload();
  };

  if (!client) {
    return <div className={styles.connectPrompt}>Connect your wallet to view messages</div>;
  }

  if (error) {
    return (
      <div className={styles.messageContainer}>
        <div className={styles.statusIndicator}>
        <div className={`${styles.statusDot} ${isStreaming ? styles.statusDotActive : styles.statusDotInactive}`}></div>
        <span className={styles.statusText}>
          {isStreaming ? 'Streaming active' : 'Streaming inactive'}
        </span>
      </div>
      <div className={styles.messagesWrapper}>
        
            {error}
            <button 
              onClick={() => window.location.reload()} 
              className={styles.retryButton}
            >
              Retry
            </button>
          </div>
      </div>
    );
  }

  return (
    <div className={styles.messageContainer}>



      <div className={styles.statusIndicator}>
   
        <div className={styles.statusLeft}>
        <div className={`${styles.statusDot} ${isStreaming ? styles.statusDotActive : styles.statusDotInactive}`}></div>
        <span className={styles.statusText}>
          {isStreaming ? 'Streaming active' : 'Streaming inactive'}
        </span>
        </div>
       <div className={styles.statusRight}>
          <span className={styles.conversationId}>
              ID: {target_conversationId}
            </span>
            <button
          className={styles.refreshButton}
          onClick={handleSyncAndReload}
          title="Refresh"
        >
          &#x21bb;
        </button>
      </div>
   
      </div>
      
      <div className={styles.messagesWrapper}>
        {messages.length === 0 ? (
          <div className={styles.noMessages}>No messages yet</div>
        ) : (
          messages.map((message) => (
            <div key={message.id} className={styles.messageCard}>
              <div className={styles.messageHeader}>
                <div className={styles.senderAddress}>
                  {basenames[message.senderAddress] ? (
                    <>
                      {basenames[message.senderAddress]}
                      <span className={styles.addressSuffix}>
                        ({message.senderAddress.slice(0,4)}...{message.senderAddress.slice(-4)})
                      </span>
                    </>
                  ) : (
                    `${message.senderAddress.slice(0,4)}...${message.senderAddress.slice(-4)}`
                  )}
                </div>
                <div className={styles.timestamp}>
                  {message.sent.toLocaleString()}
                </div>
              </div>
              <div className={styles.messageContent}>
                {typeof message.content === 'string' ? message.content : message.content}
              </div>
            
            </div>
          ))
        )}
          {errorMsg && (
            <div className={styles.errorMessage}>
              {errorMsg}
              <button 
                className={styles.closeButton}
                onClick={() => setErrorMsg(null)}
                aria-label="Close error message"
              >
                ×
              </button>
            </div>
          )}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
} 