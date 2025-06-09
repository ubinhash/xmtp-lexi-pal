import { useEffect, useState } from 'react';
import { useXMTP } from '../contexts/XMTPContext';
import { DecodedMessage } from '@xmtp/browser-sdk';

interface Message {
  id: string;
  content: string;
  senderAddress: string;
  sent: Date;
  conversationId: string;
}

export function MessageList() {
  const { client } = useXMTP();
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!client) return;

    let isStreamingActive = true;
    const messageStreams = new Set<AsyncGenerator<DecodedMessage>>();

    const setupMessageStream = async () => {
      try {
        setError(null);
        const conversations = await client.conversations.list();
        console.log("Found conversations:", conversations.length);
        
        const allMessages: Message[] = [];
        
        for (const conversation of conversations) {
          try {
            const conversationMessages = await conversation.messages();
            console.log(`Loaded ${conversationMessages.length} messages from conversation ${conversation.id}`);
            const  currentTimeNs = BigInt(Date.now()) * BigInt(1000000);
            allMessages.push(...conversationMessages.map(msg => ({
              id: msg.id,
              content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
              senderAddress: msg.senderInboxId|| '',
              sent: msg.sentAtNs ? new Date(Number(msg.sentAtNs / BigInt(1000000))) : new Date() ,
              conversationId: conversation.id
            })));

            if (isStreamingActive) {
              const stream = await conversation.stream();
              messageStreams.add(stream);
              
              (async () => {
                try {
                  for await (const message of stream) {
                    if (!isStreamingActive) break;
                    const  currentTimeNs = BigInt(Date.now()) * BigInt(1000000);
                    
                    console.log("New message received:", message);
                    setMessages(prevMessages => {
                      const newMessage = {
                        id: message.id,
                        content: typeof message.content === 'string' ? message.content : JSON.stringify(message.content),
                        senderAddress: message?.senderInboxId || '',
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
                  console.error('Message stream error:', error);
                  setError('Error streaming messages');
                }
              })();
            }
          } catch (error) {
            console.error(`Error loading messages for conversation ${conversation.id}:`, error);
          }
        }

        allMessages.sort((a, b) => b.sent.getTime() - a.sent.getTime());
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
  }, [client]);

  if (!client) {
    return <div className="p-4 text-gray-500">Connect your wallet to view messages</div>;
  }

  if (error) {
    return (
      <div className="p-4 text-red-500">
        {error}
        <button 
          onClick={() => window.location.reload()} 
          className="ml-2 text-blue-500 hover:text-blue-700"
        >
          Retry
        </button>
      </div>
    );
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
                {message.senderAddress.slice(0,4)}...{message.senderAddress.slice(-4)}
              </div>
              <div className="text-xs text-gray-500">
                {message.sent.toLocaleString()}
              </div>
            </div>
            <div className="text-gray-700 whitespace-pre-wrap break-words">
              {message.content}
            </div>
          </div>
        ))
      )}
    </div>
  );
} 