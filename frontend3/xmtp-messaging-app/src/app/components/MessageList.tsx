import { useEffect, useState } from 'react';
import { useXMTP } from '../contexts/XMTPContext';
import { DecodedMessage } from '@xmtp/browser-sdk';

interface Message {
  id: string;
  content: string;
  senderAddress: string;
  sent: Date;
}

export function MessageList() {
  const { client } = useXMTP();
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);

  useEffect(() => {
    if (!client) return;

    let isStreamingActive = true; // Flag to control streaming

    const setupMessageStream = async () => {
      try {
        // First load existing messages
        const conversations = await client.conversations.list();
        const allMessages: Message[] = [];
        
        for (const conversation of conversations) {
          const conversationMessages = await conversation.messages();
          allMessages.push(...conversationMessages.map(msg => ({
            id: msg.id,
            content: msg.content as string,
            senderAddress: msg.senderAddress || '',
            sent: msg.sent || new Date()
          })));
        }

        // Sort messages by timestamp
        allMessages.sort((a, b) => b.sent.getTime() - a.sent.getTime());
        setMessages(allMessages);

        // Keep listening for new conversations
        while (isStreamingActive) {
          try {
            setIsStreaming(true);
            const stream = await client.conversations.stream();
            console.log("Starting conversation stream...");
            
            for await (const conversation of stream) {
              if (!isStreamingActive) break; // Check if we should stop streaming
              
              console.log("New conversation received:", conversation);
              // Get messages from the new conversation
              const conversationMessages = await conversation.messages();
              const newMessages = conversationMessages.map(msg => ({
                id: msg.id,
                content: msg.content as string,
                senderAddress: msg.senderAddress || '',
                sent: msg.sent || new Date()
              }));
              
              // Add new messages to the state
              setMessages(prevMessages => {
                const updatedMessages = [...newMessages, ...prevMessages];
                // Sort by timestamp
                return updatedMessages.sort((a, b) => b.sent.getTime() - a.sent.getTime());
              });
            }
          } catch (error) {
            console.error('Stream error:', error);
            setIsStreaming(false);
            // If there's an error, wait a bit before trying again
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      } catch (error) {
        console.error('Failed to setup message stream:', error);
        setIsStreaming(false);
      }
    };

    setupMessageStream();

    // Cleanup function
    return () => {
      isStreamingActive = false;
      setIsStreaming(false);
    };
  }, [client]);

  return (<div></div>);
  if (!client) {
    return <div className="p-4 text-gray-500">Connect your wallet to view messages</div>;
  }

  return (
    <div className="flex flex-col space-y-4 p-4">
      <div className="flex items-center space-x-2 mb-4">
        <div className={`w-3 h-3 rounded-full ${isStreaming ? 'bg-green-500' : 'bg-red-500'}`}></div>
        <span className="text-sm text-gray-600">
          {isStreaming ? 'Streaming active' : 'Streaming inactive'}
        </span>
      </div>
      
      {messages.length === 0 ? (
        <div className="text-gray-500">No messages yet</div>
      ) : (
        messages.map((message) => (
          <div key={message.id} className="bg-white rounded-lg shadow p-4">
            <div className="flex justify-between items-start mb-2">
              <div className="text-sm font-medium text-gray-900">
                {message.senderAddress.slice(0, 6)}...{message.senderAddress.slice(-4)}
              </div>
              <div className="text-xs text-gray-500">
                {message.sent.toLocaleString()}
              </div>
            </div>
            <div className="text-gray-700">{message.content}</div>
          </div>
        ))
      )}
    </div>
  );
} 